/**
 * Higgsfield UI spike v3 — точный разведсчитан на /ai/video → Kling 2.5 Turbo.
 *
 * Цель:
 *   1. Подтвердить что Kling 2.5 Turbo есть и имеет UNLIMITED бейдж
 *   2. Зафиксировать URL после выбора (kling_2_5_turbo или вариация)
 *   3. После выбора — найти: Unlimited toggle, Lexical, Generate, start-frame input, end-frame input
 *   4. Загрузить реальный файл на start-frame → подтвердить появление end-frame input
 *   5. Проверить accept=webp: загрузить реальный .webp
 *
 * Выход:
 *   data/spike-v3-screens/*.png
 *   data/spike-v3-dump.json
 *   data/spike-v3-raw.txt
 */

import { chromium, type Page, type BrowserContext, type ElementHandle } from 'playwright-core';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import path from 'path';

const USER_DATA_DIR =
  process.env.HIGGSFIELD_USER_DATA_DIR || 'E:/Users/rasla/chrome-automation-safe';
const OUT_DIR = path.join(process.cwd(), 'data', 'spike-v3-screens');
const DUMP_PATH = path.join(process.cwd(), 'data', 'spike-v3-dump.json');
const LOG_PATH = path.join(process.cwd(), 'data', 'spike-v3-raw.txt');
const TEST_IMG_PNG = path.join(process.cwd(), 'balloon.png');
const TEST_IMG_WEBP = path.join(process.cwd(), 'balloon.webp');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(LOG_PATH, `Higgsfield UI spike v3 — ${new Date().toISOString()}\n`);

function log(msg: string) {
  console.log(msg);
  appendFileSync(LOG_PATH, msg + '\n');
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  log(`  [shot] ${name}`);
}

async function dumpAll(page: Page, label: string) {
  const items = await page.evaluate(() => {
    const q =
      'button, [role="button"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="option"], [role="switch"], [role="dialog"], input, [contenteditable="true"], [aria-label], [data-state]';
    return Array.from(document.querySelectorAll(q)).map((el) => {
      const e = el as HTMLElement;
      const attrs: Record<string, string> = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      const r = e.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (e.innerText || '').trim().slice(0, 160),
        attrs: Object.fromEntries(
          Object.entries(attrs).filter(
            ([k]) =>
              k === 'type' ||
              k === 'role' ||
              k === 'id' ||
              k === 'name' ||
              k === 'accept' ||
              k === 'multiple' ||
              k === 'aria-label' ||
              k === 'aria-checked' ||
              k === 'data-state' ||
              k === 'data-rac' ||
              k === 'placeholder' ||
              k === 'data-placeholder',
          ),
        ),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        visible: e.offsetParent !== null && r.width > 0 && r.height > 0,
      };
    });
  });
  log(`  [dump:${label}] ${items.length} elements`);
  return { label, url: page.url(), items };
}

async function findOptionByText(page: Page, re: RegExp): Promise<ElementHandle | null> {
  return await page.evaluateHandle(
    ({ rxSrc }) => {
      const rx = new RegExp(rxSrc, 'i');
      const sels = ['[role="option"]', '[role="menuitem"]', 'li', 'button', 'div'];
      for (const sel of sels) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const text = (el as HTMLElement).innerText || '';
          if (rx.test(text) && (el as HTMLElement).offsetParent !== null) return el;
        }
      }
      return null;
    },
    { rxSrc: re.source },
  ).then((h) => h.asElement());
}

async function describeFileInputs(page: Page, label: string) {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type="file"]')).map((el, i) => {
      const e = el as HTMLInputElement;
      const r = e.getBoundingClientRect();
      return {
        index: i,
        id: e.id,
        name: e.name,
        accept: e.accept,
        multiple: e.multiple,
        disabled: e.disabled,
        rectY: Math.round(r.y),
        rectH: Math.round(r.height),
        hasFiles: (e.files?.length || 0) > 0,
      };
    });
  });
  log(`  [file-inputs:${label}] ${JSON.stringify(info)}`);
  return info;
}

