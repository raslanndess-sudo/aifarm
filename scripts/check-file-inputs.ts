/**
 * Diagnose all file inputs on /ai/video — name, accept, position, parent context.
 */
import { chromium } from 'playwright-core';

async function main() {
  const browser = await chromium.connectOverCDP(`http://${process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1'}:${process.env.HIGGSFIELD_CDP_PORT || '9224'}`);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => /\/ai\/video/.test(p.url())) || ctx.pages()[0];
  if (!/\/ai\/video/.test(page.url())) {
    await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }
  console.log('Page:', page.url());

  const inputs = await page.evaluate(() => {
    const result: unknown[] = [];
    Array.from(document.querySelectorAll('input[type="file"]')).forEach((inp, i) => {
      const r = inp.getBoundingClientRect();
      // Find ancestor with text describing role (Start frame / End frame / Reference / etc)
      let scope: Element | null = inp.parentElement;
      const ancestorTexts: string[] = [];
      for (let depth = 0; depth < 8 && scope; depth++) {
        const t = (scope.textContent || '').trim().slice(0, 100);
        if (t && t.length < 100) ancestorTexts.push(`d${depth}: ${t}`);
        scope = scope.parentElement;
      }
      result.push({
        index: i,
        name: inp.getAttribute('name'),
        accept: inp.getAttribute('accept'),
        multiple: inp.getAttribute('multiple') !== null,
        ariaLabel: inp.getAttribute('aria-label'),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        ancestorTexts: ancestorTexts.slice(0, 4),
      });
    });
    return result;
  });

  console.log(JSON.stringify(inputs, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
