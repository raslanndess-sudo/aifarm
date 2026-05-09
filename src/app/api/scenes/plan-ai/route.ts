import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callClaudeJson, ClaudeCliError } from '@/lib/claude-cli';

const SceneSchema = z.object({
  description: z.string().min(1).max(200),
  image_prompt: z.string().min(5).max(700),
  animation_prompt: z.string().min(3).max(300),
  duration_s: z.number().int().min(3).max(10),
});

const ResponseSchema = z.object({
  main_character: z.string().min(5).max(300),
  setting: z.string().min(3).max(300),
  scenes: z.array(SceneSchema).min(1).max(10),
});

const EXAMPLE = {
  main_character: 'small white cat with bright blue eyes, fluffy fur, red leather collar with brass bell',
  setting: 'golden wheat field at sunset, rolling hills in distance, warm orange light, soft summer breeze',
  scenes: [
    {
      description: 'Кот идёт через золотое поле на закате',
      image_prompt: 'small white cat with bright blue eyes, fluffy fur, red leather collar with brass bell, walking through golden wheat field at sunset, rolling hills in distance, cinematic wide shot, warm orange backlight, anime style',
      animation_prompt: 'slow camera push-in following the cat, gentle wind ripples through grass, cat walks forward steadily',
      duration_s: 5,
    },
    {
      description: 'Кот замечает бабочку и останавливается',
      image_prompt: 'small white cat with bright blue eyes, fluffy fur, red leather collar with brass bell, frozen mid-step in golden wheat field, head turned upward, focused gaze on a blue butterfly hovering above, blurred sunset background, soft bokeh, anime style',
      animation_prompt: 'cat freezes, ears prick up, eyes track the butterfly, tail flicks once, blue butterfly flutters in slow motion',
      duration_s: 5,
    },
  ],
};

const MODEL_HINT_BY_STYLE: Record<string, string> = {
  anime: 'anime style, vibrant colors, expressive characters',
  cyberpunk: 'cyberpunk style, neon lighting, dystopian atmosphere',
  realistic: 'photorealistic, natural lighting, sharp focus',
  ghibli: 'studio ghibli style, watercolor textures, soft pastels',
  seinen: 'seinen anime style, mature tones, dramatic shadows',
  mecha: 'mecha anime style, mechanical detail, metallic surfaces',
};

export async function POST(req: Request) {
  let script: string;
  let sceneCount: number;
  let style: string;
  try {
    const body = await req.json();
    script = String(body.script ?? '').trim();
    sceneCount = Math.max(1, Math.min(10, Number(body.sceneCount ?? 6)));
    style = String(body.style ?? 'anime').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!script || script.length < 10) {
    return NextResponse.json(
      { error: 'script must be at least 10 characters' },
      { status: 400 },
    );
  }

  const styleHint = MODEL_HINT_BY_STYLE[style] ?? `${style} style`;

  const prompt = [
    `Ты режиссёр, который раскадровывает короткий сценарий на ${sceneCount} последовательных кадров для AI-видео.`,
    '',
    'ШАГ 1 — анализ:',
    '- main_character: ОДНО короткое описание главного героя на английском (внешность, одежда, отличительные черты, причёска/цвет глаз, аксессуары). Это описание ДОЛЖНО дословно повторяться в начале каждого image_prompt — это критично для консистентности персонажа между сценами AI-генерации.',
    '- setting: общая обстановка/локация на английском (одно-два предложения). Если в сценарии локация меняется, описывай главную/начальную.',
    '',
    'ШАГ 2 — раскадровка:',
    `Раздели сценарий на ровно ${sceneCount} кадров В ТОМ ЖЕ ПОРЯДКЕ, в каком события идут в тексте пользователя. НЕ переставляй события местами. Каждый кадр — это один beat сюжета (одно действие/состояние).`,
    '',
    'Для каждого кадра пиши:',
    '- description: одно русское предложение что происходит (для UI, не для AI)',
    `- image_prompt: на английском. ФОРМАТ ОБЯЗАТЕЛЕН: "<main_character дословно>, <что делает герой именно в этом кадре>, <поза/эмоция/угол камеры>, <освещение и композиция>, ${styleHint}". Длина 1-3 предложения. Каждый image_prompt должен начинаться с тех же слов что и main_character — это гарантирует одного и того же героя на всех кадрах.`,
    '- animation_prompt: motion prompt на английском, 1 предложение. Описывай ТОЛЬКО движение в этом кадре (камера и/или субъект). Start frame подаётся отдельно — НЕ описывай что в кадре, только как двигается. Движение должно логически продолжать предыдущий кадр и подводить к следующему.',
    '- duration_s: целое 3-10 (сколько длится кадр)',
    '',
    `Стиль для всех image_prompt: ${styleHint}.`,
    `Верни ровно ${sceneCount} кадров в порядке хронологии сценария.`,
    '',
    'Сценарий пользователя:',
    script,
  ].join('\n');

  try {
    const result = await callClaudeJson(prompt, ResponseSchema, EXAMPLE, {
      timeoutMs: 90_000,
    });

    // Trim/normalize to requested sceneCount in case Claude returned more/fewer
    const scenes = result.scenes.slice(0, sceneCount);
    if (scenes.length < 1) {
      throw new Error(`got ${scenes.length} scenes, need at least 1`);
    }

    return NextResponse.json({ scenes, source: 'claude-cli' });
  } catch (err) {
    const stage = err instanceof ClaudeCliError ? err.stage : 'unknown';
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[plan-ai] Claude CLI failed (${stage}), falling back to naive split:`, msg);

    // Naive fallback: split script into N roughly-equal segments by sentences
    const sentences = script
      .split(/[.!?\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const fallback = Array.from({ length: sceneCount }, (_, i) => {
      const startIdx = Math.floor((i * sentences.length) / sceneCount);
      const endIdx = Math.floor(((i + 1) * sentences.length) / sceneCount);
      const segment = sentences.slice(startIdx, endIdx).join('. ') || sentences[i] || `Сцена ${i + 1}`;
      return {
        description: segment.slice(0, 120),
        image_prompt: `${styleHint}, scene ${i + 1}: ${segment.slice(0, 200)}, cinematic composition`,
        animation_prompt: 'slow camera push-in, gentle ambient motion',
        duration_s: 5,
      };
    });

    return NextResponse.json({
      scenes: fallback,
      source: 'fallback-naive',
      warning: `Claude CLI unavailable (${stage}: ${msg.slice(0, 100)}). Using naive split.`,
    });
  }
}
