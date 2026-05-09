/**
 * Voiceover loop test: exercises /api/scenario/voiceover at 10/20/30s durations.
 * Up to 5 retries per duration. Reports via say.sh.
 *
 * Run:
 *   npx tsx scripts/test-voiceover-hf.ts
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const WIN_HOST = (() => {
  if (process.env.BASE_HOST) return process.env.BASE_HOST;
  try {
    const out = execSync('ip route show default', { encoding: 'utf8' });
    const m = String(out).match(/default via (\S+)/);
    if (m) return m[1];
  } catch { /* */ }
  return 'localhost';
})();
const BASE = `http://${WIN_HOST}:3000`;
const SAY = path.join(process.cwd(), '.claude', 'agents', 'say.sh');

const TEST_SCRIPTS_BY_DURATION: Record<number, string> = {
  10: 'Двое программистов спорят перед монитором. Один показывает код другому, оба смеются над багом.',
  20: 'Тёмный лес ночью. Лиса бежит между деревьями. Луна светит через ветки. Звуки сов в тишине леса. Наконец лиса находит свою нору и забирается внутрь.',
  30: 'Закат над океаном. Серфер ловит последнюю волну дня. Брызги воды искрятся в розовых лучах. Он встаёт на доску и режет волну. Затем волна спадает и он сидит на доске. Камера медленно поднимается над горизонтом. Огромное бескрайнее пространство океана.',
};

const VOICES = ['TALLULAH', 'ROMAN', 'MABEL', 'STERLING', 'QUINN', 'LEO'];

let sessionCookie = '';

function log(tag: string, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [${tag}] ${msg}`);
}
function say(type: string, message: string) {
  const safe = message.replace(/"/g, '\\"').slice(0, 300);
  try { execSync(`bash "${SAY}" tester ${type} "${safe}"`, { stdio: 'inherit' }); }
  catch { /* */ }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
    redirect: 'manual',
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const m = setCookie.join('; ').match(/session=([^;]+)/);
  if (!m) throw new Error('No session cookie');
  sessionCookie = `session=${m[1]}`;
}

async function attemptOne(durationS: number, attemptNum: number): Promise<boolean> {
  const text = TEST_SCRIPTS_BY_DURATION[durationS];
  log('TEST', `attempt #${attemptNum}, duration=${durationS}s, text="${text.slice(0, 50)}..."`);

  const res = await fetch(`${BASE}/api/scenario/voiceover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      scenes: [{ description: text }],
      totalDurationS: durationS,
      scenarioId: `voice_test_${durationS}s_${attemptNum}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log('FAIL', `HTTP ${res.status}: ${err.slice(0, 200)}`);
    return false;
  }

  const data = await res.json();
  log('TEST', `voiceUrl=${data.voiceUrl}, provider=${data.provider}, voiceTone=${data.voiceTone}, size=${data.sizeBytes}`);

  // Validate file exists & has ffprobe-readable audio
  const localPath = path.join(process.cwd(), 'public', data.voiceUrl.replace(/^\//, ''));
  if (!fs.existsSync(localPath)) {
    log('FAIL', `mp3 not found at ${localPath}`);
    return false;
  }
  try {
    const probe = execSync(`ffprobe -v quiet -show_streams -of json "${localPath}"`).toString();
    const streams = JSON.parse(probe).streams as Array<{codec_type: string}>;
    const audio = streams.filter(s => s.codec_type === 'audio');
    if (audio.length === 0) {
      log('FAIL', 'no audio stream in mp3');
      return false;
    }
    log('PASS', `audio stream OK, voice=${data.voiceTone}, attempt #${attemptNum}, ${durationS}s`);
    return true;
  } catch (e) {
    log('FAIL', `ffprobe failed: ${e}`);
    return false;
  }
}

async function run() {
  await login();
  log('INIT', 'logged in, starting voiceover loop tests');

  const results: Array<{duration: number; attempts: number; passed: boolean}> = [];

  for (const duration of [10, 20, 30]) {
    let attemptCount = 0;
    let passed = false;
    for (let i = 1; i <= 5; i++) {
      attemptCount = i;
      passed = await attemptOne(duration, i);
      if (passed) break;
      log('RETRY', `${duration}s attempt ${i} failed, waiting 30s before retry`);
      await new Promise(r => setTimeout(r, 30_000));
    }
    results.push({ duration, attempts: attemptCount, passed });
  }

  const summary = results.map(r => `${r.duration}s: ${r.passed ? 'PASS' : 'FAIL'} (${r.attempts} attempts)`).join('; ');
  log('DONE', summary);
  if (results.every(r => r.passed)) {
    say('done', `voiceover-hf loop test ALL PASS — ${summary}`);
    process.exit(0);
  } else {
    say('blocked', `voiceover-hf loop test PARTIAL FAIL — ${summary}`);
    process.exit(1);
  }
}

run().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  log('FATAL', msg);
  say('blocked', `voiceover-hf loop FATAL — ${msg}`);
  process.exit(1);
});
