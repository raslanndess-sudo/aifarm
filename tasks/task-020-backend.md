# task-020: Higgsfield Provider — Video Generation (Kling 2.5 Turbo)

## Цель

HiggsfieldWebProvider получает метод `generateVideo` который:
1. Навигирует на `higgsfield.ai/ai/video?model=kling-2-5-turbo`
2. Загружает start frame (и опционально end frame) через file input
3. Вводит промпт
4. Ждёт генерации
5. Скачивает видео в `public/generations/{jobId}/clips/`

## Шаги

### 1. Обнови `src/lib/providers/higgsfield-web.ts` — метод `generateVideo`

Замени заглушку на реальную реализацию:

```ts
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
  // Скачиваем картинку во временный файл если это URL
  const startFramePath = await this.downloadToTemp(params.imageUrl, jobId, 'start_frame.png');
  
  // Ищем file input для start frame и загружаем
  const startInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  if (!startInput) throw new Error('Start frame file input not found');
  await startInput.setInputFiles(startFramePath);
  await sleep(randomDelay(1500, 3000));
  
  auditLog('generateVideo:startFrame', 'uploaded');
  
  // --- Загрузка end frame (опционально) ---
  if (params.endImageUrl) {
    const endFramePath = await this.downloadToTemp(params.endImageUrl, jobId, 'end_frame.png');
    // Может быть второй file input или кнопка "Add end frame"
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
  // Видео появится как <video> элемент или ссылка на скачивание
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
```

### 2. Добавь вспомогательный метод `downloadToTemp` в класс HiggsfieldWebProvider

```ts
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
    // Считаем что это уже локальный путь
    const { copyFileSync } = require('fs');
    copyFileSync(urlOrPath, filePath);
  }
  
  return filePath;
}
```

### 3. Обнови метод `getStatus`

Замени заглушку — для Higgsfield статус определяется наличием файлов:

```ts
async getStatus(jobId: string): Promise<GenerationJob> {
  const clipPath = path.join(process.cwd(), 'public', 'generations', jobId, 'clips', 'clip_0.mp4');
  const { existsSync } = require('fs');
  
  if (existsSync(clipPath)) {
    return { jobId, status: 'succeed', resultUrl: `/generations/${jobId}/clips/clip_0.mp4` };
  }
  
  // Проверяем есть ли директория — значит в процессе
  const dirPath = path.join(process.cwd(), 'public', 'generations', jobId);
  if (existsSync(dirPath)) {
    return { jobId, status: 'processing' };
  }
  
  return { jobId, status: 'failed', error: 'Job not found' };
}
```

### 4. Убедись что все импорты на месте

В `higgsfield-web.ts` должны быть:
```ts
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { humanClick, typeInLexical, sleep, randomDelay, auditLog } from './browser-helpers';
```

## Важные замечания

- Селекторы `video source`, `a[href*=".mp4"]`, `input[type="file"]` — ПРИБЛИЗИТЕЛЬНЫЕ. Подправим после реального теста.
- `setInputFiles()` — стандартный Playwright способ загрузки файлов. Если Higgsfield использует drag-and-drop вместо input — придётся адаптировать в следующем таске.
- Timeout 5 минут на генерацию видео — Kling 2.5 Turbo может быть медленным.

## НЕ ТРОГАЙ

- API роуты
- Компоненты
- browser-helpers.ts (уже создан в 019)
- KlingApiProvider
