/**
 * Task-008 TEST 1 DEBUG — пошаговая диагностика generateImage.
 *
 * Цель: один прогон → из лога видно на каком шаге упало.
 *
 * Запуск (PowerShell, Chrome с CDP):
 *   $env:HIGGSFIELD_CDP_HOST='127.0.0.1'; $env:HIGGSFIELD_CDP_PORT='9224'; npx tsx scripts/task-008-test1-debug.ts
 *   npx tsx scripts/task-008-test1-debug.ts "A red dragon on a mountain, fantasy style"
 *
 * Скриншоты → data/task-008-evidence/test1-debug/
 */

import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { mkdirSync, appendFileSync, statSync } from 'fs';
import path from 'path';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_WAIT_MS = 900_000; // 15 min — Unlimited Relax queue can take 5-15 min
const EVIDENCE_DIR = 'data/task-008-evidence/test1-debug';
const LOG_FILE = `${EVIDENCE_DIR}/debug.log`;

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

// ── URL normalization helper ───────────────────────────────────────────────────

// Higgsfield uses TWO DOM structures:
//   - History (old): <aside><figure class="group..."><img></figure></aside>
//   - Latest/Today:  <div class="absolute will-change-transform"><div class="@container..."><img></div></div>
// We need both — drop the figure ancestor requirement.
const thumbSelector = 'img[src*="images.higgs.ai"]';

async function collectNormalized(page: Page): Promise<Array<{ raw: string; normalized: string }>> {
  return page.locator(thumbSelector).evaluateAll((imgs) => {
    return imgs.map((img) => {
      const raw = (img as HTMLImageElement).src;
      let normalized = raw;
      try {
        const u = new URL(raw, location.origin);
        const proxied = u.searchParams.get('url');
        if (proxied) normalized = proxied;
      } catch { /* keep raw */ }
      return { raw, normalized };
    });
  });
}

