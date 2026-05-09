import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { callClaudeJson } from '@/lib/claude-cli';

export const maxDuration = 120;

const FORMATS = ['narrator', 'marketing', 'dialogue', 'tutorial'] as const;

const FORMAT_DESCRIPTIONS: Record<typeof FORMATS[number], string> = {
  narrator: 'cinematic, third-person, descriptive, evocative',
  marketing: 'punchy, persuasive, addressing viewer directly, clear CTA',
  dialogue: 'conversational, first-person, natural rhythm',
  tutorial: 'clear, step-by-step, instructive, second-person',
};

const inputSchema = z.object({
  script: z.string().min(1),
  scenes: z.array(z.object({ prompt: z.string() })).optional(),
  format: z.enum(FORMATS),
  sceneCount: z.number().int().min(1).max(12),
  voiceLanguage: z.enum(['en', 'ru']).default('en'),
});

const resultSchema = z.object({
  text: z.string().min(5),
});

export async function POST(req: NextRequest) {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `validation: ${msg}` }, { status: 400 });
  }

  const targetSec = body.sceneCount * 5;
  const wps = body.voiceLanguage === 'ru' ? 2.6 : 2.8;
  const targetWords = Math.round(targetSec * wps);

  const scenesText = body.scenes
    ? body.scenes.map((s, i) => `Scene ${i + 1}: ${s.prompt}`).join('\n')
    : body.script;

  const lang = body.voiceLanguage === 'ru' ? 'Russian' : 'English';
  const formatDesc = FORMAT_DESCRIPTIONS[body.format];

  const prompt = [
    `Write a voiceover narration in ${lang}.`,
    `Style: ${body.format} — ${formatDesc}.`,
    `Target: exactly ${targetWords} words (${targetSec} seconds at TTS pace).`,
    `Write as a single flowing piece — no scene labels, no headings.`,
    '',
    `Source (${body.sceneCount} scenes, ${targetSec}s total):`,
    scenesText,
  ].join('\n');

  const example = { text: 'A samurai stands atop the wind-swept cliff, cherry blossoms swirling around him...' };

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const retryHint = attempt > 0
        ? `\nCRITICAL: Your previous response had wrong word count. You MUST write EXACTLY ${targetWords} words. Count carefully.`
        : '';

      const result = await callClaudeJson(prompt + retryHint, resultSchema, example, {
        timeoutMs: 45_000,
      });

      const wordCount = result.text.split(/\s+/).filter(Boolean).length;
      const drift = Math.abs(wordCount - targetWords) / targetWords;

      if (drift > 0.3 && attempt < 2) {
        console.log(`[generate-text] attempt ${attempt + 1}: ${wordCount}w vs target ${targetWords}w (drift ${(drift * 100).toFixed(0)}%), retrying`);
        continue;
      }

      const durationS = Math.round(wordCount / wps);
      console.log(`[generate-text] ${body.format} ${body.sceneCount}sc → ${wordCount}w ${durationS}s`);

      return NextResponse.json({
        success: true,
        text: result.text,
        durationS,
        wordCount,
        format: body.format,
      });
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.warn(`[generate-text] attempt ${attempt + 1} failed, retrying:`, err);
        continue;
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('[generate-text] all attempts failed:', msg);
  return NextResponse.json({ error: `Claude generation failed: ${msg}` }, { status: 502 });
}
