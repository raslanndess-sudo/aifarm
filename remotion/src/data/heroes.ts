export type HeroEffect =
  | 'typewriter-glitch'
  | 'slide-rotate'
  | 'flip-stamp'
  | 'zoom-punch'
  | 'split-slide'
  | 'mask-wipe'
  | 'stamp-drop'
  | 'flip3d';

export type HeroMoment = {
  id: number;
  startSec: number;
  endSec: number;
  text: string;
  sublabel?: string;
  effect: HeroEffect;
  sfx?: string[];
};

// Только hero НЕ перекрывающие черные зоны (А/B1/B2/B3/C/D/E сами заполняют пространство)
export const HEROES: HeroMoment[] = [
  {
    id: 1,
    startSec: 0.0,
    endSec: 2.0,
    text: 'JUST A KEYBOARD?',
    effect: 'typewriter-glitch',
    sfx: [],
  },
  {
    id: 2,
    startSec: 5.5,
    endSec: 7.9,
    text: 'HP ELITE BOARD G1',
    effect: 'slide-rotate',
    sfx: ['sfx/whoosh-trailer-1.wav'],
  },
  {
    id: 7,
    startSec: 48.8,
    endSec: 51.2,
    text: 'BOOM. DESKTOP.',
    effect: 'zoom-punch',
    sfx: ['sfx/boom.mp3'],
  },
  {
    id: 9,
    startSec: 92.0,
    endSec: 94.5,
    text: 'GAME CHANGER',
    effect: 'stamp-drop',
    sfx: ['sfx/hit.mp3'],
  },
  {
    id: 10,
    startSec: 97.5,
    endSec: 101.5,
    text: 'SUBSCRIBE',
    effect: 'mask-wipe',
    sfx: [],
  },
];

// Чёрные зоны — чтобы не показывать субтитры поверх графики
export const ZONE_WINDOWS: Array<[number, number]> = [
  [8.0, 12.0],
  [16.5, 22.0],
  [22.0, 26.5],
  [26.5, 32.5],
  [43.5, 46.5],
  [72.0, 74.5],
  [78.0, 79.75],
];

export const FPS = 24;

export const secToFrame = (sec: number): number => Math.round(sec * FPS);
