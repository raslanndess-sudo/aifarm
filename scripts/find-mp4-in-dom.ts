/**
 * Find direct mp4 URL by asset id by scanning DOM, scripts, network history.
 */
import { chromium } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

const HOST = process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1';
const PORT = process.env.HIGGSFIELD_CDP_PORT || '9224';
const ASSET_ID = process.env.VIDEO_ASSET_ID || '18b135ee-23d1-49ef-a943-7c8cf8d91e82';

async function main() {
  const browser = await chromium.connectOverCDP(`http://${HOST}:${PORT}`);
  const ctx = browser.contexts()[0];

  const networkUrls: string[] = [];
  ctx.on('request', req => {
    const u = req.url();
    if (u.includes(ASSET_ID) || /\.mp4|kling_motion/.test(u)) networkUrls.push(`REQ ${req.method()} ${u}`);
  });
  ctx.on('response', resp => {
    const u = resp.url();
    if (u.includes(ASSET_ID) || /\.mp4|kling_motion/.test(u)) networkUrls.push(`RESP ${resp.status()} ${u}`);
  });

  let page = ctx.pages().find(p => /\/ai\/video/.test(p.url())) || ctx.pages()[0];
  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Scan EVERYTHING for mp4 URLs related to our id
  const found = await page.evaluate((id: string) => {
    const out: Record<string, unknown> = {};
    const corpus = [];

    // 1. Inline next data
    const nextData = document.querySelector('#__NEXT_DATA__');
    if (nextData) corpus.push({ source: '__NEXT_DATA__', text: nextData.textContent || '' });

    // 2. All scripts
    for (const s of Array.from(document.querySelectorAll('script'))) {
      const t = s.textContent || '';
      if (t.length > 50) corpus.push({ source: 'script', text: t });
    }

    // 3. All elements with relevant data-* attributes
    for (const el of Array.from(document.querySelectorAll(`[data-asset-preview="${id}"], [data-asset-id="${id}"]`))) {
      corpus.push({ source: `data-attr ${el.tagName}`, text: el.outerHTML.slice(0, 500) });
    }

    // Find mp4 / video URLs containing asset id OR matching common patterns
    const matches = new Set<string>();
    const patterns = [
      new RegExp(`https?://[^"'\\s]*${id}[^"'\\s]*`, 'g'),
      /https?:\/\/[^"'\s]*\.mp4[^"'\s]*/g,
      /https?:\/\/cdn\.higgsfield\.ai\/[^"'\s]+/g,
      /https?:\/\/d\d?ol7oe51mr4n9\.cloudfront\.net\/[^"'\s]+/g,
      /https?:\/\/d8j0ntlcm91z4\.cloudfront\.net\/[^"'\s]+/g,
    ];
    for (const c of corpus) {
      for (const p of patterns) {
        const m = c.text.match(p);
        if (m) for (const url of m) matches.add(url.slice(0, 300));
      }
    }
    out.matches = Array.from(matches).slice(0, 30);

    // Also: img elements with our id
    out.matchingImgs = Array.from(document.querySelectorAll(`img[alt*="${id}"], img[data-asset-preview="${id}"]`))
      .map(img => ({
        src: (img as HTMLImageElement).src.slice(0, 300),
        attrs: Array.from((img as HTMLImageElement).attributes).map(a => `${a.name}=${a.value.slice(0, 100)}`),
      }));

    return out;
  }, ASSET_ID);

  console.log(JSON.stringify({ found, networkUrlsCount: networkUrls.length }, null, 2));
  console.log('--- network urls (first 30) ---');
  for (const u of networkUrls.slice(0, 30)) console.log(u);

  // Try direct fetch of any cdn.higgsfield.ai/kling_motion URL (the most likely pattern for Kling output)
  const matches = (found as { matches?: string[] }).matches || [];
  for (const url of matches) {
    if (/\.mp4(\?|$)/i.test(url)) {
      console.log(`\nAttempting download: ${url}`);
      try {
        const resp = await page.request.get(url);
        if (resp.ok()) {
          const buf = await resp.body();
          const outDir = 'data/task-008-evidence/e2e';
          fs.mkdirSync(outDir, { recursive: true });
          const fname = path.basename(new URL(url).pathname) || `recovered-${ASSET_ID}.mp4`;
          const out = path.join(outDir, fname);
          fs.writeFileSync(out, buf);
          console.log(`SAVED ${out} (${buf.length} bytes)`);
          break;
        } else {
          console.log(`HTTP ${resp.status()} for ${url}`);
        }
      } catch (e) {
        console.log(`fetch failed: ${(e as Error).message}`);
      }
    }
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
