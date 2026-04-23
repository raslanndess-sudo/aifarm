import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/providers/resolve-provider';

export const maxDuration = 300; // 5 min for Vercel

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imageUrl,
      endImageUrl,
      animationPrompt = '',
      modelName = 'kling-v1',
      duration = '5',
      mode = 'std',
    } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    // Download image → pure base64 (Kling requires raw base64, no data URI prefix)
    let imageBase64: string;
    if (imageUrl.startsWith('http')) {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to download scene image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      imageBase64 = Buffer.from(buf).toString('base64'); // pure base64, no prefix
    } else if (imageUrl.startsWith('data:')) {
      // strip data URI prefix: "data:image/jpeg;base64,XXXXX" → "XXXXX"
      imageBase64 = imageUrl.split(',')[1] ?? imageUrl;
    } else {
      imageBase64 = imageUrl;
    }

    // Convert end frame to base64 if provided
    let endImageBase64: string | undefined;
    if (endImageUrl) {
      if (endImageUrl.startsWith('http')) {
        const endRes = await fetch(endImageUrl);
        if (!endRes.ok) throw new Error(`Failed to download end image: ${endRes.status}`);
        const endBuf = await endRes.arrayBuffer();
        endImageBase64 = Buffer.from(endBuf).toString('base64');
      } else if (endImageUrl.startsWith('data:')) {
        endImageBase64 = endImageUrl.split(',')[1] ?? endImageUrl;
      } else {
        endImageBase64 = endImageUrl;
      }
    }

    const { provider, mode: providerMode } = await resolveProvider();

    let taskId: string;
    try {
      if (providerMode === 'higgsfield') {
        const hf = provider as any;
        await hf.connect();
        try {
          const job = await provider.generateVideo({ imageUrl: imageBase64, endImageUrl: endImageBase64, prompt: animationPrompt, model: modelName, duration, mode });
          taskId = job.jobId;
        } finally {
          await hf.disconnect();
        }
      } else {
        if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
          return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
        }
        const job = await provider.generateVideo({ imageUrl: imageBase64, endImageUrl: endImageBase64, prompt: animationPrompt, model: modelName, duration, mode });
        taskId = job.jobId;
      }
    } catch (klingErr: unknown) {
      const msg = klingErr instanceof Error ? klingErr.message : String(klingErr);
      console.error('[generate-video] error:', msg);
      return NextResponse.json({ error: `Submit failed: ${msg}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, taskId, status: 'submitted' });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-video] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
