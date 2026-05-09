/**
 * ═══════════════════════════════════════════════════════════════════════
 *   VIDEO CONFIG — всё специфичное для одного видео живёт ЗДЕСЬ.
 *   Движок и компоненты переиспользуются.
 *   Для нового ролика: копируй этот файл и меняй значения.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { COLORS } from './tokens';
import type { HeroMoment } from './data/heroes';

// ─── 1. МЕТА ──────────────────────────────────────────────────────────────
export const VIDEO = {
  id: 'HP',
  fps: 24,
  width: 720,
  height: 1280,
  durationSec: 102,
};

// ─── 2. АССЕТЫ (пути в public/) ────────────────────────────────────────────
export const ASSETS = {
  video: 'video/hp.mp4',           // исходный b-roll
  music: 'music/hot-pepper.mp3',   // фоновая энергичная музыка
  transcript: 'transcript.json',   // word-level таймкоды (Whisper)
  voice: null as string | null,    // 'voice.wav' если нужен внешний ГС; null = ориг звук
};

// ─── 3. АУДИО ─────────────────────────────────────────────────────────────
export const AUDIO = {
  originalVideoVolume: 1.0,
  voiceVolume: 1.0,
  musicBaseVolume: 0.025,   // тихо (фон)
  musicQuietVolume: 0.004,  // ducking
  musicFadeTime: 0.45,      // сек плавного перехода
};

// ─── 4. ЧЁРНЫЕ ЗОНЫ (letterbox моменты где верх кадра чёрный) ─────────────
// Определить через scripts/analyze-zones.sh
export const LETTERBOX_RANGES: Array<[number, number]> = [
  [8.0, 12.0],
  [16.5, 22.0],
  [22.0, 26.5],
  [26.5, 32.5],
  [43.5, 46.5],
  [72.0, 74.5],
  [78.0, 79.75],
];

// ─── 5. МОУШН-СЦЕНЫ В ЗОНАХ ────────────────────────────────────────────────
// Каждая сцена — декларативное описание. Движок превратит это в JSX.
export type SceneDef =
  | {
      kind: 'statement';
      from: number;   // seconds
      to: number;
      lines: string[];
      accentLineIndex?: number;
      bg?: string;
      fg?: string;
      showLine?: boolean;
      decor?: { tag?: string; index?: string };
    }
  | {
      kind: 'number';
      from: number;
      to: number;
      value: string;
      unit?: string;
      bg?: string;
      fg?: string;
      splitAt?: number;
      decor?: { tag?: string; index?: string };
    }
  | {
      kind: 'price';
      from: number;
      to: number;
      num: number;
      price: string;
      label?: string;
    }
  | {
      kind: 'spec-reveal';   // композит INSIDE → RYZEN → 32 GB
      from: number;
      to: number;
    };

export const SCENES: SceneDef[] = [
  // Zone A (0:08-0:12)
  {
    kind: 'statement',
    from: 8.0,
    to: 10.0,
    lines: ['THINNER THAN', 'iPHONE'],
    accentLineIndex: 1,
    decor: { tag: '[WEIGHT.G]', index: '750 / 12' },
  },
  {
    kind: 'statement',
    from: 10.0,
    to: 12.0,
    lines: ['NOT A KEYBOARD.', 'A COMPUTER.'],
    accentLineIndex: 1,
    decor: { tag: '[FORMAT.NEW]' },
  },

  // Zone B1 (0:16.5-0:22) — composite spec reveal
  { kind: 'spec-reveal', from: 16.5, to: 22.0 },

  // Zone B2 (0:22-0:26.5)
  {
    kind: 'number',
    from: 22.0,
    to: 23.9,
    value: '2TB',
    unit: 'NVMe SSD',
    bg: COLORS.fg,
    fg: COLORS.bg,
    splitAt: 1,
    decor: { tag: '[STOR.NVME]', index: '03 / 03' },
  },
  {
    kind: 'statement',
    from: 23.9,
    to: 26.5,
    lines: ['WORK PC', 'IN A', 'KEYBOARD'],
    accentLineIndex: 2,
    decor: { tag: '[CLASS.PRO]', index: '· ENTERPRISE ·' },
  },

  // Zone B3 (0:26.5-0:32.5)
  {
    kind: 'statement',
    from: 26.5,
    to: 29.5,
    lines: ['FLAT KEYS', 'MEMBRANE', 'THIN'],
    accentLineIndex: -1,
    decor: { tag: '[EXT.FEAT]', index: '03 / 04' },
  },
  {
    kind: 'statement',
    from: 29.5,
    to: 32.5,
    lines: ['COPILOT', 'KEY'],
    accentLineIndex: 0,
    bg: COLORS.accent,
    fg: COLORS.bg,
    showLine: false,
    decor: { tag: '[KEY.AI]', index: '04 / 04' },
  },

  // Zone C
  {
    kind: 'statement',
    from: 43.5,
    to: 46.5,
    lines: ['SPILL', 'RESISTANT'],
    accentLineIndex: 0,
    decor: { tag: '[IP.RATED]', index: 'H2O · SAFE' },
  },

  // Zone D
  {
    kind: 'statement',
    from: 72.0,
    to: 74.5,
    lines: ['NO PC.', 'NO LAPTOP.', 'JUST THIS.'],
    accentLineIndex: 2,
    decor: { tag: '[VERDICT]' },
  },

  // Zone E
  {
    kind: 'price',
    from: 78.0,
    to: 79.75,
    num: 1,
    price: '$1500',
    label: 'DOWNSIDE',
  },
];

// ─── 6. HERO-ТИТРЫ (вне зон, поверх видео) ────────────────────────────────
export const HEROES_CONFIG: HeroMoment[] = [
  { id: 1, startSec: 0.0, endSec: 2.0, text: 'JUST A KEYBOARD?', effect: 'typewriter-glitch' },
  { id: 2, startSec: 5.5, endSec: 7.9, text: 'HP ELITE BOARD G1', effect: 'slide-rotate' },
  { id: 7, startSec: 48.8, endSec: 51.2, text: 'BOOM. DESKTOP.', effect: 'zoom-punch' },
  { id: 9, startSec: 92.0, endSec: 94.5, text: 'GAME CHANGER', effect: 'stamp-drop' },
  { id: 10, startSec: 97.5, endSec: 101.5, text: 'SUBSCRIBE', effect: 'mask-wipe' },
];

// ─── 7. SFX КЬЮСЫ (time, file, volume, duration) ──────────────────────────
export type SfxCueConfig = { at: number; file: string; volume: number; durationSec?: number };

export const SFX_CUES_CONFIG: SfxCueConfig[] = [
  { at: 5.5, file: 'sfx/whoosh-trailer-1.wav', volume: 0.10, durationSec: 1.5 },
  { at: 8.0, file: 'sfx/whoosh-trailer-1.wav', volume: 0.12, durationSec: 1.5 },
  { at: 10.0, file: 'sfx/boom.mp3', volume: 0.28, durationSec: 2.5 },
  { at: 16.5, file: 'sfx/whoosh-rising-1.wav', volume: 0.30, durationSec: 2.0 },
  { at: 18.5, file: 'sfx/whoosh-punch-1.wav', volume: 0.28, durationSec: 1.2 },
  { at: 20.8, file: 'sfx/whoosh-punch-5.wav', volume: 0.28, durationSec: 1.2 },
  { at: 22.0, file: 'sfx/whoosh-small-1.wav', volume: 0.26, durationSec: 1.0 },
  { at: 26.5, file: 'sfx/whoosh-punch-1.wav', volume: 0.22, durationSec: 1.0 },
  { at: 29.5, file: 'sfx/boom.mp3', volume: 0.30, durationSec: 2.5 },
  { at: 43.5, file: 'sfx/swish-1.wav', volume: 0.32, durationSec: 1.5 },
  { at: 72.0, file: 'sfx/whoosh-trailer-5.wav', volume: 0.30, durationSec: 2.0 },
  { at: 78.0, file: 'sfx/hit.mp3', volume: 0.35, durationSec: 1.5 },
  { at: 48.8, file: 'sfx/boom.mp3', volume: 0.30, durationSec: 2.5 },
  { at: 92.0, file: 'sfx/hit.mp3', volume: 0.40, durationSec: 1.8 },
  { at: 98.0, file: 'sfx/piano-outro.wav', volume: 0.22, durationSec: 4.0 },
];

// ─── 8. ПОДСВЕТКА СЛОВ В СУБТИТРАХ ────────────────────────────────────────
export const CAPTION_HIGHLIGHTS = [
  'клавиатур', 'компьютер', 'usb-c', 'usbc', 'файлы', '1500',
  'omniboard', 'ryzen', 'ssd', 'copilot', 'копилот',
];
