import { chromium, type BrowserContext } from 'playwright-core';
import { auditLog } from './browser-helpers';

export type HfStatus = 'idle' | 'running' | 'paused';

interface CapturedMp4 {
  url: string;
  capturedAt: number;
}

interface HfState {
  context: BrowserContext | null;
  status: HfStatus;
  currentOperation: string | null;
  pauseRequested: boolean;
  lastActivityAt: number;
  capturedMp4s: CapturedMp4[];
  mp4ListenerInstalled: boolean;
  mutexQueue: Promise<unknown>;
}

// Use global to survive Next.js dev hot-reloads and share state across route modules.
declare global { var __hfState: HfState | undefined; }
if (!global.__hfState) {
  global.__hfState = {
    context: null,
    status: 'idle',
    currentOperation: null,
    pauseRequested: false,
    lastActivityAt: 0,
    capturedMp4s: [],
    mp4ListenerInstalled: false,
    mutexQueue: Promise.resolve(),
  };
}
const state = global.__hfState;

function captureIfUserMp4(url: string, source: string) {
  // Reject promo/static/preview domains — these are never final user output
  if (/static\.higgsfield\.ai|aux-web-media|placeholder|cdn\.higgsfield\.ai/i.test(url)) return;
  // Accept only final user-output cloudfront/S3 URLs
  const isUserClip =
    /cloudfront\.net\/user_/i.test(url) ||
    /amazonaws\.com\/.+\.mp4/i.test(url);
  if (!isUserClip) return;
  if (state.capturedMp4s.some((m) => m.url === url)) return;
  state.capturedMp4s.push({ url, capturedAt: Date.now() });
  auditLog(`mp4:captured(${source})`, url.slice(0, 140));
}

function installMp4Listener(ctx: BrowserContext) {
  if (state.mp4ListenerInstalled) return;
  ctx.on('response', (resp) => {
    const u = resp.url();
    const status = resp.status();
    if (status >= 400) return;

    // 1. Direct mp4 file response (browser fetched the video file itself)
    if (/\.mp4(\?|$)/i.test(u)) {
      captureIfUserMp4(u, 'direct');
      return;
    }

    // 2. JSON API response — scan body for cloudfront/S3 mp4 URLs
    //    Higgsfield's SPA calls its API to list generations; responses contain output URLs.
    const ct = resp.headers()['content-type'] ?? '';
    if (!ct.includes('application/json')) return;
    // Skip oversized JSON responses to avoid buffering large payloads
    const cl = parseInt(resp.headers()['content-length'] ?? '0', 10);
    if (cl > 512 * 1024) return;

    resp.text().then((body) => {
      // Match any https URL ending in .mp4 (with optional query string) inside the JSON
      const re = /https:\/\/[^"'\s,\]]+\.mp4(?:[^"'\s,\]]*)?/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        captureIfUserMp4(m[0], 'json-api');
      }
    }).catch(() => { /* ignore — body may already be consumed */ });
  });
  state.mp4ListenerInstalled = true;
  auditLog('mp4:listener-installed', 'context-level mp4 capture active (direct + json-api)');
}

export function getCapturedMp4sSince(timestamp: number): string[] {
  return state.capturedMp4s.filter((m) => m.capturedAt >= timestamp).map((m) => m.url);
}

export function getAllCapturedMp4s(): string[] {
  return state.capturedMp4s.map((m) => m.url);
}

export function clearMp4Capture() {
  state.capturedMp4s = [];
}

/**
 * Run an async fn while holding the singleton mutex. All Higgsfield browser ops MUST go through
 * this — concurrent navigate/click/upload on the same page will corrupt state (image+video flow
 * fight over the same singleton page). Submit-only flow is fast (~10s); full image flow is ~1.5min.
 */
export function withMutex<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const next = state.mutexQueue.then(async () => {
    auditLog('mutex:acquire', label);
    const start = Date.now();
    try {
      return await fn();
    } finally {
      auditLog('mutex:release', `${label} (${Math.round((Date.now() - start) / 1000)}s)`);
    }
  });
  // Keep chain alive even if a step rejects — next caller still runs after.
  state.mutexQueue = next.catch(() => undefined);
  return next as Promise<T>;
}

