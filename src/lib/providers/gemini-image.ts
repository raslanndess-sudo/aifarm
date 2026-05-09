import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export type GeminiImageModel =
  | 'gemini-2.5-flash-image-preview'
  | 'gemini-2.5-flash-image'
  | 'imagen-3.0-fast-generate-001'
  | 'imagen-3.0-generate-002';

export interface GeminiImageOpts {
  prompt: string;
  model: GeminiImageModel;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  numberOfImages?: 1 | 2 | 3 | 4;
  characterRefImageUrl?: string;
  outDir: string;
}

export interface GeminiImageResult {
  imageUrls: string[];
  cost: number;
}

const COST_MAP: Record<GeminiImageModel, number> = {
  'gemini-2.5-flash-image-preview': 0.039,
  'gemini-2.5-flash-image': 0.039,
  'imagen-3.0-fast-generate-001': 0.02,
  'imagen-3.0-generate-002': 0.04,
};

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function fetchCharRefBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    let buf: Buffer;
    let mime = 'image/png';
    if (url.startsWith('http')) {
      const res = await fetch(url);
      if (!res.ok) return null;
      mime = res.headers.get('content-type') || 'image/png';
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      // local public path
      const { readFileSync } = require('fs') as typeof import('fs');
      const localPath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
      buf = readFileSync(localPath);
      if (url.endsWith('.jpg') || url.endsWith('.jpeg')) mime = 'image/jpeg';
      else if (url.endsWith('.webp')) mime = 'image/webp';
    }
    return { data: buf.toString('base64'), mimeType: mime };
  } catch {
    return null;
  }
}

async function generateViaGeminiFlash(
  apiKey: string,
  model: string,
  opts: GeminiImageOpts,
): Promise<Buffer[]> {
  const parts: Array<Record<string, unknown>> = [];

  // Character reference as inline image (Nano Banana supports this natively)
  if (opts.characterRefImageUrl) {
    const ref = await fetchCharRefBase64(opts.characterRefImageUrl);
    if (ref) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
      parts.push({ text: `Use the person/character from the reference image above. ${opts.prompt}` });
    } else {
      parts.push({ text: opts.prompt });
    }
  } else {
    parts.push({ text: opts.prompt });
  }

  // gemini-2.5-flash-image doesn't accept aspectRatio in generationConfig.
  // Steer aspect ratio through prompt phrasing instead.
  const aspectHint = opts.aspectRatio ? ` Render in ${opts.aspectRatio} aspect ratio.` : '';
  if (parts.length > 0 && typeof parts[parts.length - 1].text === 'string') {
    parts[parts.length - 1].text = `${parts[parts.length - 1].text}${aspectHint}`;
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  const url = `${API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 400 && errText.includes('safety')) {
      throw new Error('Gemini safety blocked — try rephrasing the prompt');
    }
    if (resp.status === 404) {
      throw new Error(`Gemini model not found: ${model}`);
    }
    throw new Error(`Gemini API error: HTTP ${resp.status} — ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();

  // Check for safety blocks
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini safety blocked: ${data.promptFeedback.blockReason}`);
  }

  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const images: Buffer[] = [];
  for (const candidate of candidates) {
    const contentParts = candidate.content?.parts ?? [];
    for (const part of contentParts) {
      if (part.inlineData?.data) {
        images.push(Buffer.from(part.inlineData.data, 'base64'));
      }
    }
  }

  if (images.length === 0) {
    throw new Error('Gemini returned no image data in response');
  }

  return images;
}

async function generateViaImagen(
  apiKey: string,
  model: string,
  opts: GeminiImageOpts,
): Promise<Buffer[]> {
  const url = `${API_BASE}/models/${model}:predict?key=${apiKey}`;
  const body = {
    instances: [{ prompt: opts.prompt }],
    parameters: {
      sampleCount: opts.numberOfImages ?? 1,
      ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    if (resp.status === 400 && errText.includes('safety')) {
      throw new Error('Imagen safety blocked — try rephrasing the prompt');
    }
    if (resp.status === 404) {
      throw new Error(`Imagen model not found: ${model}`);
    }
    throw new Error(`Imagen API error: HTTP ${resp.status} — ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const predictions = data.predictions ?? [];
  if (predictions.length === 0) {
    throw new Error('Imagen returned no predictions');
  }

  return predictions
    .filter((p: Record<string, string>) => p.bytesBase64Encoded)
    .map((p: Record<string, string>) => Buffer.from(p.bytesBase64Encoded, 'base64'));
}

export async function generateImageGemini(opts: GeminiImageOpts): Promise<GeminiImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const isImagen = opts.model.startsWith('imagen-');
  let images: Buffer[];

  if (isImagen) {
    // Imagen does not support CREF
    images = await generateViaImagen(apiKey, opts.model, opts);
  } else {
    images = await generateViaGeminiFlash(apiKey, opts.model, opts);
  }

  // Save to outDir
  mkdirSync(opts.outDir, { recursive: true });
  const ext = isImagen ? 'png' : 'png'; // both return PNG
  const imageUrls: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const filename = `img_${i}.${ext}`;
    const filePath = path.join(opts.outDir, filename);
    writeFileSync(filePath, images[i]);
    // Derive public URL from outDir (expected: .../public/generations/img_XXXX/...).
    // Normalize separators so Windows paths work.
    const normalized = opts.outDir.replace(/\\/g, '/');
    const publicIdx = normalized.indexOf('public/generations/');
    if (publicIdx >= 0) {
      const relPath = normalized.slice(publicIdx + 'public'.length); // "/generations/img_XXX"
      imageUrls.push(`${relPath}/${filename}`);
    } else {
      imageUrls.push(filePath);
    }
  }

  const cost = COST_MAP[opts.model] * images.length;
  console.log('[image-gen] gemini', opts.model, 'cost:', cost.toFixed(4), 'images:', images.length);

  return { imageUrls, cost };
}
