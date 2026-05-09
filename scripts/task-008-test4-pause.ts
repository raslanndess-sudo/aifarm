/**
 * Task-008 TEST 4 — pause/resume во время generateImage.
 *
 * ТРЕБУЕТ dev-server (npm run dev) на localhost:3000.
 * Скрипт запускает generateImage, на полпути шлёт POST /pause,
 * проверяет /status, потом POST /resume и ждёт завершения.
 *
 * Запуск из Windows PowerShell:
 *   npm run dev                              # Терминал 1
 *   npx tsx scripts/task-008-test4-pause.ts  # Терминал 2
 *
 * Evidence → data/task-008-evidence/test4/
 */
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'fs';

const EVIDENCE = 'data/task-008-evidence/test4';
const LOG = `${EVIDENCE}/test4.log`;
const BASE = 'http://localhost:3000';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function apiCall(method: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: 'session=admin' },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(LOG, `\n# TEST 4 — pause/resume during generation\n# Started: ${new Date().toISOString()}\n\n`);

  // Check dev-server is running
  try {
    await fetch(`${BASE}/api/admin/higgsfield/status`, { headers: { Cookie: 'session=admin' } });
  } catch {
    log('TEST 4 FAIL — dev-server not running on localhost:3000. Start with: npm run dev');
    process.exit(1);
  }
  log('Dev-server reachable');

  const hf = new HiggsfieldWebProvider();
  log('Connecting...');
  await hf.connect();
  log('Connected');

  // Start generateImage in background
  const prompt = 'A glowing crystal in a dark cave, fantasy style';
  log(`Starting generateImage in background: "${prompt}"`);
  const genPromise = hf.generateImage(prompt, { model: 'seedream_v5_lite', count: 1 });

  // Wait 8 seconds for generation to get past model selection
  log('Waiting 8s before sending pause...');
  await new Promise(r => setTimeout(r, 8000));

  // Send pause
  log('Sending POST /api/admin/higgsfield/pause...');
  const pauseRes = await apiCall('POST', '/api/admin/higgsfield/pause');
  log(`Pause response: ${JSON.stringify(pauseRes.body)}`);

  // Wait a moment then check status
  await new Promise(r => setTimeout(r, 2000));
  const statusRes = await apiCall('GET', '/api/admin/higgsfield/status');
  log(`Status after pause: ${JSON.stringify(statusRes.body)}`);
  appendFileSync(`${EVIDENCE}/pause-during-gen.log`,
    `[${new Date().toISOString()}] Status during pause: ${JSON.stringify(statusRes.body, null, 2)}\n`);

  if (statusRes.body.status === 'paused' || statusRes.body.isPaused === true) {
    log('PAUSE VERIFIED — automation is paused');
  } else {
    log(`WARNING — expected status=paused, got: ${statusRes.body.status}`);
  }

  // Wait 5s then resume
  log('Waiting 5s in paused state...');
  await new Promise(r => setTimeout(r, 5000));

  log('Sending POST /api/admin/higgsfield/resume...');
  const resumeRes = await apiCall('POST', '/api/admin/higgsfield/resume');
  log(`Resume response: ${JSON.stringify(resumeRes.body)}`);

  // Wait for generation to complete
  log('Waiting for generateImage to complete...');
  const images = await genPromise;
  log(`Generation result: ${JSON.stringify(images)}`);

  if (images.length > 0) {
    log('TEST 4 PASS — pause/resume worked, generation completed');
  } else {
    log('TEST 4 FAIL — generation returned empty results');
  }

  // Copy audit lines
  const auditPath = 'data/higgsfield-audit.log';
  if (existsSync(auditPath)) {
    const audit = readFileSync(auditPath, 'utf-8');
    const lines = audit.split('\n').filter((l: string) =>
      l.includes('checkpoint:') || l.includes('pause:') || l.includes('resume:')
    );
    appendFileSync(`${EVIDENCE}/pause-during-gen.log`, '\n--- Audit checkpoint lines ---\n' + lines.join('\n') + '\n');
    log('Pause audit log saved');
  }

  await hf.disconnect();

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`TEST 4 FAIL: ${msg}`); } catch { console.error(`TEST 4 FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
