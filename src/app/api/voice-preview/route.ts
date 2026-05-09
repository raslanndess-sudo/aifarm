import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { synthesizeSpeech, VOICE_IDS, VOICES_LIBRARY } from '@/lib/elevenlabs';

const PREVIEW_TEXT_EN = 'Hello! This is a quick voice sample. Your video will sound exactly like this — clear, expressive, with character. Ready for any script.';
const PREVIEW_TEXT_RU = 'Привет! Это тестовая запись голоса. Так будет звучать озвучка вашего видео — спокойно, чётко, с характером.';

function getDefaultText(voiceKey: string): string {
  const entry = VOICES_LIBRARY.find(v => v.id === voiceKey);
  if (entry && 'language' in entry && (entry as Record<string, unknown>).language === 'ru') {
    return PREVIEW_TEXT_RU;
  }
  return PREVIEW_TEXT_EN;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { provider: 'api' | 'higgsfield'; voice: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // ── ElevenLabs API path ─────────────────────────────────────────────────
  if (body.provider === 'api') {
    const voiceId = VOICE_IDS[body.voice];
    if (!voiceId) {
      return NextResponse.json(
        { error: `unknown voice "${body.voice}", check /api/voice-library` },
        { status: 400 },
      );
    }

    const usingCustomText = !!(body.text && body.text.length > 5);
    const text = usingCustomText ? body.text!.slice(0, 300) : getDefaultText(body.voice);

    // Cache logic
    const textHash = usingCustomText
      ? crypto.createHash('sha1').update(body.text!).digest('hex').slice(0, 8)
      : null;
    const cacheFileName = textHash ? `${body.voice}_${textHash}.mp3` : `${body.voice}.mp3`;
    const cacheDir = path.join(process.cwd(), 'public', 'voice-previews');
    const cacheFile = path.join(cacheDir, cacheFileName);
    const publicUrl = `/voice-previews/${cacheFileName}`;

    // Check cache
    try {
      const stat = await fs.stat(cacheFile);
      console.log(`[voice-preview] cache HIT for ${body.voice}`);
      return NextResponse.json({
        success: true,
        provider: 'api',
        voice: body.voice,
        url: publicUrl,
        cached: true,
        sizeBytes: stat.size,
      });
    } catch {
      // Cache miss — generate
    }

    try {
      await fs.mkdir(cacheDir, { recursive: true });
      const result = await synthesizeSpeech({ text, voiceId, outPath: cacheFile });
      console.log(`[voice-preview] cache MISS, generated ${body.voice} → ${cacheFile}`);
      return NextResponse.json({
        success: true,
        provider: 'api',
        voice: body.voice,
        url: publicUrl,
        cached: false,
        sizeBytes: result.sizeBytes,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `ElevenLabs failed: ${msg}` }, { status: 502 });
    }
  }

  // ── Higgsfield UI path — ВРЕМЕННО заглушка ──────────────────────────────
  if (body.provider === 'higgsfield') {
    return NextResponse.json(
      {
        error: 'Higgsfield voice preview disabled — waiting for correct Audio tab URL',
        suggestion: 'Use provider=api for now',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: `unknown provider "${body.provider}"` }, { status: 400 });
}
