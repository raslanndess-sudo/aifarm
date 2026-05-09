import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

loadUnbounded(undefined, { weights: ['800', '900'], subsets: ['cyrillic', 'latin'] });
loadJetBrainsMono(undefined, { weights: ['700'], subsets: ['cyrillic', 'latin'] });

export const COLORS = {
  bg: '#000000',
  fg: '#FFFFFF',
  accent: '#14E0C5',
  accentDark: '#0B8A78',
  accentBright: '#5CF0DC',
} as const;

export const FONTS = {
  display: 'Unbounded',
  displayFallback: 'Archivo Black',
  caption: 'Unbounded',
  mono: 'JetBrains Mono',
} as const;

// Ремарка: базовая композиция 24fps. Бриф написан в ЗДУ 30fps (frame-единицы).
// Пересчёт: brief_frames * 24 / 30. Оставляю такие же значения (брутальный ритм не критичен к точности).
export const TIMING = {
  statement: 14,  // ~0.6s @ 24fps
  quick: 10,      // ~0.4s
  hold: 17,       // ~0.7s
  shake: 3,
  scramble: 6,
} as const;

export const SPRING = {
  punch: { damping: 14, stiffness: 300, mass: 0.6 },
  soft: { damping: 20, stiffness: 200, mass: 1.0 },
} as const;
