import { NextRequest, NextResponse } from 'next/server';

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style = 'anime' } = body;

    const apiKey = process.env.LEONARDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LEONARDO_API_KEY not configured' }, { status: 500 });
    }

    const modelMap: Record<string, string> = {
      anime: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      cyberpunk: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      seinen: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      ghibli: process.env.LEONARDO_MODEL_PHOENIX || 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',
      mecha: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
    };
    const modelId = modelMap[style] || modelMap.anime;

    // No init_image — pure text prompt for different angles
    // This gives Leonardo freedom to change pose/angle instead of copying the original
    const genRes = await fetch(`${LEONARDO_API}/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'blurry, low quality, multiple characters, text, watermark, deformed face, extra limbs, same pose repeated, front view only',
        modelId,
        width: 1024,
        height: 1024,
        num_images: 1,
        guidance_scale: 9,
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return NextResponse.json({ error: err }, { status: genRes.status });
    }

    const genData = await genRes.json();
    const generationId = genData.sdGenerationJob?.generationId;

    // Poll for completion
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`${LEONARDO_API}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const gen = statusData.generations_by_pk;
      if (gen?.status === 'COMPLETE' && gen?.generated_images?.length > 0) {
        return NextResponse.json({
          success: true,
          generationId,
          imageUrl: gen.generated_images[0].url,
          imageId: gen.generated_images[0].id,
        });
      }
      if (gen?.status === 'FAILED') {
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Timeout' }, { status: 504 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
