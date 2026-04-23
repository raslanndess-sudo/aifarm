export interface GenerationJob {
  jobId: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  resultUrl?: string;
  error?: string;
}

export interface VideoProvider {
  name: string;
  generateImage(prompt: string, opts?: { model?: string; count?: number }): Promise<string[]>;
  generateVideo(params: {
    imageUrl: string;
    endImageUrl?: string;
    prompt?: string;
    model?: string;
    duration?: '5' | '10';
    mode?: 'std' | 'pro';
  }): Promise<GenerationJob>;
  getStatus(jobId: string): Promise<GenerationJob>;
}
