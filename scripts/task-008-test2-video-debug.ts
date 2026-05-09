/**
 * Task-008 TEST 2 DEBUG — пошаговая диагностика generateVideo (Kling 2.5 Turbo).
 *
 * Цель: один прогон → из лога видно на каком шаге упало.
 *
 * Запуск (PowerShell, Chrome с CDP):
 *   $env:HIGGSFIELD_CDP_HOST='127.0.0.1'; $env:HIGGSFIELD_CDP_PORT='9224'; npx tsx scripts/task-008-test2-video-debug.ts
 *
 * Скриншоты → data/task-008-evidence/test2-video-debug/
 * Start frame: data/task-008-evidence/test1-debug/downloaded_image.png (from TEST 1)
 */

import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { mkdirSync, appendFileSync, statSync, existsSync } from 'fs';
import path from 'path';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_WAIT_MS = 900_000; // 15 min — Unlimited Relax queue, video gen is slow
const EVIDENCE_DIR = 'data/task-008-evidence/test2-video-debug';
const LOG_FILE = `${EVIDENCE_DIR}/debug.log`;
const START_FRAME = path.resolve('data/task-008-evidence/test1-debug/downloaded_image.png');
const PROMPT = 'The cat slowly turns its head and blinks, gentle wind in the grass';

// ── Logging helper ─────────────────────────────────────────────────────────────

