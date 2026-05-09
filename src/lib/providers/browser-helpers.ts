import type { Page } from 'playwright-core';
import { checkpointPause } from './higgsfield-singleton';

// --- Types for model selection (docs/higgsfield-selectors.md §1, §2) ---

export type PageType = 'image' | 'video';
export type ImageModel = 'seedream_v5_lite' | 'nano-banana' | 'nano-banana-pro' | 'flux' | 'soul';
export type VideoModel = 'kling-2-5-turbo' | 'kling-3-0' | 'kling-3-0-motion-control' | 'seedance-2';

// --- Basic helpers ---

export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Mouse-move перед кликом (антидетект)
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = await page.waitForSelector(selector, { timeout: 10000 });
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box: ${selector}`);
  const x = box.x + box.width / 2 + (Math.random() - 0.5) * 4;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * 4;
  await page.mouse.move(x, y, { steps: randomDelay(5, 15) });
  await sleep(randomDelay(100, 300));
  await page.mouse.click(x, y);
}

// Ввод текста в Lexical contenteditable. Higgsfield изменил DOM — старый
// "click + Ctrl+A + type char-by-char" теперь не попадает в editor (фокус уходит).
// КРИТИЧНО: на странице может быть НЕСКОЛЬКО contenteditable (search в model dropdown,
// poll, comment input). Нужно бить точно по prompt-композеру по placeholder/aria-label.
export async function typeInLexical(page: Page, _selector: string, text: string): Promise<void> {
  // 1. Закрыть любые open popover/dropdown (model selector, settings) — иначе search-input
  //    в dropdown перехватит наши клавиши.
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(150);
  await page.keyboard.press('Escape').catch(() => undefined);
  await sleep(randomDelay(300, 500));

  // 2. Найти именно prompt editor — у Higgsfield image композера placeholder
  //    "Describe the scene you imagine" / "Describe the scene...". Лучший селектор:
  //    contenteditable с aria-placeholder/placeholder containing "Describe".
  //    Проверяем кандидатов в порядке специфичности.
  const placeholderRegex = /describe/i;

  type Cand = { selector: string; ok: boolean; previewLen: number };
  const cand: Cand[] = [];

  // Helper: для каждого contenteditable собрать info о placeholder/parent — выбрать тот
  // что ассоциируется с prompt input.
  const editorIndex = await page.evaluate((rx: string) => {
    const re = new RegExp(rx, 'i');
    const editors = Array.from(document.querySelectorAll('[contenteditable="true"]')) as HTMLElement[];
    let bestIdx = -1;
    let bestScore = -1;
    editors.forEach((el, i) => {
      const placeholder = el.getAttribute('aria-placeholder') || el.getAttribute('placeholder') || '';
      // Lexical wraps placeholder in a sibling div — look at parent's text/inner divs
      const parent = el.closest('[class*="composer"], [class*="prompt"], form') || el.parentElement;
      const parentText = parent ? (parent.textContent || '') : '';
      // Score: placeholder match strongest, then "Describe" near in DOM
      let score = 0;
      if (re.test(placeholder)) score += 100;
      if (re.test(parentText.slice(0, 200))) score += 50;
      // Penalize if it's clearly inside a popover/dropdown
      const inPopover = !!el.closest('[role="dialog"], [role="listbox"], [role="menu"], [data-state="open"][class*="popover"]');
      if (inPopover) score -= 200;
      // Slight bonus for size — prompt editor is wider than search inputs
      const r = el.getBoundingClientRect();
      if (r.width > 300) score += 10;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    return { idx: bestIdx, count: editors.length, score: bestScore };
  }, placeholderRegex.source);

  if (editorIndex.idx < 0) {
    auditLog('typeInLexical:error', `no contenteditable found (count=${editorIndex.count})`);
    throw new Error('typeInLexical: no prompt-like contenteditable found');
  }
  auditLog('typeInLexical:selector', `picked editor #${editorIndex.idx}/${editorIndex.count} score=${editorIndex.score}`);

  const editor = page.locator('[contenteditable="true"]').nth(editorIndex.idx);
  await editor.scrollIntoViewIfNeeded().catch(() => undefined);
  await editor.click({ delay: 100 }).catch(() => undefined);
  await sleep(randomDelay(150, 350));

  // 3. Clear and type
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(randomDelay(100, 250));

  await page.keyboard.type(text, { delay: 8 });
  await sleep(randomDelay(300, 600));

  // 4. Verify — innerText must contain meaningful text
  const writtenLen = await editor.evaluate((el) => (el as HTMLElement).innerText.trim().length);
  if (writtenLen < Math.min(20, text.length)) {
    auditLog('typeInLexical:verify-fail', `wrote ${writtenLen}/${text.length} chars, retrying via DOM`);
    await editor.evaluate((el, value) => {
      const div = el as HTMLElement;
      div.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = value;
      div.appendChild(p);
      div.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      div.dispatchEvent(new Event('change', { bubbles: true }));
    }, text);
    await sleep(500);
    const recheck = await editor.evaluate((el) => (el as HTMLElement).innerText.trim().length);
    if (recheck < Math.min(20, text.length)) {
      auditLog('typeInLexical:fatal', `fallback also failed, wrote ${recheck}`);
      throw new Error(`typeInLexical: text not entered (wrote ${recheck}/${text.length} chars)`);
    }
    auditLog('typeInLexical:fallback-ok', `${recheck} chars via direct DOM`);
  } else {
    auditLog('typeInLexical:done', `${writtenLen} chars typed`);
  }
  // suppress unused warning
  void cand;
}

