/**
 * Task-008 TEST 2 v2 DEBUG — video generation (Kling 2.5 Turbo Unlimited).
 *
 * Flow: select model → upload start frame → prompt → Resolution 720p + Duration 5s
 *       → banner/switch Unlimited → verify submit → click → poll <video src> → fetch mp4
 *
 * Запуск (PowerShell):
 *   $env:HIGGSFIELD_CDP_HOST='127.0.0.1'; $env:HIGGSFIELD_CDP_PORT='9224'; npx tsx scripts/task-008-test2-video-debug-v2.ts
 *
 * Скриншоты → data/task-008-evidence/test2-video-debug-v2/
 */

import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { mkdirSync, appendFileSync, statSync, existsSync, writeFileSync } from 'fs';
import path from 'path';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_WAIT_MS = 900_000; // 15 min — Unlimited Relax queue, video gen is slow
const EVIDENCE_DIR = 'data/task-008-evidence/test2-video-debug-v2';
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

// ── Helpers ────────────────────────────────────────────────────────────────────

async function collectVideoSrcs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const srcs: string[] = [];
    for (const v of Array.from(document.querySelectorAll('video'))) {
      if (v.src) srcs.push(v.src);
      for (const s of Array.from(v.querySelectorAll('source'))) {
        if ((s as HTMLSourceElement).src) srcs.push((s as HTMLSourceElement).src);
      }
    }
    return srcs.filter(s => s.length > 10);
  });
}

