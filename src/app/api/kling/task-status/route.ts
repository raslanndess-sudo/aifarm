import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/providers/resolve-provider';

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  try {
    const { provider, mode } = await resolveProvider();

    // Higgsfield getStatus проверяет файлы локально — connect не нужен
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
