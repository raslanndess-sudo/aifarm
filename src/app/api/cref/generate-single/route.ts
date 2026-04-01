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

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const modelMap: Record<string, string> = {
      anime:     process.env.LEONARDO_MODEL_ANIME   || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      cyberpunk: process.env.LEONARDO_MODEL_ANIME   || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      seinen:    process.env.LEONARDO_MODEL_ANIME   || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      ghibli:    process.env.LEONARDO_MODEL_PHOENIX || 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',
      mecha:     process.env.LEONARDO_MODEL_ANIME   || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      realistic: process.env.LEONARDO_MODEL_FLUX    || 'b2614463-296c-462a-9586-aafdb8f00e36',
    };
    const modelId = modelMap[style] || modelMap.anime;

    const fullPrompt = `${prompt}. Style: ${style} anime, masterpiece, best quality, highly detailed`;

    const genRes = await fetch(`${LEONARDO_API}/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: 'blurry, low quality, text, watermark, deformed, extra limbs',
        modelId,
        width: 1344,
        height: 768,
        num_images: 1,
        guidance_scale: 7,
      }),
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

    // Poll for completion (max 60s)
    let imageUrl: string | null = null;
    let imageId: string | null = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`${LEONARDO_API}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const gen = statusData.generations_by_pk;
      if (gen?.status === 'COMPLETE' && gen?.generated_images?.length > 0) {
        imageUrl = gen.generated_images[0].url;
        imageId = gen.generated_images[0].id;
        break;
      } else if (gen?.status === 'FAILED') {
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
      }
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'Generation timed out' }, { status: 504 });
    }

    return NextResponse.json({
      success: true,
      generationId,
      imageId,
      imageUrl,
      model: modelId,
      cost: genData.sdGenerationJob?.cost,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
