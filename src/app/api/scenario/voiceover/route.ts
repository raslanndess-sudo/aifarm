import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mkdirSync } from 'fs';
import path from 'path';
import { callClaudeJson } from '@/lib/claude-cli';
import { synthesizeSpeech, VOICE_IDS } from '@/lib/elevenlabs';
import { resolveProvider } from '@/lib/providers/resolve-provider';
import { generateVoiceoverHF, type VoiceName } from '@/lib/providers/higgsfield-voiceover';

export const maxDuration = 600; // 10 min — Higgsfield audio gen can take up to 5 min

const voiceToneKeys = Object.keys(VOICE_IDS);

const narrationSchema = z.object({
  narration: z.string().min(20).max(2000),
  voice_tone: z.string(),
  reasoning: z.string().max(200),
});

type NarrationResult = z.infer<typeof narrationSchema>;

const inputSchema = z.object({
  scenes: z.array(z.object({
    description: z.string(),
    image_prompt: z.string().optional(),
    animation_prompt: z.string().optional(),
  })).min(1),
  totalDurationS: z.number().min(3).max(300),
  scenarioId: z.string().optional(),
  customText: z.string().optional(),
  voice: z.string().optional(),
  provider: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const body = inputSchema.parse(raw);

    const targetWords = Math.round(body.totalDurationS * 2.5);
    const scenesDesc = body.scenes
      .map((s, i) => `Scene ${i + 1}: ${s.description}`)
      .join('\n');

    // Generate narration via Claude CLI or use customText
    let narration: string;
    let voiceTone: string;
    let reasoning = '';

    const hasCustomText = body.customText && body.customText.trim().length >= 10;

    if (hasCustomText) {
      // Use custom text directly, skip Claude generation
      narration = body.customText!.trim();
      voiceTone = voiceToneKeys[0] ?? 'mark';
      reasoning = 'custom text provided by user';
    } else {
      try {
        const prompt = [
          `Generate a cohesive voiceover narration for a video with ${body.scenes.length} scenes.`,
          `Target duration: ~${body.totalDurationS}s (~${targetWords} words).`,
          `Write ONE continuous narration text covering all scenes naturally.`,
          `Also pick the best voice tone from: ${voiceToneKeys.join(', ')}`,
          '',
          'Scenes:',
          scenesDesc,
        ].join('\n');

        const example: NarrationResult = {
          narration: 'A boy walks through the sunlit park, leaves crunching beneath his feet...',
          voice_tone: voiceToneKeys[0] ?? 'mark',
          reasoning: 'Calm neutral narrator fits the peaceful scene',
        };

        const result = await callClaudeJson(prompt, narrationSchema, example, {
          timeoutMs: 45_000,
        });
        narration = result.narration;
        voiceTone = result.voice_tone;
        reasoning = result.reasoning;
      } catch (err) {
        console.warn('[voiceover] Claude CLI failed, using fallback:', err);
        narration = body.scenes.map((s, i) => `Scene ${i + 1}. ${s.description}.`).join(' ');
        voiceTone = voiceToneKeys[0] ?? 'mark';
        reasoning = 'fallback — Claude CLI unavailable';
      }
    }

    // Determine output path
    const folder = body.scenarioId ?? `voice_${Date.now()}`;
    const outDir = path.join(process.cwd(), 'public', 'generations', folder);
    mkdirSync(outDir, { recursive: true });

    const durationEstimate = Math.round(narration.split(/\s+/).length / 2.5);

    // Branch: Higgsfield Audio (Playwright) or ElevenLabs API
    // body.provider takes priority (FE selection); fall back to admin toggle
    const mode = body.provider === 'higgsfield' ? 'higgsfield'
      : body.provider === 'api' ? 'api'
      : (await resolveProvider()).mode;

    if (mode === 'higgsfield') {
      const voiceMap: Record<string, VoiceName> = {
        // New 10 voices → HF mapping
        mark: 'STERLING',
        sean: 'ROMAN',
        alexandra: 'QUINN',
        viraj: 'LEO',
        lauren: 'MABEL',
        ivanna: 'TALLULAH',
        eve: 'QUINN',
        tripti: 'MABEL',
        adam_m: 'STERLING',
        joseph: 'LEO',
        // Legacy aliases
        rachel: 'QUINN',
        bella: 'MABEL',
        drew: 'STERLING',
        josh: 'ROMAN',
        adam: 'STERLING',
        arnold: 'LEO',
        antoni: 'ROMAN',
        sam: 'LEO',
      };
      const hfVoiceKey = body.voice ?? voiceTone;
      const hfVoice = voiceMap[hfVoiceKey] ?? voiceMap[voiceTone] ?? 'TALLULAH';

      const result = await generateVoiceoverHF({
        text: narration,
        voice: hfVoice,
        outDir,
      });

      // Determine the relative voice URL from saved file
      const voiceFilename = path.basename(result.outPath);
      const voiceUrl = `/generations/${folder}/${voiceFilename}`;

      return NextResponse.json({
        success: true,
        voiceUrl,
        narration,
        voiceTone: hfVoice,
        reasoning,
        durationEstimate,
        sizeBytes: result.sizeBytes,
        provider: 'higgsfield',
      });
    }

    // ElevenLabs API path
    // Priority: body.voice (FE selection) → Claude voiceTone → first available key
    const resolvedVoiceKey = (body.voice && VOICE_IDS[body.voice]) ? body.voice
      : VOICE_IDS[voiceTone] ? voiceTone
      : voiceToneKeys[0];
    const resolvedVoiceId = VOICE_IDS[resolvedVoiceKey];

    if (!resolvedVoiceId) {
      console.error('[voiceover] no valid voiceId found. voice:', body.voice, 'voiceTone:', voiceTone, 'keys:', voiceToneKeys);
      return NextResponse.json({ error: 'no valid voice configured' }, { status: 500 });
    }

    console.log(`[voiceover] voice resolved: body.voice="${body.voice}" claude="${voiceTone}" → key="${resolvedVoiceKey}" id="${resolvedVoiceId}"`);

    const outPath = path.join(outDir, 'voice.mp3');
    const { sizeBytes } = await synthesizeSpeech({
      text: narration,
      voiceId: resolvedVoiceId,
      outPath,
    });

    const voiceUrl = `/generations/${folder}/voice.mp3`;

    return NextResponse.json({
      success: true,
      voiceUrl,
      narration,
      voiceTone: resolvedVoiceKey,
      reasoning,
      durationEstimate,
      sizeBytes,
      provider: 'elevenlabs',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scenario/voiceover] error:', msg);

    if (msg.includes('ElevenLabs') || msg.includes('voiceoverHF')) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
