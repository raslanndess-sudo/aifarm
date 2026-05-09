import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import path from 'path';
import { promises as fs } from 'fs';
import { mkdirSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { transcribeWithFalWhisper } from '@/lib/providers/fal-whisper';
import { buildAssFile } from '@/lib/captions-ass';

const execAsync = promisify(exec);

export const maxDuration = 600;

function resFromAspect(ar?: string): { resX: number; resY: number } {
  switch (ar) {
    case '9:16': return { resX: 1080, resY: 1920 };
    case '1:1':  return { resX: 1080, resY: 1080 };
    case '16:9':
    default:     return { resX: 1920, resY: 1080 };
  }
}

function resolvePublicPath(url: string): string {
  return path.join(process.cwd(), 'public', url.replace(/^\//, ''));
}

export async function POST(req: NextRequest) {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    videoUrl: string;
    voiceUrl: string;
    language?: 'auto' | 'en' | 'ru' | 'kk';
    aspectRatio?: '16:9' | '9:16' | '1:1';
    position?: 'bottom' | 'center' | 'top';
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.videoUrl || !body.voiceUrl) {
    return NextResponse.json({ error: 'videoUrl and voiceUrl required' }, { status: 400 });
  }

  const videoAbsPath = resolvePublicPath(body.videoUrl);
  if (!existsSync(videoAbsPath)) {
    return NextResponse.json({ error: `video not found: ${body.videoUrl}` }, { status: 404 });
  }

  // Step 1: transcribe voice
  let chunks;
  let language = 'en';
  try {
    const lang = body.language === 'auto' ? null : (body.language ?? null);
    const result = await transcribeWithFalWhisper({
      audioUrl: body.voiceUrl,
      language: lang,
    });
    if (result.chunks.length === 0) {
      return NextResponse.json({ error: 'no words detected in voice audio' }, { status: 422 });
    }
    chunks = result.chunks;
    language = result.language;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Whisper failed: ${msg}` }, { status: 502 });
  }

  // Step 2: build ASS
  const { resX, resY } = resFromAspect(body.aspectRatio);
  const assContent = buildAssFile({
    chunks,
    resX,
    resY,
    position: body.position,
  });

  // Step 3: save ASS next to video
  const videoDir = path.dirname(videoAbsPath);
  const videoName = path.basename(videoAbsPath, path.extname(videoAbsPath));
  const subsDir = path.join(videoDir, 'subs');
  mkdirSync(subsDir, { recursive: true });
  const assAbsPath = path.join(subsDir, `${videoName}.ass`);
  await fs.writeFile(assAbsPath, assContent);

  // Step 4: ffmpeg burn-in
  const outAbsPath = path.join(videoDir, `${videoName}-with-subs.mp4`);
  const fontsDir = path.join(process.cwd(), 'assets', 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:');
  const escapedAssPath = assAbsPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  const cmd = existsSync(path.join(process.cwd(), 'assets', 'fonts'))
    ? `ffmpeg -y -i "${videoAbsPath}" -vf "subtitles='${escapedAssPath}':fontsdir='${fontsDir}'" -c:v libx264 -preset fast -crf 22 -c:a copy "${outAbsPath}"`
    : `ffmpeg -y -i "${videoAbsPath}" -vf "subtitles='${escapedAssPath}'" -c:v libx264 -preset fast -crf 22 -c:a copy "${outAbsPath}"`;

  try {
    await execAsync(cmd, { timeout: 300_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `ffmpeg burn-in failed: ${msg}` }, { status: 500 });
  }

  if (!existsSync(outAbsPath)) {
    return NextResponse.json({ error: 'output not produced' }, { status: 500 });
  }

  // Build public URL: relative to /public
  const publicRoot = path.join(process.cwd(), 'public');
  const finalUrl = '/' + path.relative(publicRoot, outAbsPath).replace(/\\/g, '/');
  const captionsUrl = '/' + path.relative(publicRoot, assAbsPath).replace(/\\/g, '/');

  const stat = await fs.stat(outAbsPath);

  return NextResponse.json({
    success: true,
    finalUrl,
    captionsUrl,
    wordCount: chunks.length,
    language,
    sizeBytes: stat.size,
  });
}
