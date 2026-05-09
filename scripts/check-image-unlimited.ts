/**
 * Diagnostic: dump every toggle-like element + every "Unlimited" text node on /ai/image.
 */
import { chromium } from 'playwright-core';

const HOST = process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1';
const PORT = process.env.HIGGSFIELD_CDP_PORT || '9224';

async function main() {
  const browser = await chromium.connectOverCDP(`http://${HOST}:${PORT}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => /\/ai\/image/.test(p.url())) || ctx.pages()[0];
  if (!/\/ai\/image/.test(page.url())) {
    await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }
  console.log('Page url:', page.url());

  const dump = await page.evaluate(() => {
    const out: Record<string, unknown> = {};

    // ALL switch/toggle candidates
    const togglesSelectors = [
      'button[role="switch"]',
      '[role="switch"]',
      'input[type="checkbox"]',
      'button[data-state="checked"]',
      'button[data-state="unchecked"]',
      '[data-state="checked"]',
      '[data-state="unchecked"]',
    ];
    out.toggles = togglesSelectors.map(sel => {
      const els = Array.from(document.querySelectorAll(sel));
      return {
        selector: sel,
        count: els.length,
        items: els.slice(0, 5).map((el, i) => {
          const r = el.getBoundingClientRect();
          return {
            i,
            tag: el.tagName.toLowerCase(),
            ariaChecked: el.getAttribute('aria-checked'),
            dataState: el.getAttribute('data-state'),
            type: el.getAttribute('type'),
            cls: ((el.className || '') as string).toString().slice(0, 80),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          };
        }),
      };
    });

    // All elements containing "Unlimited" text
    out.unlimitedTexts = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const t = (el.textContent || '').trim();
        return /unlimited/i.test(t) && t.length < 80;
      })
      .slice(0, 15)
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 60),
          childCount: el.children.length,
          parentTag: el.parentElement?.tagName?.toLowerCase() || '',
          parentText: (el.parentElement?.textContent || '').trim().slice(0, 80),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      });

    return out;
  });

  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
