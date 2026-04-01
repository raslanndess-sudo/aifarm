import { NextRequest, NextResponse } from 'next/server';

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { characterDescription, style = 'anime', name = 'Character' } = body;

    const apiKey = process.env.LEONARDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LEONARDO_API_KEY not configured' }, { status: 500 });
    }

    if (!characterDescription) {
      return NextResponse.json({ error: 'characterDescription is required' }, { status: 400 });
    }

    // Select model based on style
    const modelMap: Record<string, string> = {
      anime: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      cyberpunk: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      seinen: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      ghibli: process.env.LEONARDO_MODEL_PHOENIX || 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3',
      mecha: process.env.LEONARDO_MODEL_ANIME || 'e71a1c2f-4f80-4800-934f-2c68979d8cc8',
      realistic: process.env.LEONARDO_MODEL_FLUX || 'b2614463-296c-462a-9586-aafdb8f00e36',
    };

    const modelId = modelMap[style] || modelMap.anime;

    // Build prompt
    const fullPrompt = `Character reference sheet, front-facing portrait, neutral pose, clean background. ${characterDescription}. Style: ${style} anime, masterpiece, best quality, highly detailed`;

    // Step 1: Create generation
    const genResponse = await fetch(`${LEONARDO_API}/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: 'blurry, low quality, multiple characters, text, watermark, deformed face, extra limbs',
        modelId,
        width: 1024,
        height: 1024,
        num_images: 1,
      }),
    });

    if (!genResponse.ok) {
      const err = await genResponse.text();
      return NextResponse.json({ error: `Leonardo API error: ${err}` }, { status: genResponse.status });
    }

    const genResult = await genResponse.json();
    const generationId = genResult.sdGenerationJob?.generationId;

    if (!generationId) {
      return NextResponse.json({ error: 'No generationId returned' }, { status: 500 });
    }

    // Step 2: Poll for completion (max 60s)
    let imageUrl = null;
    let imageId = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000)); // wait 5s

      const statusResponse = await fetch(`${LEONARDO_API}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const statusResult = await statusResponse.json();
      const gen = statusResult.generations_by_pk;

      if (gen?.status === 'COMPLETE' && gen?.generated_images?.length > 0) {
        imageUrl = gen.generated_images[0].url;
        imageId = gen.generated_images[0].id;
        break;
      } else if (gen?.status === 'FAILED') {
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
      }
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'Generation timed out (60s)' }, { status: 504 });
    }

    return NextResponse.json({
      success: true,
      generationId,
      imageId,
      imageUrl,
      model: modelId,
      cost: genResult.sdGenerationJob?.cost,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
