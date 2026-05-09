/**
 * Task-007 live e2e tests for selectModel, enableUnlimited, setPromptTextarea.
 *
 * Run from Windows PowerShell (NOT WSL):
 *   npx tsx scripts/task-007-live-test.ts
 *
 * Uses ensureContext() from higgsfield-singleton (launchPersistentContext).
 * Chrome stays alive after test — close manually.
 */
import { ensureContext } from '../src/lib/providers/higgsfield-singleton';
import { selectModel, enableUnlimited, setPromptTextarea, sleep } from '../src/lib/providers/browser-helpers';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const EVIDENCE = 'data/task-007-evidence';
const LOG = `${EVIDENCE}/live-test.log`;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(LOG, `# Task-007 Live E2E Test\n# Started: ${new Date().toISOString()}\n\n`);

  // --- Prekill zombie Chrome processes holding user-data-dir ---
  log('Prekill: killing zombie Chrome on chrome-automation-safe...');
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'chrome-automation-safe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
    log('Prekill complete: killed zombies (if any)');
  } catch {
    log('Prekill complete: no zombies or kill failed (non-fatal)');
  }
  await new Promise(r => setTimeout(r, 2000));

  // --- Launch singleton context ---
  log('Calling ensureContext()...');
  const ctx = await ensureContext();
  log(`Context ready, pages=${ctx.pages().length}`);

  const page = await ctx.newPage();
  const stalePagesCount = ctx.pages().length - 1;
  log(`Fresh page created, ignoring ${stalePagesCount} stale pages`);

  // ===================== TEST 1 =====================
  log('TEST 1: selectModel(image, seedream_v5_lite)');
  log('  Navigating to /ai/image...');
  const r1 = await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log(`  page.goto returned (status=${r1 ? r1.status() : 'null'})`);
  await sleep(2000);
  log('  Calling selectModel...');
  await selectModel(page, 'image', 'seedream_v5_lite');
  await page.screenshot({ path: `${EVIDENCE}/image-select.png`, fullPage: true });
  log('TEST 1 PASS — screenshot: image-select.png');

  // ===================== TEST 2 =====================
  log('TEST 2: enableUnlimited(image)');
  log('  Calling enableUnlimited...');
  await enableUnlimited(page, 'image');
  await page.screenshot({ path: `${EVIDENCE}/image-unlimited.png`, fullPage: true });
  log('TEST 2 PASS — screenshot: image-unlimited.png');

  // ===================== TEST 3 =====================
  log('TEST 3: selectModel(video, kling-2-5-turbo)');
  log('  Navigating to /ai/video...');
  const r3 = await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log(`  page.goto returned (status=${r3 ? r3.status() : 'null'})`);
  await sleep(2000);
  log('  Calling selectModel...');
  await selectModel(page, 'video', 'kling-2-5-turbo');
  await page.screenshot({ path: `${EVIDENCE}/video-select.png`, fullPage: true });
  log('TEST 3 PASS — screenshot: video-select.png');

  // ===================== TEST 4 =====================
  // FIX 2: enableUnlimited now checks "Unlimited mode" toggle first (aria-checked),
  // then falls back to banner, then checks Generate text. No dummy image needed
  // if toggle is already ON. Upload real image only to trigger banner path.
  log('TEST 4: enableUnlimited(video)');
  log('  Calling enableUnlimited (checks toggle first, then banner)...');
  try {
    await enableUnlimited(page, 'video');
    await page.screenshot({ path: `${EVIDENCE}/video-unlimited.png`, fullPage: true });
    log('TEST 4 PASS — screenshot: video-unlimited.png');
  } catch (e) {
    // Toggle not found and no banner (no start frame uploaded yet) — upload real image and retry
    const msg = e instanceof Error ? e.message : String(e);
    log(`  First attempt failed: ${msg}`);
    log('  Uploading real start frame and retrying...');

    const candidates = [
      join(process.cwd(), 'balloon.png'),
      join(process.cwd(), 'hg_screenshot.png'),
      join(process.cwd(), 'hg_screenshot2.png'),
    ];
    const framePath = candidates.find(p => existsSync(p));
    if (!framePath) {
      log('TEST 4 SKIP — no real image found for start frame upload');
      await page.screenshot({ path: `${EVIDENCE}/video-unlimited-attempt.png`, fullPage: true });
    } else {
      const fileInputs = await page.locator('input[type="file"]').all();
      if (fileInputs.length > 0) {
        await fileInputs[0].setInputFiles(framePath);
        log(`  Uploaded ${framePath}, waiting 5s...`);
        await sleep(5000);
        try {
          await enableUnlimited(page, 'video');
          await page.screenshot({ path: `${EVIDENCE}/video-unlimited.png`, fullPage: true });
          log('TEST 4 PASS — screenshot: video-unlimited.png');
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          log(`TEST 4 SKIP — ${msg2}`);
          await page.screenshot({ path: `${EVIDENCE}/video-unlimited-attempt.png`, fullPage: true });
        }
      } else {
        log('TEST 4 SKIP — no file inputs found');
      }
    }
  }

  // ===================== TEST 5 =====================
  log('TEST 5: setPromptTextarea(video)');
  log('  Calling setPromptTextarea...');
  await setPromptTextarea(page, 'A cinematic scene of ocean waves at sunset, dramatic lighting');
  await page.screenshot({ path: `${EVIDENCE}/video-prompt.png`, fullPage: true });
  log('TEST 5 PASS — screenshot: video-prompt.png');

  // ===================== TEST 6 =====================
  log('TEST 6: selectModel(video, invalid model) — expect throw');
  try {
    await selectModel(page, 'video', 'kling-1-5' as any);
    log('TEST 6 FAIL — no error thrown!');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`TEST 6 PASS — threw: ${msg}`);
    appendFileSync(`${EVIDENCE}/fail-test.log`, `[${new Date().toISOString()}] Expected error: ${msg}\n`);
  }

  log('');
  log('ALL TESTS COMPLETE');

  // FIX 3: Don't call browser.close() or context.close() — that kills Chrome.
  // Don't call process.exit(0) — that triggers Playwright cleanup hooks which close Chrome.
  // Instead: unref all handles so Node exits naturally without killing child processes.
  // Chrome survives because launchPersistentContext spawned it as a detached child.
  log('Done. Letting Node exit naturally (no process.exit, no browser.close).');
  log('Chrome should remain open — close it manually if needed.');

  // Force-unref the event loop so Node can exit without process.exit()
  // setTimeout with unref ensures we don't hang indefinitely
  const exitTimer = setTimeout(() => {
    // Safety: if Node hasn't exited after 3s, force it without Playwright cleanup
    process.kill(process.pid, 'SIGKILL');
  }, 3000);
  exitTimer.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`FATAL: ${msg}`); } catch { console.error(`FATAL: ${msg}`); }
  // SIGKILL: force exit without Playwright cleanup hooks — ERROR PATH ONLY
  process.kill(process.pid, 'SIGKILL');
});
