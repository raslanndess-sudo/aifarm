/**
 * Higgsfield UI spike v2 — точный сбор селекторов для имплементации провайдера.
 *
 * Шаги:
 *  /ai/image
 *    1. goto, подождать render
 *    2. скриншот initial
 *    3. найти composer-bar model-switcher (button с текстом текущей модели, rect.y в нижней трети viewport)
 *    4. кликнуть
 *    5. скриншот открытого overlay
 *    6. дампить overlay-элементы (portal, role=dialog/menu/listbox, fixed-position, high z-index)
 *    7. найти опцию по тексту "SeaDream 5 Lite" / "Seedream" / другая вариация
 *    8. кликнуть эту опцию если найдена
 *    9. скриншот после выбора
 *    10. подтвердить что composer-кнопка теперь содержит имя SeaDream
 *    11. искать Unlimited toggle — по role=switch, по тексту, по иконкам
 *    12. подтвердить Lexical [contenteditable="true"] + Generate button
 *
 *  /ai/video
 *    те же шаги для Kling v1.5
 *    плюс:
 *      — подтвердить наличие input[type="file"] для start frame
 *      — проверить есть ли второй input[type="file"] для end frame
 *
 * Выход:
 *  data/spike-screens/*.png
 *  data/spike-dump.json  — per-step dumps
 *  data/spike-raw.txt    — текстовый лог
 */

import { chromium, type Page, type BrowserContext, type ElementHandle } from 'playwright-core';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';

const USER_DATA_DIR =
  process.env.HIGGSFIELD_USER_DATA_DIR || 'E:/Users/rasla/chrome-automation-safe';
const OUT_DIR = path.join(process.cwd(), 'data', 'spike-screens');
const DUMP_PATH = path.join(process.cwd(), 'data', 'spike-dump.json');
const LOG_PATH = path.join(process.cwd(), 'data', 'spike-raw.txt');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(LOG_PATH, `Higgsfield UI spike v2 — ${new Date().toISOString()}\n`);

function log(msg: string) {
  console.log(msg);
  appendFileSync(LOG_PATH, msg + '\n');
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
  log(`  [shot] ${name}`);
}

interface DumpItem {
  tag: string;
  text: string;
  attrs: Record<string, string>;
  rect: { x: number; y: number; w: number; h: number };
  visible: boolean;
  zIndex: string;
  pos: string;
}

async function dumpAll(page: Page, label: string) {
  const items: DumpItem[] = await page.evaluate(() => {
    const q =
      'button, [role="button"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="option"], [role="switch"], [role="dialog"], [aria-haspopup], [data-state], input, [contenteditable="true"]';
    return Array.from(document.querySelectorAll(q)).map((el) => {
      const e = el as HTMLElement;
      const attrs: Record<string, string> = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      const cs = window.getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (e.innerText || '').trim().slice(0, 140),
        attrs,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        visible: e.offsetParent !== null && r.width > 0 && r.height > 0,
        zIndex: cs.zIndex,
        pos: cs.position,
      };
    });
  });
  log(`  [dump:${label}] ${items.length} elements`);
  return { label, url: page.url(), items };
}

/**
 * Найти composer-bar кнопку выбора модели.
 * Стратегия: ищем button с текстом-названием модели, rect.y в нижней половине viewport
 * (composer-bar всегда внизу), и у кнопки есть SVG chevron (dropdown indicator).
 */
async function findComposerModelButton(page: Page, textHint: RegExp): Promise<ElementHandle | null> {
  return await page.evaluateHandle(
    ({ rxSrc }) => {
      const rx = new RegExp(rxSrc, 'i');
      const candidates = Array.from(document.querySelectorAll('button'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, r, text: (el as HTMLElement).innerText || '' };
        })
        .filter(({ r, text, el }) => {
          if (r.width === 0 || r.height === 0) return false;
          // composer bar is near the bottom of viewport
          if (r.y < window.innerHeight * 0.5) return false;
          if (!rx.test(text)) return false;
          // dropdown indicator — chevron, arrow, caret
          const hasChevron = !!el.querySelector('svg');
          return hasChevron;
        });
      // prefer the one closest to bottom
      candidates.sort((a, b) => b.r.y - a.r.y);
      return candidates[0]?.el || null;
    },
    { rxSrc: textHint.source },
  ).then((h) => h.asElement());
}

/**
 * После клика на model switcher собираем всё что появилось как overlay:
 * fixed/absolute позиция, z-index > 10, не было в предыдущем снапшоте.
 */
async function dumpOverlay(page: Page, label: string) {
  const items = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const overlays = all.filter((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      const z = parseInt(cs.zIndex || '0', 10);
      return (cs.position === 'fixed' || cs.position === 'absolute') && z > 10;
    });
    return overlays.slice(0, 50).map((el) => {
      const e = el as HTMLElement;
      const cs2 = window.getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const attrs: Record<string, string> = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      return {
        tag: el.tagName,
        text: (e.innerText || '').trim().slice(0, 200),
        classes: el.className?.toString?.().slice(0, 120) || '',
        role: el.getAttribute('role') || '',
        attrs: Object.fromEntries(
          Object.entries(attrs).filter(([k]) => k.startsWith('data-') || k === 'role' || k === 'aria-label' || k === 'id'),
        ),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        zIndex: cs2.zIndex,
        pos: cs2.position,
        visible: e.offsetParent !== null && r.width > 0 && r.height > 0,
      };
    });
  });
  log(`  [overlay:${label}] ${items.length} high-z elements`);
  return { label, url: page.url(), items };
}

