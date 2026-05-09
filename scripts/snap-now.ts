import { chromium } from 'playwright-core';
import * as fs from 'fs';

(async () => {
  const browser = await chromium.connectOverCDP(`http://${process.env.HIGGSFIELD_CDP_HOST || '127.0.0.1'}:${process.env.HIGGSFIELD_CDP_PORT || '9224'}`);
  const page = browser.contexts()[0].pages().find(p => /\/ai\/video/.test(p.url())) || browser.contexts()[0].pages()[0];
  await page.bringToFront();
  await page.waitForTimeout(1500);
  fs.mkdirSync('data/task-008-evidence/e2e', { recursive: true });
  await page.screenshot({ path: 'data/task-008-evidence/e2e/baseline-now.png', fullPage: false });
  console.log('Saved baseline-now.png, url:', page.url());
  await browser.close();
})();
