/**
 * Auto E2E Stability Loop
 *
 * Wraps the same pipeline as auto-e2e-loop.ts but runs it repeatedly until
 * 5 consecutive PASS runs are achieved (or 30 max attempts).
 *
 * Run:
 *   SCENE_COUNT=2 npx tsx scripts/auto-e2e-stable.ts
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Node 22 global fetch is used; long timeouts handled via AbortSignal per-request where needed.

// ── Config ───────────────────────────────────────────────────────────────────
const TARGET_CONSECUTIVE = 5;
const MAX_RUNS = 30;
const SCENE_COUNT = (() => {
  const n = parseInt(process.env.SCENE_COUNT ?? '2', 10);
  return Math.max(1, Math.min(10, isNaN(n) ? 2 : n));
})();
const STYLE = 'anime';
const ASPECT = '16:9';

const SAFE_PROMPTS = [
  'Programmer at monitor in cozy room with neon ambient light. Light snow outside the window.',
  'Young blogger girl in Tokyo neon district, walking under cyberpunk billboards.',
  'Old fisherman on rocky shore at sunset, mending nets with wrinkled hands.',
  'Little girl with cloudy whale floating beside her, Ghibli style, magical.',
  'Robot wandering in post-apocalyptic desert, rusted and battered.',
  'Black cat in magical library, books floating around, candlelight.',
];

const randomPrompt = () => SAFE_PROMPTS[Math.floor(Math.random() * SAFE_PROMPTS.length)];

// ── Networking ───────────────────────────────────────────────────────────────
const WIN_HOST = (() => {
  if (process.env.BASE_HOST) return process.env.BASE_HOST;
  try {
    const out = require('child_process').execSync('ip route show default', { encoding: 'utf8' });
    const m = String(out).match(/default via (\S+)/);
    if (m) return m[1];
  } catch { /* not WSL */ }
  return 'localhost';
})();
const BASE = `http://${WIN_HOST}:3000`;
const SAY = path.join(process.cwd(), '.claude', 'agents', 'say.sh');
const LOG_PATH = path.join(process.cwd(), 'data', 'auto-e2e-stable.log');

