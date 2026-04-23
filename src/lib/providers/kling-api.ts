import { submitKlingImageToVideo, klingFetch, type KlingVideoTask } from '@/lib/kling';
import type { GenerationJob, VideoProvider } from './types';

export class KlingApiProvider implements VideoProvider {
  name = 'kling-api';

  async generateImage(): Promise<string[]> {
    throw new Error('Not implemented — use Leonardo/CREF routes');
  }

  async generateVideo(params: {
    imageUrl: string;
    endImageUrl?: string;
    prompt?: string;
    model?: string;
    duration?: '5' | '10';
    mode?: 'std' | 'pro';
  }): Promise<GenerationJob> {
    const taskId = await submitKlingImageToVideo({
      imageUrl: params.imageUrl,
      tailImage: params.endImageUrl,
      animationPrompt: params.prompt,
      modelName: params.model,
      duration: params.duration,
      mode: params.mode,
    });
    return { jobId: taskId, status: 'submitted' };
  }

  async getStatus(jobId: string): Promise<GenerationJob> {
    const res = await klingFetch(`/videos/image2video/${jobId}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kling API error: ${err}`);
    }
    const data = await res.json();
    const task: KlingVideoTask = data?.data;

    const job: GenerationJob = {
      jobId,
      status: task.task_status,
    };
    if (task.task_status === 'succeed') {
      job.resultUrl = task.task_result?.videos?.[0]?.url;
    }
    if (task.task_status === 'failed') {
      job.error = task.task_status_msg ?? 'unknown';
    }
    return job;
  }
}
