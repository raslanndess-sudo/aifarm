import { type BrowserContext, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'fs';
import path from 'path';
import type { GenerationJob, VideoProvider } from './types';
import {
  humanClick,
  typeInLexical,
  sleep,
  randomDelay,
  auditLog,
  selectModel,
  enableUnlimited,
  setPromptTextarea,
  type ImageModel,
  type VideoModel,
} from './browser-helpers';
import {
  ensureContext,
  setStatus,
  checkpointPause,
  getCapturedMp4sSince,
  withMutex,
  isPauseRequested,
} from './higgsfield-singleton';

/**
 * Thrown when user requested pause (Stop button) during a polling loop.
 * Distinct from blocking checkpointPause() — this aborts the operation immediately
 * so the mutex releases and the Studio.tsx for-loop can break cleanly.
 */
class PausedError extends Error {
  constructor(stage: string) {
    super(`Higgsfield operation aborted by user at: ${stage}`);
    this.name = 'PausedError';
  }
}

function abortIfPaused(stage: string): void {
  if (isPauseRequested()) {
    auditLog('paused:abort', stage);
    throw new PausedError(stage);
  }
}

/**
 * Higgsfield occasionally false-flags anime/stylized prompts as policy violations,
 * shows "Restricted content detected" + "Credits refunded" banner, and refunds the
 * credit. The exact same prompt usually passes on a re-click within seconds.
 * This detector returns true if the banner is currently visible on the page.
 */
async function detectModerationBanner(page: Page): Promise<boolean> {
  try {
    const banner = page.locator('text=/restricted content detected/i').first();
    return await banner.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

const MAX_MODERATION_RETRIES = 2;

/**
 * Module-level counter of consecutive scenes that hit the moderation hard-limit.
 * If this gets too high, the script likely violates Higgsfield content policy
 * scene-wide (anatomy, skin tone, pose) and retrying any further is wasted work.
 * Reset to 0 on any successful image generation.
 */
let consecutiveModerationFails = 0;
const MAX_CONSECUTIVE_MODERATION_FAILS = 2;
class ContentPolicyAbortError extends Error {
  constructor() {
    super(
      `Higgsfield content policy triggered ${MAX_CONSECUTIVE_MODERATION_FAILS} scenes in a row. ` +
      `The whole prompt is likely flagged (e.g. shirtless, anatomy, pose). ` +
      `Edit the script to remove triggers and retry.`,
    );
    this.name = 'ContentPolicyAbortError';
  }
}

/**
 * Extract UTC timestamp from Higgsfield mp4 filename pattern: hf_YYYYMMDD_HHMMSS_<uuid>.mp4
 * Returns epoch ms or null if pattern not found.
 */
function extractHfTimestamp(url: string): number | null {
  const m = url.match(/hf_(\d{8})_(\d{6})_/);
  if (!m) return null;
  const ymd = m[1], hms = m[2];
  const yyyy = +ymd.slice(0, 4);
  const mm = +ymd.slice(4, 6) - 1;
  const dd = +ymd.slice(6, 8);
  const HH = +hms.slice(0, 2);
  const MM = +hms.slice(2, 4);
  const SS = +hms.slice(4, 6);
  return Date.UTC(yyyy, mm, dd, HH, MM, SS);
}

// Helper: collect all Higgsfield CDN image URLs with normalization + debug samples.
// Selector img[src*="images.higgs.ai"] catches both DOM structures:
//   - History (old): <figure class="group"><img></figure>
//   - Latest/Today:  <div class="@container"><img></div>
// CloudFront proxy wraps real URLs in a ?url= param — we normalize by extracting that.
async function collectImageUrls(page: Page): Promise<{ urls: string[]; samples: Array<{ raw: string; normalized: string }> }> {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img[src*="images.higgs.ai"]')) as HTMLImageElement[];
    const urls: string[] = [];
    const samples: Array<{ raw: string; normalized: string }> = [];
    for (const img of imgs) {
      const raw = img.getAttribute('src') || '';
      if (!raw) continue;
      let normalized = raw;
      try {
        const u = new URL(raw, location.origin);
        const proxied = u.searchParams.get('url');
        if (proxied) normalized = proxied;
      } catch { /* keep raw */ }
      urls.push(normalized);
      if (samples.length < 3) samples.push({ raw: raw.slice(0, 120), normalized: normalized.slice(0, 120) });
    }
    return { urls, samples };
  });
}

export class HiggsfieldWebProvider implements VideoProvider {
  name = 'higgsfield-web';
  private context: BrowserContext | null = null;

  // Singleton — just confirm context is alive. Do NOT close it in disconnect().
  async connect(): Promise<void> {
    this.context = await ensureContext();
    setStatus('running');
  }

  // No-op by design. Context lives until manual shutdown or Chrome window close.
  async disconnect(): Promise<void> {
    setStatus('idle');
    this.context = null;
  }

  // --- Диагностика (canary) ---

  async listPages(): Promise<Array<{ url: string; title: string }>> {
    if (!this.context) throw new Error('Not connected — call connect() first');
    const pages: Array<{ url: string; title: string }> = [];
    for (const page of this.context.pages()) {
      pages.push({ url: page.url(), title: await page.title() });
    }
    return pages;
  }

  async screenshot(outputPath: string): Promise<string> {
    if (!this.context) throw new Error('Not connected — call connect() first');
    const page = this.context.pages()[0];
    if (!page) throw new Error('No pages found in browser');
    await page.screenshot({ path: outputPath, fullPage: false });
    return outputPath;
  }

  // --- VideoProvider interface ---

  async generateImage(
    prompt: string,
    opts?: { model?: string; count?: number; unlimited?: boolean },
  ): Promise<string[]> {
    if (!this.context) throw new Error('Not connected — call connect() first');
    return withMutex('generateImage', () => this.generateImageLocked(prompt, opts));
  }

  private async generateImageLocked(
    prompt: string,
    opts?: { model?: string; count?: number; unlimited?: boolean },
  ): Promise<string[]> {
    if (!this.context) throw new Error('Not connected — call connect() first');

    const model = (opts?.model ?? 'seedream_v5_lite') as ImageModel;
    const count = opts?.count ?? 1;
    const useUnlimited = opts?.unlimited !== false;
    const jobId = `img_${Date.now()}`;
    const outDir = path.join(process.cwd(), 'public', 'generations', jobId);
    mkdirSync(outDir, { recursive: true });

    auditLog('generateImage:start', `model=${model} jobId=${jobId} unlimited=${useUnlimited} prompt="${prompt.slice(0, 80)}"`);

    const page = this.context.pages()[0] || await this.context.newPage();

    // 1. Navigate (domcontentloaded, NOT networkidle — higgsfield.ai never idles)
    await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await checkpointPause('generateImage:loaded');

    // 2. Select the target model via real UI click
    await selectModel(page, 'image', model);
    await checkpointPause('generateImage:model-selected');

    // 3. Enable Unlimited toggle (composer switch) — skip if opts.unlimited === false
    if (useUnlimited) {
      await enableUnlimited(page, 'image');
      await checkpointPause('generateImage:unlimited-on');
    }

    // 4. Type prompt into Lexical
    await typeInLexical(page, '[contenteditable="true"]', prompt);
    await sleep(randomDelay(600, 1400));
    await checkpointPause('generateImage:prompt-typed');

    // 5. Capture baseline (all Higgsfield CDN images, normalized URLs + debug samples)
    const baseline = await collectImageUrls(page);
    let baselineSet = new Set(baseline.urls);
    auditLog('generateImage:baseline', `${baselineSet.size} urls`);
    auditLog('generateImage:baseline-sample', JSON.stringify(baseline.samples));

    // 6. Click submit button — verify BEFORE click to avoid spending credits
    //    Unlimited ON → big yellow "Unlimited ✨" button (NOT the toggle switch)
    //    Unlimited OFF → "Generate" button
    let submitBtn;
    if (useUnlimited) {
      submitBtn = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited/i }).last();
    } else {
      submitBtn = page.locator('button').filter({ hasText: /Generate/i }).last();
    }
    await submitBtn.waitFor({ state: 'visible', timeout: 900000 });
    const submitText = ((await submitBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    auditLog('generateImage:submit-text', `button text before click: "${submitText}"`);

    // FAIL-FAST: if unlimited requested but button says "Generate" → toggle didn't work, abort BEFORE click
    if (useUnlimited && !/unlimited/i.test(submitText)) {
      throw new Error(`generateImage: Unlimited mode requested but submit button shows "${submitText}" — toggle did not activate. Aborting BEFORE click to preserve credits.`);
    }

    const submitBox = await submitBtn.boundingBox();
    if (!submitBox) throw new Error('generateImage: submit button has no bounding box');
    await page.mouse.move(
      submitBox.x + submitBox.width / 2 + (Math.random() - 0.5) * 4,
      submitBox.y + submitBox.height / 2 + (Math.random() - 0.5) * 4,
      { steps: randomDelay(5, 15) },
    );
    await sleep(randomDelay(100, 300));
    await page.mouse.click(
      submitBox.x + submitBox.width / 2 + (Math.random() - 0.5) * 4,
      submitBox.y + submitBox.height / 2 + (Math.random() - 0.5) * 4,
    );
    auditLog('generateImage:submitted', `clicked "${submitText}"`);

    // 7. Poll for new images (normalized URL diff with debug samples).
    // Also watches for the Higgsfield "Restricted content detected" banner — if it
    // appears (false-positive moderation), re-clicks submit up to MAX_MODERATION_RETRIES
    // times. The same prompt usually passes on a retry within seconds.
    const waitStart = Date.now();
    let newUrls: string[] = [];
    let pollIteration = 0;
    let moderationRetries = 0;
    while (Date.now() - waitStart < 900000) {
      abortIfPaused('generateImage:polling');

      // Early-poll moderation check — banner appears within ~3-8s of the click.
      // After 60s of normal polling without it, stop checking (saves DOM queries).
      const elapsedSoFar = Math.round((Date.now() - waitStart) / 1000);
      if (elapsedSoFar < 60 && await detectModerationBanner(page)) {
        if (moderationRetries >= MAX_MODERATION_RETRIES) {
          consecutiveModerationFails++;
          auditLog(
            'generateImage:moderation-hard-limit',
            `scene failed after ${MAX_MODERATION_RETRIES + 1} retries, consecutive=${consecutiveModerationFails}/${MAX_CONSECUTIVE_MODERATION_FAILS}`,
          );
          if (consecutiveModerationFails >= MAX_CONSECUTIVE_MODERATION_FAILS) {
            // Reset counter so next run starts clean
            consecutiveModerationFails = 0;
            throw new ContentPolicyAbortError();
          }
          throw new Error(
            `generateImage: moderation triggered ${MAX_MODERATION_RETRIES + 1} times — scene blocked by Higgsfield content policy. Skipping to next scene.`,
          );
        }
        moderationRetries++;
        auditLog('generateImage:moderation', `false-positive banner detected, attempt=${moderationRetries}/${MAX_MODERATION_RETRIES}, re-submitting`);

        // Wait for banner to dismiss before re-clicking
        await sleep(randomDelay(2500, 4000));

        // Re-baseline (other users' images may have appeared in the meantime)
        const fresh = await collectImageUrls(page);
        baselineSet = new Set(fresh.urls);

        // Re-click the same submit button — submitBox is stable in viewport
        await page.mouse.move(
          submitBox.x + submitBox.width / 2 + (Math.random() - 0.5) * 4,
          submitBox.y + submitBox.height / 2 + (Math.random() - 0.5) * 4,
          { steps: randomDelay(5, 15) },
        );
        await sleep(randomDelay(100, 300));
        await page.mouse.click(
          submitBox.x + submitBox.width / 2 + (Math.random() - 0.5) * 4,
          submitBox.y + submitBox.height / 2 + (Math.random() - 0.5) * 4,
        );
        auditLog('generateImage:resubmitted', `moderation-retry ${moderationRetries}/${MAX_MODERATION_RETRIES}`);
        pollIteration = 0;
        continue;
      }

      const current = await collectImageUrls(page);
      newUrls = current.urls.filter(url => !baselineSet.has(url));
      const elapsed = Math.round((Date.now() - waitStart) / 1000);

      // Log samples on first iteration and every 30s
      if (pollIteration === 0) {
        auditLog('generateImage:current-sample', JSON.stringify(current.samples));
      }

      if (newUrls.length >= count) {
        // Log the first 2 new URLs for debugging
        const newSample = newUrls.slice(0, 2).map(u => u.slice(0, 120));
        auditLog('generateImage:new-found', `${newUrls.length} new urls, first 2: ${JSON.stringify(newSample)}`);
        break;
      }

      if (elapsed > 0 && elapsed % 30 === 0) {
        auditLog('generateImage:polling', `new: ${newUrls.length}, baseline: ${baselineSet.size}, current: ${current.urls.length}, elapsed: ${elapsed}s`);
        if (pollIteration > 0) {
          auditLog('generateImage:current-sample', JSON.stringify(current.samples));
        }
      }

      if (elapsed >= 900) {
        throw new Error(`generateImage: timeout after ${elapsed}s — found ${newUrls.length}/${count} new images`);
      }
      await sleep(5000);
      pollIteration++;
    }
    if (newUrls.length === 0) {
      throw new Error('generateImage: timeout — no new images appeared');
    }
    const waitElapsed = Math.round((Date.now() - waitStart) / 1000);
    auditLog('generateImage:appeared', `${newUrls.length} new images after ${waitElapsed}s`);
    // Reset consecutive moderation counter on any successful image — a single false-flag
    // on one scene shouldn't permanently count against future runs.
    if (consecutiveModerationFails > 0) {
      auditLog('generateImage:moderation-counter-reset', `was ${consecutiveModerationFails}, now 0`);
      consecutiveModerationFails = 0;
    }
    await sleep(randomDelay(3000, 5000));
    await checkpointPause('generateImage:results-visible');

    // 8–10. For each new image: click thumbnail → modal → Download → save
    const savedPaths: string[] = [];
    const toDownload = Math.min(count, newUrls.length);

    for (let i = 0; i < toDownload; i++) {
      const targetNormUrl = newUrls[i];

      try {
        // 8. Find and click the new thumbnail by normalized URL match
        const thumbImgIndex = await page.evaluate(
          ({ normUrl }: { normUrl: string }) => {
            const imgs = Array.from(document.querySelectorAll('img[src*="images.higgs.ai"]')) as HTMLImageElement[];
            for (let idx = 0; idx < imgs.length; idx++) {
              const img = imgs[idx];
              let normalized: string;
              try {
                const u = new URL(img.src);
                normalized = u.searchParams.get('url') || img.src;
              } catch { normalized = img.src; }
              if (normalized === normUrl) return idx;
            }
            return -1;
          },
          { normUrl: targetNormUrl },
        );

        if (thumbImgIndex < 0) {
          auditLog('generateImage:warn', `image ${i} normalized url not found in DOM, skipping`);
          continue;
        }

        const thumbnail = page.locator('img[src*="images.higgs.ai"]').nth(thumbImgIndex);
        await thumbnail.scrollIntoViewIfNeeded();
        await sleep(randomDelay(300, 600));
        await thumbnail.hover();
        await sleep(randomDelay(600, 900));
        auditLog('generateImage:hover', `image ${i} at figure index ${thumbImgIndex}`);

        await thumbnail.click({ delay: 100 });
        auditLog('generateImage:clicked-thumbnail', `image ${i}, waiting for modal`);

        // 9. Wait for modal / detail view
        const modalSelector = 'dialog, [role="dialog"], [data-state="open"]';
        await page.waitForSelector(modalSelector, { timeout: 900000 });
        await sleep(randomDelay(1000, 2000));
        auditLog('generateImage:modal-opened', `image ${i}`);

        // 10. Click Download button inside modal
        const downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
        await downloadBtn.waitFor({ state: 'visible', timeout: 900000 });
        auditLog('generateImage:clicking-download', `image ${i}`);

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 900000 }),
          downloadBtn.click({ delay: 100 }),
        ]);
        auditLog('generateImage:download-event', `image ${i}, suggestedFilename=${download.suggestedFilename()}`);

        // Save file with correct extension from suggestedFilename
        const suggested = download.suggestedFilename();
        const ext = path.extname(suggested) || '.png';
        const filename = `image_${i}${ext}`;
        const filePath = path.join(outDir, filename);
        await download.saveAs(filePath);

        let fileSize = 0;
        try { fileSize = statSync(filePath).size; } catch { /* ignore */ }
        auditLog('generateImage:saved', `${filename} (${fileSize} bytes)`);

        savedPaths.push(`/generations/${jobId}/${filename}`);

        // Close modal — Escape
        await page.keyboard.press('Escape');
        await sleep(randomDelay(800, 1500));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        auditLog('generateImage:download-error', `image ${i}: ${msg}`);
        // Try to close any open modal before re-throwing
        try { await page.keyboard.press('Escape'); } catch { /* ignore */ }
        await sleep(500);
        throw err;
      }
    }

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
    /** If true, return immediately after submit click (skip 5-min wait + download).
     *  Used by scenario pipeline to fan out submits, then batch-collect via collectAndDownloadVideos. */
    submitOnly?: boolean;
  }): Promise<GenerationJob & { submitTime?: number }> {
    if (!this.context) throw new Error('Not connected — call connect() first');

    return withMutex(`generateVideo:${params.submitOnly ? 'submit' : 'full'}`, () =>
      this.generateVideoLocked(params),
    );
  }

  private async generateVideoLocked(params: {
    imageUrl: string;
    endImageUrl?: string;
    prompt?: string;
    model?: string;
    duration?: '5' | '10';
    mode?: 'std' | 'pro';
    submitOnly?: boolean;
  }): Promise<GenerationJob & { submitTime?: number }> {
    if (!this.context) throw new Error('Not connected — call connect() first');

    const model = (params.model ?? 'kling-2-5-turbo') as VideoModel;
    const jobId = `vid_${Date.now()}`;
    const outDir = path.join(process.cwd(), 'public', 'generations', jobId, 'clips');
    mkdirSync(outDir, { recursive: true });

    auditLog('generateVideo:start', `jobId=${jobId} model=${model} submitOnly=${!!params.submitOnly}`);

    const page = this.context.pages()[0] || await this.context.newPage();

    // 1. Navigate
    await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await checkpointPause('generateVideo:loaded');

    // 2. Select model (category → variant)
    await selectModel(page, 'video', model);
    await checkpointPause('generateVideo:model-selected');

    // 3. Download + normalize start frame to PNG (Kling rejects webp)
    const startFramePath = await this.downloadToTempPng(params.imageUrl, jobId, 'start_frame.png');

    // 3a. CRITICAL: Higgsfield keeps last submission's start frame sticky in the slot.
    // If we don't clear it, scene N gets scene (N-1)'s frame even after setInputFiles —
    // UI thumbnail shows the new file but the actual upload reuses the old one in some cases.
    // Hover over thumbnail → click X (top-right). Logic ported from task-008-e2e-image-then-video.ts.
    const cleared = await page.evaluate(() => {
      const candidates = (Array.from(document.querySelectorAll('img')) as HTMLImageElement[])
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width >= 60 && r.width < 220 && r.x < 350 && r.y > 100 && r.y < 550;
        });
      for (const img of candidates) {
        let scope: Element | null = img.parentElement;
        for (let depth = 0; depth < 6 && scope; depth++) {
          const closeBtn =
            scope.querySelector('button[aria-label*="remove" i]') ||
            scope.querySelector('button[aria-label*="close" i]') ||
            scope.querySelector('button[aria-label*="delete" i]') ||
            scope.querySelector('button[aria-label*="clear" i]');
          if (closeBtn) {
            (closeBtn as HTMLElement).click();
            return { ok: true, via: 'aria', depth };
          }
          const iconBtns = (Array.from(scope.querySelectorAll('button')) as HTMLButtonElement[]).filter((b) => {
            const br = b.getBoundingClientRect();
            return (b.textContent || '').trim() === '' && br.width > 0 && br.width <= 36 && br.height <= 36;
          });
          if (iconBtns.length > 0) {
            iconBtns[0].click();
            return { ok: true, via: 'icon', depth };
          }
          scope = scope.parentElement;
        }
      }
      return { ok: false };
    });
    auditLog('generateVideo:cleanup-start-frame', JSON.stringify(cleared));
    await sleep(800);

    const fileInputs = await page.locator('input[type="file"]').all();
    if (fileInputs.length < 1) {
      auditLog('generateVideo:error', 'no file inputs on /ai/video');
      throw new Error('generateVideo: no start-frame input found');
    }
    await fileInputs[0].setInputFiles(startFramePath);
    await sleep(randomDelay(1800, 2800));
    auditLog('generateVideo:startFrame', 'uploaded');
    await checkpointPause('generateVideo:start-frame-uploaded');

    // 4. Optional end frame
    if (params.endImageUrl) {
      const endFramePath = await this.downloadToTempPng(params.endImageUrl, jobId, 'end_frame.png');
      const refreshedInputs = await page.locator('input[type="file"]').all();
      if (refreshedInputs.length < 2) {
        auditLog('generateVideo:warn', 'end-frame input missing despite endImageUrl provided — skipping');
      } else {
        await refreshedInputs[1].setInputFiles(endFramePath);
        await sleep(randomDelay(1800, 2800));
        auditLog('generateVideo:endFrame', 'uploaded');
      }
    }
    await checkpointPause('generateVideo:frames-ready');

    // 5. Enable Unlimited banner (switches 1080p→720p, 5s stays)
    await enableUnlimited(page, 'video');
    await checkpointPause('generateVideo:unlimited-on');

    // 6. Type prompt into <textarea id="prompt">
    if (params.prompt) {
      await setPromptTextarea(page, params.prompt);
      await sleep(randomDelay(600, 1200));
    }
    await checkpointPause('generateVideo:prompt-typed');

    // 7. Click submit button — MUST show "Unlimited" text. If it shows "Generate6/12/...", Unlimited
    //    didn't activate (banner click failed → still on 1080p) and clicking would burn credits.
    const submitBtnV = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
    await submitBtnV.waitFor({ state: 'visible', timeout: 900000 });
    const submitTextV = ((await submitBtnV.textContent()) || '').trim().replace(/\n/g, ' ');
    auditLog('generateVideo:submit-text', `button text before click: "${submitTextV}"`);

    // FAIL-FAST: must contain "Unlimited" AND must NOT contain "Generate<number>" (paid mode).
    if (!/unlimited/i.test(submitTextV) || /Generate\d+/.test(submitTextV)) {
      throw new Error(
        `generateVideo: Unlimited mode not active — submit button shows "${submitTextV}". ` +
        `Aborting BEFORE click to preserve credits. (Likely the "Change to 720p 5s for Unlimited" banner click did not activate Unlimited mode.)`,
      );
    }

    const submitBoxV = await submitBtnV.boundingBox();
    if (!submitBoxV) throw new Error('generateVideo: submit button has no bounding box');
    await page.mouse.move(
      submitBoxV.x + submitBoxV.width / 2 + (Math.random() - 0.5) * 4,
      submitBoxV.y + submitBoxV.height / 2 + (Math.random() - 0.5) * 4,
      { steps: randomDelay(5, 15) },
    );
    await sleep(randomDelay(100, 300));
    await page.mouse.click(
      submitBoxV.x + submitBoxV.width / 2 + (Math.random() - 0.5) * 4,
      submitBoxV.y + submitBoxV.height / 2 + (Math.random() - 0.5) * 4,
    );
    const submitTime = Date.now();
    auditLog('generateVideo:submitted', `clicked "${submitTextV}" at=${submitTime}`);

    // submitOnly path: return immediately so caller can fan out next image generation.
    // Video continues processing in Higgsfield cloud; collectAndDownloadVideos picks it up later.
    if (params.submitOnly) {
      // Brief settle so Higgsfield UI registers the request before we navigate away.
      await sleep(randomDelay(2500, 4000));
      auditLog('generateVideo:submit-only-return', `jobId=${jobId} submitTime=${submitTime}`);
      return { jobId, status: 'processing', submitTime };
    }

    // 8. Wait for result (up to 5 min)
    try {
      await page.waitForSelector('video source, a[href*=".mp4"], video[src]', { timeout: 300000 });
    } catch {
      auditLog('generateVideo:timeout', 'video not ready after 5 min');
      return { jobId, status: 'failed', error: 'Generation timeout after 5 min' };
    }
    await sleep(randomDelay(2000, 4000));

    // 9. Download video
    const videoUrl = await page.evaluate(() => {
      const v = document.querySelector('video source, video[src]') as HTMLVideoElement | HTMLSourceElement | null;
      if (v) return (v as HTMLSourceElement).src || (v as HTMLVideoElement).src;
      const a = document.querySelector('a[href*=".mp4"]') as HTMLAnchorElement | null;
      return a?.href || null;
    });
    if (!videoUrl) {
      auditLog('generateVideo:error', 'video URL not extractable');
      return { jobId, status: 'failed', error: 'Video URL not found' };
    }
    const res = await fetch(videoUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const videoPath = path.join(outDir, 'clip_0.mp4');
    writeFileSync(videoPath, buf);
    auditLog('generateVideo:downloaded', `clip_0.mp4 (${buf.length} bytes)`);

    return {
      jobId,
      status: 'succeed',
      resultUrl: `/generations/${jobId}/clips/clip_0.mp4`,
    };
  }

  /**
   * Batch-collect videos that were submitted via submitOnly mode.
   * Opens /ai/video, waits until N mp4 URLs are captured by the singleton's network listener
   * (filtering by submitTime so we don't pick up unrelated old clips), then downloads each in
   * the order they finished. Submit order ↔ download index pairing is the caller's job — we
   * return the full ordered list and let the caller assign jobIds.
   */
  async collectAndDownloadVideos(
    submittedJobs: Array<{ jobId: string; submitTime: number }>,
    options?: { timeoutMs?: number },
  ): Promise<Array<{ jobId: string; resultUrl: string | null; error?: string }>> {
    if (!this.context) throw new Error('Not connected — call connect() first');
    return withMutex('collectAndDownloadVideos', () =>
      this.collectAndDownloadVideosLocked(submittedJobs, options),
    );
  }

  private async collectAndDownloadVideosLocked(
    submittedJobs: Array<{ jobId: string; submitTime: number }>,
    options?: { timeoutMs?: number },
  ): Promise<Array<{ jobId: string; resultUrl: string | null; error?: string }>> {
    if (!this.context) throw new Error('Not connected — call connect() first');
    const timeoutMs = options?.timeoutMs ?? 900_000; // 15 min
    const expectedCount = submittedJobs.length;

    // collectStart timestamp: mp4s captured BEFORE this time are from prior sessions and are ignored.
    // Anchor to the earliest submitTime so retries (after collect timeout/abort) still match the
    // submitted jobs — using Date.now() would shift the window and exclude already-finished jobs.
    const earliestSubmit = submittedJobs.reduce((a, j) => Math.min(a, j.submitTime), Date.now());
    const collectStart = Math.min(Date.now(), earliestSubmit);
    auditLog(
      'collectAndDownloadVideos:start',
      `expected=${expectedCount} collectStart=${collectStart} earliestSubmit=${earliestSubmit}`,
    );

    const page = this.context.pages()[0] || (await this.context.newPage());

    // Scrape cloudfront mp4 URLs from the page DOM using string-form evaluate
    // (avoids __name injection issues from any bundler).
    const scrapeDomMp4s = async (): Promise<string[]> => {
      try {
        return (await page.evaluate(`
          (function() {
            var out = [];
            var seen = {};
            function push(u) {
              if (!u || seen[u]) return;
              if (!/cloudfront\\.net\\/user_/i.test(u) && !/amazonaws\\.com\\/.+\\.mp4/i.test(u)) return;
              seen[u] = 1; out.push(u);
            }
            var videos = document.querySelectorAll('video');
            for (var i = 0; i < videos.length; i++) {
              push(videos[i].src); push(videos[i].currentSrc);
              var srcs = videos[i].querySelectorAll('source');
              for (var j = 0; j < srcs.length; j++) push(srcs[j].src);
            }
            var links = document.querySelectorAll('a[href]');
            for (var k = 0; k < links.length; k++) {
              var h = links[k].href || '';
              if ((h.indexOf('cloudfront.net/user_') >= 0 || h.indexOf('amazonaws.com') >= 0) && h.indexOf('.mp4') >= 0) push(h);
            }
            return out;
          })()
        `)) as string[];
      } catch { return []; }
    };

    // Navigate to /ai/video and stay there. The page's SPA will call Higgsfield's API to check
    // generation status — the JSON API listener in the singleton captures mp4 URLs from those responses.
    // We reload periodically so the SPA re-fetches the latest generation status.
    // As a fallback after each reload, we click recent history items to load their video URLs from the DOM.
    const waitStart = Date.now();
    let mp4Urls: string[] = [];
    let pollCount = 0;
    const capturedSet = new Set<string>();

    const mergeInto = (urls: string[]) => {
      for (const u of urls) {
        if (capturedSet.has(u)) continue;
        if (!(/cloudfront\.net\/user_/i.test(u) || /amazonaws\.com\/.+\.mp4/i.test(u))) continue;
        const ts = extractHfTimestamp(u);
        // Strict filter: only accept URLs with hf_YYYYMMDD_HHMMSS_ prefix AND timestamp >= collectStart - 60s.
        // URLs without the timestamp prefix (UUID-only legacy/featured) are NOT ours — discard.
        if (ts === null) {
          auditLog('collectAndDownloadVideos:skip-no-timestamp', u.slice(-80));
          continue;
        }
        if (ts < collectStart - 60_000) {
          auditLog('collectAndDownloadVideos:skip-old', `${new Date(ts).toISOString()} < ${new Date(collectStart).toISOString()}`);
          continue;
        }
        capturedSet.add(u);
        mp4Urls.push(u);
      }
    };

    // Click recent history figures and extract video URLs from the DOM player.
    // Higgsfield shows a video element or download link when you open a generation detail.
    const tryDomClickExtract = async (needed: number) => {
      try {
        const figCount = (await page.evaluate(`document.querySelectorAll('figure[data-asset-preview]').length`)) as number;
        auditLog('collectAndDownloadVideos:click-scan', `${figCount} figures, need ${needed} more`);
        for (let i = 0; i < Math.min(needed * 3, figCount, 12); i++) {
          if (mp4Urls.length >= expectedCount) break;
          await page.evaluate(`document.querySelectorAll('figure[data-asset-preview]')[${i}].click()`);
          let url: string | null = null;
          try {
            await page.waitForSelector(
              'video[src*="cloudfront"], video source[src*="cloudfront"], a[href*="cloudfront"][href*=".mp4"], video[src*=".mp4"]',
              { timeout: 7000 },
            );
            url = (await page.evaluate(`
              (function() {
                var v = document.querySelector('video[src*="cloudfront"]');
                if (v && v.src) return v.src;
                var s = document.querySelector('video source[src*="cloudfront"]');
                if (s && s.src) return s.src;
                var a = document.querySelector('a[href*="cloudfront"][href*=".mp4"]');
                if (a && a.href) return a.href;
                var v2 = document.querySelector('video[src]');
                if (v2 && v2.src && v2.src.includes('.mp4')) return v2.src;
                var s2 = document.querySelector('video source[src]');
                if (s2 && s2.src && s2.src.includes('.mp4')) return s2.src;
                return null;
              })()
            `)) as string | null;
          } catch { /* video not ready yet */ }
          if (url) {
            auditLog('collectAndDownloadVideos:click-found', `figure[${i}]: ${url.slice(0, 100)}`);
            mergeInto([url]);
          }
          await page.keyboard.press('Escape');
          await sleep(600);
        }
      } catch (e) {
        auditLog('collectAndDownloadVideos:click-error', String(e).slice(0, 120));
      }
    };

    try {
      await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);
    } catch { /* ignore initial nav errors */ }

    // Try DOM click on initial load too
    await tryDomClickExtract(expectedCount);

    while (Date.now() - waitStart < timeoutMs) {
      abortIfPaused('collectAndDownloadVideos:poll');
      const listenerUrls = getCapturedMp4sSince(collectStart);
      const domUrls = await scrapeDomMp4s();
      mergeInto([...listenerUrls, ...domUrls]);

      const elapsed = Math.round((Date.now() - waitStart) / 1000);
      auditLog('collectAndDownloadVideos:poll', `#${++pollCount} total=${mp4Urls.length}/${expectedCount} elapsed=${elapsed}s`);

      if (mp4Urls.length >= expectedCount) break;

      // Reload every ~60s to trigger fresh API calls from the SPA, then try DOM click
      if (pollCount % 6 === 0 && pollCount > 0) {
        auditLog('collectAndDownloadVideos:reload', `reloading /ai/video`);
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(4000);
        } catch { /* ignore */ }
        await tryDomClickExtract(expectedCount - mp4Urls.length);
      } else {
        await sleep(10000);
      }
    }

    if (mp4Urls.length < expectedCount) {
      auditLog('collectAndDownloadVideos:timeout', `only ${mp4Urls.length}/${expectedCount} after ${Math.round((Date.now() - waitStart) / 1000)}s`);
    }

    // Download each captured mp4 to its respective jobId folder.
    // Order: capture order = readiness order (first finished = first in array). Higgsfield queues
    // submits in order, but processing time varies, so this is closest-to-submit-order best effort.
    auditLog('collectAndDownloadVideos:final-mp4-list', `count=${mp4Urls.length} urls=${JSON.stringify(mp4Urls.map(u => u.slice(-80)))}`);
    const results: Array<{ jobId: string; resultUrl: string | null; error?: string }> = [];
    for (let i = 0; i < submittedJobs.length; i++) {
      const { jobId } = submittedJobs[i];
      const mp4Url = mp4Urls[i];
      if (!mp4Url) {
        auditLog('collectAndDownloadVideos:slot-empty', `slot[${i}] jobId=${jobId} — no mp4 captured`);
        results.push({ jobId, resultUrl: null, error: 'no mp4 captured for this slot' });
        continue;
      }
      try {
        const outDir = path.join(process.cwd(), 'public', 'generations', jobId, 'clips');
        mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, 'clip_0.mp4');

        // Use Node.js global fetch (NOT page.request.get) — Chrome's request adds cookies/auth
        // that make CloudFront return 403. Direct fetch works (URL is publicly accessible once captured).
        // CloudFront edge propagation can take up to ~60s for a freshly-uploaded file, so retry
        // with longer backoff: 5s/10s/15s/20s/25s/30s = 105s total before giving up.
        let resp: Response | null = null;
        let lastStatus = 0;
        for (let attempt = 1; attempt <= 6; attempt++) {
          try {
            resp = await fetch(mp4Url);
            lastStatus = resp.status;
            if (resp.ok) break;
            auditLog('collectAndDownloadVideos:fetch-retry', `${jobId} attempt=${attempt} prev=HTTP ${resp.status}`);
          } catch (e) {
            auditLog('collectAndDownloadVideos:fetch-retry', `${jobId} attempt=${attempt} err=${(e as Error).message.slice(0, 80)}`);
          }
          await sleep(Math.min(30_000, 5_000 * attempt));
        }
        if (!resp || !resp.ok) {
          auditLog('collectAndDownloadVideos:fetch-failed', `${jobId} HTTP ${lastStatus} ${mp4Url.slice(-80)}`);
          results.push({ jobId, resultUrl: null, error: `HTTP ${lastStatus} fetching mp4` });
          continue;
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        writeFileSync(outPath, buf);
        auditLog('collectAndDownloadVideos:saved', `${jobId} → ${buf.length} bytes`);
        results.push({ jobId, resultUrl: `/generations/${jobId}/clips/clip_0.mp4` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        auditLog('collectAndDownloadVideos:error', `${jobId}: ${msg}`);
        results.push({ jobId, resultUrl: null, error: msg });
      }
    }

    auditLog('collectAndDownloadVideos:done', `saved ${results.filter((r) => r.resultUrl).length}/${expectedCount}`);
    return results;
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

  private async downloadToTempPng(
    urlOrPath: string,
    jobId: string,
    filename: string,
  ): Promise<string> {
    const tmpDir = path.join(process.cwd(), 'public', 'generations', jobId);
    mkdirSync(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, filename);

    // 1. Fetch bytes
    let buf: Buffer;
    if (urlOrPath.startsWith('http')) {
      const r = await fetch(urlOrPath);
      buf = Buffer.from(await r.arrayBuffer());
    } else if (urlOrPath.startsWith('data:')) {
      const b64 = urlOrPath.split(',')[1] ?? urlOrPath;
      buf = Buffer.from(b64, 'base64');
    } else if (urlOrPath.startsWith('/generations/')) {
      // Internal path from our public dir
      buf = readFileSync(path.join(process.cwd(), 'public', urlOrPath));
    } else {
      buf = readFileSync(urlOrPath);
    }

    // 2. Detect format. If webp → convert via sharp.
    const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
    if (isWebp) {
      const sharp = (await import('sharp')).default;
      buf = await sharp(buf).png().toBuffer();
      auditLog('downloadToTempPng:converted', 'webp → png');
    }

    writeFileSync(outPath, buf);
    return outPath;
  }
}