export async function ensureContext(): Promise<BrowserContext> {
  // 1. If context exists and is alive, reuse it
  if (state.context) {
    try {
      const pages = state.context.pages();
      if (pages.length === 0 || !pages.some((p) => p.isClosed())) {
        auditLog('ensureContext:reuse', `${pages.length} pages`);
        installMp4Listener(state.context);
        return state.context;
      }
    } catch {
      auditLog('ensureContext:stale', 'previous context dead, re-creating');
      state.context = null;
      state.mp4ListenerInstalled = false;
    }
  }

  // 2. Try connecting to an already-running Chrome via CDP
  const host = process.env.HIGGSFIELD_CDP_HOST || 'localhost';
  const port = process.env.HIGGSFIELD_CDP_PORT || '9223';
  const cdpUrl = `http://${host}:${port}`;

  auditLog('ensureContext:cdp-attempt', cdpUrl);
  try {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const contexts = browser.contexts();
    if (!contexts.length) {
      throw new Error(`No browser contexts available at ${cdpUrl}`);
    }
    state.context = contexts[0];

    browser.on('disconnected', () => {
      auditLog('ensureContext:disconnected', 'browser disconnected externally');
      state.context = null;
      state.status = 'idle';
      state.currentOperation = null;
      state.mp4ListenerInstalled = false;
    });

    auditLog('ensureContext:connected', `CDP OK, ${state.context.pages().length} pages`);
    installMp4Listener(state.context);
    return state.context;
  } catch (cdpErr) {
    const cdpMsg = cdpErr instanceof Error ? cdpErr.message : String(cdpErr);
    auditLog('ensureContext:cdp-failed', `${cdpMsg} — falling back to launchPersistentContext`);
  }

  // 3. Fallback: launch Chrome with persistent context (standalone mode)
  const userDataDir = process.env.HIGGSFIELD_USER_DATA_DIR || 'E:/Users/rasla/chrome-automation-safe';
  auditLog('ensureContext:launching', `userDataDir=${userDataDir}`);
  try {
    state.context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    state.context.on('close', () => {
      auditLog('ensureContext:closed', 'persistent context closed');
      state.context = null;
      state.status = 'idle';
      state.currentOperation = null;
      state.mp4ListenerInstalled = false;
    });

    auditLog('ensureContext:launched', `${state.context.pages().length} pages`);
    installMp4Listener(state.context);
    return state.context;
  } catch (launchErr) {
    const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
    auditLog('ensureContext:error', msg);
    throw new Error(`ensureContext failed (CDP + launch both failed): ${msg}`);
  }
}

export function getStatus(): HfStatus {
  return state.status;
}

export function getCurrentOperation(): string | null {
  return state.currentOperation;
}

export function setStatus(s: HfStatus, op: string | null = null) {
  state.status = s;
  state.currentOperation = op;
  state.lastActivityAt = Date.now();
}

export function requestPause() {
  state.pauseRequested = true;
  auditLog('pause:requested', `current op: ${state.currentOperation ?? 'none'}`);
}

export function requestResume() {
  state.pauseRequested = false;
  auditLog('resume:requested', `current op: ${state.currentOperation ?? 'none'}`);
}

export function isPauseRequested() {
  return state.pauseRequested;
}

/**
 * Call at the start of each automation step.
 * If pause was requested, block until resumed — but only up to 30 seconds.
 * After that we throw PausedError so the operation aborts cleanly instead of
 * hanging the mutex indefinitely (e.g. when the UI never delivers a resume).
 */
const CHECKPOINT_PAUSE_TIMEOUT_MS = 30_000;

export class PausedError extends Error {
  constructor(stepName: string) {
    super(`Higgsfield operation aborted at checkpoint: ${stepName}`);
    this.name = 'PausedError';
  }
}

export async function checkpointPause(stepName: string): Promise<void> {
  if (!state.pauseRequested) return;
  const prevOp = state.currentOperation;
  setStatus('paused', `paused at: ${stepName}`);
  auditLog('checkpoint:paused', stepName);
  const startedAt = Date.now();
  while (state.pauseRequested) {
    if (Date.now() - startedAt > CHECKPOINT_PAUSE_TIMEOUT_MS) {
      auditLog('checkpoint:timeout', `${stepName} — auto-resume after ${CHECKPOINT_PAUSE_TIMEOUT_MS / 1000}s; throwing PausedError`);
      // Auto-clear the flag so subsequent operations don't immediately re-pause.
      state.pauseRequested = false;
      setStatus('running', prevOp);
      throw new PausedError(stepName);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  auditLog('checkpoint:resumed', stepName);
  setStatus('running', prevOp);
}

export async function shutdown(): Promise<void> {
  auditLog('shutdown', 'shutting down singleton context');
  if (state.context) {
    try {
      await state.context.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      auditLog('shutdown:error', msg);
      throw err;
    }
    state.context = null;
    state.mp4ListenerInstalled = false;
  }
  state.status = 'idle';
  state.currentOperation = null;
}

// Graceful shutdown hooks
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}
