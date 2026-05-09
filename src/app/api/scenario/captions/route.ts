import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { mkdirSync, existsSync } from 'fs';
import { transcribeWithFalWhisper } from '@/lib/providers/fal-whisper';
import { buildAssFile } from '@/lib/captions-ass';

const CACHE_DIR = path.join(process.cwd(), 'data', 'captions-cache');

function resFromAspect(ar?: string): { resX: number; resY: number } {
  switch (ar) {
    case '9:16': return { resX: 1080, resY: 1920 };
    case '1:1':  return { resX: 1080, resY: 1080 };
    case '16:9':
    default:     return { resX: 1920, resY: 1080 };
  }
}

export async function POST(req: NextRequest) {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    voiceUrl: string;
    language?: 'auto' | 'en' | 'ru' | 'kk';
    scenarioId?: string;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    position?: 'bottom' | 'center' | 'top';
    fontName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.voiceUrl) {
    return NextResponse.json({ error: 'voiceUrl is required' }, { status: 400 });
  }

  // Cache key
  const cacheKey = crypto.createHash('sha1')
    .update(`${body.voiceUrl}|${body.language ?? 'auto'}|${body.aspectRatio ?? ''}|${body.position ?? ''}`)
    .digest('hex')
    .slice(0, 16);
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachedAssPath = path.join(CACHE_DIR, `${cacheKey}.ass`);

  // Cache check
  if (existsSync(cachedAssPath)) {
    console.log('[captions] cache HIT:', cacheKey);
    const stat = await fs.stat(cachedAssPath);

    // Copy to scenario dir if scenarioId provided
    const scenarioId = body.scenarioId ?? `captions_${Date.now()}`;
    const subsDir = path.join(process.cwd(), 'public', 'generations', scenarioId, 'subs');
    mkdirSync(subsDir, { recursive: true });
    const outAssPath = path.join(subsDir, 'captions.ass');
    await fs.copyFile(cachedAssPath, outAssPath);

    const captionsUrl = `/generations/${scenarioId}/subs/captions.ass`;
    return NextResponse.json({
      success: true,
      captionsUrl,
      cached: true,
      sizeBytes: stat.size,
    });
  }

  // Transcribe
  try {
    const lang = body.language === 'auto' ? null : (body.language ?? null);
    const result = await transcribeWithFalWhisper({
      audioUrl: body.voiceUrl,
      language: lang,
    });

    if (result.chunks.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'no words detected in audio',
      });
    }

    // Check audio duration — skip if too short
    const maxTs = Math.max(...result.chunks.map(c => c.timestamp[1]));
    if (maxTs < 1) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'audio too short',
      });
    }

    // Build ASS
    const { resX, resY } = resFromAspect(body.aspectRatio);
    const assContent = buildAssFile({
      chunks: result.chunks,
      resX,
      resY,
      fontName: body.fontName,
      position: body.position,
    });

    // Save to scenario dir
    const scenarioId = body.scenarioId ?? `captions_${Date.now()}`;
    const subsDir = path.join(process.cwd(), 'public', 'generations', scenarioId, 'subs');
    mkdirSync(subsDir, { recursive: true });

    const outAssPath = path.join(subsDir, 'captions.ass');
    await fs.writeFile(outAssPath, assContent);

    // Save raw whisper JSON for debug
    await fs.writeFile(
      path.join(subsDir, 'raw-whisper.json'),
      JSON.stringify(result, null, 2),
    );

    // Cache copy
    await fs.writeFile(cachedAssPath, assContent);

    const captionsUrl = `/generations/${scenarioId}/subs/captions.ass`;
    console.log(`[captions] generated: ${result.chunks.length} words, ${captionsUrl}`);

    return NextResponse.json({
      success: true,
      captionsUrl,
      wordCount: result.chunks.length,
      language: result.language,
      cost: result.cost,
      cached: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[captions] whisper failed:', msg);

    // Log failure
    try {
      const logPath = path.join(process.cwd(), 'data', 'whisper-fail.log');
      await fs.appendFile(logPath, `${new Date().toISOString()} ${body.voiceUrl} ${msg}\n`);
    } catch { /* non-critical */ }

    return NextResponse.json({ error: `Whisper failed: ${msg}` }, { status: 502 });
  }
}
