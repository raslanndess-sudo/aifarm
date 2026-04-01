import { NextRequest, NextResponse } from 'next/server';

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1';

const ANGLE_PROMPTS = [
  'front-facing portrait, looking directly at camera',
  'three-quarter view from left, slight turn',
  'three-quarter view from right, slight turn',
  'profile view from left side, side face',
  'profile view from right side, side face',
  'looking up, low angle shot, chin visible',
  'looking down, high angle shot, top of head visible',
  'back view showing hair and shoulders from behind',
  'dynamic action pose, running or fighting stance',
  'close-up face shot, extreme detail on eyes and expression',
];

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterDescription, style = 'anime', sourceImageUrl } = body;

    const apiKey = process.env.LEONARDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LEONARDO_API_KEY not configured' }, { status: 500 });
    }

    if (!characterDescription) {
      return NextResponse.json({ error: 'characterDescription is required' }, { status: 400 });
    }

    const modelMap: Record<string, string> = {
      anime: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      cyberpunk: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      seinen: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      ghibli: process.env.LEONARDO_MODEL_PHOENIX || 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',
      mecha: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
    };
    const modelId = modelMap[style] || modelMap.anime;

    // If we have a source image, upload it first for init_image reference
    let initImageId: string | null = null;
    if (sourceImageUrl) {
      // Upload the source image to Leonardo
      const uploadRes = await fetch(`${LEONARDO_API}/init-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sourceImageUrl }),
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        initImageId = uploadData?.uploadInitImage?.id || null;
      }
    }

    // Generate all 10 angles sequentially (Leonardo rate limit)
    const results: Array<{ angle: string; imageUrl: string | null; imageId: string | null; status: string }> = [];

    for (let i = 0; i < ANGLE_PROMPTS.length; i++) {
      const anglePrompt = ANGLE_PROMPTS[i];
      const fullPrompt = `${characterDescription}, ${anglePrompt}. Same character, consistent face and outfit. Style: ${style} anime, masterpiece, best quality, highly detailed`;

      const genBody: Record<string, unknown> = {
        prompt: fullPrompt,
        negative_prompt: 'blurry, low quality, multiple characters, text, watermark, deformed face, extra limbs, different character, inconsistent',
        modelId,
        width: 1024,
        height: 1024,
        num_images: 1,
        guidance_scale: 8,
      };

      // Use init image for better consistency
      if (initImageId) {
        genBody.init_image_id = initImageId;
        genBody.init_strength = 0.35; // Low strength = keep face, change pose
      }

      const genRes = await fetch(`${LEONARDO_API}/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });

      if (!genRes.ok) {
        results.push({ angle: anglePrompt, imageUrl: null, imageId: null, status: 'failed' });
        continue;
      }

      const genData = await genRes.json();
      const generationId = genData.sdGenerationJob?.generationId;

      if (!generationId) {
        results.push({ angle: anglePrompt, imageUrl: null, imageId: null, status: 'no_id' });
        continue;
      }

      // Wait for this one to complete before starting next
      const result = await waitForGeneration(generationId, apiKey);
      if (result) {
        results.push({ angle: anglePrompt, imageUrl: result.imageUrl, imageId: result.imageId, status: 'complete' });
      } else {
        results.push({ angle: anglePrompt, imageUrl: null, imageId: null, status: 'timeout' });
      }
    }

    const successful = results.filter(r => r.status === 'complete');

    return NextResponse.json({
      success: true,
      total: ANGLE_PROMPTS.length,
      completed: successful.length,
      images: results,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
