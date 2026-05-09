/**
 * Download an already-generated video from /ai/video by media-asset id.
 * Usage: pass id via env VIDEO_ASSET_ID, or hardcoded default below.
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
  const page = ctx.pages().find(p => /\/ai\/video/.test(p.url())) || ctx.pages()[0];
  // Try direct detail-page URL first — Higgsfield commonly uses /ai/video/{id} or /ai/image/{id}
  const detailUrls = [
    `https://higgsfield.ai/ai/video/${ASSET_ID}`,
    `https://higgsfield.ai/ai/image/${ASSET_ID}`,
    `https://higgsfield.ai/asset/${ASSET_ID}`,
    `https://higgsfield.ai/media/${ASSET_ID}`,
  ];
  let opened = false;
  for (const url of detailUrls) {
    console.log(`Trying ${url}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    if (resp && resp.status() < 400) {
      const titleHint = await page.locator('button').filter({ hasText: /^Download$/i }).count();
      if (titleHint > 0) {
        console.log(`Detail page works at ${url} — Download button visible`);
        opened = true;
        break;
      }
    }
  }
  if (!opened) {
    console.log('No detail URL worked, falling back to grid+click flow');
    await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const thumb = page.locator(`img[alt="media asset by id of ${ASSET_ID}"]`).first();
    if (!(await thumb.count())) throw new Error(`thumb not found in grid for ${ASSET_ID}`);
    await thumb.scrollIntoViewIfNeeded();
    // dblclick — single click in Higgsfield video grid only triggers play overlay
    await thumb.dblclick({ force: true });
    await page.waitForTimeout(2500);
    if (!(await page.locator('button').filter({ hasText: /^Download$/i }).count())) {
      throw new Error('Modal/detail did not open even with dblclick');
    }
    console.log('Opened via dblclick fallback');
  }

  const outDir = 'data/task-008-evidence/e2e';
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Final url: ${page.url()}`);

  await page.screenshot({ path: `${outDir}/recovered-modal.png` });

  const downloadBtn = page.locator('button').filter({ hasText: /^Download$/i }).first();
  await downloadBtn.waitFor({ state: 'visible', timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);
  const suggested = download.suggestedFilename();
  const ext = path.extname(suggested) || '.mp4';
  const videoPath = path.join(outDir, `recovered-video${ext}`);
  await download.saveAs(videoPath);
  const stat = fs.statSync(videoPath);
  console.log(`SAVED: ${videoPath}, size: ${stat.size} bytes (suggested: ${suggested})`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
