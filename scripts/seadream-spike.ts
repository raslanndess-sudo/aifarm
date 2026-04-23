import { chromium } from 'playwright-core';

async function main() {
  const host = process.env.HIGGSFIELD_CDP_HOST ?? 'localhost';
  const port = process.env.HIGGSFIELD_CDP_PORT ?? '9223';
  console.log(`Connecting to CDP at ${host}:${port}...`);
  const browser = await chromium.connectOverCDP(`http://${host}:${port}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();

  // Go to image generation page
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'networkidle' });
  console.log('Current URL:', page.url());
  console.log('Title:', await page.title());

  // Screenshot the initial state
  await page.screenshot({ path: 'data/seadream-spike-1-initial.png', fullPage: true });
  console.log('Screenshot 1 saved: data/seadream-spike-1-initial.png');

  // Look for model selector / dropdown
  // Try clicking on model name or dropdown trigger
  const modelButtons = await page.$$('button, [role="combobox"], [class*="model"], [class*="select"], [class*="dropdown"]');
  console.log(`Found ${modelButtons.length} potential model selectors`);

  // Log all visible text that mentions model names
  const pageText = await page.evaluate(() => document.body.innerText);
  const modelLines = pageText.split('\n').filter((l: string) =>
    /model|nano|banana|dream|seed|lite/i.test(l)
  );
  console.log('Model-related text on page:', modelLines);

  // Try to find and click a model selector
  // Common patterns: a dropdown, a button with model name, tabs
  const modelSelector = await page.$('[class*="model-select"], [class*="ModelSelect"], [data-testid*="model"], button:has-text("nano"), button:has-text("Nano"), [class*="dropdown"]');
  if (modelSelector) {
    console.log('Found model selector, clicking...');
    await modelSelector.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'data/seadream-spike-2-dropdown.png', fullPage: true });
    console.log('Screenshot 2 saved: data/seadream-spike-2-dropdown.png');

    // Look for SeaDream option
    const options = await page.$$('text=/[Ss]ea[Dd]ream|[Ss]eedream|[Ss]ee[Dd]ream/');
    console.log(`Found ${options.length} SeaDream options`);
    if (options.length > 0) {
      await options[0].click();
      await page.waitForTimeout(2000);
      console.log('Clicked SeaDream option, new URL:', page.url());
      await page.screenshot({ path: 'data/seadream-spike-3-seadream.png', fullPage: true });
      console.log('Screenshot 3 saved');
    }
  } else {
    console.log('No obvious model selector found, trying alternative approaches...');

    // Try direct navigation to seadream variants
    const variants = [
      'https://higgsfield.ai/ai/image?model=seadream-5-lite',
      'https://higgsfield.ai/ai/image?model=seedream-5-lite',
      'https://higgsfield.ai/ai/image?model=sea-dream-5-lite',
    ];

    for (const url of variants) {
      console.log(`Trying: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });
      const currentUrl = page.url();
      const title = await page.title();
      console.log(`  Result URL: ${currentUrl}, Title: ${title}`);

      // Check if the model param stuck or was redirected
      if (currentUrl.includes('model=')) {
        console.log('  Model param preserved in URL!');
        await page.screenshot({ path: 'data/seadream-spike-variant.png', fullPage: true });
        break;
      }
    }
  }

  // Final: dump all links and buttons with their text
  const allButtons = await page.evaluate(() => {
    const btns = document.querySelectorAll('button, a[href*="model"], [role="option"], [role="menuitem"]');
    return Array.from(btns).map(b => ({
      tag: b.tagName,
      text: (b as HTMLElement).innerText?.slice(0, 80),
      href: (b as HTMLAnchorElement).href || '',
      class: b.className?.slice?.(0, 80) || '',
    }));
  });
  console.log('All buttons/links:', JSON.stringify(allButtons, null, 2));

  // Check current URL params
  console.log('Final URL:', page.url());

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