// Запись в аудит-лог
export function auditLog(action: string, details?: string): void {
  const fs = require('fs');
  const line = `[${new Date().toISOString()}] ${action}${details ? ' — ' + details : ''}\n`;
  fs.appendFileSync('data/higgsfield-audit.log', line);
}

// --- Display name maps (docs/higgsfield-selectors.md §1.3, §2.4) ---

function imageModelToDisplayName(m: ImageModel): string {
  const map: Record<ImageModel, string> = {
    'seedream_v5_lite': 'Seedream 5.0 lite',
    'nano-banana': 'Nano Banana',
    'nano-banana-pro': 'Nano Banana Pro',
    'flux': 'Flux',
    'soul': 'Soul',
  };
  return map[m];
}

/**
 * Build a regex that matches the model display name EXACTLY in the dropdown.
 * Higgsfield lists "Nano Banana", "Nano Banana 2", and "Nano Banana Pro"
 * side-by-side — a naive /Nano Banana/i would match all three. For names
 * without a Pro/number suffix we add a negative lookahead so they don't
 * match the longer variants.
 */
function modelNameRegex(displayName: string): RegExp {
  const esc = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // If the name itself already contains Pro or a digit, it's specific enough
  if (/\bPro\b|\d/.test(displayName)) {
    return new RegExp(esc, 'i');
  }
  // Otherwise prevent matching "<name> Pro" / "<name> 2" / "<name> 4.5" etc.
  return new RegExp(`${esc}(?!\\s*(Pro|\\d))`, 'i');
}

function videoModelToDisplayName(m: VideoModel): string {
  const map: Record<VideoModel, string> = {
    'kling-2-5-turbo': 'Kling 2.5 Turbo',
    'kling-3-0': 'Kling 3.0',
    'kling-3-0-motion-control': 'Kling 3.0 Motion Control',
    'seedance-2': 'Seedance 2.0',
  };
  return map[m];
}

// --- selectModel (docs/higgsfield-selectors.md §1.2-1.3, §2.2-2.4) ---

