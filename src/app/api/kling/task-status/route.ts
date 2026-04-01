import { NextRequest, NextResponse } from 'next/server';
import { klingFetch } from '@/lib/kling';

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return NextResponse.json({ error: 'Kling API keys not configured' }, { status: 500 });
  }

  try {
    const res = await klingFetch(`/videos/image2video/${taskId}`);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Kling API error: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    const task = data?.data;

    return NextResponse.json({
      taskId,
      status: task?.task_status,
      statusMsg: task?.task_status_msg,
      videoUrl: task?.task_result?.videos?.[0]?.url ?? null,
      videoDuration: task?.task_result?.videos?.[0]?.duration ?? null,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