// ── Helpers ──────────────────────────────────────────────────────────────────
function ts() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function log(tag: string, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [${tag}] ${msg}`);
}

function appendLog(line: string) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, line + '\n');
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const signal = AbortSignal.timeout(20 * 60_000); // 20 min — covers long finalize
  const opts: RequestInit = { method: body ? 'POST' : 'GET', headers, redirect: 'manual', signal };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`API ${endpoint} redirected (auth expired?): ${res.headers.get('location')}`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(`API ${endpoint} HTTP ${res.status}: ${JSON.stringify(json)}`);
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
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const sessionMatch = setCookie.join('; ').match(/session=([^;]+)/);
  if (!sessionMatch) throw new Error('No session cookie in login response');
  sessionCookie = `session=${sessionMatch[1]}`;
  log('AUTH', 'logged in');
}

// ── Single E2E run ───────────────────────────────────────────────────────────
async function singleRun(prompt: string): Promise<{ pass: boolean; error?: string; duration: number; finalUrl?: string; fileSize?: number; videoDuration?: number }> {
  const t0 = Date.now();
  try {
    // Build a 2-line script from the prompt (one line per scene)
    const lines = Array.from({ length: SCENE_COUNT }, () => prompt);
    const script = lines.join('\n');

    await login();

    // Step 1: Plan scenes
    log('S1', `plan-ai (${SCENE_COUNT} scenes)`);
    const planResult = await api('/api/scenes/plan-ai', { script, sceneCount: SCENE_COUNT, style: STYLE });
    const scenes: Array<{ image_prompt: string; animation_prompt: string; description: string }> = planResult.scenes;
    if (!scenes || scenes.length < SCENE_COUNT) {
      throw new Error(`Expected ${SCENE_COUNT} scenes, got ${scenes?.length ?? 0}`);
    }

    // Step 2: Generate images
    const imageUrls: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const prefix = ASPECT === '16:9' ? '16:9 widescreen cinematic video frame, ' : '9:16 vertical video frame, portrait orientation, ';
      log('S2', `image scene ${i + 1}/${scenes.length}`);
      const imgResult = await api('/api/cref/generate-scene', {
        scenePrompt: prefix + scenes[i].image_prompt,
        style: STYLE,
        aspectRatio: ASPECT,
      });
      if (!imgResult.imageUrl) throw new Error(`Scene ${i + 1} image gen failed: ${JSON.stringify(imgResult)}`);
      imageUrls.push(imgResult.imageUrl);
    }

    // Step 3: Submit videos
    const submittedJobs: Array<{ jobId: string; submitTime: number }> = [];
    for (let i = 0; i < scenes.length; i++) {
      log('S3', `video scene ${i + 1}/${scenes.length}`);
      const vidResult = await api('/api/kling/generate-video', {
        imageUrl: imageUrls[i],
        animationPrompt: scenes[i].animation_prompt,
        modelName: 'kling-v1',
        duration: '5',
        mode: 'std',
        submitOnly: true,
      });
      if (!vidResult.taskId || !vidResult.submitTime) throw new Error(`Scene ${i + 1} video submit failed`);
      submittedJobs.push({ jobId: vidResult.taskId, submitTime: vidResult.submitTime });
    }

    // Step 3.5: Generate voiceover (Claude narration → TTS)
    log('S3.5', 'generating voiceover');
    let voiceUrl: string | undefined;
    try {
      const voiceRes = await api('/api/scenario/voiceover', {
        scenes: scenes.map(s => ({
          description: s.description,
          image_prompt: s.image_prompt,
          animation_prompt: s.animation_prompt,
        })),
        totalDurationS: scenes.length * 5,
        voice: 'mark',
        provider: 'api',
      });
      if (!voiceRes.success) {
        log('S3.5', `voiceover returned success=false: ${JSON.stringify(voiceRes).slice(0, 200)}`);
      } else {
        voiceUrl = voiceRes.voiceUrl;
        log('S3.5', voiceUrl ? `voiceUrl: ${voiceUrl}` : `no voiceUrl in response: ${JSON.stringify(voiceRes).slice(0, 200)}`);
      }
    } catch (err) {
      log('S3.5', `voiceover ERR (continuing without audio): ${err instanceof Error ? err.message : err}`);
    }

    // Step 4: Finalize (collect + merge + voice overlay)
    log('S4', `finalize ${submittedJobs.length} jobs${voiceUrl ? ' + voice' : ' (no voice!)'}`);
    const finResult = await api('/api/scenario/finalize', { submittedJobs, voiceUrl });
    if (!finResult.finalUrl) throw new Error(`Finalize failed: ${JSON.stringify(finResult)}`);

    // ── Validation ──
    const localPath = path.join(process.cwd(), 'public', finResult.finalUrl.replace(/^\//, ''));

    // V1: file exists
    if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);

    // V2: HTTP accessible
    const headRes = await fetch(`${BASE}${finResult.finalUrl}`, { method: 'HEAD' });
    if (!headRes.ok) throw new Error(`HEAD ${finResult.finalUrl} → ${headRes.status}`);

    // V3: ffprobe duration
    const probe = execSync(`ffprobe -v quiet -show_format -of json "${localPath}"`).toString();
    const videoDuration = parseFloat(JSON.parse(probe).format.duration);
    const expectedMin = SCENE_COUNT * 5 - 2;
    const expectedMax = SCENE_COUNT * 5 + 2;
    if (videoDuration < expectedMin || videoDuration > expectedMax) {
      throw new Error(`Duration ${videoDuration.toFixed(1)}s outside [${expectedMin}-${expectedMax}]`);
    }

    // V4: audio track
    const streamsProbe = execSync(`ffprobe -v quiet -show_streams -of json "${localPath}"`).toString();
    const streams = JSON.parse(streamsProbe).streams as Array<{ codec_type: string }>;
    const hasAudio = streams.some(s => s.codec_type === 'audio');
    const hasVideo = streams.some(s => s.codec_type === 'video');
    if (!hasVideo) throw new Error('No video stream in final.mp4');
    if (!hasAudio) throw new Error('No audio track in final.mp4 — voiceover not merged');

    // V5: file size sanity
    const fileSize = fs.statSync(localPath).size;
    if (fileSize < 500_000) throw new Error(`final.mp4 too small: ${fileSize} bytes`);

    log('VAL', `PASS duration=${videoDuration.toFixed(1)}s size=${fileSize} audio=yes`);
    return { pass: true, duration: (Date.now() - t0) / 1000, finalUrl: finResult.finalUrl, fileSize, videoDuration };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pass: false, error: msg, duration: (Date.now() - t0) / 1000 };
  }
}

// ── Cleanup between runs ─────────────────────────────────────────────────────
function cleanup() {
  const outputDir = path.join(process.cwd(), 'output');
  const scenesDir = path.join(process.cwd(), 'data', 'scenes');
  for (const dir of [outputDir, scenesDir]) {
    if (fs.existsSync(dir)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  const globalStart = Date.now();
  let consecutiveSuccess = 0;
  let totalPass = 0;
  let totalFail = 0;
  const errors: string[] = [];

  log('INIT', `stability loop: target=${TARGET_CONSECUTIVE} consecutive, max=${MAX_RUNS}, scenes=${SCENE_COUNT}`);
  appendLog(`${ts()} · INIT · target=${TARGET_CONSECUTIVE} consecutive, max=${MAX_RUNS}, scenes=${SCENE_COUNT}`);

  for (let run = 1; run <= MAX_RUNS; run++) {
    const prompt = randomPrompt();
    log('RUN', `--- run ${run}/${MAX_RUNS} --- prompt: "${prompt.slice(0, 60)}..."`);

    cleanup();

    const result = await singleRun(prompt);
    const runDur = result.duration.toFixed(0);

    if (result.pass) {
      consecutiveSuccess++;
      totalPass++;
      const msg = `Run ${run}/${MAX_RUNS}: PASS (${runDur}s) consecutive=${consecutiveSuccess}/${TARGET_CONSECUTIVE}`;
      log('RUN', msg);
      say('status', msg);
      appendLog(`${ts()} · run ${run} · PASS · ${prompt.slice(0, 50)} · ${runDur}s · consecutive=${consecutiveSuccess}`);

      if (consecutiveSuccess >= TARGET_CONSECUTIVE) {
        const totalDur = ((Date.now() - globalStart) / 60_000).toFixed(1);
        const finalMsg = `5/5 PASS reached at run ${run}, total=${totalPass}P/${totalFail}F, duration=${totalDur}min`;
        log('DONE', finalMsg);
        say('done', finalMsg);
        appendLog(`${ts()} · DONE · ${finalMsg}`);
        process.exit(0);
      }
    } else {
      consecutiveSuccess = 0;
      totalFail++;
      errors.push(`run${run}: ${result.error}`);
      const msg = `Run ${run}/${MAX_RUNS}: FAIL (${runDur}s) — ${result.error?.slice(0, 150)}`;
      log('RUN', msg);
      say('status', msg);
      appendLog(`${ts()} · run ${run} · FAIL · ${prompt.slice(0, 50)} · ${runDur}s · ${result.error?.slice(0, 200)}`);
    }
  }

  // Max runs exhausted
  const totalDur = ((Date.now() - globalStart) / 60_000).toFixed(1);
  const topErrors = errors.slice(-5).join(' | ');
  const failMsg = `failed: max ${MAX_RUNS} runs, ${totalPass}P/${totalFail}F, best consecutive=${consecutiveSuccess}, top errors: ${topErrors.slice(0, 200)}`;
  log('FAIL', failMsg);
  say('done', failMsg);
  appendLog(`${ts()} · FAIL · ${failMsg}`);
  process.exit(1);
}

main().catch(err => {
  log('FATAL', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
