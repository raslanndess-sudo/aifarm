/**
 * Kling AI API client
 * Docs: https://api.klingai.com/v1
 */

const KLING_API = 'https://api.klingai.com/v1';

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
  animationPrompt?: string;
  modelName?: string;
  duration?: '5' | '10';
  mode?: 'std' | 'pro';
}): Promise<string> {
  const {
    imageUrl,
    animationPrompt = '',
    modelName = 'kling-v1',
    duration = '5',
    mode = 'std',
  } = params;

  // Kling accepts either a URL or base64 data URI
  const isBase64 = imageUrl.startsWith('data:');
  const body: Record<string, unknown> = {
    model_name: modelName,
    mode,
    duration,
    prompt: animationPrompt,
    cfg_scale: 0.5,
  };
  if (isBase64) {
    body.image = imageUrl; // data:image/jpeg;base64,...
  } else {
    body.image = imageUrl;
  }

  const res = await klingFetch('/videos/image2video', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling API error: ${err}`);
  }

  const data = await res.json();
  // Response: { code, message, request_id, data: { task_id, task_status, ... } }
  const taskId: string = data?.data?.task_id;
  if (!taskId) throw new Error('No task_id returned from Kling');
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
