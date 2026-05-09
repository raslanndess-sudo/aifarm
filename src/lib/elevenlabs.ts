import { writeFileSync } from 'fs';
import voicesConfig from './elevenlabs-voices.json';

// Dynamic voice IDs from Voice Library JSON
export const VOICE_IDS: Record<string, string> = Object.fromEntries(
  voicesConfig.voices.map(v => [v.id, v.voiceId])
);

export const VOICES_LIBRARY = voicesConfig.voices;

export type VoiceTone = string;

export async function synthesizeSpeech(opts: {
  text: string;
  voiceId: string;
  modelId?: string;
  outPath: string;
}): Promise<{ outPath: string; sizeBytes: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const modelId = opts.modelId ?? 'eleven_multilingual_v2';

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: opts.text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error(`ElevenLabs: invalid API key (401)`);
    if (resp.status === 422) throw new Error(`ElevenLabs: invalid voice_id or params (422): ${body}`);
    if (resp.status === 429) throw new Error(`ElevenLabs: rate limit exceeded (429)`);
    throw new Error(`ElevenLabs: HTTP ${resp.status} — ${body}`);
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(opts.outPath, buf);

  return { outPath: opts.outPath, sizeBytes: buf.length };
}
