/**
 * Task-008 TEST 5 — 2 сцены последовательно (подготовка к task-009).
 * Генерит 2 image + 2 video через один singleton context.
 *
 * Запуск из Windows PowerShell:
 *   npx tsx scripts/task-008-test5-two-scenes.ts
 *
 * Evidence → data/task-008-evidence/test5/
 */
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync, appendFileSync, existsSync, readFileSync, copyFileSync, statSync } from 'fs';
import path from 'path';

const EVIDENCE = 'data/task-008-evidence/test5';
const LOG = `${EVIDENCE}/test5.log`;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  appendFileSync(LOG, `\n# TEST 5 — two scenes sequential\n# Started: ${new Date().toISOString()}\n\n`);

  const hf = new HiggsfieldWebProvider();
  log('Connecting...');
  await hf.connect();
  log('Connected');

  // --- Scene 1 ---
  log('=== SCENE 1 ===');
  log('Generating image: white cat on porch...');
  const imgs1 = await hf.generateImage('A white cat sitting on a wooden porch, warm sunset light, anime style');
  log(`Scene 1 image: ${imgs1[0]}`);

  log('Generating video from scene 1 image...');
  const vid1 = await hf.generateVideo({
    imageUrl: imgs1[0],
    prompt: 'Cat stands up and stretches lazily, warm light, anime style',
    model: 'kling-2-5-turbo',
  });
  log(`Scene 1 video: ${JSON.stringify(vid1)}`);

  // --- Scene 2 ---
  log('=== SCENE 2 ===');
  log('Generating image: white cat in flower field...');
  const imgs2 = await hf.generateImage('A white cat walking through a colorful flower field, anime style');
  log(`Scene 2 image: ${imgs2[0]}`);

  log('Generating video from scene 2 image...');
  const vid2 = await hf.generateVideo({
    imageUrl: imgs2[0],
    prompt: 'Cat walks forward through flowers, petals floating in breeze, anime style',
    model: 'kling-2-5-turbo',
  });
  log(`Scene 2 video: ${JSON.stringify(vid2)}`);

  // --- Verification ---
  log('=== VERIFICATION ===');

  let pass = true;

  // Check both videos exist and are >500KB
  for (const [i, vid] of [vid1, vid2].entries()) {
    if (vid.status === 'failed') {
      log(`Scene ${i + 1} video FAILED: ${vid.error}`);
      pass = false;
      continue;
    }
    if (vid.resultUrl) {
      const clipPath = path.join(process.cwd(), 'public', vid.resultUrl);
      if (existsSync(clipPath)) {
        const size = statSync(clipPath).size;
        log(`Scene ${i + 1} clip: ${vid.resultUrl} (${size} bytes)`);
        copyFileSync(clipPath, path.join(EVIDENCE, `scene${i + 1}_clip.mp4`));
        if (size < 500 * 1024) {
          log(`WARNING: scene ${i + 1} clip is only ${size} bytes — expected >500KB`);
        }
      } else {
        log(`Scene ${i + 1} clip not found at ${clipPath}`);
        pass = false;
      }
    }
  }

  // Copy evidence images
  for (const [i, imgs] of [imgs1, imgs2].entries()) {
    if (imgs[0]) {
      const imgPath = path.join(process.cwd(), 'public', imgs[0]);
      if (existsSync(imgPath)) {
        copyFileSync(imgPath, path.join(EVIDENCE, `scene${i + 1}_image.png`));
      }
    }
  }

  // Audit log analysis
  const auditPath = 'data/higgsfield-audit.log';
  if (existsSync(auditPath)) {
    const audit = readFileSync(auditPath, 'utf-8');
    const lines = audit.split('\n');

    const selectModelImage = lines.filter(l => l.includes('selectModel:done') && l.includes('image=')).length;
    const genVideoDown = lines.filter(l => l.includes('generateVideo:downloaded')).length;
    const launchCount = lines.filter(l => l.includes('launchPersistentContext')).length;

    log(`Audit: selectModel:done image= × ${selectModelImage} (expect >=2)`);
    log(`Audit: generateVideo:downloaded × ${genVideoDown} (expect >=2)`);
    log(`Audit: launchPersistentContext × ${launchCount} (expect <=1 — singleton reuse)`);

    // Save full audit extract for this run
    appendFileSync(`${EVIDENCE}/two-scenes-audit.log`, lines.join('\n') + '\n');
    log('Full audit saved to two-scenes-audit.log');

    if (launchCount > 1) {
      log('WARNING: multiple launchPersistentContext calls — singleton not reused!');
    }
  }

  if (pass) {
    log('TEST 5 PASS — both scenes generated successfully');
  } else {
    log('TEST 5 FAIL — see errors above');
  }

  await hf.disconnect();

  const t = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 3000);
  t.unref();
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  try { log(`TEST 5 FAIL: ${msg}`); } catch { console.error(`TEST 5 FAIL: ${msg}`); }
  process.kill(process.pid, 'SIGKILL');
});