function log(step: number | string, msg: string): void {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const line = `[${hh}:${mm}:${ss}] [STEP ${step}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

async function screenshot(page: Page, name: string): Promise<void> {
  const p = path.join(EVIDENCE_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  log('-', `screenshot saved: ${name}`);
}

// ── Wide DOM dump helpers ──────────────────────────────────────────────────────

async function dumpAllImages(page: Page) {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .map((img, i) => {
        const r = img.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return null;
        const parent = img.parentElement;
        const grandparent = parent?.parentElement;
        return {
          index: i,
          src: (img.src || '').slice(0, 200),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          parentTag: parent?.tagName?.toLowerCase() || '',
          parentClass: (parent?.className || '').toString().slice(0, 100),
          grandparentTag: grandparent?.tagName?.toLowerCase() || '',
          grandparentClass: (grandparent?.className || '').toString().slice(0, 100),
          inFigure: !!img.closest('figure'),
          figureClass: (img.closest('figure')?.className || '').toString().slice(0, 100),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.rect.y - b.rect.y);
  });
}

async function dumpVideoElements(page: Page) {
  return page.evaluate(() => {
    const results: Array<{
      type: string;
      src: string;
      rect: { x: number; y: number; w: number; h: number };
      parentTag: string;
      parentClass: string;
    }> = [];

    // <video> elements
    for (const v of Array.from(document.querySelectorAll('video'))) {
      const r = v.getBoundingClientRect();
      const src = v.src || '';
      const sourceEl = v.querySelector('source');
      const sourceSrc = sourceEl?.src || '';
      results.push({
        type: 'video',
        src: (src || sourceSrc).slice(0, 200),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parentTag: v.parentElement?.tagName?.toLowerCase() || '',
        parentClass: (v.parentElement?.className || '').toString().slice(0, 100),
      });
    }

    // <a href*=".mp4"> links
    for (const a of Array.from(document.querySelectorAll('a[href*=".mp4"]'))) {
      const r = a.getBoundingClientRect();
      results.push({
        type: 'a[mp4]',
        src: ((a as HTMLAnchorElement).href || '').slice(0, 200),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parentTag: a.parentElement?.tagName?.toLowerCase() || '',
        parentClass: (a.parentElement?.className || '').toString().slice(0, 100),
      });
    }

    // <video source> elements
    for (const s of Array.from(document.querySelectorAll('video source'))) {
      const r = s.parentElement?.getBoundingClientRect() || { x: 0, y: 0, width: 0, height: 0 };
      results.push({
        type: 'source',
        src: ((s as HTMLSourceElement).src || '').slice(0, 200),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parentTag: s.parentElement?.tagName?.toLowerCase() || '',
        parentClass: (s.parentElement?.className || '').toString().slice(0, 100),
      });
    }

    return results;
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `\n# DEBUG RUN — ${new Date().toISOString()}\n\n`);

  // Pre-flight: check start frame exists
  if (!existsSync(START_FRAME)) {
    log(0, `FAILED: start frame not found at ${START_FRAME}. Run TEST 1 first.`);
    process.exit(1);
  }
  log(0, `start frame: ${START_FRAME} (${statSync(START_FRAME).size} bytes)`);
  log(0, `prompt: "${PROMPT}"`);

  // ── Connect via CDP ────────────────────────────────────────────────────────
  const host = process.env.HIGGSFIELD_CDP_HOST || 'localhost';
  const port = process.env.HIGGSFIELD_CDP_PORT || '9223';
  const cdpUrl = `http://${host}:${port}`;
  log(0, `connecting to Chrome CDP at ${cdpUrl}`);

  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No browser contexts at CDP endpoint');
  const context: BrowserContext = contexts[0];
  const page: Page = context.pages()[0] || await context.newPage();
  log(0, `connected, ${context.pages().length} page(s), navigating to /ai/video`);

  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await screenshot(page, 'step-0-loaded.png');

  // ── STEP 1: selectModel — Kling 2.5 Turbo ───────────────────────────────
  try {
    log(1, 'selecting model Kling 2.5 Turbo — opening Model dropdown');

    // §2.2 — button[aria-label="Model"]
    const modelBtn = page.locator('button[aria-label="Model"]');
    if (await modelBtn.count() === 0) throw new Error('button[aria-label="Model"] not found');
    await modelBtn.click({ delay: 100 });
    await page.waitForTimeout(1500);
    log(1, 'model dropdown opened');

    // §2.3 — expand Kling category
    const klingCategory = page.locator('button').filter({
      has: page.locator('text=/^Kling\\s*$/'),
      hasText: /Perfect motion/i,
    });
    if (await klingCategory.count() === 0) {
      // Maybe already expanded or different structure — dump buttons
      const btns = await page.locator('button').evaluateAll(bs =>
        bs.map(b => (b.textContent || '').trim().replace(/\n/g, ' ').slice(0, 80)).filter(t => /kling/i.test(t)),
      );
      log(1, `Kling category not found. Buttons with "Kling": ${JSON.stringify(btns)}`);
      throw new Error('Kling category button not found in video dropdown');
    }
    await klingCategory.click({ delay: 100 });
    await page.waitForTimeout(2000);
    log(1, 'Kling category expanded');

    // §2.4 — click Kling 2.5 Turbo option (has tech specs like "1080p", "5s-10s")
    const klingOption = page.locator('button')
      .filter({ hasText: /Kling 2\.5 Turbo/i })
      .filter({ hasText: /\d+s-\d+s|\d+p|UNLIMITED/i });
    if (await klingOption.count() === 0) {
      throw new Error('Kling 2.5 Turbo option not found after expanding category');
    }
    await klingOption.first().click({ delay: 100 });
    await page.waitForTimeout(2500);

    // Verify: Model button now shows "Kling 2.5 Turbo"
    const modelText = ((await modelBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    if (!/Kling 2\.5 Turbo/i.test(modelText)) {
      log(1, `WARNING: Model button shows "${modelText}" — may not have selected correctly`);
    }

    log(1, `model selected: Kling 2.5 Turbo (button text: "${modelText}")`);
    await screenshot(page, 'step-1-ok.png');
  } catch (err) {
    log(1, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-1-fail.png');
    process.exit(1);
  }

  // ── STEP 2: upload start frame ───────────────────────────────────────────
  try {
    log(2, 'uploading start frame via input[type="file"]');

    const fileInputs = await page.locator('input[type="file"]').all();
    log(2, `found ${fileInputs.length} file input(s) on page`);
    if (fileInputs.length < 1) throw new Error('no input[type="file"] found on /ai/video');

    await fileInputs[0].setInputFiles(START_FRAME);
    await page.waitForTimeout(2500);

    log(2, 'start frame uploaded');
    await screenshot(page, 'step-2-ok.png');
  } catch (err) {
    log(2, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-2-fail.png');
    process.exit(1);
  }

  // ── STEP 3: type prompt (textarea#prompt, NOT Lexical) ───────────────────
  try {
    log(3, 'typing prompt into textarea#prompt');

    const ta = page.locator('textarea#prompt');
    if (await ta.count() === 0) {
      // Fallback: any textarea with "Describe" placeholder
      const fallback = page.locator('textarea[placeholder*="Describe"]');
      if (await fallback.count() === 0) throw new Error('textarea#prompt not found, no fallback either');
      log(3, 'textarea#prompt not found, using fallback textarea[placeholder*="Describe"]');
      await fallback.click({ delay: 100 });
      await fallback.fill('');
      await fallback.pressSequentially(PROMPT, { delay: 40 });
    } else {
      await ta.click({ delay: 100 });
      await ta.fill('');
      await ta.pressSequentially(PROMPT, { delay: 40 });
    }

    log(3, 'prompt typed OK');
  } catch (err) {
    log(3, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-3-fail.png');
    process.exit(1);
  }

  // ── STEP 4: enableUnlimited (video — banner, NOT toggle switch) ─────────
  // §2.5: on /ai/video, Unlimited is a clickable banner "Change to 720p 5s for Unlimited"
  // Banner appears AFTER start frame upload. If no banner — check Generate button cost.
  try {
    log(4, 'looking for Unlimited banner or toggle');
    await page.waitForTimeout(1000); // let UI settle after frame upload

    // 4a. DOM dump: switches + banner candidates
    const switchesDump = await page.evaluate(() => {
      const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
      return switches.map((s, i) => {
        const r = s.getBoundingClientRect();
        const candidates = Array.from(document.querySelectorAll('label, span, div, p'))
          .map(el => {
            const er = el.getBoundingClientRect();
            const text = (el.textContent || '').trim();
            if (!text || text.length > 60) return null;
            const dx = Math.abs(er.x - r.x);
            const dy = Math.abs(er.y - r.y);
            if (dx > 250 || dy > 60) return null;
            return { text, dx, dy };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null)
          .sort((a, b) => (a.dx + a.dy) - (b.dx + b.dy))
          .slice(0, 3)
          .map(v => v.text);
        return {
          index: i,
          ariaChecked: s.getAttribute('aria-checked'),
          dataState: s.getAttribute('data-state'),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          nearbyTexts: candidates,
        };
      });
    });
    log('4a', `switches in DOM: ${JSON.stringify(switchesDump, null, 2)}`);

    // 4b. Try banner approach first (§2.5)
    const banner = page.locator('*').filter({ hasText: /Change to 720p 5s[\s\S]*for Unlimited/i }).first();
    const bannerVisible = await banner.isVisible().catch(() => false);

    if (bannerVisible) {
      log('4b', 'found Unlimited banner "Change to 720p 5s for Unlimited", clicking');
      await banner.click({ delay: 100 });
      await page.waitForTimeout(1500);
      log('4b', 'banner clicked');
    } else {
      log('4b', 'no Unlimited banner visible');

      // 4c. Try toggle switch with "Unlimited" nearby (like image flow)
      const target = switchesDump.find(s => s.nearbyTexts.some(t => /unlimited/i.test(t)));
      if (target && target.ariaChecked !== 'true' && target.dataState !== 'checked') {
        log('4c', `found Unlimited switch at index ${target.index}, clicking`);
        const sw = page.locator('button[role="switch"]').nth(target.index);
        await sw.click({ delay: 100 });
        await page.waitForTimeout(1500);
        log('4c', 'switch clicked');
      } else if (target) {
        log('4c', `Unlimited switch at index ${target.index} already ON`);
      } else {
        log('4c', 'no Unlimited switch found either');
      }
    }

    // 4d. Verify: check Generate button cost (should be 0 for Unlimited)
    const genBtn = page.locator('button').filter({ hasText: /Generate|Unlimited/i }).last();
    const genText = ((await genBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log('4d', `submit button text after Unlimited attempt: "${genText}"`);

    // If it says "Generate 0" or contains "Unlimited" — OK
    // If "Generate 6" — Unlimited didn't activate, but we continue with logging
    if (/Generate\s+[1-9]/.test(genText) && !/unlimited/i.test(genText)) {
      log('4d', `WARNING: submit button shows cost>0: "${genText}". Unlimited may not have activated. Continuing for diagnostic purposes.`);
    }

    await screenshot(page, 'step-4-ok.png');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PROCESS_EXIT') throw err;
    log(4, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-4-fail.png');
    process.exit(1);
  }

  // ── STEP 5: DOM dump BEFORE submit ───────────────────────────────────────
  {
    const imgDump = await dumpAllImages(page);
    log('5a', `image DOM dump BEFORE submit — ${imgDump.length} visible images:`);
    log('5a', JSON.stringify(imgDump.slice(0, 10), null, 2));

    const videoDump = await dumpVideoElements(page);
    log('5b', `video DOM dump BEFORE submit — ${videoDump.length} video/source/mp4 elements:`);
    log('5b', JSON.stringify(videoDump, null, 2));
  }

  // ── STEP 6: click submit (verify BEFORE click) ──────────────────────────
  try {
    log(6, 'looking for submit button');

    const submitBtn = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
    await submitBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    const btnText = ((await submitBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log(6, `button text before click: "${btnText}"`);

    // For video: "Generate 0" is OK (Unlimited active), "Unlimited..." also OK
    // "Generate 6" means credits will be spent — warn but don't block (diagnostic script)
    if (/Generate\s+[1-9]/.test(btnText) && !/unlimited/i.test(btnText)) {
      log(6, `WARNING: button shows cost>0: "${btnText}". This will spend credits. Proceeding for diagnostic.`);
    }

    const box = await submitBtn.boundingBox();
    if (!box) throw new Error('submit button has no bounding box');
    await page.mouse.move(
      box.x + box.width / 2 + (Math.random() - 0.5) * 4,
      box.y + box.height / 2 + (Math.random() - 0.5) * 4,
      { steps: 10 },
    );
    await page.waitForTimeout(200);
    await page.mouse.click(
      box.x + box.width / 2 + (Math.random() - 0.5) * 4,
      box.y + box.height / 2 + (Math.random() - 0.5) * 4,
    );

    log(6, 'submit button clicked');
    await screenshot(page, 'step-6-ok.png');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PROCESS_EXIT') throw err;
    log(6, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-6-fail.png');
    process.exit(1);
  }

  // ── STEP 7: polling for video result ─────────────────────────────────────
  // Unknown DOM structure for video results — poll with dump at 60s and 120s
  try {
    const pollStart = Date.now();
    let dumpedAt60 = false;
    let dumpedAt120 = false;
    let foundVideo = false;

    while (Date.now() - pollStart < MAX_WAIT_MS) {
      const elapsed = Math.round((Date.now() - pollStart) / 1000);

      // Check for video elements
      const videoDump = await dumpVideoElements(page);
      const videoCount = videoDump.length;

      // Also check for any new thumbnail images (video previews may be img elements)
      const imgCount = await page.locator('img[src*="images.higgs.ai"]').count();

      log(7, `elapsed: ${elapsed}s, video_elements: ${videoCount}, higgs_images: ${imgCount}`);

      // DOM dump at 60s
      if (!dumpedAt60 && elapsed >= 60) {
        log(7, `DOM dump at ${elapsed}s — video elements:`);
        log(7, JSON.stringify(videoDump, null, 2));
        const imgDump = await dumpAllImages(page);
        log(7, `DOM dump at ${elapsed}s — images (top 10):`);
        log(7, JSON.stringify(imgDump.slice(0, 10), null, 2));
        await screenshot(page, 'step-7-dump-60s.png');
        dumpedAt60 = true;
      }

      // DOM dump at 120s
      if (!dumpedAt120 && elapsed >= 120) {
        log(7, `DOM dump at ${elapsed}s — video elements:`);
        log(7, JSON.stringify(videoDump, null, 2));
        await screenshot(page, 'step-7-dump-120s.png');
        dumpedAt120 = true;
      }

      // Check for actual video with src (not just empty video element)
      const videoWithSrc = videoDump.filter(v => v.src.length > 10);
      if (videoWithSrc.length > 0) {
        log(7, `found video with src: ${JSON.stringify(videoWithSrc)}`);
        foundVideo = true;
        break;
      }

      // Also try: waitForSelector with short timeout
      try {
        await page.waitForSelector('video source[src], video[src]', { timeout: 5000 });
        log(7, 'video source appeared via waitForSelector');
        foundVideo = true;
        break;
      } catch {
        // Not yet — continue polling
      }

      await page.waitForTimeout(5000);
    }

    if (!foundVideo) {
      // Final dump before failing
      const finalVideoDump = await dumpVideoElements(page);
      const finalImgDump = await dumpAllImages(page);
      log(7, `FINAL dump — video elements: ${JSON.stringify(finalVideoDump)}`);
      log(7, `FINAL dump — images (top 10): ${JSON.stringify(finalImgDump.slice(0, 10))}`);
      throw new Error(`timeout ${MAX_WAIT_MS / 1000}s, no video with src appeared`);
    }

    await screenshot(page, 'step-7-ok.png');
  } catch (err) {
    log(7, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-7-fail.png');
    process.exit(1);
  }

  // ── STEP 8: identify the video result and try to interact ────────────────
  // At this point we found a <video> with src. Try to click it → modal → Download.
  // This is exploratory — DOM may differ from image flow.
  try {
    log(8, 'attempting to interact with video result');

    // Try clicking on the video element or its container
    const videoEl = page.locator('video[src], video:has(source[src])').first();
    const videoVisible = await videoEl.isVisible().catch(() => false);

    if (videoVisible) {
      await videoEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await videoEl.click({ delay: 100 });
      log(8, 'clicked video element');
    } else {
      // Maybe it's in a figure or card — try clicking parent
      const videoParent = page.locator('video[src], video:has(source[src])').first().locator('..');
      await videoParent.click({ delay: 100 });
      log(8, 'clicked video parent element');
    }
    await page.waitForTimeout(2500);
    await screenshot(page, 'step-8-ok.png');
  } catch (err) {
    log(8, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-8-fail.png');
    process.exit(1);
  }

  // ── STEP 9: check for modal/detail view ──────────────────────────────────
  try {
    const dialogSelectors = [
      'dialog',
      '[role="dialog"]',
      '[data-state="open"]',
      '.modal',
      '[class*="modal"]',
      '[class*="overlay"]',
      '[class*="detail"]',
      '[class*="lightbox"]',
    ];
    let detailFound = false;
    for (const sel of dialogSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        log(9, `detail view rendered? yes (matched selector: "${sel}", count: ${count})`);
        detailFound = true;
        break;
      }
    }
    if (!detailFound) {
      log(9, 'detail view rendered? no — none of the dialog/modal selectors matched');
      log(9, 'continuing anyway to inspect buttons on page');
    }
    await screenshot(page, 'step-9-ok.png');
  } catch (err) {
    log(9, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-9-fail.png');
    process.exit(1);
  }

  // ── STEP 10: enumerate all visible buttons ───────────────────────────────
  try {
    const allButtons = await page.locator('button').evaluateAll((btns) =>
      btns.map((b) => ({
        text: (b.textContent || '').trim().replace(/\n/g, ' ').slice(0, 60),
        aria: b.getAttribute('aria-label') || '',
        visible: (b as HTMLElement).offsetParent !== null,
      })),
    );
    const visibleButtons = allButtons.filter((b) => b.visible);
    log(10, `buttons on page (visible only): ${JSON.stringify(visibleButtons)}`);
  } catch (err) {
    log(10, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-10-fail.png');
    process.exit(1);
  }

  // ── STEP 11: click Download ──────────────────────────────────────────────
  try {
    log(11, 'looking for Download button');
    const downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
    await downloadBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    const dlText = ((await downloadBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log(11, `found Download button, text: "${dlText}"`);

    log(12, `awaiting download event (timeout ${MAX_WAIT_MS / 1000}s)`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: MAX_WAIT_MS }),
      downloadBtn.click({ delay: 100 }),
    ]);
    log(11, 'Download button clicked');
    log(12, 'download event received');

    // ── STEP 13: save file ───────────────────────────────────────────────
    const suggested = download.suggestedFilename();
    const ext = path.extname(suggested) || '.mp4';
    const savePath = path.join(EVIDENCE_DIR, `downloaded_video${ext}`);
    log(13, `saving to ${savePath} (suggested: ${suggested})`);
    await download.saveAs(savePath);

    let fileSize = 0;
    try {
      fileSize = statSync(savePath).size;
    } catch { /* ignore */ }
    log(13, `saved, file size: ${fileSize} bytes`);
    await screenshot(page, 'step-13-ok.png');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Download') || msg.includes('Waiting for locator')) {
      log(11, `FAILED: ${msg}`);
      await screenshot(page, 'step-11-fail.png');
    } else if (msg.includes('download') || msg.includes('timeout') || msg.includes('event')) {
      log(12, `FAILED: ${msg}`);
      await screenshot(page, 'step-12-fail.png');
    } else {
      log(13, `FAILED: ${msg}`);
      await screenshot(page, 'step-13-fail.png');
    }
    process.exit(1);
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  log('DONE', 'TEST 2 VIDEO PASS');

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  (t as ReturnType<typeof setTimeout>).unref();
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    log('FATAL', msg);
  } catch {
    console.error(`[FATAL] ${msg}`);
  }
  process.exit(1);
});
