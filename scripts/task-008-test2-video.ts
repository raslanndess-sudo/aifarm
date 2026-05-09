/**
 * Task-008 TEST 2 — generateVideo end-to-end через Higgsfield UI.
 * Использует картинку из TEST 1 (последняя img_* папка) как start frame.
 *
 * Запуск из Windows PowerShell:
 *   npx tsx scripts/task-008-test2-video.ts
 *   npx tsx scripts/task-008-test2-video.ts "Cat jumps off the porch, anime style"
 *
 * Evidence → data/task-008-evidence/test2/
 */
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync, appendFileSync, readdirSync, existsSync, copyFileSync, statSync } from 'fs';
import path from 'path';

const EVIDENCE = 'data/task-008-evidence/test2';
const LOG = `${EVIDENCE}/test2.log`;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

function findLatestImage(): string {
  const genDir = path.join(process.cwd(), 'public', 'generations');
  if (!existsSync(genDir)) throw new Error('No public/generations/ — run TEST 1 first');
  const imgDirs = readdirSync(genDir)
    .filter(d => d.startsWith('img_') && statSync(path.join(genDir, d)).isDirectory())
    .sort()
    .reverse();
  if (!imgDirs.length) throw new Error('No img_* dirs found — run TEST 1 first');
  const imgPath = `/generations/${imgDirs[0]}/image_0.png`;
  const fullPath = path.join(process.cwd(), 'public', imgPath);
  if (!existsSync(fullPath)) throw new Error(`Image not found: ${fullPath}`);
  return imgPath;
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(LOG, `\n# TEST 2 — generateVideo\n# Started: ${new Date().toISOString()}\n\n`);

  const imageUrl = findLatestImage();
  const prompt = process.argv[2] || 'Gentle wind blowing through fur, camera slowly zooms in, anime style';
  log(`Start frame: ${imageUrl}`);
  log(`Prompt: "${prompt}"`);

  const hf = new HiggsfieldWebProvider();
  log('Connecting...');
  await hf.connect();
  log('Connected');

  log('Calling generateVideo(kling-2-5-turbo)...');
  const job = await hf.generateVideo({
    imageUrl,
    prompt,
    model: 'kling-2-5-turbo',
  });
  log(`Result: ${JSON.stringify(job)}`);

  if (job.status === 'failed') {
    log(`TEST 2 FAIL — ${job.error}`);
  } else {
    // Copy clip to evidence
    if (job.resultUrl) {
      const clipSrc = path.join(process.cwd(), 'public', job.resultUrl);
      if (existsSync(clipSrc)) {
        copyFileSync(clipSrc, path.join(EVIDENCE, 'clip_0.mp4'));
        const size = statSync(clipSrc).size;
        log(`Evidence copied: clip_0.mp4 (${size} bytes)`);
        if (size < 500 * 1024) {
          log(`WARNING: clip is only ${size} bytes — expected >500KB`);
        }
      }
    }
    log('TEST 2 PASS');
  }

  // Copy relevant audit log lines
  const auditPath = 'data/higgsfield-audit.log';
  if (existsSync(auditPath)) {
    const { readFileSync } = require('fs');
    const audit = readFileSync(auditPath, 'utf-8');
    const lines = audit.split('\n').filter((l: string) =>
      l.includes('generateVideo') || l.includes('selectModel:done video') || l.includes('enableUnlimited')
    );
    appendFileSync(`${EVIDENCE}/audit-extract.log`, lines.join('\n') + '\n');
    log('Audit extract saved');
  }

  await hf.disconnect();

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`TEST 2 FAIL: ${msg}`); } catch { console.error(`TEST 2 FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
