// Pricing source: fal.ai live pages, verified May 2026.
// 100 tokens = $1 USD. tokens = round(usd * 100).

export const IMAGE_MODEL_PRICING: Record<string, { tokens: number; usd: number; label: string }> = {
  'leonardo':       { tokens: 4,   usd: 0.04,  label: 'Leonardo' },
  'nano-banana':    { tokens: 4,   usd: 0.039, label: 'Nano Banana' },
  'nano-banana-2':  { tokens: 4,   usd: 0.039, label: 'Nano Banana 2' },
  'imagen-3-fast':  { tokens: 2,   usd: 0.02,  label: 'Imagen 3 Fast' },
  'imagen-3':       { tokens: 4,   usd: 0.04,  label: 'Imagen 3' },
};

// Per-5-second clip prices. duration scaling = durationS / 5 in estimateRunCost.
// Verified against fal.ai live pricing pages (May 2026). Earlier numbers were
// 3-6× inflated; corrected here.
export const VIDEO_MODEL_PRICING: Record<string, { tokens: number; usd: number; label: string; supportsAudio?: boolean; note?: string }> = {
  'kling-direct':              { tokens: 20,  usd: 0.20,  label: 'Kling Direct',           note: 'Direct REST API, your existing balance' },
  'fal-kling-3-0':             { tokens: 42,  usd: 0.42,  label: 'Kling 3.0 Standard',     note: '$0.084/s · cinematic, audio off' },
  'fal-kling-3-0-audio':       { tokens: 63,  usd: 0.63,  label: 'Kling 3.0 + audio',      note: '$0.126/s · with native audio',  supportsAudio: true },
  'fal-kling-2-6-pro':         { tokens: 35,  usd: 0.35,  label: 'Kling 2.6 Pro',          note: '$0.07/s · pro quality, no audio' },
  'fal-kling-2-6-pro-audio':   { tokens: 70,  usd: 0.70,  label: 'Kling 2.6 Pro + audio',  note: '$0.14/s · with native audio',    supportsAudio: true },
  'fal-kling-2-5-pro':         { tokens: 35,  usd: 0.35,  label: 'Kling 2.5 Turbo Pro',    note: '$0.07/s · fast, balanced' },
  'fal-luma-ray-2':            { tokens: 50,  usd: 0.50,  label: 'Luma Ray-2',             note: '$0.10/s · photoreal physics, 540p' },
  'fal-minimax-hailuo':        { tokens: 9,   usd: 0.085, label: 'Hailuo 02 Fast',         note: '$0.017/s · cheapest, 512P stylized' },
};

export function estimateRunCost(
  imageProvider: string,
  videoProvider: string,
  sceneCount: number,
  durationS: number = 5,
): { tokens: number; usd: number } {
  const img = IMAGE_MODEL_PRICING[imageProvider] ?? { tokens: 4, usd: 0.04 };
  const vid = VIDEO_MODEL_PRICING[videoProvider] ?? { tokens: 35, usd: 0.35 };
  const durationMultiplier = durationS / 5;
  const totalTokens = (img.tokens + vid.tokens * durationMultiplier) * sceneCount;
  const totalUsd = (img.usd + vid.usd * durationMultiplier) * sceneCount;
  return { tokens: Math.round(totalTokens), usd: Math.round(totalUsd * 100) / 100 };
}

export function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}