async function describeSwitches(page: Page, label: string) {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="switch"]')).map((el) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      return {
        ariaLabel: el.getAttribute('aria-label') || '',
        ariaChecked: el.getAttribute('aria-checked') || '',
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        visible: e.offsetParent !== null,
        // nearest label by DOM traversal
        nearbyText: ((): string => {
          const parent = e.parentElement;
          if (!parent) return '';
          return (parent.innerText || '').trim().slice(0, 80);
        })(),
      };
    });
  });
  log(`  [switches:${label}] ${JSON.stringify(info)}`);
  return info;
}

async function describeLexical(page: Page, label: string) {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[contenteditable="true"]')).map((el) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      return {
        placeholder: e.getAttribute('data-placeholder') || e.getAttribute('aria-placeholder') || '',
        text: (e.innerText || '').slice(0, 80),
        visible: e.offsetParent !== null && r.width > 0,
        rect: { y: Math.round(r.y), h: Math.round(r.height) },
      };
    });
  });
  log(`  [lexical:${label}] ${JSON.stringify(info)}`);
  return info;
}

async function describeGenerate(page: Page, label: string) {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button'))
      .filter((b) => /generate/i.test((b as HTMLElement).innerText || ''))
      .map((b) => {
        const e = b as HTMLElement;
        const r = e.getBoundingClientRect();
        return {
          text: e.innerText.slice(0, 80),
          disabled: (b as HTMLButtonElement).disabled,
          visible: e.offsetParent !== null,
          rect: { y: Math.round(r.y), h: Math.round(r.height) },
        };
      });
  });
  log(`  [generate:${label}] ${JSON.stringify(info)}`);
  return info;
}

