import { chromium, type Browser } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import type { GenerationJob, VideoProvider } from './types';
import { humanClick, typeInLexical, sleep, randomDelay, auditLog } from './browser-helpers';

export class HiggsfieldWebProvider implements VideoProvider {
  name = 'higgsfield-web';
  private browser: Browser | null = null;

  // CDP connection — подключается к Chrome который уже запущен через start.bat
  // HIGGSFIELD_CDP_HOST: 'localhost' для запуска из Windows, WSL gateway IP (например 172.22.144.1) для WSL
  async connect(cdpUrl = `http://${process.env.HIGGSFIELD_CDP_HOST || 'localhost'}:${process.env.HIGGSFIELD_CDP_PORT || '9223'}`): Promise<void> {
    this.browser = await chromium.connectOverCDP(cdpUrl);
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // --- Диагностика (canary) ---

  async listPages(): Promise<Array<{ url: string; title: string }>> {
    if (!this.browser) throw new Error('Not connected — call connect() first');
    const contexts = this.browser.contexts();
    const pages: Array<{ url: string; title: string }> = [];
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        pages.push({ url: page.url(), title: await page.title() });
      }
    }
    return pages;
  }

  async screenshot(outputPath: string): Promise<string> {
    if (!this.browser) throw new Error('Not connected — call connect() first');
    const contexts = this.browser.contexts();
    const page = contexts[0]?.pages()[0];
    if (!page) throw new Error('No pages found in browser');
    await page.screenshot({ path: outputPath, fullPage: false });
    return outputPath;
  }

  // --- VideoProvider interface ---

  async generateImage(
    prompt: string,
    opts?: { model?: 'nano-banana-2' | 'seedream-5-lite'; count?: number },
  ): Promise<string[]> {
    if (!this.browser) throw new Error('Not connected — call connect() first');

    const model = opts?.model ?? 'nano-banana-2';
    const count = opts?.count ?? (model === 'seedream-5-lite' ? 1 : 4);

    const jobId = `img_${Date.now()}`;
    const outDir = path.join(process.cwd(), 'public', 'generations', jobId);
    mkdirSync(outDir, { recursive: true });

    auditLog('generateImage:start', `model=${model} jobId=${jobId} prompt="${prompt.slice(0, 50)}..."`);

    const context = this.browser.contexts()[0];
    if (!context) throw new Error('No browser context');
    const page = context.pages()[0] || await context.newPage();

    // Навигация — URL зависит от модели
    const modelUrl = `https://higgsfield.ai/ai/image?model=${model}`;
    await page.goto(modelUrl, { waitUntil: 'networkidle' });
    await sleep(randomDelay(1500, 3000));

    auditLog('generateImage:navigated', `${model} page loaded`);

    // Ввод промпта в Lexical
    await typeInLexical(page, '[contenteditable="true"]', prompt);
    await sleep(randomDelay(800, 2000));

    // Клик Generate
    await humanClick(page, 'button:has-text("Generate")');

    auditLog('generateImage:submitted', 'clicked Generate');

    // Ожидание результатов — картинки появляются как <img> внутри результатов
    // Ждём до 120 секунд пока появятся картинки
    await page.waitForSelector('img[src*="generation"]', { timeout: 120000 });
    await sleep(randomDelay(2000, 4000)); // подождать все картинки

    // Скачивание картинок
    const maxImages = count;
    const imageUrls = await page.evaluate((max: number) => {
      const imgs = document.querySelectorAll('img[src*="generation"]');
      return Array.from(imgs).map(img => (img as HTMLImageElement).src).slice(0, max);
    }, maxImages);

    const savedPaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imgUrl = imageUrls[i];
      const res = await fetch(imgUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(outDir, `image_${i}.png`);
      writeFileSync(filePath, buf);
      savedPaths.push(`/generations/${jobId}/image_${i}.png`);

      auditLog('generateImage:downloaded', `image_${i}.png`);
      await sleep(randomDelay(500, 1500));
    }

    await sleep(randomDelay(15000, 30000)); // пауза между генерациями

    auditLog('generateImage:done', `${savedPaths.length} images saved`);
    return savedPaths;
  }

  async generateVideo(params: {
    imageUrl: string;
    endImageUrl?: string;
    prompt?: string;
    model?: string;
    duration?: '5' | '10';
    mode?: 'std' | 'pro';
  }): Promise<GenerationJob> {
    if (!this.browser) throw new Error('Not connected — call connect() first');

    const jobId = `vid_${Date.now()}`;
    const outDir = path.join(process.cwd(), 'public', 'generations', jobId, 'clips');
    mkdirSync(outDir, { recursive: true });

    auditLog('generateVideo:start', `jobId=${jobId} prompt="${(params.prompt ?? '').slice(0, 50)}"`);

    const context = this.browser.contexts()[0];
    if (!context) throw new Error('No browser context');
    const page = context.pages()[0] || await context.newPage();

    // Навигация
    await page.goto('https://higgsfield.ai/ai/video?model=kling-2-5-turbo', { waitUntil: 'networkidle' });
    await sleep(randomDelay(2000, 4000));

    auditLog('generateVideo:navigated', 'kling-2-5-turbo page loaded');

    // --- Загрузка start frame ---
    const startFramePath = await this.downloadToTemp(params.imageUrl, jobId, 'start_frame.png');

    const startInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
    if (!startInput) throw new Error('Start frame file input not found');
    await startInput.setInputFiles(startFramePath);
    await sleep(randomDelay(1500, 3000));

    auditLog('generateVideo:startFrame', 'uploaded');

    // --- Загрузка end frame (опционально) ---
    if (params.endImageUrl) {
      const endFramePath = await this.downloadToTemp(params.endImageUrl, jobId, 'end_frame.png');
      const endInputs = await page.$$('input[type="file"]');
      if (endInputs.length > 1) {
        await endInputs[1].setInputFiles(endFramePath);
        await sleep(randomDelay(1500, 3000));
        auditLog('generateVideo:endFrame', 'uploaded');
      }
    }

    // --- Ввод промпта (если есть contenteditable) ---
    if (params.prompt) {
      const hasLexical = await page.$('[contenteditable="true"]');
      if (hasLexical) {
        await typeInLexical(page, '[contenteditable="true"]', params.prompt);
        await sleep(randomDelay(800, 2000));
      }
    }

    // --- Клик Generate ---
    await humanClick(page, 'button:has-text("Generate")');
    auditLog('generateVideo:submitted', 'clicked Generate');

    // --- Ожидание результата (до 5 минут) ---
    try {
      await page.waitForSelector('video source, a[href*=".mp4"], video[src]', { timeout: 300000 });
    } catch {
      auditLog('generateVideo:timeout', 'video not ready after 5 min');
      return { jobId, status: 'failed', error: 'Generation timeout after 5 minutes' };
    }
    await sleep(randomDelay(2000, 4000));

    // --- Скачивание видео ---
    const videoUrl = await page.evaluate(() => {
      const video = document.querySelector('video source, video[src]') as HTMLVideoElement | HTMLSourceElement | null;
      if (video) return (video as HTMLSourceElement).src || (video as HTMLVideoElement).src;
      const link = document.querySelector('a[href*=".mp4"]') as HTMLAnchorElement | null;
      if (link) return link.href;
      return null;
    });

    if (!videoUrl) {
      auditLog('generateVideo:error', 'could not find video URL');
      return { jobId, status: 'failed', error: 'Video URL not found on page' };
    }

    const videoRes = await fetch(videoUrl);
    const videoBuf = Buffer.from(await videoRes.arrayBuffer());
    const videoPath = path.join(outDir, 'clip_0.mp4');
    writeFileSync(videoPath, videoBuf);

    auditLog('generateVideo:downloaded', `clip_0.mp4 (${videoBuf.length} bytes)`);

    await sleep(randomDelay(15000, 30000)); // пауза антидетект

    auditLog('generateVideo:done', jobId);

    return {
      jobId,
      status: 'succeed',
      resultUrl: `/generations/${jobId}/clips/clip_0.mp4`,
    };
  }

  async getStatus(jobId: string): Promise<GenerationJob> {
    const clipPath = path.join(process.cwd(), 'public', 'generations', jobId, 'clips', 'clip_0.mp4');
    const { existsSync } = require('fs');

    if (existsSync(clipPath)) {
      return { jobId, status: 'succeed', resultUrl: `/generations/${jobId}/clips/clip_0.mp4` };
    }

    const dirPath = path.join(process.cwd(), 'public', 'generations', jobId);
    if (existsSync(dirPath)) {
      return { jobId, status: 'processing' };
    }

    return { jobId, status: 'failed', error: 'Job not found' };
  }

  // --- Helpers ---

  private async downloadToTemp(urlOrPath: string, jobId: string, filename: string): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'public', 'generations', jobId);
    mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, filename);

    if (urlOrPath.startsWith('http')) {
      const res = await fetch(urlOrPath);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(filePath, buf);
    } else if (urlOrPath.startsWith('data:')) {
      const base64 = urlOrPath.split(',')[1] ?? urlOrPath;
      writeFileSync(filePath, Buffer.from(base64, 'base64'));
    } else {
      const { copyFileSync } = require('fs');
      copyFileSync(urlOrPath, filePath);
    }

    return filePath;
  }
}
