import { spring, interpolate } from 'remotion';
import { SPRING } from './tokens';

export const scalePunch = (frame: number, startFrame: number, fps: number) => {
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING.punch,
  });
  return interpolate(progress, [0, 1], [1.4, 1.0]);
};

export const fadeIn = (frame: number, startFrame: number, durationFrames: number = 4) => {
  return interpolate(frame - startFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

export const cameraShake = (frame: number, amount: number = 3) => {
  const seed = frame * 7.1;
  return {
    x: Math.sin(seed) * amount * Math.cos(frame * 0.8),
    y: Math.cos(seed * 1.3) * amount * Math.sin(frame * 0.7),
  };
};

export const scrambleNumber = (
  frame: number,
  startFrame: number,
  targetValue: string,
  scrambleFrames: number = 6
): string => {
  const local = frame - startFrame;
  if (local < 0) return '';
  if (local >= scrambleFrames) return targetValue;
  const digits = '0123456789';
  return targetValue
    .split('')
    .map((ch) => {
      if (!/\d/.test(ch)) return ch;
      return digits[Math.floor(Math.random() * 10)];
    })
    .join('');
};

export const lineSweep = (frame: number, startFrame: number, durationFrames: number = 8) => {
  return interpolate(frame - startFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