export async function selectModel(
  page: Page,
  pageType: PageType,
  targetModel: ImageModel | VideoModel,
): Promise<void> {
  auditLog('selectModel:start', `page=${pageType} target=${targetModel}`);

  if (pageType === 'image') {
    await checkpointPause('selectModel:image:1-open-dropdown');

    // §1.2 — Composer model button (last button with svg + model name text)
    const btn = page.locator('button:has(svg)')
      .filter({ hasText: /Nano Banana|Seedream|Flux|Soul|Kling/i })
      .last();
    if (await btn.count() === 0) {
      auditLog('selectModel:error', 'image composer button not found');
      throw new Error('selectModel: composer button not found on /ai/image');
    }
    await btn.click({ delay: 100 });
    await page.waitForTimeout(1500);

    await checkpointPause('selectModel:image:2-click-option');

    // §1.3 — Find option by display name in overlay
    // Options contain badges (UNLIMITED, description text) that composer button does not.
    // Filter by display name + secondary token to avoid matching the composer button itself.
    const displayName = imageModelToDisplayName(targetModel as ImageModel);
    if (!displayName) {
      auditLog('selectModel:error', `unknown image model "${targetModel}"`);
      throw new Error(`selectModel: failed to switch to ${targetModel}`);
    }
    const exactRegex = modelNameRegex(displayName);
    const option = page.locator('button').filter({
      hasText: exactRegex,
    }).filter({
      hasText: /UNLIMITED|reasoning|quality|speed|standard|generation/i,
    });
    if (await option.count() === 0) {
      auditLog('selectModel:error', `image option "${displayName}" not found in dropdown (regex=${exactRegex})`);
      throw new Error(`selectModel: option "${displayName}" not found`);
    }
    await option.first().click({ delay: 100 });
    await page.waitForTimeout(2000);

    await checkpointPause('selectModel:image:3-verify');

    // §1.3 — Verify: composer button now shows the selected model
    const composer = page.locator('button:has(svg)').filter({ hasText: exactRegex });
    if (await composer.count() === 0) {
      auditLog('selectModel:error', `after click, composer does not show "${displayName}"`);
      throw new Error(`selectModel: failed to switch to ${displayName}`);
    }
    auditLog('selectModel:done', `image=${displayName}`);
  }

  if (pageType === 'video') {
    await checkpointPause('selectModel:video:1-open-dropdown');

    // §2.2 — Composer model button (stable aria-label)
    const btn = page.locator('button[aria-label="Model"]');
    if (await btn.count() === 0) {
      auditLog('selectModel:error', 'video composer Model button not found');
      throw new Error('selectModel: button[aria-label="Model"] not found');
    }
    await btn.click({ delay: 100 });
    await page.waitForTimeout(1500);

    // §2.3 — For Kling models, expand "Kling" category first
    if ((targetModel as string).startsWith('kling-')) {
      await checkpointPause('selectModel:video:2-expand-kling');

      const klingCategory = page.locator('button').filter({
        has: page.locator('text=/^Kling\\s*$/'),
        hasText: /Perfect motion/i,
      });
      if (await klingCategory.count() === 0) {
        auditLog('selectModel:error', 'Kling category button not found');
        throw new Error('selectModel: Kling category not found in video dropdown');
      }
      await klingCategory.click({ delay: 100 });
      await page.waitForTimeout(2000);
    }

    await checkpointPause('selectModel:video:3-click-option');

    // §2.4 — Find specific model variant in submenu
    // Options contain tech specs (UNLIMITED, resolution, duration) that composer button does not.
    // e.g. "Kling 2.5 Turbo\nUNLIMITED\n1080p\n5s-10s" vs composer "Model\n\nKling 2.5 Turbo"
    const displayName = videoModelToDisplayName(targetModel as VideoModel);
    if (!displayName) {
      auditLog('selectModel:error', `unknown video model "${targetModel}"`);
      throw new Error(`selectModel: failed to switch to ${targetModel}`);
    }
    const option = page.locator('button').filter({
      hasText: new RegExp(displayName, 'i'),
    }).filter({
      hasText: /\d+s-\d+s|\d+p|UNLIMITED/i,
    });
    if (await option.count() === 0) {
      auditLog('selectModel:error', `video option "${displayName}" not found (with tech specs filter)`);
      throw new Error(`selectModel: option "${displayName}" not found on /ai/video`);
    }
    await option.first().click({ delay: 100 });
    await page.waitForTimeout(2500);

    await checkpointPause('selectModel:video:4-verify');

    // §2.4 — Verify: Model button now shows selected model
    const composerVerify = page.locator('button[aria-label="Model"]')
      .filter({ hasText: new RegExp(displayName, 'i') });
    if (await composerVerify.count() === 0) {
      auditLog('selectModel:error', `after click, Model button does not show "${displayName}"`);
      throw new Error(`selectModel: failed to switch to ${displayName}`);
    }
    auditLog('selectModel:done', `video=${displayName}`);
  }
}

// --- enableUnlimited (docs/higgsfield-selectors.md §1.4, §2.5) ---