// ── Wide DOM dump helper ───────────────────────────────────────────────────────

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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `\n# DEBUG RUN — ${new Date().toISOString()}\n\n`);

  const prompt = process.argv[2] || 'A white cat sitting in a sunlit field, anime style';
  log(0, `prompt: "${prompt}"`);

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
  log(0, `connected, ${context.pages().length} page(s), navigating to /ai/image`);

  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, 'step-0-loaded.png');

  // ── STEP 1: selectModel ──────────────────────────────────────────────────
  try {
    log(1, 'selecting model seedream_v5_lite — opening dropdown');

    const modelBtn = page.locator('button:has(svg)')
      .filter({ hasText: /Nano Banana|Seedream|Flux|Soul|Kling/i })
      .last();
    if (await modelBtn.count() === 0) throw new Error('model composer button not found');
    await modelBtn.click({ delay: 100 });
    await page.waitForTimeout(1500);

    const option = page.locator('button')
      .filter({ hasText: /Seedream 5\.0 lite/i })
      .filter({ hasText: /UNLIMITED|reasoning|quality|speed/i });
    if (await option.count() === 0) throw new Error('Seedream 5.0 lite option not found in dropdown');
    await option.first().click({ delay: 100 });
    await page.waitForTimeout(2000);

    log(1, 'model selected: Seedream 5.0 lite');
    await screenshot(page, 'step-1-ok.png');
  } catch (err) {
    log(1, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-1-fail.png');
    process.exit(1);
  }

  // ── STEP 2: type prompt (Lexical on /ai/image) ──────────────────────────
  try {
    log(2, 'typing prompt into Lexical contenteditable');

    const editable = page.locator('[contenteditable="true"]');
    await editable.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    await editable.click({ delay: 100 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    await page.keyboard.type(prompt, { delay: 50 });

    log(2, 'prompt typed OK');
  } catch (err) {
    log(2, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-2-fail.png');
    process.exit(1);
  }

  // ── STEP 3: enableUnlimited (DOM dump + targeted click + verify) ────────

  // 3a. DOM dump all switches
  try {
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
    log('3a', `switches in DOM: ${JSON.stringify(switchesDump, null, 2)}`);

    // 3b. Identify Unlimited switch
    const target = switchesDump.find(s => s.nearbyTexts.some(t => /unlimited/i.test(t)));
    if (!target) {
      log('3b', `FAILED: no switch with "Unlimited" in nearbyTexts. Dump: ${JSON.stringify(switchesDump)}`);
      await screenshot(page, 'step-3b-fail.png');
      process.exit(1);
    }
    log('3b', `target switch: index=${target.index}, currently aria-checked="${target.ariaChecked}", data-state="${target.dataState}"`);

    // 3c. Click if OFF, verify
    if (target.ariaChecked !== 'true' && target.dataState !== 'checked') {
      const switchHandle = page.locator('button[role="switch"]').nth(target.index);
      await switchHandle.click();
      try {
        await page.waitForFunction(
          ({ idx }: { idx: number }) => {
            const s = document.querySelectorAll('button[role="switch"]')[idx] as HTMLButtonElement | undefined;
            return s?.getAttribute('aria-checked') === 'true' || s?.getAttribute('data-state') === 'checked';
          },
          { idx: target.index },
          { timeout: 5000 },
        );
        log('3c', 'clicked, now ON');
      } catch {
        log('3c', `FAILED: clicked switch ${target.index} but state stayed OFF (aria-checked="${target.ariaChecked}", data-state="${target.dataState}")`);
        await screenshot(page, 'step-3c-fail.png');
        process.exit(1);
      }
    } else {
      log('3c', 'already checked, skipping click');
    }
    await screenshot(page, 'step-3-ok.png');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PROCESS_EXIT') throw err;
    log(3, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-3-fail.png');
    process.exit(1);
  }

  // ── STEP 4: baseline snapshot (normalized URLs + samples) ────────────────
  let baselineSrcs: Set<string>;
  try {
    const baselineEntries = await collectNormalized(page);
    baselineSrcs = new Set(baselineEntries.map(e => e.normalized));
    log(4, `baseline urls captured: ${baselineSrcs.size} urls`);
    log(4, `baseline sample (first 3): ${JSON.stringify(baselineEntries.slice(0, 3), null, 2)}`);
  } catch (err) {
    log(4, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-4-fail.png');
    process.exit(1);
  }

  // ── STEP 4b: wide DOM dump BEFORE submit click ──────────────────────────
  {
    const baselineDump = await dumpAllImages(page);
    log('4b', `DOM dump BEFORE submit click — ${baselineDump.length} visible images:`);
    log('4b', JSON.stringify(baselineDump.slice(0, 15), null, 2));
  }

  // ── STEP 5: click Unlimited submit button (verify BEFORE click) ─────────
  try {
    log(5, 'looking for Unlimited submit button');

    const submitBtn = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
    await submitBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    const btnText = ((await submitBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log(5, `button text before click: "${btnText}"`);

    // FAIL-FAST: abort BEFORE click if button says "Generate" instead of "Unlimited"
    if (!/unlimited/i.test(btnText)) {
      log(5, `FAILED: expected "Unlimited" submit button but got "${btnText}". Toggle did not activate. Aborting BEFORE click to preserve credits.`);
      await screenshot(page, 'step-5-fail.png');
      process.exit(1);
    }

    log(5, 'verified Unlimited button, clicking now');
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

    log(5, 'Unlimited button clicked');
    await screenshot(page, 'step-5-ok.png');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PROCESS_EXIT') throw err;
    log(5, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-5-fail.png');
    process.exit(1);
  }

  // ── STEP 6: polling for new image URLs (normalized + samples) ────────────
  let newSrcs: string[] = [];
  try {
    const pollStart = Date.now();
    let firstIteration = true;
    let dumpedAfter = false;
    while (Date.now() - pollStart < MAX_WAIT_MS) {
      const currentEntries = await collectNormalized(page);
      const currentNorm = currentEntries.map(e => e.normalized);
      newSrcs = currentNorm.filter(src => !baselineSrcs.has(src));
      const elapsed = Math.round((Date.now() - pollStart) / 1000);
      log(6, `elapsed: ${elapsed}s, baseline_urls: ${baselineSrcs.size}, current_urls: ${currentNorm.length}, new_urls: ${newSrcs.length}`);

      if (firstIteration) {
        log(6, `current sample (first 3): ${JSON.stringify(currentEntries.slice(0, 3), null, 2)}`);
        firstIteration = false;
      }

      // Wide DOM dump after ~30s — Higgsfield will have rendered new images by then
      if (!dumpedAfter && elapsed >= 30) {
        const afterDump = await dumpAllImages(page);
        log(6, `DOM dump AFTER submit (elapsed=${elapsed}s) — ${afterDump.length} visible images:`);
        log(6, JSON.stringify(afterDump.slice(0, 15), null, 2));
        dumpedAfter = true;
      }

      if (newSrcs.length >= 1) {
        log(6, `new urls (first 2): ${JSON.stringify(newSrcs.slice(0, 2).map(u => u.slice(0, 120)))}`);
        break;
      }
      await page.waitForTimeout(5000);
    }

    if (newSrcs.length === 0) {
      throw new Error(`timeout ${MAX_WAIT_MS / 1000}s, no new image urls appeared`);
    }
  } catch (err) {
    log(6, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-6-fail.png');
    process.exit(1);
  }

  // ── STEP 7: found new image ──────────────────────────────────────────────
  const targetSrc = newSrcs[0];
  log(7, `new image normalized src: ${targetSrc.slice(0, 120)}`);
  await screenshot(page, 'step-7-ok.png');

  // Wait a bit for render
  await page.waitForTimeout(3000);

  // ── STEP 8: hover thumbnail ──────────────────────────────────────────────
  let thumbnail;
  try {
    // Find figure index by matching normalized URL
    const thumbIndex = await page.locator(thumbSelector).evaluateAll(
      (imgs, normTarget) => {
        return imgs.findIndex((img) => {
          const raw = (img as HTMLImageElement).src;
          let normalized = raw;
          try {
            const u = new URL(raw, location.origin);
            const proxied = u.searchParams.get('url');
            if (proxied) normalized = proxied;
          } catch { /* keep raw */ }
          return normalized === normTarget;
        });
      },
      targetSrc,
    );
    if (thumbIndex < 0) throw new Error('thumbnail with normalized src not found in DOM');
    log(8, `attempting hover on thumbnail at index ${thumbIndex}`);

    thumbnail = page.locator(thumbSelector).nth(thumbIndex);
    await thumbnail.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await thumbnail.hover();
    await page.waitForTimeout(800);

    log(8, 'hover OK');
  } catch (err) {
    log(8, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-8-fail.png');
    process.exit(1);
  }

  // ── STEP 9: click thumbnail to open detail view ──────────────────────────
  try {
    log(9, 'clicking thumbnail to open detail view');
    await thumbnail!.click({ delay: 100 });
    await page.waitForTimeout(2500);
    log(9, 'clicked, waiting for detail view');
    await screenshot(page, 'step-9-ok.png');
  } catch (err) {
    log(9, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-9-fail.png');
    process.exit(1);
  }

  // ── STEP 10: detail view check ───────────────────────────────────────────
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
        log(10, `detail view rendered? yes (matched selector: "${sel}", count: ${count})`);
        detailFound = true;
        break;
      }
    }
    if (!detailFound) {
      log(10, 'detail view rendered? no — none of the dialog/modal selectors matched');
      log(10, 'continuing anyway to inspect buttons on page');
    }
    await screenshot(page, 'step-10-ok.png');
  } catch (err) {
    log(10, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-10-fail.png');
    process.exit(1);
  }

  // ── STEP 11: enumerate all buttons (find Download) ───────────────────────
  try {
    const allButtons = await page.locator('button').evaluateAll((btns) =>
      btns.map((b) => ({
        text: (b.textContent || '').trim().replace(/\n/g, ' ').slice(0, 60),
        aria: b.getAttribute('aria-label') || '',
        visible: (b as HTMLElement).offsetParent !== null,
      })),
    );
    const visibleButtons = allButtons.filter((b) => b.visible);
    log(11, `buttons on page (visible only): ${JSON.stringify(visibleButtons)}`);
  } catch (err) {
    log(11, `FAILED: ${(err as Error).message}`);
    await screenshot(page, 'step-11-fail.png');
    process.exit(1);
  }

  // ── STEP 12: click Download ──────────────────────────────────────────────
  try {
    log(12, 'looking for Download button');
    const downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
    await downloadBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
    const dlText = ((await downloadBtn.textContent()) || '').trim().replace(/\n/g, ' ');
    log(12, `found Download button, text: "${dlText}"`);

    // Set up download listener BEFORE clicking
    log(13, `awaiting download event (timeout ${MAX_WAIT_MS / 1000}s)`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: MAX_WAIT_MS }),
      downloadBtn.click({ delay: 100 }),
    ]);
    log(12, 'Download button clicked');
    log(13, 'download event received');

    // ── STEP 14: save file ───────────────────────────────────────────────
    const suggested = download.suggestedFilename();
    const ext = path.extname(suggested) || '.png';
    const savePath = path.join(EVIDENCE_DIR, `downloaded_image${ext}`);
    log(14, `saving to ${savePath} (suggested: ${suggested})`);
    await download.saveAs(savePath);

    let fileSize = 0;
    try {
      fileSize = statSync(savePath).size;
    } catch { /* ignore */ }
    log(14, `saved, file size: ${fileSize} bytes`);
    await screenshot(page, 'step-14-ok.png');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Download') || msg.includes('Waiting for locator')) {
      log(12, `FAILED: ${msg}`);
      await screenshot(page, 'step-12-fail.png');
    } else if (msg.includes('download') || msg.includes('timeout') || msg.includes('event')) {
      log(13, `FAILED: ${msg}`);
      await screenshot(page, 'step-13-fail.png');
    } else {
      log(14, `FAILED: ${msg}`);
      await screenshot(page, 'step-14-fail.png');
    }
    process.exit(1);
  }

  // ── DONE ─────────────────────────────────────────────────────────────────
  log('DONE', 'TEST 1 PASS');

  // Close cleanly without killing Chrome
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
