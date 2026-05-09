/**
 * Auto E2E loop: exercises the full Studio pipeline via API calls
 * (plan-ai → generate-scene → generate-video → finalize),
 * validates result (DB, file, duration, size), reports via say.sh.
 *
 * No browser needed — drives the same backend APIs that the Studio UI calls.
 *
 * Run:
 *   npx tsx scripts/auto-e2e-loop.ts
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, setGlobalDispatcher } from 'undici';

// Higgsfield collect+merge can take 8-15 min. Disable undici default timeouts.
setGlobalDispatcher(new Agent({ headersTimeout: 20 * 60_000, bodyTimeout: 20 * 60_000 }));

// ── Random scripts pool (2-line = 2 scenes) ──────────────────────────────────
const SCRIPTS = [
  'кавказский мальчик знакомится с русской девушкой на патриках в москве\nони идут вместе по улице и смеются',
  'старый рыбак чинит сети на берегу моря\nк нему подходит молодой парень и предлагает помощь',
  'девушка-блогер снимает влог в Tokyo neon district\nпрохожий улыбается ей в камеру и машет рукой',
  'самурай тренируется в бамбуковом лесу на рассвете\nон поднимает катану и делает резкий выпад',
  'двое программистов спорят перед монитором с кодом\nодин показывает другому что-то на экране и оба смеются',
];

const randomScript = () => SCRIPTS[Math.floor(Math.random() * SCRIPTS.length)];

// ── Constants ─────────────────────────────────────────────────────────────────
// In WSL2, the Windows host is reachable via the default gateway, NOT the resolv.conf nameserver.
// Allow override via env var. Falls back to default gateway, then localhost.
const WIN_HOST = (() => {
  if (process.env.BASE_HOST) return process.env.BASE_HOST;
  try {
    const out = require('child_process').execSync('ip route show default', { encoding: 'utf8' });
    const m = String(out).match(/default via (\S+)/);
    if (m) return m[1];
  } catch { /* not WSL or ip not available */ }
  return 'localhost';
})();
const BASE = `http://${WIN_HOST}:3000`;
const SAY = path.join(process.cwd(), '.claude', 'agents', 'say.sh');
const SCENE_COUNT = (() => {
  const n = parseInt(process.env.SCENE_COUNT ?? '2', 10);
  return Math.max(1, Math.min(10, isNaN(n) ? 2 : n));
})();
const STYLE = 'anime';
const ASPECT = '16:9';

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(tag: string, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [${tag}] ${msg}`);
}

function say(type: string, message: string) {
  const safe = message.replace(/"/g, '\\"').slice(0, 300);
  try {
    execSync(`bash "${SAY}" tester ${type} "${safe}"`, { stdio: 'inherit' });
  } catch {
    log('SAY', `say.sh failed for: ${type} ${safe}`);
  }
}

let sessionCookie = '';

async function api(endpoint: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const opts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers,
    redirect: 'manual',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);

  // Handle redirect to /login
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`API ${endpoint} redirected (auth expired?): ${res.headers.get('location')}`);
  }

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`API ${endpoint} HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function login() {
  log('AUTH', 'logging in as admin');
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
    redirect: 'manual',
  });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}`);

  // Extract session cookie from Set-Cookie header
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const sessionMatch = setCookie.join('; ').match(/session=([^;]+)/);
  if (!sessionMatch) throw new Error('No session cookie in login response');
  sessionCookie = `session=${sessionMatch[1]}`;
  log('AUTH', 'logged in successfully');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const script = randomScript();
  log('INIT', `script: "${script.split('\n')[0].slice(0, 60)}..."`);

  await login();

  // ── Step 1: Plan scenes via AI ──────────────────────────────────────────
  log('S1', `calling /api/scenes/plan-ai (${SCENE_COUNT} scenes, style=${STYLE})`);
  const planResult = await api('/api/scenes/plan-ai', {
    script,
    sceneCount: SCENE_COUNT,
    style: STYLE,
  });
  const scenes: Array<{ image_prompt: string; animation_prompt: string; description: string }> =
    planResult.scenes;
  if (!scenes || scenes.length < SCENE_COUNT) {
    throw new Error(`Expected ${SCENE_COUNT} scenes, got ${scenes?.length ?? 0}`);
  }
  log('S1', `got ${scenes.length} scenes (source: ${planResult.source ?? 'unknown'})`);
  scenes.forEach((s, i) => log('S1', `  scene ${i + 1}: ${s.description?.slice(0, 80)}`));

  // ── Step 2: Generate images for each scene ──────────────────────────────
  const imageUrls: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prefix = ASPECT === '16:9'
      ? '16:9 widescreen cinematic video frame, '
      : '9:16 vertical video frame, portrait orientation, ';
    const prompt = prefix + scene.image_prompt;

    log('S2', `generating image for scene ${i + 1}...`);
    const imgResult = await api('/api/cref/generate-scene', {
      scenePrompt: prompt,
      style: STYLE,
      aspectRatio: ASPECT,
    });
    if (!imgResult.imageUrl) {
      throw new Error(`Scene ${i + 1} image generation failed: ${JSON.stringify(imgResult)}`);
    }
    imageUrls.push(imgResult.imageUrl);
    log('S2', `scene ${i + 1} image: ${imgResult.imageUrl.slice(0, 80)}...`);
  }

  // ── Step 3: Submit video generation for each scene (submitOnly) ─────────
  const submittedJobs: Array<{ jobId: string; submitTime: number }> = [];
  for (let i = 0; i < scenes.length; i++) {
    log('S3', `submitting video for scene ${i + 1}...`);
    const vidResult = await api('/api/kling/generate-video', {
      imageUrl: imageUrls[i],
      animationPrompt: scenes[i].animation_prompt,
      modelName: 'kling-v1',
      duration: '5',
      mode: 'std',
      submitOnly: true,
    });
    if (!vidResult.taskId || !vidResult.submitTime) {
      throw new Error(`Scene ${i + 1} video submit failed: ${JSON.stringify(vidResult)}`);
    }
    submittedJobs.push({ jobId: vidResult.taskId, submitTime: vidResult.submitTime });
    log('S3', `scene ${i + 1} submitted: taskId=${vidResult.taskId}`);
  }

  // ── Step 4: Finalize — collect + merge ──────────────────────────────────
  log('S4', `calling /api/scenario/finalize with ${submittedJobs.length} jobs...`);
  const finResult = await api('/api/scenario/finalize', { submittedJobs });

  if (!finResult.finalUrl) {
    throw new Error(`Finalize failed: ${JSON.stringify(finResult)}`);
  }
  log('S4', `finalized! finalUrl=${finResult.finalUrl}, clips=${finResult.clipCount}, size=${finResult.sizeBytes}`);

  // ── Validation ──────────────────────────────────────────────────────────
  log('VAL', 'starting validation');

  // 1. DB should have a fresh video record
  const dbResp = await api('/api/videos');
  const videos = dbResp.videos as Array<{ id: number; video_url: string | null }>;
  const latest = videos[0];
  log('VAL', `DB latest video: id=${latest?.id}, video_url=${latest?.video_url ?? 'null'}`);

  // 2. Final file accessible via HTTP HEAD
  const fileCheck = await fetch(`${BASE}${finResult.finalUrl}`, { method: 'HEAD' });
  if (!fileCheck.ok) {
    throw new Error(`finalUrl ${finResult.finalUrl} returns HTTP ${fileCheck.status}`);
  }
  log('VAL', `HEAD ${finResult.finalUrl} → ${fileCheck.status} OK`);

  // 3. ffprobe — check duration
  const localPath = path.join(process.cwd(), 'public', finResult.finalUrl.replace(/^\//, ''));
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
  const probe = execSync(`ffprobe -v quiet -show_format -of json "${localPath}"`).toString();
  const duration = parseFloat(JSON.parse(probe).format.duration);
  const expectedMin = 4;
  const expectedMax = 12;
  if (duration < expectedMin || duration > expectedMax) {
    throw new Error(`Duration ${duration}s outside expected [${expectedMin}-${expectedMax}]`);
  }
  log('VAL', `duration: ${duration}s ✓`);

  // 3.5 Audio track presence (ffprobe shows codec_type per stream)
  const streamsProbe = execSync(`ffprobe -v quiet -show_streams -of json "${localPath}"`).toString();
  const streams = JSON.parse(streamsProbe).streams as Array<{codec_type: string; codec_name?: string}>;
  const audioStreams = streams.filter(s => s.codec_type === 'audio');
  const videoStreams = streams.filter(s => s.codec_type === 'video');
  log('VAL', `streams: ${videoStreams.length} video + ${audioStreams.length} audio`);
  if (videoStreams.length === 0) throw new Error('No video stream in final.mp4');
  if (audioStreams.length === 0) {
    log('VAL', '⚠ no audio track — voiceover not merged (or skipped)');
  } else {
    log('VAL', `✓ audio track: ${audioStreams[0].codec_name}`);
  }

  // 4. File size sanity (>500KB per scene)
  const stat = fs.statSync(localPath);
  if (stat.size < 500_000) {
    throw new Error(`final.mp4 suspiciously small: ${stat.size} bytes`);
  }
  log('VAL', `size: ${stat.size} bytes ✓`);

  // 5. Check per-scene clips exist
  if (finResult.clipUrls) {
    for (let i = 0; i < (finResult.clipUrls as string[]).length; i++) {
      const clipUrl = (finResult.clipUrls as string[])[i];
      const clipCheck = await fetch(`${BASE}${clipUrl}`, { method: 'HEAD' });
      log('VAL', `clip ${i + 1} HEAD ${clipUrl} → ${clipCheck.status}`);
    }
  }

  // 6. Audit log freshness (if available)
  const auditPath = path.join(process.cwd(), 'data', 'higgsfield-audit.log');
  if (fs.existsSync(auditPath)) {
    const auditLog = fs.readFileSync(auditPath, 'utf8');
    const recentSaved = auditLog
      .split('\n')
      .filter(l => l.includes('collectAndDownloadVideos:saved'))
      .slice(-3);
    log('VAL', `recent audit saved entries: ${recentSaved.length}`);
    recentSaved.forEach(l => log('VAL', `  ${l.slice(0, 120)}`));
  }

  // ── Report PASS ─────────────────────────────────────────────────────────
  const summary = `auto-e2e-loop PASS — script='${script.split('\n')[0].slice(0, 50)}...', ${scenes.length} scenes, duration=${duration}s, size=${stat.size}, finalUrl=${finResult.finalUrl}`;
  log('DONE', summary);
  say('done', summary);
}

run().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  log('FAIL', msg);
  say('blocked', `auto-e2e-loop FAIL — ${msg.slice(0, 200)}`);
  process.exit(1);
});
