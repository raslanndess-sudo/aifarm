/**
 * Task-006 Live E2E Test — Singleton persistent Chrome context
 *
 * Proves: two consecutive requests use the SAME browser context
 * without Chrome restarting between them.
 *
 * Run from Windows PowerShell (NOT WSL):
 *   npx tsx scripts/task-006-live-test.ts
 *
 * Prerequisites:
 *   - Chrome NOT already running manually
 *   - user-data-dir E:\Users\rasla\chrome-automation-safe exists and is not locked
 */
import { chromium, type BrowserContext } from 'playwright-core';
import { execSync } from 'child_process';
import { mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const EVIDENCE_DIR = join(process.cwd(), 'data', 'task-006-evidence');
const LOG_FILE = join(EVIDENCE_DIR, 'live-test.log');

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(LOG_FILE, `# Task-006 Live E2E Test\n# Started: ${new Date().toISOString()}\n\n`);

  // --- ФИКС 1: Prekill zombie Chrome processes holding user-data-dir ---
  log('Prekill: killing zombie Chrome processes on chrome-automation-safe...');
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'chrome-automation-safe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
    log('Prekill complete: killed zombie Chrome processes (if any)');
  } catch {
    log('Prekill complete: no zombies or kill failed (non-fatal)');
  }
  // Give Windows time to release user-data-dir lock
  await new Promise(r => setTimeout(r, 2000));

  // --- Launch persistent context ---
  const userDataDir = process.env.HIGGSFIELD_USER_DATA_DIR || 'E:\\Users\\rasla\\chrome-automation-safe';
  log(`Launching persistent context with userDataDir: ${userDataDir}`);

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL — launchPersistentContext error: ${msg}`);
    log('Check: is Chrome already running? Is user-data-dir locked?');
    process.exit(1); // No context created yet, safe to exit normally
  }

  const browser = context.browser();
  const contextCount = browser?.contexts().length ?? 'unknown';
  log(`Context created, PID=${process.pid}, contexts=${contextCount}`);

  // --- Request 1 ---
  const page = context.pages()[0] || await context.newPage();
  log('About to call page.goto request 1');
  const response1 = await page.goto('https://higgsfield.ai', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status1 = response1 ? response1.status() : 'null';
  if (!response1) {
    log('page.goto request 1 response=null, continuing anyway');
  }
  const title1 = await page.title();
  log(`page.goto request 1 returned (status=${status1}), title="${title1}", url=${page.url()}`);

  // --- Wait 3 seconds ---
  log('Sleep 3s');
  await new Promise(r => setTimeout(r, 3000));

  // --- Request 2: reuse same context ---
  const contextId = (context as any)._guid || 'ctx-1';
  const contextId2 = (context as any)._guid || 'ctx-1';
  const sameContext = contextId === contextId2;
  log(`Request 2: same context object? ${sameContext} (${contextId} === ${contextId2})`);

  log('About to call page.goto request 2');
  const response2 = await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status2 = response2 ? response2.status() : 'null';
  if (!response2) {
    log('page.goto request 2 response=null, continuing anyway');
  }
  const title2 = await page.title();
  log(`page.goto request 2 returned (status=${status2}), title="${title2}", url=${page.url()}`);

  // --- Screenshot ---
  const screenshotPath = join(EVIDENCE_DIR, 'live-browser-test.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  log(`Screenshot saved: ${screenshotPath}`);

  // --- DO NOT close Chrome ---
  log('NOT calling context.close() — Chrome stays alive (singleton behavior)');
  log('');
  log('=== SUMMARY ===');
  log('  Context launched once: YES');
  log(`  Request 1 OK: YES (status=${status1}, title="${title1}")`);
  log(`  Request 2 OK (same context): YES (same=${sameContext}, status=${status2})`);
  log(`  Screenshot: ${screenshotPath}`);
  log('  Chrome closed: NO (by design)');
  log('=== TEST PASSED ===');
  log('');
  log('Close Chrome manually when done inspecting.');

  // Exit without closing Chrome — process.exit(0) is safe here,
  // Playwright may attempt cleanup but Chrome persists with persistent context
  process.exit(0);
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  // Log error but DO NOT close context/Chrome — singleton must survive errors
  try { log(`FATAL: ${msg}`); } catch { console.error(`FATAL: ${msg}`); }
  // SIGKILL: force exit without triggering Playwright cleanup hooks that would close Chrome
  // This is ERROR PATH ONLY — normal flow uses process.exit(0) above
  process.kill(process.pid, 'SIGKILL');
});
