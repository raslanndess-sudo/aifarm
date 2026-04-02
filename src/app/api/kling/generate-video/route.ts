import { NextRequest, NextResponse } from 'next/server';
import { submitKlingImageToVideo } from '@/lib/kling';

export const maxDuration = 300; // 5 min for Vercel

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imageUrl,
      animationPrompt = '',
      modelName = 'kling-v1',
      duration = '5',
      mode = 'std',
    } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
      return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
    }

    // Download image → base64 (Kling cannot access Leonardo CDN URLs directly)
    let imageBase64: string;
    if (imageUrl.startsWith('http')) {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to download scene image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      imageBase64 = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
    } else {
      // already base64
      imageBase64 = imageUrl;
    }

    // Submit task — returns task_id immediately
    const taskId = await submitKlingImageToVideo({
      imageUrl: imageBase64,
      animationPrompt,
      modelName,
      duration,
      mode,
    });

    return NextResponse.json({ success: true, taskId, status: 'submitted' });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
