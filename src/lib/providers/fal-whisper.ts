import { ensureFalReachableUrl } from './fal-video';

const FAL_WHISPER_NS = 'fal-ai/whisper';

export interface WhisperOpts {
  audioUrl: string;
  language?: string | null;
  task?: 'transcribe' | 'translate';
}

export interface WhisperChunk {
  timestamp: [number, number];
  text: string;
}

export interface WhisperResult {
  text: string;
  chunks: WhisperChunk[];
  language: string;
  cost: number;
}

async function falWhisperPost(endpoint: string, body?: unknown): Promise<unknown> {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY not set');
  const url = `https://queue.fal.run/${FAL_WHISPER_NS}${endpoint}`;
  const opts: RequestInit = {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Key ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`fal whisper HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

export async function transcribeWithFalWhisper(opts: WhisperOpts): Promise<WhisperResult> {
  // Upload local audio to fal.storage if needed
  const audioUrl = await ensureFalReachableUrl(opts.audioUrl);

  // Submit to queue — fal.ai REST expects flat body (not wrapped in `input`)
  const submitResp = await falWhisperPost('', {
    audio_url: audioUrl,
    task: opts.task ?? 'transcribe',
    language: opts.language ?? undefined,
    chunk_level: 'word',
  }) as { request_id: string };

  const jobId = submitResp.request_id;
  console.log('[whisper] submitted job:', jobId);

  // Poll for completion
  const maxAttempts = 60; // 60 * 2s = 2min max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const statusResp = await falWhisperPost(`/requests/${jobId}/status`, undefined) as { status: string };

    if (statusResp.status === 'COMPLETED') {
      const result = await falWhisperPost(`/requests/${jobId}`, undefined) as {
        text?: string;
        chunks?: Array<{ timestamp: [number, number]; text: string }>;
        inferred_languages?: string[];
      };

      const chunks: WhisperChunk[] = (result.chunks ?? []).map(c => ({
        timestamp: c.timestamp,
        text: c.text,
      }));

      // Estimate cost: ~$0.0001 per second of audio
      const maxTs = chunks.length > 0 ? Math.max(...chunks.map(c => c.timestamp[1])) : 0;
      const cost = maxTs * 0.0001;

      const language = result.inferred_languages?.[0] ?? 'en';

      console.log(`[whisper] done: ${chunks.length} words, ${maxTs.toFixed(1)}s, lang=${language}, cost=$${cost.toFixed(4)}`);

      return {
        text: result.text ?? '',
        chunks,
        language,
        cost,
      };
    }

    if (statusResp.status === 'FAILED') {
      throw new Error('fal Whisper transcription failed');
    }
  }

  throw new Error('fal Whisper timed out after 2 minutes');
}