/**
 * Ищем кликабельную опцию внутри overlay/menu.
 * Сначала role=option/menuitem, fallback — любой элемент с точным текстом.
 */
async function findOptionByText(page: Page, re: RegExp): Promise<ElementHandle | null> {
  const h = await page.evaluateHandle(
    ({ rxSrc }) => {
      const rx = new RegExp(rxSrc, 'i');
      const prefer = ['[role="option"]', '[role="menuitem"]', 'li', 'button', 'div'];
      for (const sel of prefer) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const text = (el as HTMLElement).innerText || '';
          if (rx.test(text) && (el as HTMLElement).offsetParent !== null) return el;
        }
      }
      return null;
    },
    { rxSrc: re.source },
  );
  return h.asElement();
}

async function checkLexical(page: Page) {
  const info = await page.evaluate(() => {
    const eds = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    return eds.map((el) => {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      return {
        text: (e.innerText || '').slice(0, 80),
        placeholder: e.getAttribute('data-placeholder') || e.getAttribute('aria-placeholder') || '',
        visible: e.offsetParent !== null,
        rect: { y: Math.round(r.y), h: Math.round(r.height) },
      };
    });
  });
  log(`  [lexical] ${JSON.stringify(info)}`);
  return info;
}

async function checkGenerateButton(page: Page) {
  const info = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => {
      const t = (b as HTMLElement).innerText || '';
      return /generate/i.test(t);
    });
    return btns.map((b) => {
      const e = b as HTMLElement;
      const r = e.getBoundingClientRect();
      return { text: e.innerText.slice(0, 60), visible: e.offsetParent !== null, rect: { y: Math.round(r.y), h: Math.round(r.height) } };
    });
  });
  log(`  [generate-btn] ${JSON.stringify(info)}`);
  return info;
}

async function checkFileInputs(page: Page) {
  const info = await page.evaluate(() => {
    const ins = Array.from(document.querySelectorAll('input[type="file"]'));
    return ins.map((i) => {
      const e = i as HTMLInputElement;
      return {
        accept: e.accept,
        multiple: e.multiple,
        name: e.name,
        id: e.id,
        visible: e.offsetParent !== null || e.style.display === 'none' || e.getClientRects().length === 0, // file inputs часто скрыты
      };
    });
  });
  log(`  [file-inputs] ${JSON.stringify(info)}`);
  return info;
}

