/**
 * Task-008 TEST 1 — generateImage end-to-end через Higgsfield UI.
 *
 * Запуск из Windows PowerShell:
 *   npx tsx scripts/task-008-test1-image.ts
 *   npx tsx scripts/task-008-test1-image.ts "A red dragon on a mountain, fantasy style"
 *
 * Evidence → data/task-008-evidence/test1/
 */
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync, appendFileSync, copyFileSync, existsSync } from 'fs';
import path from 'path';

const EVIDENCE = 'data/task-008-evidence/test1';
const LOG = `${EVIDENCE}/test1.log`;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(LOG, `\n# TEST 1 — generateImage\n# Started: ${new Date().toISOString()}\n\n`);

  const prompt = process.argv[2] || 'A white cat sitting in a sunlit field, anime style';
  log(`Prompt: "${prompt}"`);

  const hf = new HiggsfieldWebProvider();
  log('Connecting...');
  await hf.connect();
  log('Connected');

  log('Calling generateImage(seedream_v5_lite, unlimited=true for Unlimited Relax queue)...');
  const images = await hf.generateImage(prompt, { model: 'seedream_v5_lite', count: 1, unlimited: true });
  log(`Result: ${JSON.stringify(images)}`);

  // Copy evidence
  if (images.length > 0) {
    const srcPath = path.join(process.cwd(), 'public', images[0]);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, path.join(EVIDENCE, 'image_0.png'));
      log('Evidence copied: image_0.png');
    }
  }

  // Copy relevant audit log lines
  const auditPath = 'data/higgsfield-audit.log';
  if (existsSync(auditPath)) {
    const { readFileSync } = require('fs');
    const audit = readFileSync(auditPath, 'utf-8');
    const lines = audit.split('\n').filter((l: string) =>
      l.includes('generateImage') || l.includes('selectModel') || l.includes('enableUnlimited')
    );
    appendFileSync(`${EVIDENCE}/audit-extract.log`, lines.join('\n') + '\n');
    log('Audit extract saved');
  }

  log('TEST 1 PASS');
  await hf.disconnect();

  // Exit without killing Chrome
  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`TEST 1 FAIL: ${msg}`); } catch { console.error(`TEST 1 FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
