/**
 * Spike: dump Generate button DOM on /ai/image after Seedream + Unlimited + prompt.
 *
 * Run from Windows PowerShell:
 *   npx tsx scripts/spike-generate-button.ts
 */
import { ensureContext } from '../src/lib/providers/higgsfield-singleton';
import { selectModel, enableUnlimited, typeInLexical, sleep } from '../src/lib/providers/browser-helpers';
import { appendFileSync, mkdirSync } from 'fs';

const LOG = 'data/spike-generate-button.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function main() {
  mkdirSync('data', { recursive: true });
  appendFileSync(LOG, `\n# Spike: Generate button\n# ${new Date().toISOString()}\n\n`);

  const ctx = await ensureContext();
  const page = await ctx.newPage();

  log('Navigating to /ai/image...');
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  log('selectModel(image, seedream_v5_lite)...');
  await selectModel(page, 'image', 'seedream_v5_lite');
  await sleep(1000);

  log('enableUnlimited(image)...');
  await enableUnlimited(page, 'image');
  await sleep(1000);

  log('typeInLexical prompt...');
  await typeInLexical(page, '[contenteditable="true"]', 'A white cat sitting in a sunlit field, anime style');
  await sleep(2000);

  // --- Dump ALL buttons on the page ---
  log('Dumping all buttons...');
  const buttons = await page.evaluate(() => {
    const all = document.querySelectorAll('button');
    return Array.from(all).map((b, i) => ({
      index: i,
      textContent: b.textContent?.trim().replace(/\n/g, '\\n') || '',
      innerHTML: b.innerHTML.slice(0, 300),
      className: b.className.slice(0, 200),
      type: b.type,
      disabled: b.disabled,
      ariaLabel: b.getAttribute('aria-label'),
      visible: b.offsetParent !== null,
      rect: b.getBoundingClientRect().toJSON(),
    }));
  });

  // Filter to likely Generate buttons
  const generateButtons = buttons.filter(b =>
    /generate/i.test(b.textContent) ||
    /generate/i.test(b.ariaLabel || '') ||
    /submit/i.test(b.textContent) ||
    /create/i.test(b.textContent)
  );

  log(`Total buttons on page: ${buttons.length}`);
  log(`Buttons matching /generate|submit|create/i: ${generateButtons.length}`);

  for (const b of generateButtons) {
    log(`\n--- Button #${b.index} ---`);
    log(`  textContent: "${b.textContent}"`);
    log(`  ariaLabel: "${b.ariaLabel}"`);
    log(`  className: "${b.className}"`);
    log(`  type: ${b.type} | disabled: ${b.disabled} | visible: ${b.visible}`);
    log(`  rect: x=${Math.round(b.rect.x)} y=${Math.round(b.rect.y)} w=${Math.round(b.rect.width)} h=${Math.round(b.rect.height)}`);
    log(`  innerHTML (first 300): ${b.innerHTML}`);
  }

  // Also check for :has-text("Generate") with Playwright
  log('\n--- Playwright locator checks ---');
  const checks = [
    'button:has-text("Generate")',
    'button:has-text("Generate 1")',
    'button:has-text("Generate · Unlimited")',
    'button:has-text("Generate Unlimited")',
    'button >> text=Generate',
    'button[type="submit"]',
  ];
  for (const sel of checks) {
    try {
      const count = await page.locator(sel).count();
      log(`  "${sel}" → count=${count}`);
      if (count > 0) {
        const text = await page.locator(sel).first().textContent();
        const vis = await page.locator(sel).first().isVisible();
        log(`    first text="${text?.trim().replace(/\n/g, '\\n')}" visible=${vis}`);
      }
    } catch (e) {
      log(`  "${sel}" → ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Screenshot
  await page.screenshot({ path: 'data/spike-generate-button.png', fullPage: false });
  log('\nScreenshot: data/spike-generate-button.png');
  log('Spike complete');

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`SPIKE FAIL: ${msg}`); } catch { console.error(`SPIKE FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
