import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/providers/resolve-provider';
import { getFalVideoStatus, FAL_MODEL_MAP, type FalVideoProvider } from '@/lib/providers/fal-video';

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  try {
    // --- fal.ai branch: taskId = "fal:<provider>:<jobId>" ---
    if (taskId.startsWith('fal:')) {
      const parts = taskId.split(':');
      const provider = parts[1] as FalVideoProvider;
      const jobId = parts.slice(2).join(':'); // jobId may contain colons (UUIDs don't, but be safe)

      if (!FAL_MODEL_MAP[provider]) {
        return NextResponse.json({ error: `unknown fal provider: ${provider}` }, { status: 400 });
      }

      const result = await getFalVideoStatus(provider, jobId);

      // Map to existing response shape
      const statusMap: Record<string, string> = {
        submitted: 'processing',
        processing: 'processing',
        completed: 'completed',
        failed: 'failed',
      };

      return NextResponse.json({
        taskId,
        status: statusMap[result.status] ?? result.status,
        statusMsg: result.status === 'failed' ? 'fal generation failed' : null,
        videoUrl: result.videoUrl ?? null,
        videoDuration: null,
        provider: `fal:${provider}`,
      });
    }

    // --- Existing kling-direct / higgsfield path ---
    const { provider, mode } = await resolveProvider();

    if (mode === 'api') {
      if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
        return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
      }
    }

    const job = await provider.getStatus(taskId);

    return NextResponse.json({
      taskId,
      status: job.status,
      statusMsg: job.error ?? null,
      videoUrl: job.resultUrl ?? null,
      videoDuration: null,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
