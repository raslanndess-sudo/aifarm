import { fal } from '@fal-ai/client';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';

// Verified slugs/prices from fal.ai live pricing pages, May 2026.
export type FalVideoProvider =
  | 'fal-kling-3-0'
  | 'fal-kling-3-0-audio'
  | 'fal-kling-2-6-pro'
  | 'fal-kling-2-6-pro-audio'
  | 'fal-kling-2-5-pro'
  | 'fal-luma-ray-2'
  | 'fal-minimax-hailuo';

interface FalModelEntry {
  slug: string;
  pricePerSec: number;
  audio: boolean;
  /** Map UI duration ('5' / '10') to model-specific value */
  durationMap: Record<string, string>;
}

export const FAL_MODEL_MAP: Record<FalVideoProvider, FalModelEntry> = {
  'fal-kling-3-0':           { slug: 'fal-ai/kling-video/v3/standard/image-to-video',     pricePerSec: 0.084, audio: false, durationMap: { '5': '5', '10': '10' } },
  'fal-kling-3-0-audio':     { slug: 'fal-ai/kling-video/v3/standard/image-to-video',     pricePerSec: 0.126, audio: true,  durationMap: { '5': '5', '10': '10' } },
  'fal-kling-2-6-pro':       { slug: 'fal-ai/kling-video/v2.6/pro/image-to-video',        pricePerSec: 0.07,  audio: false, durationMap: { '5': '5', '10': '10' } },
  'fal-kling-2-6-pro-audio': { slug: 'fal-ai/kling-video/v2.6/pro/image-to-video',        pricePerSec: 0.14,  audio: true,  durationMap: { '5': '5', '10': '10' } },
  'fal-kling-2-5-pro':       { slug: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',  pricePerSec: 0.07,  audio: false, durationMap: { '5': '5', '10': '10' } },
  'fal-luma-ray-2':          { slug: 'fal-ai/luma-dream-machine/ray-2/image-to-video',    pricePerSec: 0.10,  audio: false, durationMap: { '5': '5', '10': '9' } },
  'fal-minimax-hailuo':      { slug: 'fal-ai/minimax/hailuo-02-fast/image-to-video',      pricePerSec: 0.017, audio: false, durationMap: { '5': '6', '10': '10' } },
};

export type FalVideoModel = string; // any slug

function ensureConfig() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY not set');
  fal.config({ credentials: key });
}

export interface FalVideoOpts {
  provider: FalVideoProvider;
  imageUrl: string;
  prompt: string;
  duration?: '5' | '10';
  endImageUrl?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  outDir: string;
}

export interface FalVideoResult {
  jobId: string;
  status: 'submitted' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  localPath?: string;
  cost: number;
}

function calcCost(provider: FalVideoProvider, durationS: number): number {
  const entry = FAL_MODEL_MAP[provider];
  if (!entry) return 0;
  return entry.pricePerSec * durationS;
}

/**
 * Convert any image source (local public path / localhost URL / data URI / public URL) into a
 * URL fal.ai can fetch. Local paths and localhost URLs are uploaded to fal.storage; public
 * URLs are returned as-is.
 */
