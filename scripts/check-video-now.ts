/**
 * Quick standalone DOM inspector for /ai/video — connects to live Higgsfield Chrome,
 * dumps current videos + images + bg-image divs + screenshot, no submission.
 */
import { chromium } from 'playwright-core';
import * as fs from 'fs';

const HOST = process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1';
const PORT = process.env.HIGGSFIELD_CDP_PORT || '9224';

async function main() {
  const browser = await chromium.connectOverCDP(`http://${HOST}:${PORT}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => /\/ai\/video/.test(p.url())) || ctx.pages()[0];
  console.log('Page url:', page.url());

  // Screenshot first to capture what user sees
  const outDir = 'data/task-008-evidence/check-video-now';
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: `${outDir}/now.png`, fullPage: false });
  console.log(`Screenshot saved: ${outDir}/now.png`);

  const dump = await page.evaluate(() => {
    const out: Record<string, unknown> = {};

    out.videos = Array.from(document.querySelectorAll('video')).map(v => ({
      src: (v.src || v.querySelector('source')?.getAttribute('src') || '').slice(0, 200),
      rect: (() => { const r = v.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      poster: v.getAttribute('poster')?.slice(0, 200) || '',
    })).filter(v => v.rect.w > 30 || v.poster);

    // Images that are large enough to be content thumbnails (not icons)
    out.largeImages = Array.from(document.querySelectorAll('img'))
      .map(img => ({
        src: (img as HTMLImageElement).src.slice(0, 200),
        rect: (() => { const r = img.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
        alt: img.getAttribute('alt')?.slice(0, 80) || '',
      }))
      .filter(i => i.rect.w >= 100 && i.rect.h >= 100)
      .slice(0, 20);

    // Anchors with mp4 / kling_motion / cloudfront video
    out.mp4Anchors = Array.from(document.querySelectorAll('a'))
      .map(a => (a as HTMLAnchorElement).href)
      .filter(h => /\.mp4|kling_motion/.test(h))
      .slice(0, 10);

    // Elements with background-image url(...mp4|...kling)
    out.bgImageMp4 = Array.from(document.querySelectorAll('*'))
      .map(el => ({
        bg: (el as HTMLElement).style?.backgroundImage || '',
        cls: ((el.className || '') as string).toString().slice(0, 80),
      }))
      .filter(e => /\.mp4|kling_motion/.test(e.bg))
      .slice(0, 10);

    // Look for "Generating" or "Processing" UI hints
    out.statusTexts = Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && /generating|processing|queue|completed|done|just now|few seconds/i.test((el.textContent || '').trim()))
      .slice(0, 10)
      .map(el => (el.textContent || '').trim().slice(0, 80));

    return out;
  });

  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
