/**
 * E2E: image generation → auto-transition → video generation with that image as start frame.
 *
 * Phase A: /ai/image — Seedream 5.0 lite, Unlimited mode, save .png
 * Phase B: /ai/video — Kling 2.5 Turbo, upload phase A image as start frame,
 *          banner→Unlimited mode toggle→submit, click result thumbnail→modal→Download .mp4
 *
 * Final: data/task-008-evidence/e2e/ contains image.png + video.mp4
 *
 * Run:
 *   $env:HIGGSFIELD_CDP_HOST='127.0.0.1'
 *   $env:HIGGSFIELD_CDP_PORT='9224'
 *   npx tsx scripts/task-008-e2e-image-then-video.ts
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_WAIT_MS = 900_000; // 15 min for Unlimited Relax queue
const EVIDENCE_DIR = 'data/task-008-evidence/e2e';
const LOG_FILE = `${EVIDENCE_DIR}/e2e.log`;

const IMAGE_PROMPT = 'A white cat sitting in a sunlit field, anime style';
const VIDEO_PROMPT = 'The cat slowly turns its head and blinks, gentle wind in the grass';

// ── Setup ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function log(step: string | number, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  const line = `[${t}] [STEP ${step}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function screenshot(page: Page, name: string) {
  const fullPath = path.join(EVIDENCE_DIR, name);
  await page.screenshot({ path: fullPath, fullPage: false });
  log('-', `screenshot: ${name}`);
}

// ── Connect ────────────────────────────────────────────────────────────────────
async function connectChrome(): Promise<{ browser: any; ctx: BrowserContext; page: Page; capturedMp4s: Set<string> }> {
  const host = process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1';
  const port = process.env.HIGGSFIELD_CDP_PORT || '9224';
  log(0, `connecting to Chrome CDP at http://${host}:${port}`);
  const browser = await chromium.connectOverCDP(`http://${host}:${port}`);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('no Chrome context');
  const page = ctx.pages()[0] || (await ctx.newPage());

  // Listen for all mp4 responses — Higgsfield streams video via direct CDN URLs.
  // We track them and pick the newest non-baseline one after generation completes.
  const capturedMp4s = new Set<string>();
  ctx.on('response', resp => {
    const u = resp.url();
    if (/\.mp4(\?|$)/i.test(u) && resp.status() < 400) {
      capturedMp4s.add(u);
    }
  });

  return { browser, ctx, page, capturedMp4s };
}

// ── Common Higgsfield ops ─────────────────────────────────────────────────────
async function selectModelInDropdown(
  page: Page,
  composerLabelRegex: RegExp,
  optionTextRegex: RegExp,
  optionalCategoryClick?: RegExp,
) {
  const modelBtn = page
    .locator('button:has(svg)')
    .filter({ hasText: composerLabelRegex })
    .last();
  await modelBtn.click({ delay: 100 });
  await page.waitForTimeout(800);
  if (optionalCategoryClick) {
    const cat = page.locator('button').filter({ hasText: optionalCategoryClick }).first();
    if (await cat.count()) {
      await cat.click({ force: true });
      await page.waitForTimeout(500);
    }
  }
  const opt = page.locator('button').filter({ hasText: optionTextRegex }).first();
  await opt.click({ force: true });
  await page.waitForTimeout(800);
}

async function typeIntoLexical(page: Page, prompt: string) {
  const editable = page.locator('[contenteditable="true"]').first();
  await editable.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
  await editable.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(prompt, { delay: 12 });
}

// Find Unlimited switch via near-text or label-walk fallback. Returns true if turned ON.
async function enableUnlimitedMode(page: Page): Promise<boolean> {
  const switchesDump = await page.evaluate(() => {
    const sw = Array.from(document.querySelectorAll('button[role="switch"]'));
    return sw.map((s, i) => {
      const r = s.getBoundingClientRect();
      const candidates = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter(el => {
          const er = el.getBoundingClientRect();
          const text = (el.textContent || '').trim();
          if (!text || text.length > 60) return false;
          return Math.abs(er.x - r.x) < 250 && Math.abs(er.y - r.y) < 60;
        })
        .map(el => (el.textContent || '').trim());
      // dedupe and keep more than 3 — "Unlimited" was being pushed out by repeated count tokens
      const nearby = Array.from(new Set(candidates)).slice(0, 10);
      return {
        index: i,
        ariaChecked: s.getAttribute('aria-checked'),
        nearby,
      };
    });
  });
  log('U', `switches: ${JSON.stringify(switchesDump)}`);

  const target = switchesDump.find(s => s.nearby.some(t => /unlimited/i.test(t)));
  if (target) {
    if (target.ariaChecked === 'true') {
      log('U', `switch idx=${target.index} already ON`);
      return true;
    }
    const sw = page.locator('button[role="switch"]').nth(target.index);
    await sw.click({ force: true });
    await page.waitForTimeout(800);
    log('U', `near-text match: switch idx=${target.index} clicked`);
    return true;
  }

  // Label-walk fallback (works for both /ai/image "Unlimited" and /ai/video "Unlimited mode")
  const labelLocator = page.getByText(/^Unlimited(\s+mode)?$/i).first();
  if ((await labelLocator.count()) === 0) {
    log('U', 'no near-text and no Unlimited label — proceeding without switch');
    return false;
  }
  const clicked = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('*')).filter(
      el => /^Unlimited(\s+mode)?$/i.test((el.textContent || '').trim()) && el.children.length === 0,
    );
    for (const label of labels) {
      let scope: Element | null = label.parentElement;
      for (let depth = 0; depth < 4 && scope; depth++) {
        const toggle = scope.querySelector(
          'button[role="switch"], [role="switch"], input[type="checkbox"]',
        ) as HTMLElement | null;
        if (toggle) {
          toggle.click();
          return { ok: true, depth };
        }
        scope = scope.parentElement;
      }
    }
    return { ok: false };
  });
  log('U', `label-walk toggle click: ${JSON.stringify(clicked)}`);
  await page.waitForTimeout(1200);
  return !!(clicked as { ok: boolean }).ok;
}

async function verifyUnlimitedSubmit(page: Page): Promise<{ btn: any; text: string }> {
  const submitBtn = page
    .locator('button')
    .filter({ hasText: /Unlimited|Generate/i })
    .last();
  await submitBtn.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
  const txt = ((await submitBtn.textContent()) || '').trim().replace(/\s+/g, '');
  log('V', `submit text: "${txt}"`);
  if (!/Unlimited/i.test(txt) || /Generate\d+/i.test(txt)) {
    throw new Error(`submit "${txt}" is not Unlimited (would cost credits) — abort`);
  }
  return { btn: submitBtn, text: txt };
}

async function clickViaMouseBox(page: Page, locator: any, label: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label}: no bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// ── Phase A: Image ─────────────────────────────────────────────────────────────
async function phaseImage(page: Page): Promise<string> {
  log('A0', `=== PHASE A: image generation (prompt: "${IMAGE_PROMPT}") ===`);
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, 'A0-image-loaded.png');

  // A1. Select Seedream 5.0 lite
  log('A1', 'selecting Seedream 5.0 lite');
  await selectModelInDropdown(
    page,
    /Nano Banana|Seedream|Flux|Soul|Kling/i,
    /Seedream 5\.?0? lite/i,
  );
  await screenshot(page, 'A1-model.png');

  // A2. Type prompt
  log('A2', 'typing prompt');
  await typeIntoLexical(page, IMAGE_PROMPT);

  // A3. Enable Unlimited
  log('A3', 'enabling Unlimited');
  await enableUnlimitedMode(page);
  await screenshot(page, 'A3-unlimited.png');

  // A4. Baseline image URLs
  const collectImgUrls = async () => {
    return page.locator('img[src*="images.higgs.ai"]').evaluateAll(imgs =>
      imgs.map(img => {
        const raw = (img as HTMLImageElement).src;
        let normalized = raw;
        try {
          const u = new URL(raw);
          const proxied = u.searchParams.get('url');
          if (proxied) normalized = proxied;
        } catch {}
        return normalized;
      }),
    );
  };
  const baseline = new Set(await collectImgUrls());
  log('A4', `baseline image urls: ${baseline.size}`);

  // A5. Verify + submit
  const { btn: submitBtnA } = await verifyUnlimitedSubmit(page);
  await clickViaMouseBox(page, submitBtnA, 'image submit');
  log('A5', 'image submit clicked');

  // A6. Poll for new image
  let newImgUrl = '';
  const pollStart = Date.now();
  while (Date.now() - pollStart < MAX_WAIT_MS) {
    const cur = await collectImgUrls();
    const newOnes = cur.filter(u => !baseline.has(u));
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    log('A6', `elapsed: ${elapsed}s, baseline: ${baseline.size}, current: ${cur.length}, new: ${newOnes.length}`);
    if (newOnes.length >= 1) {
      newImgUrl = newOnes[0];
      log('A6', `new image: ${newImgUrl.slice(0, 100)}`);
      break;
    }
    await page.waitForTimeout(5000);
  }
  if (!newImgUrl) throw new Error('image generation timed out');

  // A7. Click new thumbnail to open modal
  await page.waitForTimeout(2000);
  const thumbIndex = await page.evaluate((target: string) => {
    const imgs = Array.from(document.querySelectorAll('img[src*="images.higgs.ai"]')) as HTMLImageElement[];
    return imgs.findIndex(img => {
      let n = img.src;
      try {
        const u = new URL(img.src);
        const proxied = u.searchParams.get('url');
        if (proxied) n = proxied;
      } catch {}
      return n === target;
    });
  }, newImgUrl);
  if (thumbIndex < 0) throw new Error('new thumbnail not found in DOM by URL match');
  const thumb = page.locator('img[src*="images.higgs.ai"]').nth(thumbIndex);
  await thumb.hover();
  await page.waitForTimeout(700);
  await thumb.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 30_000 });
  log('A7', 'image modal opened');
  await screenshot(page, 'A7-modal.png');

  // A8. Click Download in modal, save .png
  const downloadBtn = page.locator('[role="dialog"] button').filter({ hasText: /^Download$/i }).first();
  await downloadBtn.waitFor({ state: 'visible', timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: MAX_WAIT_MS }),
    downloadBtn.click(),
  ]);
  const suggested = download.suggestedFilename();
  const ext = path.extname(suggested) || '.png';
  const imagePath = path.join(EVIDENCE_DIR, `image${ext}`);
  await download.saveAs(imagePath);
  const stat = fs.statSync(imagePath);
  log('A8', `image saved: ${imagePath}, size: ${stat.size} bytes`);

  // A9. Close modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  return imagePath;
}

// ── Phase B: Video ─────────────────────────────────────────────────────────────
async function phaseVideo(page: Page, startFramePath: string, capturedMp4s: Set<string>): Promise<string> {
  log('B0', `=== PHASE B: video generation (start frame: ${startFramePath}, prompt: "${VIDEO_PROMPT}") ===`);
  if (!fs.existsSync(startFramePath)) throw new Error(`start frame not found: ${startFramePath}`);

  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await screenshot(page, 'B0-video-loaded.png');

  // B1. Select Kling 2.5 Turbo
  log('B1', 'selecting Kling 2.5 Turbo');
  await selectModelInDropdown(
    page,
    /Kling|Higgsfield DoP|Seedance|Veo|Sora|Wan|Minimax/i,
    /Kling 2\.5 Turbo/i,
    /^Kling$/i,
  );
  await screenshot(page, 'B1-model.png');

  // B2. Upload start frame
  log('B2', 'uploading start frame');
  // First: clear any existing preview in Start frame slot.
  // Higgsfield keeps last upload sticky; X button appears on hover (top-right of preview).
  const cleared = await page.evaluate(() => {
    // Locate Start frame preview img — small thumb in top-left composer (w 80-200, x<350, 100<y<550).
    const candidates = Array.from(document.querySelectorAll('img'))
      .filter(img => {
        const r = img.getBoundingClientRect();
        return r.width >= 60 && r.width < 220 && r.x < 350 && r.y > 100 && r.y < 550;
      });
    for (const img of candidates) {
      // Walk up to find sibling/ancestor close button.
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
        // Fallback: small icon-only button (typically the X) inside the slot
        const iconBtns = Array.from(scope.querySelectorAll('button')).filter(b => {
          const br = (b as HTMLElement).getBoundingClientRect();
          return (b.textContent || '').trim() === '' && br.width > 0 && br.width <= 36 && br.height <= 36;
        });
        if (iconBtns.length > 0) {
          (iconBtns[0] as HTMLElement).click();
          return { ok: true, via: 'icon', depth };
        }
        scope = scope.parentElement;
      }
    }
    return { ok: false };
  });
  log('B2', `cleanup result: ${JSON.stringify(cleared)}`);
  await page.waitForTimeout(800);

  const fileInputs = page.locator('input[type="file"]');
  const inputCount = await fileInputs.count();
  log('B2', `file inputs: ${inputCount}`);
  if (inputCount === 0) throw new Error('no file input on /ai/video');
  await fileInputs.first().setInputFiles(startFramePath);
  await page.waitForTimeout(4000);
  await screenshot(page, 'B2-uploaded.png');

  // B3. Type animation prompt
  log('B3', 'typing animation prompt');
  const ta = page.locator('textarea#prompt, textarea[placeholder*="prompt" i], textarea').first();
  await ta.click();
  await ta.fill('');
  await ta.type(VIDEO_PROMPT, { delay: 12 });

  // B4a. Click banner to switch into Unlimited mode (Resolution=720p, Duration=5s)
  const banner = page.getByText(/Change to.*Unlimited/i).first();
  if (await banner.count() > 0) {
    log('B4a', 'banner found, clicking');
    await banner.click({ force: true });
    await page.waitForTimeout(1500);
  } else {
    log('B4a', 'banner missing — leaving Resolution/Duration as is');
  }
  await screenshot(page, 'B4a-banner.png');

  // B4b. Toggle Unlimited mode (label-walk fallback handles /ai/video case)
  await enableUnlimitedMode(page);
  await page.waitForTimeout(800);
  await screenshot(page, 'B4b-toggle.png');

  // B5. Verify + submit (FAIL fast if not Unlimited)
  const { btn: submitBtnB } = await verifyUnlimitedSubmit(page);

  // B6. Snapshot baseline mp4 URLs already captured by network listener (will compare against post-gen).
  const baselineMp4s = new Set(capturedMp4s);
  log('B6', `baseline captured mp4s: ${baselineMp4s.size}`);

  // B7. Submit click
  await clickViaMouseBox(page, submitBtnB, 'video submit');
  log('B7', 'video submit clicked');

  // B8. Poll captured network mp4 URLs (network listener catches them as Higgsfield streams the result).
  let newMp4 = '';
  const pollStart = Date.now();
  let dumpedAt60 = false;
  let dumpedAt300 = false;
  while (Date.now() - pollStart < MAX_WAIT_MS) {
    const newOnes = Array.from(capturedMp4s).filter(u => !baselineMp4s.has(u));
    const elapsed = Math.round((Date.now() - pollStart) / 1000);
    log('B8', `elapsed: ${elapsed}s, baseline_mp4s: ${baselineMp4s.size}, captured_mp4s: ${capturedMp4s.size}, new: ${newOnes.length}`);

    if (!dumpedAt60 && elapsed >= 60) {
      await screenshot(page, 'B8-60s.png');
      dumpedAt60 = true;
    }
    if (!dumpedAt300 && elapsed >= 300) {
      await screenshot(page, 'B8-300s.png');
      dumpedAt300 = true;
    }

    if (newOnes.length >= 1) {
      // Pick the most recent (Higgsfield may stream multiple bitrates — last is usually highest)
      newMp4 = newOnes[newOnes.length - 1];
      log('B8', `new mp4 captured: ${newMp4.slice(0, 200)}`);
      break;
    }
    await page.waitForTimeout(5000);
  }
  if (!newMp4) throw new Error('video generation timed out — no new mp4 url captured by network listener');

  // B9. Direct fetch — strip cdn-cgi/image proxy if present (Higgsfield uses scaled webp wrappers, raw mp4 is upstream)
  let downloadUrl = newMp4;
  const cgiMatch = newMp4.match(/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)$/);
  if (cgiMatch) {
    downloadUrl = cgiMatch[1];
    log('B9', `unwrapped cdn-cgi: ${downloadUrl}`);
  }
  log('B9', `fetching mp4 directly: ${downloadUrl}`);
  const resp = await page.request.get(downloadUrl, { timeout: 120_000 });
  if (!resp.ok()) throw new Error(`mp4 fetch HTTP ${resp.status()}`);
  const buf = await resp.body();

  // B10. Save
  const fname = path.basename(new URL(downloadUrl).pathname) || `video-${Date.now()}.mp4`;
  const ext = path.extname(fname) || '.mp4';
  const videoPath = path.join(EVIDENCE_DIR, `video${ext}`);
  fs.writeFileSync(videoPath, buf);
  log('B10', `video saved: ${videoPath}, size: ${buf.length} bytes (from ${fname})`);

  return videoPath;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  fs.writeFileSync(LOG_FILE, '');
  log(0, '=== E2E start ===');

  const { browser, page, capturedMp4s } = await connectChrome();
  log(0, `connected, ${(await page.context().pages()).length} page(s)`);

  try {
    const imagePath = await phaseImage(page);
    log('A!', `=== PHASE A DONE: ${imagePath} ===`);

    const videoPath = await phaseVideo(page, imagePath, capturedMp4s);
    log('B!', `=== PHASE B DONE: ${videoPath} ===`);

    log('DONE', `E2E PASS — image=${imagePath}, video=${videoPath}`);
    process.exit(0);
  } catch (err) {
    log('X', `E2E FAILED: ${(err as Error).message}`);
    await screenshot(page, 'X-fail.png');
    process.exit(1);
  } finally {
    await browser.close().catch(() => undefined);
  }
})();