export async function ensureFalReachableUrl(input: string): Promise<string> {
  ensureConfig();

  // Already public, hosted somewhere fal can reach
  if (input.startsWith('https://') || input.startsWith('http://') && !input.includes('localhost') && !input.includes('127.0.0.1')) {
    return input;
  }

  // Strip localhost/origin prefix if present, leaving "/generations/..."
  let localPath = input;
  const localhostMatch = input.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
  if (localhostMatch) localPath = localhostMatch[1];

  if (localPath.startsWith('/')) {
    const absPath = path.join(process.cwd(), 'public', localPath.replace(/^\//, ''));
    if (!existsSync(absPath)) throw new Error(`fal upload: file not found ${absPath}`);
    const buf = readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    const file = new File([new Uint8Array(buf)], path.basename(absPath), { type: mime });
    const uploadedUrl = await fal.storage.upload(file);
    console.log('[fal-storage] uploaded', absPath, '→', uploadedUrl);
    return uploadedUrl;
  }

  if (input.startsWith('data:')) {
    const matched = input.match(/^data:(.+);base64,(.+)$/);
    if (!matched) throw new Error('invalid data URI');
    const buf = Buffer.from(matched[2], 'base64');
    const file = new File([new Uint8Array(buf)], 'inline.png', { type: matched[1] });
    const uploadedUrl = await fal.storage.upload(file);
    console.log('[fal-storage] uploaded data URI →', uploadedUrl);
    return uploadedUrl;
  }

  return input;
}

export async function submitFalVideo(opts: FalVideoOpts): Promise<{ jobId: string; cost: number; slug: string }> {
  ensureConfig();

  const entry = FAL_MODEL_MAP[opts.provider];
  if (!entry) throw new Error(`Unknown fal provider: ${opts.provider}`);

  const requestedDuration = opts.duration ?? '5';
  const mappedDuration = entry.durationMap[requestedDuration] ?? requestedDuration;
  const durationS = parseInt(mappedDuration, 10);

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    image_url: opts.imageUrl,
    duration: mappedDuration,
  };
  if (opts.endImageUrl) {
    input.tail_image_url = opts.endImageUrl;
  }
  // Audio toggle for Kling 3.0 / 2.6 Pro
  if (entry.audio) {
    input.audio = true;
  }
  // Aspect ratio — Kling/Hailuo/Luma all accept this. Override input image aspect.
  if (opts.aspectRatio) {
    input.aspect_ratio = opts.aspectRatio;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request_id } = await fal.queue.submit(entry.slug, { input } as any);

  const cost = calcCost(opts.provider, durationS);

  console.log('[video-gen] fal submit', opts.provider, 'slug:', entry.slug, 'jobId:', request_id, 'duration:', durationS, 'cost: $' + cost.toFixed(2));

  return { jobId: request_id, cost, slug: entry.slug };
}

/** fal.ai queue endpoints use base namespace, not the full model slug. */
function falNamespace(fullSlug: string): string {
  return fullSlug.split('/').slice(0, 2).join('/');
}

/** SDK has quirks with deeply-nested slugs. Use direct REST against queue.fal.run. */
async function falQueueGet(ns: string, jobId: string, suffix: '' | '/status'): Promise<unknown> {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY not set');
  const url = `https://queue.fal.run/${ns}/requests/${jobId}${suffix}`;
  const r = await fetch(url, { headers: { Authorization: `Key ${key}` } });
  if (!r.ok) throw new Error(`fal queue ${suffix || 'result'} HTTP ${r.status}`);
  return r.json();
}

export async function getFalVideoStatus(
  provider: FalVideoProvider,
  jobId: string,
): Promise<FalVideoResult> {
  ensureConfig();

  const entry = FAL_MODEL_MAP[provider];
  if (!entry) throw new Error(`Unknown fal provider: ${provider}`);

  const ns = falNamespace(entry.slug);

  const statusResp = (await falQueueGet(ns, jobId, '/status')) as { status: string };
  const queueStatus = statusResp.status;

  if (queueStatus === 'COMPLETED') {
    const result = (await falQueueGet(ns, jobId, '')) as { video?: { url: string } } & Record<string, unknown>;
    const video = result.video;
    return { jobId, status: 'completed', videoUrl: video?.url, cost: 0 };
  }

  if (queueStatus === 'FAILED') {
    return { jobId, status: 'failed', cost: 0 };
  }

  return {
    jobId,
    status: queueStatus === 'IN_PROGRESS' ? 'processing' : 'submitted',
    cost: 0,
  };
}

export async function downloadFalVideo(
  videoUrl: string,
  outDir: string,
): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'clip.mp4');

  const resp = await fetch(videoUrl);
  if (!resp.ok) throw new Error(`Failed to download fal video: HTTP ${resp.status}`);

  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(outPath, buf);

  return outPath;
}
