import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { resolveProvider } from '@/lib/providers/resolve-provider';
import { generateImageGemini, type GeminiImageModel } from '@/lib/providers/gemini-image';
import { getDb } from '@/lib/db';

const LEONARDO_API = 'https://cloud.leonardo.ai/api/rest/v1';

type ImageProvider = 'leonardo' | 'nano-banana' | 'nano-banana-2' | 'imagen-3-fast' | 'imagen-3';

const GEMINI_MODEL_MAP: Record<string, GeminiImageModel> = {
  'nano-banana': 'gemini-2.5-flash-image-preview',
  'nano-banana-2': 'gemini-2.5-flash-image',
  'imagen-3-fast': 'imagen-3.0-fast-generate-001',
  'imagen-3': 'imagen-3.0-generate-002',
};

function getDefaultImageProvider(): ImageProvider {
  try {
    const row = getDb().prepare(`SELECT value FROM settings WHERE key = 'image_provider'`).get() as { value: string } | undefined;
    return (row?.value as ImageProvider) ?? 'leonardo';
  } catch {
    return 'leonardo';
  }
}

const STYLE_HINTS: Record<string, string> = {
  anime: 'anime style, vibrant colors, cinematic scene, masterpiece quality',
  cyberpunk: 'cyberpunk neon aesthetic, dark moody atmosphere, cinematic',
  seinen: 'seinen anime, mature style, detailed art, dramatic lighting',
  ghibli: 'Studio Ghibli style, soft watercolor, whimsical, warm lighting',
  mecha: 'mecha anime, giant robots, dynamic action, epic scale',
  realistic: 'photorealistic, highly detailed, cinematic lighting, 8k quality',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      scenePrompt,
      style = 'anime',
      characterRefImageUrl,
      characterDescription,
      characterName,
      aspectRatio = '16:9',
      imageProvider: rawProvider,
    } = body;

    if (!scenePrompt) {
      return NextResponse.json({ error: 'scenePrompt is required' }, { status: 400 });
    }

    const imageProvider: ImageProvider = rawProvider ?? getDefaultImageProvider();

    // --- Gemini branch (Nano Banana / Imagen) ---
    if (imageProvider !== 'leonardo') {
      let geminiModel = GEMINI_MODEL_MAP[imageProvider];
      if (!geminiModel) {
        return NextResponse.json({ error: `unknown imageProvider: ${imageProvider}` }, { status: 400 });
      }

      const charPrefix = characterDescription
        ? `${characterName ? characterName + ', ' : ''}${characterDescription}. `
        : '';
      const styleHint = STYLE_HINTS[style] ?? STYLE_HINTS.anime;
      const fullPrompt = `${charPrefix}${scenePrompt}. ${styleHint}`;

      // Map aspect ratio to Gemini format
      const geminiAR = aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9';

      const outDir = path.join(process.cwd(), 'public', 'generations', `img_${Date.now()}`);

      try {
        const result = await generateImageGemini({
          prompt: fullPrompt,
          model: geminiModel,
          aspectRatio: geminiAR as '1:1' | '16:9' | '9:16',
          numberOfImages: 1,
          characterRefImageUrl,
          outDir,
        });

        if (result.imageUrls.length === 0) {
          return NextResponse.json({ error: 'Gemini returned no images' }, { status: 502 });
        }

        console.log('[image-gen]', imageProvider, 'model:', geminiModel, 'cost:', result.cost.toFixed(4));

        return NextResponse.json({
          success: true,
          imageUrl: result.imageUrls[0],
          model: geminiModel,
          provider: imageProvider,
          cost: result.cost,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // nano-banana-2 fallback to preview if model not found
        if (imageProvider === 'nano-banana-2' && msg.includes('not found')) {
          console.warn('[image-gen] nano-banana-2 not found, falling back to preview');
          geminiModel = 'gemini-2.5-flash-image-preview';
          const fallbackResult = await generateImageGemini({
            prompt: fullPrompt,
            model: geminiModel,
            aspectRatio: geminiAR as '1:1' | '16:9' | '9:16',
            numberOfImages: 1,
            characterRefImageUrl,
            outDir,
          });
          return NextResponse.json({
            success: true,
            imageUrl: fallbackResult.imageUrls[0],
            model: geminiModel,
            provider: 'nano-banana',
            cost: fallbackResult.cost,
            fallback: true,
          });
        }

        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    // --- Higgsfield branch (SeaDream 5 Lite) ---
    const { provider, mode } = await resolveProvider();
    if (mode === 'higgsfield') {
      const hf = provider as any;
      await hf.connect();
      try {
        const charHint = characterDescription
          ? `${characterName ? characterName + ', ' : ''}${characterDescription}. `
          : '';
        const fullPrompt = `${charHint}${scenePrompt}, ${style} style`;
        const images = await hf.generateImage(fullPrompt, { model: 'nano-banana', count: 1 });
        if (!images || images.length === 0) {
          return NextResponse.json({ error: 'SeaDream returned no images' }, { status: 502 });
        }
        return NextResponse.json({ success: true, imageUrl: images[0] });
      } finally {
        await hf.disconnect();
      }
    }

    // --- Leonardo branch (default) ---
    const apiKey = process.env.LEONARDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LEONARDO_API_KEY not configured' }, { status: 500 });
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

    // Build prompt — inject character description for consistency
    const charPrefix = characterDescription
      ? `${characterName ? characterName + ', ' : ''}${characterDescription}. `
      : '';
    const fullPrompt = `${charPrefix}${scenePrompt}. Style: ${style} anime, cinematic scene, masterpiece, best quality, highly detailed`;

    // Upload character ref image for ControlNet (IP-Adapter character consistency)
    let controlnetImageId: string | null = null;
    if (characterRefImageUrl) {
      const uploadRes = await fetch(`${LEONARDO_API}/init-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: characterRefImageUrl }),
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        controlnetImageId = uploadData?.uploadInitImage?.id ?? null;
      }
    }

    // Dimensions by aspect ratio
    const dimensions = aspectRatio === '9:16'
      ? { width: 768, height: 1344 }
      : { width: 1344, height: 768 };

    const genBody: Record<string, unknown> = {
      prompt: fullPrompt,
      negative_prompt: 'blurry, low quality, text, watermark, deformed, extra limbs, low resolution, inconsistent character, different outfit',
      modelId,
      ...dimensions,
      num_images: 1,
      guidance_scale: 8,
    };

    // ControlNet for character reference — keeps face/costume consistent across scenes
    if (controlnetImageId) {
      genBody.controlnets = [
        {
          preprocessorId: 67, // IP-Adapter / Character Reference in Leonardo
          initImageId: controlnetImageId,
          strengthType: 'High',
          influence: 0.75,
        },
      ];
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

    // Poll for completion
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
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // ContentPolicyAbortError from higgsfield-web means N consecutive scenes were
    // blocked by Higgsfield moderation — the prompt likely violates policy as a whole.
    // Signal abortAll back to the client so Studio.tsx can break the for-loop instead
    // of marching into all remaining scenes and burning credits on each.
    const isContentPolicyAbort = error instanceof Error && error.name === 'ContentPolicyAbortError';
    if (isContentPolicyAbort) {
      return NextResponse.json(
        { error: message, abortAll: true, reason: 'content-policy' },
        { status: 451 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
