import { NextRequest, NextResponse } from 'next/server';

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1';

async function waitForGeneration(generationId: string, apiKey: string, maxWaitMs = 60000): Promise<{ imageUrl: string; imageId: string } | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${LEONARDO_API}/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const gen = data.generations_by_pk;
    if (gen?.status === 'COMPLETE' && gen?.generated_images?.length > 0) {
      return { imageUrl: gen.generated_images[0].url, imageId: gen.generated_images[0].id };
    }
    if (gen?.status === 'FAILED') return null;
  }
  return null;
}

async function uploadImageToLeonardo(apiKey: string, imageBase64: string, filename: string): Promise<string | null> {
  // Step 1: Get presigned URL
  const initRes = await fetch(`${LEONARDO_API}/init-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ extension: filename.split('.').pop() || 'png' }),
  });

  if (!initRes.ok) return null;
  const initData = await initRes.json();
  const fields = JSON.parse(initData.uploadInitImage?.fields || '{}');
  const uploadUrl = initData.uploadInitImage?.url;
  const initImageId = initData.uploadInitImage?.id;

  if (!uploadUrl || !initImageId) return null;

  // Step 2: Upload to S3
  const binaryStr = atob(imageBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });

  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, value as string));
  formData.append('file', blob, filename);

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok) return null;

  return initImageId;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { photos, description = '', style = 'anime' } = body;
    // photos is an array of { base64: string, name: string }

    const apiKey = process.env.LEONARDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LEONARDO_API_KEY not configured' }, { status: 500 });
    }

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    // Upload the first photo as init image reference
    const firstPhoto = photos[0];
    const initImageId = await uploadImageToLeonardo(apiKey, firstPhoto.base64, firstPhoto.name || 'ref.png');

    const modelMap: Record<string, string> = {
      anime: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      cyberpunk: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      realistic: process.env.LEONARDO_MODEL_FLUX || 'b2614463-296c-462a-9586-aafdb8f00e36',
      ghibli: process.env.LEONARDO_MODEL_PHOENIX || 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',
    };
    const modelId = modelMap[style] || modelMap.anime;

    // Build prompt that instructs to reproduce the character from the reference photos
    const baseDesc = description || 'character from reference photo';
    const fullPrompt = `Character reference sheet, front-facing portrait, neutral pose, clean background. Reproduce the exact character from the provided reference image: ${baseDesc}. Maintain exact same face, features, colors. Style: ${style}, masterpiece, best quality, highly detailed`;

    const genBody: Record<string, unknown> = {
      prompt: fullPrompt,
      negative_prompt: 'blurry, low quality, multiple characters, text, watermark, deformed face, extra limbs, different character',
      modelId,
      width: 1024,
      height: 1024,
      num_images: 1,
      guidance_scale: 8,
    };

    // Attach init image for visual reference
    if (initImageId) {
      genBody.init_image_id = initImageId;
      genBody.init_strength = 0.45; // Strong enough to keep the look, flexible for style
    }

    const genRes = await fetch(`${LEONARDO_API}/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(genBody),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return NextResponse.json({ error: `Leonardo API error: ${err}` }, { status: genRes.status });
    }

    const genData = await genRes.json();
    const generationId = genData.sdGenerationJob?.generationId;

    if (!generationId) {
      return NextResponse.json({ error: 'No generationId returned' }, { status: 500 });
    }

    const result = await waitForGeneration(generationId, apiKey);

    if (!result) {
      return NextResponse.json({ error: 'Generation timed out or failed' }, { status: 504 });
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      imageId: result.imageId,
      generationId,
      photosUsed: photos.length,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