export async function enableUnlimited(page: Page, pageType: PageType): Promise<void> {
  auditLog('enableUnlimited:start', `page=${pageType}`);

  if (pageType === 'image') {
    await checkpointPause('enableUnlimited:image:1-toggle');

    // ── DOM dump: enumerate ALL switches with nearby text labels ──
    const switchDump = await page.evaluate(() => {
      const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
      return switches.map((s, i) => {
        const rect = s.getBoundingClientRect();
        const all = Array.from(document.querySelectorAll('*'));
        const labels = all
          .filter(el => {
            const r = el.getBoundingClientRect();
            const t = (el.textContent || '').trim().slice(0, 40);
            return t.length > 0 && t.length < 50
              && Math.abs(r.x - rect.x) < 250 && Math.abs(r.y - rect.y) < 50;
          })
          .map(el => (el.textContent || '').trim().slice(0, 40))
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .slice(0, 5);
        return {
          index: i,
          ariaChecked: s.getAttribute('aria-checked'),
          dataState: s.getAttribute('data-state'),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          nearbyTexts: labels,
        };
      });
    });
    auditLog('enableUnlimited:dom-dump', JSON.stringify(switchDump));

    if (switchDump.length === 0) {
      throw new Error('enableUnlimited: no button[role="switch"] found on /ai/image');
    }

    // ── Pick the right switch: the one with "Unlimited" in nearbyTexts ──
    let targetIndex = switchDump.findIndex(
      s => s.nearbyTexts.some(t => /unlimited/i.test(t)),
    );
    if (targetIndex < 0) {
      // Fallback: last switch (composer is at bottom of DOM)
      targetIndex = switchDump.length - 1;
      auditLog('enableUnlimited:warn', `no switch has "Unlimited" nearby, falling back to last (index ${targetIndex})`);
    } else {
      auditLog('enableUnlimited:info', `picked switch index ${targetIndex} (has "Unlimited" nearby)`);
    }

    const target = switchDump[targetIndex];
    const switchHandle = page.locator('button[role="switch"]').nth(targetIndex);

    // ── Check if already ON ──
    const isOn = target.ariaChecked === 'true' || target.dataState === 'checked';
    if (isOn) {
      auditLog('enableUnlimited:skip', `image: already ON (index=${targetIndex}, aria-checked=${target.ariaChecked}, data-state=${target.dataState})`);
      return;
    }

    // ── Click and wait for aria-checked to flip ──
    auditLog('enableUnlimited:clicking', `image: switch ${targetIndex} was OFF (aria-checked=${target.ariaChecked}, data-state=${target.dataState})`);
    await switchHandle.click({ delay: 100 });
    await page.waitForTimeout(500);

    // Wait for aria-checked="true" with polling (waitForFunction on elementHandle)
    const handle = await switchHandle.elementHandle();
    if (!handle) throw new Error('enableUnlimited: could not get elementHandle for switch');
    try {
      await page.waitForFunction(
        (el: Element) => el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked',
        handle,
        { timeout: 10000 },
      );
    } catch {
      // Re-read state for error message
      const postAriaChecked = await switchHandle.getAttribute('aria-checked');
      const postDataState = await switchHandle.getAttribute('data-state');
      const fullDump = JSON.stringify(switchDump);
      throw new Error(`enableUnlimited: clicked switch ${targetIndex} but state stayed OFF (aria-checked=${postAriaChecked}, data-state=${postDataState}). Full dump: ${fullDump}`);
    }

    const finalAriaChecked = await switchHandle.getAttribute('aria-checked');
    const finalDataState = await switchHandle.getAttribute('data-state');
    auditLog('enableUnlimited:done', `image: switch ${targetIndex} now ON (aria-checked=${finalAriaChecked}, data-state=${finalDataState})`);
  }

  if (pageType === 'video') {
    await checkpointPause('enableUnlimited:video:1-toggle');

    // Higgsfield video flow на текущем UI:
    //   - После загрузки start frame видны: 720p/1080p индикатор и (если 1080p) баннер
    //     "Change to 720p 5s for Unlimited" в виде <div>. Сам "Unlimited mode" toggle
    //     появляется только когда resolution = 720p.
    //   - Banner — это <div> (не button), нужен click через mouse coords по rect.
    // Шаги: 1) если видим banner — кликаем → resolution → 720p; 2) ждём toggle;
    //       3) кликаем toggle; 4) verify через текст Generate-button.
    await sleep(2000);

    // Шаг 1: ищем banner и кликаем его. Используем playwright text-based locator —
    // он сам найдёт правильный clickable element (button/a/span с onClick) и попадёт в него.
    // Старый «click по центру div rect» промахивался — кликабельная зона внутри другая.
    const bannerLoc = page.locator('text=/Change to 720p 5s/i').first();
    const bannerCount = await bannerLoc.count();
    auditLog('enableUnlimited:video:banner-locator', `count=${bannerCount}`);

    if (bannerCount > 0) {
      try {
        await bannerLoc.click({ force: true, delay: 100 });
        auditLog('enableUnlimited:video:banner-clicked', 'via text= locator');
      } catch (err) {
        auditLog('enableUnlimited:video:banner-click-error', String(err).slice(0, 200));
      }
      // Ждём пока DOM перерисуется: либо banner исчезнет, либо появится "Unlimited mode" label
      try {
        await page.waitForFunction(() => {
          const all = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
          // banner gone OR "Unlimited mode" label visible
          const stillBanner = all.some((el) => /Change to 720p 5s/i.test((el as HTMLElement).innerText || ''));
          const hasUnlimitedLabel = all.some((el) => {
            const t = ((el as HTMLElement).innerText || '').trim();
            return /^Unlimited mode/i.test(t) && t.length < 50;
          });
          return !stillBanner || hasUnlimitedLabel;
        }, { timeout: 8000 });
        auditLog('enableUnlimited:video:banner-effect', 'banner gone or unlimited label appeared');
      } catch {
        auditLog('enableUnlimited:video:banner-effect-timeout', 'no DOM change after banner click in 8s');
      }
      await sleep(500);
    } else {
      auditLog('enableUnlimited:video:banner-locator', 'banner not present (maybe already 720p)');
    }

    const findToggleInDom = () => page.evaluate(() => {
      // Helper: is element visible (rect > 0 + not display:none + not opacity:0)
      const isVisible = (el: HTMLElement): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        return true;
      };

      // Helper: distance between two rects (center-to-center)
      const dist = (a: DOMRect, b: DOMRect) => {
        const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
        const bx = b.x + b.width / 2, by = b.y + b.height / 2;
        return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
      };

      // 1. Find all VISIBLE elements that LOOK LIKE switches (not tooltips/popovers/buttons).
      //    Strict: role="switch" OR aria-checked="true|false" OR data-state checked|unchecked
      //    Excludes data-state="closed/open" (those are popovers/tooltips/dialog states).
      const toggleCandidates = (Array.from(document.querySelectorAll(
        '[role="switch"], [aria-checked="true"], [aria-checked="false"], [data-state="checked"], [data-state="unchecked"], input[type="checkbox"]'
      )) as HTMLElement[]).filter(isVisible);

      // 2. Find label "Unlimited mode" element (visible)
      const allEls = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
      const labelEl = allEls.find((el) => {
        if (!isVisible(el)) return false;
        const own = el.children.length === 0 ? (el.textContent || '').trim() : '';
        if (/^Unlimited mode$/i.test(own)) return true;
        const innerText = ((el as HTMLElement).innerText || '').trim();
        return /^Unlimited mode/i.test(innerText) && innerText.length < 50;
      });

      const mentions = allEls
        .filter((el) => /unlimited/i.test(((el as HTMLElement).innerText || '').slice(0, 80)))
        .slice(0, 8)
        .map((el) => ({
          tag: el.tagName,
          text: ((el as HTMLElement).innerText || '').slice(0, 80),
          visible: isVisible(el),
          html: el.outerHTML.slice(0, 400),
        }));

      if (!labelEl) {
        if (toggleCandidates.length === 0) {
          return { found: false, reason: 'no label & no toggle-like elements', mentions };
        }
        const fb = toggleCandidates[0];
        const fbR = fb.getBoundingClientRect();
        return {
          found: true,
          fallback: 'first-visible-switch',
          toggleType: fb.getAttribute('role') || fb.getAttribute('data-state') || fb.tagName.toLowerCase(),
          isOn: fb.getAttribute('aria-checked') === 'true' || fb.getAttribute('data-state') === 'checked',
          rect: { x: Math.round(fbR.x), y: Math.round(fbR.y), w: Math.round(fbR.width), h: Math.round(fbR.height) },
          mentions,
        };
      }

      const labelRect = labelEl.getBoundingClientRect();

      // 3. Pick the closest VALID switch to the label
      let bestToggle: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const t of toggleCandidates) {
        const tr = t.getBoundingClientRect();
        // Switches are typically 24-60 wide × 14-32 tall — filter out tiny icons (16×16 = info)
        if (tr.width < 20 || tr.height < 12) continue;
        if (tr.width > 100 || tr.height > 50) continue;
        const d = dist(labelRect, tr);
        if (d < bestDist) { bestDist = d; bestToggle = t; }
      }

      if (bestToggle) {
        const r = bestToggle.getBoundingClientRect();
        return {
          found: true,
          toggleType: bestToggle.getAttribute('role') || bestToggle.getAttribute('data-state') || bestToggle.tagName.toLowerCase(),
          ariaChecked: bestToggle.getAttribute('aria-checked'),
          dataState: bestToggle.getAttribute('data-state'),
          isOn: bestToggle.getAttribute('aria-checked') === 'true' || bestToggle.getAttribute('data-state') === 'checked',
          distFromLabel: Math.round(bestDist),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      }

      // 4. FALLBACK: no proper switch found near label. Try clicking on a clickable element
      //    near the label that is NOT the label itself and NOT an info icon.
      //    Look at right siblings of label — Tailwind/shadcn often puts the toggle as next sibling.
      let cur: HTMLElement | null = labelEl;
      let clickEl: HTMLElement | null = null;
      for (let depth = 0; depth < 5 && cur && cur.parentElement; depth++) {
        const siblings: HTMLElement[] = (Array.from(cur.parentElement.children) as HTMLElement[]).filter(isVisible);
        for (const sib of siblings) {
          if (sib === cur) continue;
          if (sib.contains(labelEl)) continue;
          const sr = sib.getBoundingClientRect();
          // Look for pill-like dimensions
          if (sr.width >= 24 && sr.width <= 100 && sr.height >= 14 && sr.height <= 40) {
            clickEl = sib;
            break;
          }
        }
        if (clickEl) break;
        cur = cur.parentElement;
      }

      if (clickEl) {
        const r = clickEl.getBoundingClientRect();
        return {
          found: true,
          fallback: 'pill-sibling',
          toggleType: clickEl.tagName.toLowerCase(),
          isOn: false,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          mentions,
        };
      }

      return { found: false, reason: 'label found but no switch/pill nearby', labelText: (labelEl.textContent || '').slice(0, 80), mentions };
    });

    let toggleResult = await findToggleInDom();
    auditLog('enableUnlimited:video:scan', JSON.stringify(toggleResult));

    // Retry up to 3× with 2s gap if label not found yet (Higgsfield UI sometimes lazy-renders)
    let retries = 0;
    while (!toggleResult.found && retries < 3) {
      await sleep(2000);
      retries++;
      toggleResult = await findToggleInDom();
      auditLog('enableUnlimited:video:scan-retry', `attempt=${retries} ${JSON.stringify(toggleResult)}`);
    }

    if (toggleResult.found) {
      if (toggleResult.isOn) {
        auditLog('enableUnlimited:skip', 'video toggle already ON');
        return;
      }

      // Click via native DOM element.click() — bypasses any anti-bot heuristics on
      // page.mouse.click(x,y), and reliably triggers Radix Switch onPointerDown handlers.
      // (Earlier coordinate-based click was hitting the right element but not firing
      // the events Radix needs to flip the state.)
      const clickRes = await page.evaluate(() => {
        const isVisible = (el: HTMLElement): boolean => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = window.getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        };

        // Find "Unlimited mode" label, then nearest [role="switch"] in its tree.
        const allEls = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
        const labelEl = allEls.find((el) => {
          if (!isVisible(el)) return false;
          const own = el.children.length === 0 ? (el.textContent || '').trim() : '';
          if (/^Unlimited mode$/i.test(own)) return true;
          const innerText = ((el as HTMLElement).innerText || '').trim();
          return /^Unlimited mode/i.test(innerText) && innerText.length < 50;
        });
        if (!labelEl) return { ok: false, reason: 'no Unlimited mode label' };

        // Walk up to find a container holding a [role="switch"]
        let container: HTMLElement | null = labelEl;
        let sw: HTMLElement | null = null;
        for (let depth = 0; depth < 6 && container; depth++) {
          sw = container.querySelector('[role="switch"]:not([data-state="closed"]):not([data-state="open"])') as HTMLElement | null;
          if (sw && isVisible(sw)) break;
          sw = null;
          container = container.parentElement;
        }
        if (!sw) return { ok: false, reason: 'no [role="switch"] near label' };

        const wasOn = sw.getAttribute('aria-checked') === 'true' || sw.getAttribute('data-state') === 'checked';
        if (wasOn) return { ok: true, alreadyOn: true };

        // Native click — Radix Switch is a button under the hood, this works reliably.
        sw.click();
        // Some Radix variants need explicit pointer events too; fire them as belt-and-suspenders.
        const r = sw.getBoundingClientRect();
        const init: PointerEventInit = {
          bubbles: true, cancelable: true, view: window,
          clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
          pointerType: 'mouse', button: 0,
        };
        try { sw.dispatchEvent(new PointerEvent('pointerdown', init)); } catch { /* ignore */ }
        try { sw.dispatchEvent(new PointerEvent('pointerup', init)); } catch { /* ignore */ }

        return {
          ok: true,
          afterAriaChecked: sw.getAttribute('aria-checked'),
          afterDataState: sw.getAttribute('data-state'),
        };
      });
      auditLog('enableUnlimited:video:dom-click', JSON.stringify(clickRes));

      // Poll the Generate button text up to 8s — Higgsfield UI updates button label
      // asynchronously after toggle click (sometimes 3-5s).
      const genBtnSelector = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
      const pollDeadline = Date.now() + 8000;
      let lastGenText = '';
      while (Date.now() < pollDeadline) {
        await page.waitForTimeout(500);
        lastGenText = ((await genBtnSelector.textContent().catch(() => '')) || '').replace(/\n/g, ' ').trim();
        if (/unlimited/i.test(lastGenText) && !/Generate\d+/.test(lastGenText)) {
          auditLog('enableUnlimited:done', `video: toggle clicked → Generate="${lastGenText}"`);
          return;
        }
      }
      auditLog('enableUnlimited:error', `video: clicked toggle but Generate="${lastGenText}" after 8s polling`);
      throw new Error(`enableUnlimited: toggle clicked but Generate="${lastGenText}" (still paid) after 8s wait`);
    }

    // Toggle still not found after banner click + retries — final verify check
    const genBtnFinal = page.locator('button:not([role="switch"])').filter({ hasText: /Unlimited|Generate/i }).last();
    const genFinal = ((await genBtnFinal.textContent().catch(() => '')) || '').replace(/\n/g, ' ').trim();
    if (/unlimited/i.test(genFinal) && !/Generate\d+/.test(genFinal)) {
      auditLog('enableUnlimited:done', `video: banner alone activated Unlimited → Generate="${genFinal}"`);
      return;
    }
    auditLog('enableUnlimited:error', `video: no toggle, Generate="${genFinal}"`);
    throw new Error(
      `enableUnlimited: "Unlimited mode" toggle never appeared after banner click. Generate="${genFinal}".`,
    );
  }
}

// --- setPromptTextarea (docs/higgsfield-selectors.md §2.6) ---
// Specifically for /ai/video which uses <textarea id="prompt">, NOT Lexical

export async function setPromptTextarea(page: Page, text: string): Promise<void> {
  await checkpointPause('setPromptTextarea:1-fill');

  // §2.6 — textarea#prompt on /ai/video
  const ta = page.locator('textarea#prompt');
  if (await ta.count() === 0) {
    auditLog('setPromptTextarea:error', 'textarea#prompt not found');
    throw new Error('setPromptTextarea: textarea#prompt not found');
  }
  await ta.click({ delay: 100 });
  await ta.fill(''); // clear existing
  // pressSequentially for human-like typing
  await ta.pressSequentially(text, { delay: randomDelay(25, 60) });
  auditLog('setPromptTextarea:done', `"${text.slice(0, 50)}..."`);
}