async function huntUnlimited(page: Page) {
  const info = await page.evaluate(() => {
    const out: unknown[] = [];
    // by text
    const all = Array.from(document.querySelectorAll('button, [role="switch"], [role="button"], span, div'));
    for (const el of all) {
      const t = ((el as HTMLElement).innerText || '').trim();
      if (/unlimited|∞|free\s+mode|subscription/i.test(t) && t.length < 80) {
        const e = el as HTMLElement;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && e.offsetParent !== null) {
          out.push({
            tag: el.tagName,
            text: t.slice(0, 100),
            role: el.getAttribute('role') || '',
            class: el.className?.toString?.().slice(0, 100) || '',
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          });
        }
      }
    }
    // any role="switch"
    const switches = Array.from(document.querySelectorAll('[role="switch"]'));
    for (const el of switches) {
      const e = el as HTMLElement;
      const r = e.getBoundingClientRect();
      out.push({
        tag: el.tagName,
        role: 'switch',
        text: (e.innerText || '').slice(0, 60),
        ariaLabel: el.getAttribute('aria-label') || '',
        ariaChecked: el.getAttribute('aria-checked') || '',
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        visible: e.offsetParent !== null,
      });
    }
    return out;
  });
  log(`  [unlimited-hunt] ${JSON.stringify(info)}`);
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

  // ================= /ai/image =================
  log('\n=== /ai/image ===');
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  log(`  initial URL: ${page.url()}`);
  await shot(page, '01-image-initial.png');
  dumps.push(await dumpAll(page, 'image:initial'));

  // Composer model button
  const imgModelBtn = await findComposerModelButton(page, /nano|seadream|seedream|banana|flux|soul/i);
  if (!imgModelBtn) {
    log('  FAIL: composer model button not found on /ai/image');
  } else {
    const bbox = await imgModelBtn.boundingBox();
    log(`  composer model button rect: ${JSON.stringify(bbox)}`);
    const outer = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 400), imgModelBtn);
    log(`  composer model button outerHTML: ${outer}`);
    await imgModelBtn.click({ delay: 150 }).catch((e) => log(`  click fail: ${e.message}`));
    await page.waitForTimeout(2000);
    await shot(page, '02-image-model-open.png');
    dumps.push(await dumpAll(page, 'image:model-open'));
    dumps.push(await dumpOverlay(page, 'image:model-overlay'));

    // Try SeaDream
    const sd = await findOptionByText(page, /sea\s?dream\s*5\s*lite|seedream\s*5\s*lite|seadream|seedream/i);
    if (sd) {
      const t = await page.evaluate((el) => (el as HTMLElement).innerText.slice(0, 200), sd);
      log(`  SeaDream candidate found, text: "${t}"`);
      const outer = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 400), sd);
      log(`  SeaDream outerHTML: ${outer}`);
      await sd.click({ delay: 150 }).catch((e) => log(`  sd click fail: ${e.message}`));
      await page.waitForTimeout(2500);
      log(`  URL after SeaDream: ${page.url()}`);
      await shot(page, '03-image-seadream-selected.png');
      dumps.push(await dumpAll(page, 'image:seadream-selected'));

      // Re-check composer button text now
      const newBtn = await findComposerModelButton(page, /.+/);
      if (newBtn) {
        const newText = await page.evaluate((el) => (el as HTMLElement).innerText, newBtn);
        log(`  composer button text after SeaDream selection: "${newText}"`);
      }
    } else {
      log('  SeaDream option NOT found in opened menu — dumping visible option text:');
      const vis = await page.evaluate(() => {
        const sel = '[role="option"], [role="menuitem"], li, button, a';
        return Array.from(document.querySelectorAll(sel))
          .map((el) => ((el as HTMLElement).innerText || '').trim())
          .filter((t) => t && t.length > 0 && t.length < 100);
      });
      log(`  visible options: ${JSON.stringify(vis.slice(0, 60))}`);
      await shot(page, '03-image-seadream-notfound.png');
    }
  }

  // Unlimited hunt on image
  log('\n  Unlimited hunt on /ai/image:');
  await huntUnlimited(page);
  await shot(page, '04-image-unlimited-hunt.png');

  // Lexical + Generate
  await checkLexical(page);
  await checkGenerateButton(page);

  // ================= /ai/video =================
  log('\n=== /ai/video ===');
  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  log(`  initial URL: ${page.url()}`);
  await shot(page, '05-video-initial.png');
  dumps.push(await dumpAll(page, 'video:initial'));

  const vidModelBtn = await findComposerModelButton(page, /kling|soul|video|model/i);
  if (!vidModelBtn) {
    log('  FAIL: composer model button not found on /ai/video');
  } else {
    const bbox = await vidModelBtn.boundingBox();
    log(`  video composer model button rect: ${JSON.stringify(bbox)}`);
    const outer = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 400), vidModelBtn);
    log(`  video composer model button outerHTML: ${outer}`);
    await vidModelBtn.click({ delay: 150 }).catch((e) => log(`  click fail: ${e.message}`));
    await page.waitForTimeout(2000);
    await shot(page, '06-video-model-open.png');
    dumps.push(await dumpAll(page, 'video:model-open'));
    dumps.push(await dumpOverlay(page, 'video:model-overlay'));

    // Try Kling
    const kling = await findOptionByText(page, /kling\s*(v|)\s*1\.5|kling.*1\.5/i);
    if (kling) {
      const t = await page.evaluate((el) => (el as HTMLElement).innerText.slice(0, 200), kling);
      log(`  Kling 1.5 candidate found, text: "${t}"`);
      const outer = await page.evaluate((el) => (el as HTMLElement).outerHTML.slice(0, 400), kling);
      log(`  Kling outerHTML: ${outer}`);
      await kling.click({ delay: 150 }).catch((e) => log(`  kling click fail: ${e.message}`));
      await page.waitForTimeout(2500);
      log(`  URL after Kling 1.5: ${page.url()}`);
      await shot(page, '07-video-kling15-selected.png');
      dumps.push(await dumpAll(page, 'video:kling15-selected'));
    } else {
      log('  Kling 1.5 NOT found — dumping visible options:');
      const vis = await page.evaluate(() => {
        const sel = '[role="option"], [role="menuitem"], li, button, a';
        return Array.from(document.querySelectorAll(sel))
          .map((el) => ((el as HTMLElement).innerText || '').trim())
          .filter((t) => t && t.length > 0 && t.length < 100);
      });
      log(`  visible options: ${JSON.stringify(vis.slice(0, 60))}`);
      await shot(page, '07-video-kling15-notfound.png');
    }
  }

  // Unlimited hunt on video
  log('\n  Unlimited hunt on /ai/video:');
  await huntUnlimited(page);
  await shot(page, '08-video-unlimited-hunt.png');

  // Lexical + Generate + file inputs on video
  await checkLexical(page);
  await checkGenerateButton(page);
  await checkFileInputs(page);

  writeFileSync(DUMP_PATH, JSON.stringify(dumps, null, 2));
  log(`\nDump saved to ${DUMP_PATH}`);

  await page.waitForTimeout(4000); // let user see before closing
  await ctx.close();
  log('Spike v2 done.');
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  if (e.stack) log(e.stack);
  process.exit(1);
});
