/**
 * Task-008 TEST 3 — webp→png конвертация через sharp.
 * Передаёт .webp файл как start frame в generateVideo, проверяет конвертацию.
 *
 * Запуск из Windows PowerShell:
 *   npx tsx scripts/task-008-test3-webp.ts
 *   npx tsx scripts/task-008-test3-webp.ts path/to/file.webp
 *
 * Если webp файла нет — скачай тестовый:
 *   Invoke-WebRequest -Uri "https://www.gstatic.com/webp/gallery/1.webp" -OutFile test-webp.webp
 *
 * Evidence → data/task-008-evidence/test3/
 */
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync, appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const EVIDENCE = 'data/task-008-evidence/test3';
const LOG = `${EVIDENCE}/test3.log`;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

function findWebp(): string {
  const explicit = process.argv[2];
  if (explicit && existsSync(explicit)) return explicit;

  // Search for any .webp in project root
  const candidates = ['test-webp.webp', 'balloon.webp'];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error('No .webp file found. Download one first:\n  Invoke-WebRequest -Uri "https://www.gstatic.com/webp/gallery/1.webp" -OutFile test-webp.webp');
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(LOG, `\n# TEST 3 — webp→png conversion\n# Started: ${new Date().toISOString()}\n\n`);

  const webpPath = findWebp();
  log(`Input webp: ${webpPath}`);

  // Verify it's actually webp (RIFF...WEBP magic)
  const header = readFileSync(webpPath);
  const isWebp = header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP';
  log(`Magic bytes check: RIFF=${header.slice(0, 4).toString('ascii')} WEBP=${header.slice(8, 12).toString('ascii')} → isWebp=${isWebp}`);
  if (!isWebp) {
    log('WARNING: file does not have WEBP magic bytes — sharp conversion will be skipped');
  }

  const hf = new HiggsfieldWebProvider();
  log('Connecting...');
  await hf.connect();
  log('Connected');

  log('Calling generateVideo with webp start frame...');
  const job = await hf.generateVideo({
    imageUrl: webpPath,
    prompt: 'Slow pan across landscape, cinematic',
    model: 'kling-2-5-turbo',
  });
  log(`Result: ${JSON.stringify(job)}`);

  // Verify the start_frame.png in generations dir is actually PNG
  const genDir = path.join(process.cwd(), 'public', 'generations');
  const vidDirs = readdirSync(genDir)
    .filter(d => d.startsWith('vid_') && statSync(path.join(genDir, d)).isDirectory())
    .sort()
    .reverse();
  if (vidDirs.length > 0) {
    const framePath = path.join(genDir, vidDirs[0], 'start_frame.png');
    if (existsSync(framePath)) {
      const frameHeader = readFileSync(framePath);
      const magic = `${frameHeader[0].toString(16).toUpperCase()} ${frameHeader[1].toString(16).toUpperCase()} ${frameHeader[2].toString(16).toUpperCase()} ${frameHeader[3].toString(16).toUpperCase()}`;
      log(`start_frame.png magic bytes: ${magic} (expect: 89 50 4E 47 for PNG)`);
      const isPng = frameHeader[0] === 0x89 && frameHeader[1] === 0x50 && frameHeader[2] === 0x4E && frameHeader[3] === 0x47;
      if (isPng) {
        log('PNG verification: PASS');
      } else {
        log('PNG verification: FAIL — not a real PNG!');
      }
    } else {
      log(`start_frame.png not found at ${framePath}`);
    }
  }

  // Copy audit lines
  const auditPath = 'data/higgsfield-audit.log';
  if (existsSync(auditPath)) {
    const audit = readFileSync(auditPath, 'utf-8');
    const lines = audit.split('\n').filter((l: string) =>
      l.includes('downloadToTempPng') || l.includes('generateVideo')
    );
    appendFileSync(`${EVIDENCE}/webp-test.log`, lines.join('\n') + '\n');
    log('Webp test audit saved to webp-test.log');
  }

  if (job.status === 'failed') {
    log(`TEST 3 FAIL — ${job.error}`);
  } else {
    log('TEST 3 PASS');
  }

  await hf.disconnect();

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`TEST 3 FAIL: ${msg}`); } catch { console.error(`TEST 3 FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