async function dumpVideoElements(page: Page) {
  return page.evaluate(() => {
    const results: Array<{
      type: string; src: string;
      rect: { x: number; y: number; w: number; h: number };
      parentTag: string; parentClass: string;
    }> = [];
    for (const v of Array.from(document.querySelectorAll('video'))) {
      const r = v.getBoundingClientRect();
      const src = v.src || '';
      const sourceEl = v.querySelector('source');
      const sourceSrc = sourceEl?.src || '';
      results.push({
        type: 'video', src: (src || sourceSrc).slice(0, 200),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parentTag: v.parentElement?.tagName?.toLowerCase() || '',
        parentClass: (v.parentElement?.className || '').toString().slice(0, 100),
      });
    }
    for (const a of Array.from(document.querySelectorAll('a[href*=".mp4"]'))) {
      const r = a.getBoundingClientRect();
      results.push({
        type: 'a[mp4]', src: ((a as HTMLAnchorElement).href || '').slice(0, 200),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parentTag: a.parentElement?.tagName?.toLowerCase() || '',
        parentClass: (a.parentElement?.className || '').toString().slice(0, 100),
      });
    }
    return results;
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `\n# DEBUG RUN v2 — ${new Date().toISOString()}\n\n`);

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

    const modelBtn = page.locator('button[aria-label="Model"]');
    if (await modelBtn.count() === 0) throw new Error('button[aria-label="Model"] not found');
    await modelBtn.click({ delay: 100 });
    await page.waitForTimeout(1500);
    log(1, 'model dropdown opened');

    // Expand Kling category
    const klingCategory = page.locator('button').filter({
      has: page.locator('text=/^Kling\\s*$/'),
      hasText: /Perfect motion/i,
    });
    if (await klingCategory.count() === 0) {
      const btns = await page.locator('button').evaluateAll(bs =>
        bs.map(b => (b.textContent || '').trim().replace(/\n/g, ' ').slice(0, 80)).filter(t => /kling/i.test(t)),
      );
      log(1, `Kling category not found. Buttons with "Kling": ${JSON.stringify(btns)}`);
      throw new Error('Kling category button not found');
    }
    await klingCategory.click({ delay: 100 });
    await page.waitForTimeout(2000);
    log(1, 'Kling category expanded');

    // Click Kling 2.5 Turbo option
    const klingOption = page.locator('button')
      .filter({ hasText: /Kling 2\.5 Turbo/i })
      .filter({ hasText: /\d+s-\d+s|\d+p|UNLIMITED/i });
    if (await klingOption.count() === 0) throw new Error('Kling 2.5 Turbo option not found');
    await klingOption.first().click({ delay: 100 });
    await page.waitForTimeout(2500);

    const modelText = ((await modelBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log(1, `model selected (button text: "${modelText}")`);
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
    log(2, `found ${fileInputs.length} file input(s)`);
    if (fileInputs.length < 1) throw new Error('no input[type="file"] found');
    await fileInputs[0].setInputFiles(START_FRAME);
    await page.waitForTimeout(2500);
    log(2, 'start frame uploaded');
    await screenshot(page, 'step-2-ok.png');
  } catch (err) {
    log(2, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-2-fail.png');
    process.exit(1);
  }

  // ── STEP 3: type prompt (textarea#prompt) ────────────────────────────────
  try {
    log(3, 'typing prompt into textarea#prompt');
    const ta = page.locator('textarea#prompt');
    if (await ta.count() === 0) {
      const fallback = page.locator('textarea[placeholder*="Describe"]');
      if (await fallback.count() === 0) throw new Error('no prompt textarea found');
      log(3, 'using fallback textarea[placeholder*="Describe"]');
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

  // ── STEP 4: enable Unlimited (banner-first, manual Resolution/Duration fallback) ──
  try {
    // 4a. Priority 1: banner "Change to ... Unlimited" (most direct path)
    log('4a', 'looking for "Change to ... Unlimited" banner');
    const banner = page.getByText(/Change to.*Unlimited/i).first();
    const bannerCount = await banner.count();

    if (bannerCount > 0) {
      log('4a', 'banner found, clicking (force: true to bypass underlay)');
      await banner.click({ force: true });
      await page.waitForTimeout(1500);
      log('4a', 'banner clicked');
      await screenshot(page, 'step-4a-banner.png');
    } else {
      // 4b. Fallback: manually set Resolution → 720p, Duration → 5s
      log('4a', 'banner not found, falling back to manual Resolution/Duration switch');

      // Resolution dropdown
      const resBtn = page.locator('button[aria-label*="Resolution" i]').first();
      if (await resBtn.count() > 0) {
        await resBtn.click({ force: true });
        await page.waitForTimeout(800);
        const opt720 = page.locator('[role="option"], [role="menuitem"], button').filter({ hasText: /^720p$/i }).first();
        if (await opt720.count() > 0) {
          await opt720.click({ force: true, timeout: 8000 });
          await page.waitForTimeout(800);
          log('4b', 'Resolution set to 720p');
        } else {
          log('4b', 'no 720p option found after opening Resolution dropdown');
        }
      } else {
        // Last-resort: button with "1080p" or "720p" text
        const altRes = page.locator('button').filter({ hasText: /1080p|720p/i }).first();
        if (await altRes.count() > 0) {
          await altRes.click({ force: true });
          await page.waitForTimeout(800);
          const opt720 = page.locator('[role="option"], [role="menuitem"], button').filter({ hasText: /^720p$/i }).first();
          if (await opt720.count() > 0) {
            await opt720.click({ force: true, timeout: 8000 });
            await page.waitForTimeout(800);
            log('4b', 'Resolution set to 720p (via text fallback)');
          }
        } else {
          log('4b', 'no Resolution button found at all');
        }
      }

      // Duration dropdown
      const durBtn = page.locator('button[aria-label*="Duration" i]').first();
      if (await durBtn.count() > 0) {
        await durBtn.click({ force: true });
        await page.waitForTimeout(800);
        const opt5s = page.locator('[role="option"], [role="menuitem"], button').filter({ hasText: /^5s$/i }).first();
        if (await opt5s.count() > 0) {
          await opt5s.click({ force: true, timeout: 8000 });
          await page.waitForTimeout(800);
          log('4b', 'Duration set to 5s');
        }
      }

      await page.waitForTimeout(1500);
      await screenshot(page, 'step-4b-manual.png');
    }

    // 4c. Check for Unlimited switch (may appear after banner-click or 720p+5s)
    log('4c', 'looking for Unlimited switch');
    const switches = await page.evaluate(() => {
      const sw = Array.from(document.querySelectorAll('button[role="switch"]'));
      return sw.map((s, i) => ({
        index: i,
        ariaChecked: s.getAttribute('aria-checked'),
        nearby: Array.from(document.querySelectorAll('label, span, div, p'))
          .filter(el => {
            const r = el.getBoundingClientRect();
            const sr = s.getBoundingClientRect();
            return Math.abs(r.x - sr.x) < 250 && Math.abs(r.y - sr.y) < 60
              && (el.textContent || '').trim().length > 0
              && (el.textContent || '').trim().length < 40;
          })
          .slice(0, 3)
          .map(el => (el.textContent || '').trim()),
      }));
    });
    log('4c', `switches found: ${JSON.stringify(switches)}`);

    const unlimitedSwitch = switches.find(s => s.nearby.some((t: string) => /unlimited/i.test(t)));
    if (unlimitedSwitch && unlimitedSwitch.ariaChecked !== 'true') {
      log('4d', `clicking Unlimited switch idx=${unlimitedSwitch.index}`);
      const sw = page.locator('button[role="switch"]').nth(unlimitedSwitch.index);
      await sw.click({ force: true });
      await page.waitForTimeout(800);
      log('4d', 'switch clicked');
    } else if (unlimitedSwitch) {
      log('4d', `Unlimited switch idx=${unlimitedSwitch.index} already ON`);
    } else {
      // Fallback: find toggle via "Unlimited mode" text label (banner mode toggle has different DOM than image's)
      log('4c', 'no nearby-text match; trying label-based fallback');
      const labelLocator = page.getByText(/Unlimited mode/i).first();
      const labelCount = await labelLocator.count();
      log('4c', `"Unlimited mode" label count: ${labelCount}`);
      if (labelCount > 0) {
        // Walk up DOM to find any switch-like control
        const clicked = await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll('*'))
            .filter(el => /^Unlimited mode$/i.test((el.textContent || '').trim()) && el.children.length === 0);
          for (const label of labels) {
            // look in same parent and adjacent for clickable toggle
            let scope: Element | null = label.parentElement;
            for (let depth = 0; depth < 4 && scope; depth++) {
              const toggle = scope.querySelector(
                'button[role="switch"], [role="switch"], input[type="checkbox"], button[data-state="checked"], button[data-state="unchecked"]'
              ) as HTMLElement | null;
              if (toggle) {
                toggle.click();
                return {
                  ok: true,
                  tag: toggle.tagName.toLowerCase(),
                  role: toggle.getAttribute('role'),
                  ariaChecked: toggle.getAttribute('aria-checked'),
                  dataState: toggle.getAttribute('data-state'),
                  depth,
                };
              }
              scope = scope.parentElement;
            }
          }
          return { ok: false };
        });
        log('4d', `label-based toggle click result: ${JSON.stringify(clicked)}`);
        await page.waitForTimeout(1200);
      } else {
        log('4c', 'no Unlimited mode label found either — proceeding to verify');
      }
    }

    // 4e. Verify submit text — must contain "Unlimited"
    const submitBtn = page.locator('button').filter({ hasText: /Unlimited|Generate/i }).last();
    await submitBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    const submitText = ((await submitBtn.textContent()) || '').trim().replace(/\s+/g, '');
    log('4e', `submit text after Unlimited setup: "${submitText}"`);

    // PASS if "Unlimited" appears anywhere (covers both "Unlimited" and "GenerateUnlimited" text variants).
    // FAIL if it looks like a priority-queue button "Generate6" / "Generate4" (digit means credit cost).
    const hasUnlimited = /Unlimited/i.test(submitText);
    const hasGenerateWithCredits = /Generate\d+/i.test(submitText);
    if (!hasUnlimited || hasGenerateWithCredits) {
      log('4e', `FAILED: expected submit to start with "Unlimited", got "${submitText}". ABORT — credits in danger.`);
      await screenshot(page, 'step-4e-fail.png');
      process.exit(1);
    }
    log('4e', 'verified Unlimited submit, proceeding');
    await screenshot(page, 'step-4-ok.png');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PROCESS_EXIT') throw err;
    log(4, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-4-fail.png');
    process.exit(1);
  }

  // ── STEP 5: baseline video src snapshot ──────────────────────────────────
  let baselineVideoSrcs: Set<string>;
  try {
    const srcs = await collectVideoSrcs(page);
    baselineVideoSrcs = new Set(srcs);
    log(5, `baseline video srcs: ${baselineVideoSrcs.size}`);
    if (baselineVideoSrcs.size > 0) {
      log(5, `sample: ${JSON.stringify([...baselineVideoSrcs].slice(0, 3).map(s => s.slice(0, 120)))}`);
    }

    // Also dump video elements for context
    const videoDump = await dumpVideoElements(page);
    log(5, `video elements before submit: ${JSON.stringify(videoDump)}`);
  } catch (err) {
    log(5, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-5-fail.png');
    process.exit(1);
  }

  // ── STEP 6: click Unlimited submit ───────────────────────────────────────
  try {
    log(6, 'clicking Unlimited submit button');
    const submitBtn = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
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
    log(6, 'Unlimited submit clicked');
    await screenshot(page, 'step-6-ok.png');
  } catch (err) {
    log(6, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-6-fail.png');
    process.exit(1);
  }

  // ── STEP 7: poll for new <video src> ─────────────────────────────────────
  let newVideoSrc = '';
  try {
    const pollStart = Date.now();
    let dumpedAt60 = false;
    let dumpedAt120 = false;

    while (Date.now() - pollStart < MAX_WAIT_MS) {
      const currentSrcs = await collectVideoSrcs(page);
      const newSrcs = currentSrcs.filter(s => !baselineVideoSrcs.has(s));
      const elapsed = Math.round((Date.now() - pollStart) / 1000);

      log(7, `elapsed: ${elapsed}s, baseline_videos: ${baselineVideoSrcs.size}, current_videos: ${currentSrcs.length}, new_videos: ${newSrcs.length}`);

      // Dump at 60s
      if (!dumpedAt60 && elapsed >= 60) {
        const dump = await dumpVideoElements(page);
        log(7, `video dump at ${elapsed}s: ${JSON.stringify(dump)}`);
        await screenshot(page, 'step-7-dump-60s.png');
        dumpedAt60 = true;
      }

      // Dump at 120s
      if (!dumpedAt120 && elapsed >= 120) {
        const dump = await dumpVideoElements(page);
        log(7, `video dump at ${elapsed}s: ${JSON.stringify(dump)}`);
        await screenshot(page, 'step-7-dump-120s.png');
        dumpedAt120 = true;
      }

      if (newSrcs.length > 0) {
        newVideoSrc = newSrcs[0];
        log(7, `new video src found: ${newVideoSrc.slice(0, 200)}`);
        break;
      }

      await page.waitForTimeout(5000);
    }

    if (!newVideoSrc) {
      // Final dump
      const finalDump = await dumpVideoElements(page);
      log(7, `FINAL video dump: ${JSON.stringify(finalDump)}`);
      throw new Error(`timeout ${MAX_WAIT_MS / 1000}s, no new video src appeared`);
    }
    await screenshot(page, 'step-7-ok.png');
  } catch (err) {
    log(7, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-7-fail.png');
    process.exit(1);
  }

  // ── STEP 8: log new video src ────────────────────────────────────────────
  log(8, `downloading video from: ${newVideoSrc.slice(0, 200)}`);

  // ── STEP 9: fetch mp4 and save ───────────────────────────────────────────
  try {
    const response = await page.request.get(newVideoSrc);
    const buf = Buffer.from(await response.body());
    const savePath = path.join(EVIDENCE_DIR, 'downloaded_video.mp4');
    writeFileSync(savePath, buf);

    let fileSize = 0;
    try { fileSize = statSync(savePath).size; } catch { /* ignore */ }
    log(9, `saved: ${savePath}, file size: ${fileSize} bytes`);
    await screenshot(page, 'step-9-ok.png');
  } catch (err) {
    log(9, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-9-fail.png');
    process.exit(1);
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  log('DONE', 'TEST 2 v2 VIDEO PASS');

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