async function main() {
  log('Launching persistent Chrome...');
  const ctx: BrowserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const dumps: unknown[] = [];

  // ====== STEP 1: goto /ai/video ======
  log('\n=== STEP 1: goto /ai/video ===');
  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  log(`  initial URL: ${page.url()}`);
  await shot(page, '01-initial.png');
  dumps.push(await dumpAll(page, 'video:initial'));

  // ====== STEP 2: open model dropdown ======
  log('\n=== STEP 2: open model dropdown ===');
  const modelBtn = await page.$('button[aria-label="Model"]');
  if (!modelBtn) {
    log('  FAIL: button[aria-label="Model"] not found');
    await shot(page, '01-model-btn-notfound.png');
    await ctx.close();
    process.exit(1);
  }
  await modelBtn.click({ delay: 150 });
  await page.waitForTimeout(2500);
  await shot(page, '02-model-open.png');
  dumps.push(await dumpAll(page, 'video:model-open'));

  // Log all Kling-named options in the open menu
  const klingOptions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="option"], li, div'))
      .filter((el) => /kling/i.test((el as HTMLElement).innerText || ''))
      .map((el) => {
        const e = el as HTMLElement;
        const r = e.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: (e.innerText || '').trim().slice(0, 160),
          visible: e.offsetParent !== null && r.width > 0,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });
  });
  log(`  [kling-variants] ${JSON.stringify(klingOptions)}`);

  // ====== STEP 3: click Kling 2.5 Turbo (avoid 3.0 / 2.1 / O1) ======
  log('\n=== STEP 3: click Kling 2.5 Turbo ===');
  // On current UI Kling 2.5 Turbo is NOT in the featured list — it lives under
  // the "Kling" category card. Click the category first to expand the sub-menu.
  let kling25 = await findOptionByText(page, /Kling\s*(v)?\s*2\.5\s*Turbo/i);
  if (!kling25) {
    log('  Kling 2.5 Turbo not at top level — opening "Kling" category...');
    // Kling category = button with text matching only "Kling" + description
    const klingCategory = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => {
        const t = ((b as HTMLElement).innerText || '').trim();
        // match "Kling\n\nPerfect motion with advanced video control" but not "Kling 3.0 ..."
        return /^Kling\s*\n/i.test(t) && /Perfect motion/i.test(t);
      }) || null;
    });
    const catEl = klingCategory.asElement();
    if (!catEl) {
      log('  FAIL: Kling category button not found');
      await shot(page, '02b-no-kling-cat.png');
      await ctx.close();
      process.exit(1);
    }
    const catText = await page.evaluate((el) => (el as HTMLElement).innerText.slice(0, 120), catEl);
    log(`  Kling category found: "${catText}"`);
    await catEl.click({ delay: 150 });
    await page.waitForTimeout(2500);
    await shot(page, '02b-kling-category-open.png');
    dumps.push(await dumpAll(page, 'video:kling-category-open'));

    // Log all variants now visible
    const variants = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="option"], div'))
        .filter((el) => /kling.*2\.5|kling.*1\.5|kling.*2\.1/i.test((el as HTMLElement).innerText || ''))
        .map((el) => {
          const e = el as HTMLElement;
          const r = e.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: (e.innerText || '').trim().slice(0, 120),
            visible: e.offsetParent !== null && r.width > 0,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          };
        });
    });
    log(`  [kling-sub-variants] ${JSON.stringify(variants)}`);

    kling25 = await findOptionByText(page, /Kling\s*(v)?\s*2\.5\s*Turbo/i);
    if (!kling25) {
      log('  FAIL: Kling 2.5 Turbo still not found after opening category');
      await ctx.close();
      process.exit(1);
    }
  }
  const target = kling25;
  const targetText = await page.evaluate((el) => (el as HTMLElement).innerText.slice(0, 200), target);
  const targetOuter = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 600), target);
  log(`  kling 2.5 turbo text: "${targetText}"`);
  log(`  kling 2.5 turbo outerHTML: ${targetOuter}`);

  await target.click({ delay: 150 });
  await page.waitForTimeout(3000);
  log(`  URL after selection: ${page.url()}`);
  await shot(page, '03-kling25-selected.png');
  dumps.push(await dumpAll(page, 'video:kling25-selected'));

  // ====== STEP 4: describe UI after model selection ======
  log('\n=== STEP 4: describe UI post-selection ===');
  await describeSwitches(page, 'post-select');
  await describeLexical(page, 'post-select');
  await describeGenerate(page, 'post-select');
  await describeFileInputs(page, 'post-select');

  // ====== STEP 5: setInputFiles with PNG (start frame) ======
  log('\n=== STEP 5: upload start-frame (PNG) ===');
  if (!existsSync(TEST_IMG_PNG)) {
    log(`  FAIL: test image missing at ${TEST_IMG_PNG}`);
  } else {
    // Get first visible file input
    const inputs = await page.$$('input[type="file"]');
    log(`  found ${inputs.length} file inputs before upload`);
    if (inputs.length === 0) {
      log('  FAIL: no file input on page after model selection');
    } else {
      try {
        await inputs[0].setInputFiles(TEST_IMG_PNG);
        await page.waitForTimeout(3000);
        log(`  uploaded PNG: ${TEST_IMG_PNG}`);
        await shot(page, '04-after-png-upload.png');
        dumps.push(await dumpAll(page, 'video:after-png-upload'));

        // Check if end-frame input appeared
        await describeFileInputs(page, 'after-png-upload');
      } catch (e: unknown) {
        log(`  upload failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ====== STEP 6: try setInputFiles with WEBP to verify accept ======
  log('\n=== STEP 6: test webp accept ===');
  if (!existsSync(TEST_IMG_WEBP)) {
    log(`  skipped — no webp at ${TEST_IMG_WEBP}`);
  } else {
    const inputs = await page.$$('input[type="file"]');
    if (inputs.length > 0) {
      try {
        await inputs[0].setInputFiles(TEST_IMG_WEBP);
        await page.waitForTimeout(3000);
        log(`  uploaded WEBP: ${TEST_IMG_WEBP}`);
        await shot(page, '05-after-webp-upload.png');
        // Check for error toast / preview
        const errors = await page.evaluate(() => {
          const toastRoots = Array.from(document.querySelectorAll('[role="alert"], [role="status"], [class*="toast"], [class*="error"]'));
          return toastRoots.map((el) => ((el as HTMLElement).innerText || '').trim()).filter((t) => t.length > 0 && t.length < 200);
        });
        log(`  post-webp visible alerts/errors: ${JSON.stringify(errors)}`);
        dumps.push(await dumpAll(page, 'video:after-webp-upload'));
      } catch (e: unknown) {
        log(`  webp upload failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ====== STEP 7: click "Change to 720p 5s for Unlimited" banner ======
  log('\n=== STEP 7: click Unlimited banner ===');
  // First make sure start-frame has a PNG loaded (not failed webp)
  const inputsBefore = await page.$$('input[type="file"]');
  if (inputsBefore.length > 0) {
    await inputsBefore[0].setInputFiles(TEST_IMG_PNG).catch(() => {});
    await page.waitForTimeout(1500);
  }

  const unlimitedBanner = await page.evaluateHandle(() => {
    const els = Array.from(document.querySelectorAll('button, a, div, span'));
    return els.find((el) => {
      const t = ((el as HTMLElement).innerText || '').trim();
      return /change\s+to\s+720p.*unlimited|720p.*5s.*for\s+unlimited/i.test(t);
    }) || null;
  });
  const bannerEl = unlimitedBanner.asElement();
  if (bannerEl) {
    const bannerText = await page.evaluate((el) => (el as HTMLElement).innerText.slice(0, 100), bannerEl);
    const bannerOuter = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 400), bannerEl);
    log(`  Unlimited banner text: "${bannerText}"`);
    log(`  Unlimited banner outerHTML: ${bannerOuter}`);
    await bannerEl.click({ delay: 150 });
    await page.waitForTimeout(2000);
    await shot(page, '06-after-unlimited-banner-click.png');
    dumps.push(await dumpAll(page, 'video:unlimited-banner-clicked'));
  } else {
    log('  FAIL: Unlimited banner not found');
  }

  // ====== STEP 8: hunt textarea (prompt is NOT Lexical on /ai/video) ======
  log('\n=== STEP 8: find prompt textarea + verify Generate cost ===');
  const textareas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('textarea')).map((el) => {
      const e = el as HTMLTextAreaElement;
      const r = e.getBoundingClientRect();
      return {
        placeholder: e.placeholder,
        name: e.name,
        id: e.id,
        value: e.value.slice(0, 80),
        disabled: e.disabled,
        visible: e.offsetParent !== null && r.width > 0,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
  });
  log(`  [textareas] ${JSON.stringify(textareas)}`);

  // All switches (there should be "Motion On" + maybe others after selection)
  await describeSwitches(page, 'after-unlimited');

  // Generate button cost after unlimited banner
  await describeGenerate(page, 'after-unlimited');

  // Try typing a prompt
  const ta = await page.$('textarea');
  if (ta) {
    await ta.fill('A white cat leaps off a porch and lands gracefully in a flower field, anime style');
    await page.waitForTimeout(1000);
    log('  prompt typed into textarea');
    await shot(page, '07-prompt-typed.png');
    await describeGenerate(page, 'after-prompt');
  } else {
    log('  no textarea found — prompt input mechanism unknown');
  }

  // ====== STEP 9: final state recap ======
  log('\n=== STEP 9: final state recap ===');
  await describeSwitches(page, 'final');
  await describeLexical(page, 'final');
  await describeGenerate(page, 'final');
  await describeFileInputs(page, 'final');

  writeFileSync(DUMP_PATH, JSON.stringify(dumps, null, 2));
  log(`\nDump saved to ${DUMP_PATH}`);

  await page.waitForTimeout(4000);
  await ctx.close();
  log('Spike v3 done.');
}

main().catch((e: unknown) => {
  log(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  if (e instanceof Error && e.stack) log(e.stack);
  process.exit(1);
});
