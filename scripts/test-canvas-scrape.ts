import { chromium } from 'playwright-core';

async function main() {
  const context = await chromium.launchPersistentContext('E:/Users/rasla/chrome-automation-safe', {
    headless: false,
    channel: 'chrome',
    viewport: null,
  });

  const page = context.pages()[0] || await context.newPage();

  const capturedMp4s: string[] = [];
  context.on('response', (resp) => {
    const u = resp.url();
    if (/\.mp4(\?|$)/i.test(u) && resp.status() < 400) {
      console.log('[network] mp4:', u.slice(0, 150));
      capturedMp4s.push(u);
    }
  });

  // Navigate to /ai/video
  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);

  const figCount = await page.evaluate(`document.querySelectorAll('figure[data-asset-preview]').length`);
  console.log('Figure count on /ai/video:', figCount);

  if (figCount > 0) {
    // Get first figure UUID and its bounding box, then hover
    const firstUuid = await page.evaluate(`document.querySelectorAll('figure[data-asset-preview]')[0].getAttribute('data-asset-preview')`);
    console.log('First figure UUID:', firstUuid);

    const fig = page.locator(`figure[data-asset-preview="${firstUuid}"]`).first();
    const box = await fig.boundingBox();
    console.log('Figure bounding box:', box);

    if (box) {
      // Hover over the figure center
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'E:/Users/rasla/Desktop/hover-figure.png' });
      console.log('Hover screenshot saved. Network mp4s so far:', capturedMp4s);

      // Check DOM after hover
      const afterHover = await page.evaluate(`
        (function() {
          var videos = Array.from(document.querySelectorAll('video'));
          return videos.map(function(v) { return v.src || v.currentSrc || ''; }).filter(Boolean);
        })()
      `);
      console.log('Video srcs after hover:', afterHover.slice(0, 5));

      // Also check for any new buttons/links that appeared on hover
      const hoverButtons = await page.evaluate(`
        (function() {
          var fig = document.querySelectorAll('figure[data-asset-preview]')[0];
          if (!fig) return [];
          var btns = Array.from(fig.querySelectorAll('button, a'));
          return btns.map(function(b) { return { tag: b.tagName, text: b.innerText ? b.innerText.trim() : '', href: b.href || '' }; });
        })()
      `);
      console.log('Buttons in figure after hover:', JSON.stringify(hoverButtons));
    }

    // Now click the figure and see what happens
    console.log('\n=== Clicking figure ===');
    await fig.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'E:/Users/rasla/Desktop/click-figure-result.png' });
    console.log('After click URL:', page.url());
    console.log('Network mp4s after click:', capturedMp4s);

    // Check for video elements or download links
    const clickResult = await page.evaluate(`
      (function() {
        var videos = Array.from(document.querySelectorAll('video'));
        var links = Array.from(document.querySelectorAll('a[href]'));
        var btns = Array.from(document.querySelectorAll('button'));
        return {
          videoSrcs: videos.map(function(v) { return v.src || v.currentSrc || ''; }).filter(Boolean).slice(0, 5),
          mp4Links: links.filter(function(a) { return a.href.includes('.mp4'); }).map(function(a) { return a.href.slice(0, 150); }).slice(0, 5),
          downloadBtns: btns.filter(function(b) { return /download/i.test(b.innerText || ''); }).map(function(b) { return b.innerText.trim(); }),
        };
      })()
    `);
    console.log('After click page info:', JSON.stringify(clickResult, null, 2));
  }

  console.log('\nFinal captured mp4s:', capturedMp4s);
  await context.close();
}

main().catch(console.error);
