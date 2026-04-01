import { NextRequest, NextResponse } from 'next/server';
import { submitKlingImageToVideo, pollKlingTask } from '@/lib/kling';

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
      waitForResult = true,
    } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
      return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
    }

    // Submit task
    const taskId = await submitKlingImageToVideo({
      imageUrl,
      animationPrompt,
      modelName,
      duration,
      mode,
    });

    if (!waitForResult) {
      // Return task_id immediately — client can poll /api/kling/task-status
      return NextResponse.json({ success: true, taskId, status: 'submitted' });
    }

    // Wait for result (up to 5 min)
    const videoUrl = await pollKlingTask(taskId, 280_000);

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        taskId,
        status: 'timeout',
        error: 'Video generation timed out (>5 min)',
      }, { status: 504 });
    }

    return NextResponse.json({
      success: true,
      taskId,
      status: 'done',
      videoUrl,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
