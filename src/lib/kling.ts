/**
 * Kling AI API client
 * Docs: https://api.klingai.com/v1
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const KLING_API = 'https://api.klingai.com/v1';

/**
 * Kling expects either a public URL or **pure** base64 (no data: prefix).
 * Convert local /generations/... paths and localhost URLs to base64.
 * Public https URLs pass through unchanged.
 */
async function toKlingImageInput(input: string): Promise<string> {
  // data:image/...;base64,... → strip prefix
  if (input.startsWith('data:')) {
    const m = input.match(/^data:.+;base64,(.+)$/);
    if (m) return m[1];
    return input;
  }
  // public https/http (non-localhost) — pass through
  const isLocalhost = /^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(input);
  if ((input.startsWith('https://') || input.startsWith('http://')) && !isLocalhost) {
    return input;
  }
  // Local public path or localhost URL — read file, base64-encode
  let absPath = input;
  const localhostMatch = input.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
  if (localhostMatch) absPath = localhostMatch[1];
  if (absPath.startsWith('/')) {
    absPath = path.join(process.cwd(), 'public', absPath.replace(/^\//, ''));
  }
  if (!existsSync(absPath)) throw new Error(`Kling image not found: ${absPath}`);
  return readFileSync(absPath).toString('base64');
}

/** Generate JWT token for Kling AI API (HS256) */
async function generateKlingToken(): Promise<string> {
  const accessKey = process.env.KLING_ACCESS_KEY!;
  const secretKey = process.env.KLING_SECRET_KEY!;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 min
    nbf: now - 5,
  };

  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64url');

  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Use Web Crypto (available in Next.js edge/node)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = Buffer.from(signature).toString('base64url');

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

async function klingFetch(path: string, options: RequestInit = {}) {
  const token = await generateKlingToken();
  return fetch(`${KLING_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export interface KlingVideoTask {
  task_id: string;
  task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
  task_status_msg?: string;
  task_result?: {
    videos?: Array<{ id: string; url: string; duration: string }>;
  };
}

/**
 * Submit image-to-video task
 * @param imageUrl - URL of the generated image
 * @param animationPrompt - Motion description for the video
 * @param modelName - 'kling-v1' | 'kling-v1-5' | 'kling-v2'
 * @param duration - '5' | '10'
 * @param mode - 'std' | 'pro'
 */
export async function submitKlingImageToVideo(params: {
  imageUrl: string;
  tailImage?: string;
  animationPrompt?: string;
  modelName?: string;
  duration?: '5' | '10';
  mode?: 'std' | 'pro';
}): Promise<string> {
  const {
    imageUrl,
    tailImage,
    animationPrompt = '',
    modelName = 'kling-v1',
    duration = '5',
    mode = 'std',
  } = params;

  // Kling accepts either a public URL or pure base64 (NOT data URI). Local /generations/...
  // paths or localhost URLs must be encoded to base64 before submit.
  const body: Record<string, unknown> = {
    model_name: modelName,
    mode,
    duration,
    prompt: animationPrompt,
    cfg_scale: 0.5,
  };
  body.image = await toKlingImageInput(imageUrl);
  if (tailImage) {
    body.tail_image = await toKlingImageInput(tailImage);
  }

  const res = await klingFetch('/videos/image2video', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log('[Kling] image2video response:', res.status, rawText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Kling API ${res.status}: ${rawText}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Kling non-JSON response: ${rawText.slice(0, 200)}`);
  }

  // Kling error codes: code 0 = success
  if (data.code !== 0) {
    throw new Error(`Kling error code ${data.code}: ${data.message}`);
  }

  const taskId: string = (data?.data as Record<string, unknown>)?.task_id as string;
  if (!taskId) throw new Error(`No task_id in Kling response: ${rawText.slice(0, 200)}`);
  return taskId;
}

/**
 * Poll task status until done or timeout
 * @returns video URL or null on timeout
 */
export async function pollKlingTask(taskId: string, maxWaitMs = 300_000): Promise<string | null> {
  const start = Date.now();
  const interval = 5000;

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, interval));

    const res = await klingFetch(`/videos/image2video/${taskId}`);
    if (!res.ok) continue;

    const data = await res.json();
    const task: KlingVideoTask = data?.data;
    if (!task) continue;

    if (task.task_status === 'succeed') {
      return task.task_result?.videos?.[0]?.url ?? null;
    }
    if (task.task_status === 'failed') {
      throw new Error(`Kling task failed: ${task.task_status_msg ?? 'unknown'}`);
    }
  }

  return null; // timeout
}

export { klingFetch };
