/**
 * Spike: dump DOM of generated images on /ai/image.
 *
 * Prerequisites:
 *   1. Chrome already running (ensureContext via CDP or persistent)
 *   2. Ruslan has ALREADY navigated to /ai/image with generated images visible
 *      (from history or a fresh generation — doesn't matter)
 *
 * Run from Windows PowerShell:
 *   npx tsx scripts/spike-generated-images.ts
 *
 * Output: data/spike-generated-images.log (JSON dumps + summary)
 */
import { ensureContext } from '../src/lib/providers/higgsfield-singleton';
import { sleep } from '../src/lib/providers/browser-helpers';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';

const LOG = 'data/spike-generated-images.log';

function log(msg: string) {
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

async function main() {
  mkdirSync('data', { recursive: true });
  writeFileSync(LOG, `# Spike: generated images DOM dump\n# ${new Date().toISOString()}\n\n`);

  const ctx = await ensureContext();
  // Use existing page — Ruslan already has /ai/image open
  const pages = ctx.pages();
  log(`Context has ${pages.length} pages`);

  const page = pages.find(p => p.url().includes('/ai/image')) || pages[0];
  log(`Using page: ${page.url()}`);

  // ====== PART 1: Dump ALL <img> elements ======
  log('\n========== PART 1: ALL <img> ELEMENTS ==========\n');

  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map((img, i) => {
      const e = img as HTMLImageElement;
      const r = e.getBoundingClientRect();

      // Walk 3 levels up
      const ancestors: Array<{ tag: string; className: string; id: string; role: string | null }> = [];
      let parent = e.parentElement;
      for (let level = 0; level < 3 && parent; level++) {
        ancestors.push({
          tag: parent.tagName.toLowerCase(),
          className: parent.className?.toString().slice(0, 150) || '',
          id: parent.id || '',
          role: parent.getAttribute('role'),
        });
        parent = parent.parentElement;
      }

      return {
        index: i,
        src: (e.src || '').slice(0, 120),
        alt: e.alt || '',
        className: e.className?.toString().slice(0, 150) || '',
        ariaLabel: e.getAttribute('aria-label') || '',
        naturalWidth: e.naturalWidth,
        naturalHeight: e.naturalHeight,
        offsetWidth: e.offsetWidth,
        offsetHeight: e.offsetHeight,
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        },
        visible: e.offsetParent !== null && r.width > 0 && r.height > 0,
        ancestors,
      };
    });
  });

  log(`Total <img> elements: ${imgs.length}\n`);

  // Categorize by size
  const large = imgs.filter(i => i.rect.w > 100 && i.rect.h > 100 && i.visible);
  const small = imgs.filter(i => (i.rect.w <= 100 || i.rect.h <= 100) && i.visible);
  const hidden = imgs.filter(i => !i.visible);

  log(`Visible large (>100x100): ${large.length}`);
  log(`Visible small (<=100x100): ${small.length}`);
  log(`Hidden: ${hidden.length}\n`);

  log('--- LARGE VISIBLE IMAGES (likely generated results) ---\n');
  for (const img of large) {
    log(JSON.stringify(img, null, 2));
    log('');
  }

  log('--- SMALL VISIBLE IMAGES (likely icons/avatars) ---\n');
  for (const img of small.slice(0, 5)) {
    log(JSON.stringify(img, null, 2));
    log('');
  }
  if (small.length > 5) log(`... and ${small.length - 5} more small images\n`);

  // ====== PART 2: Containers around large images ======
  log('\n========== PART 2: CONTAINERS AROUND LARGE IMAGES ==========\n');

  const containers = await page.evaluate(() => {
    const largeImgs = Array.from(document.querySelectorAll('img')).filter(img => {
      const r = img.getBoundingClientRect();
      return r.width > 100 && r.height > 100 && (img as HTMLElement).offsetParent !== null;
    });

    // Walk up to find common container
    const containerInfo: Array<{
      imgSrc: string;
      levels: Array<{
        tag: string;
        className: string;
        id: string;
        role: string | null;
        childCount: number;
        dataAttrs: Record<string, string>;
        rect: { x: number; y: number; w: number; h: number };
      }>;
    }> = [];

    for (const img of largeImgs.slice(0, 4)) {
      const levels: typeof containerInfo[0]['levels'] = [];
      let el = img.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        const r = el.getBoundingClientRect();
        const dataAttrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value.slice(0, 50);
        }
        levels.push({
          tag: el.tagName.toLowerCase(),
          className: el.className?.toString().slice(0, 150) || '',
          id: el.id || '',
          role: el.getAttribute('role'),
          childCount: el.children.length,
          dataAttrs,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        });
        el = el.parentElement;
      }
      containerInfo.push({
        imgSrc: (img as HTMLImageElement).src.slice(0, 100),
        levels,
      });
    }
    return containerInfo;
  });

  for (const c of containers) {
    log(`Image: ${c.imgSrc}`);
    for (const [i, lvl] of c.levels.entries()) {
      log(`  L${i}: <${lvl.tag}> class="${lvl.className.slice(0, 80)}" id="${lvl.id}" role=${lvl.role} children=${lvl.childCount} rect=${JSON.stringify(lvl.rect)} data=${JSON.stringify(lvl.dataAttrs)}`);
    }
    log('');
  }

  // ====== PART 3: Hover on first large image — detect new elements ======
  log('\n========== PART 3: HOVER STATE CHANGES ==========\n');

  if (large.length > 0) {
    // Snapshot DOM element count before hover
    const beforeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    const beforeButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({
        text: (b.textContent || '').trim().slice(0, 50),
        visible: (b as HTMLElement).offsetParent !== null,
      }))
    );

    // Hover on the first large image — use figure>img selector and scrollIntoView
    const firstLarge = page.locator('figure img[src*="images.higgs.ai"]').first();
    const box = await firstLarge.boundingBox();
    if (!box) {
      log('First large image has no bounding box — trying scrollIntoView...');
      await firstLarge.scrollIntoViewIfNeeded();
      await sleep(1000);
    }
    try {
      await firstLarge.hover({ timeout: 10000 });
    } catch (hoverErr) {
      log(`Hover failed: ${hoverErr instanceof Error ? hoverErr.message : hoverErr} — skipping PART 3`);
      log('');
      // Jump to screenshot
      await page.screenshot({ path: 'data/spike-generated-images.png', fullPage: false });
      log('Screenshot: data/spike-generated-images.png');
      log('\nDone (hover skipped).');
      process.exit(0);
    }
    await sleep(1500);

    const afterCount = await page.evaluate(() => document.querySelectorAll('*').length);
    log(`DOM elements: before hover=${beforeCount}, after hover=${afterCount}, diff=${afterCount - beforeCount}`);

    // Find new/changed buttons
    const afterButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => {
        const e = b as HTMLElement;
        const r = e.getBoundingClientRect();
        return {
          text: (e.textContent || '').trim().slice(0, 80),
          visible: e.offsetParent !== null && r.width > 0,
          ariaLabel: b.getAttribute('aria-label') || '',
          className: e.className?.toString().slice(0, 100) || '',
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          innerHTML: e.innerHTML.slice(0, 200),
        };
      })
    );

    // Filter buttons that appeared or became visible after hover
    const beforeTexts = new Set(beforeButtons.filter(b => b.visible).map(b => b.text));
    const newButtons = afterButtons.filter(b => b.visible && !beforeTexts.has(b.text));
    log(`\nNew/changed visible buttons after hover: ${newButtons.length}\n`);
    for (const b of newButtons) {
      log(JSON.stringify(b, null, 2));
      log('');
    }

    // Also check for SVG icons / anchor links that appeared
    const hoverOverlay = await page.evaluate((imgIndex: number) => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const target = imgs[imgIndex];
      if (!target) return null;

      // Check siblings and parent's children for overlay elements
      const parent = target.parentElement;
      if (!parent) return null;

      const overlayElements: Array<{
        tag: string;
        text: string;
        ariaLabel: string;
        className: string;
        svgContent: string;
        href: string;
        rect: { x: number; y: number; w: number; h: number };
      }> = [];

      // Check up to 3 levels for overlay-like children
      const checkContainer = (el: Element, depth: number) => {
        if (depth > 3) return;
        for (const child of el.children) {
          const ce = child as HTMLElement;
          const r = ce.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && ce.offsetParent !== null) {
            const svg = child.querySelector('svg');
            overlayElements.push({
              tag: child.tagName.toLowerCase(),
              text: (ce.textContent || '').trim().slice(0, 50),
              ariaLabel: child.getAttribute('aria-label') || '',
              className: ce.className?.toString().slice(0, 100) || '',
              svgContent: svg ? svg.outerHTML.slice(0, 150) : '',
              href: (child as HTMLAnchorElement).href || '',
              rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            });
          }
          checkContainer(child, depth + 1);
        }
      };

      // Walk up 2 levels from img and scan children
      let container: Element | null = parent;
      for (let i = 0; i < 2 && container; i++) {
        container = container.parentElement;
      }
      if (container) checkContainer(container, 0);
      return overlayElements;
    }, large[0].index);

    if (hoverOverlay) {
      log(`\nOverlay elements near hovered image: ${hoverOverlay.length}\n`);
      // Show only SVG-containing or button-like elements (likely action icons)
      const actionElements = hoverOverlay.filter(e =>
        e.svgContent || e.tag === 'button' || e.tag === 'a' || e.ariaLabel
      );
      for (const el of actionElements.slice(0, 15)) {
        log(JSON.stringify(el, null, 2));
        log('');
      }
    }

    // Move mouse away to reset hover
    await page.mouse.move(0, 0);
    await sleep(500);
  } else {
    log('No large images found — cannot test hover. Make sure generated images are visible on /ai/image.');
  }

  // ====== PART 4: Screenshot ======
  await page.screenshot({ path: 'data/spike-generated-images.png', fullPage: false });
  log('\nScreenshot: data/spike-generated-images.png');

  // ====== SUMMARY ======
  log('\n========== SUMMARY ==========\n');
  log(`Page: ${page.url()}`);
  log(`Total imgs: ${imgs.length} (large visible: ${large.length}, small visible: ${small.length}, hidden: ${hidden.length})`);
  if (large.length > 0) {
    log(`First large img src pattern: ${large[0].src}`);
    log(`First large img ancestors[0]: tag=${large[0].ancestors[0]?.tag} class="${large[0].ancestors[0]?.className.slice(0, 60)}"`);
  }
  log('\nDone. Full details in data/spike-generated-images.log');

  process.exit(0);
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`SPIKE FAIL: ${msg}`); } catch { console.error(`SPIKE FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
