import { interpolate } from 'remotion';

export const fadeInOut = (t: number, start: number, end: number, fadeIn = 0.3, fadeOut = 0.4) => {
  if (t < start || t > end) return 0;
  const into = t - start;
  const outo = end - t;
  if (into < fadeIn) return interpolate(into, [0, fadeIn], [0, 1]);
  if (outo < fadeOut) return interpolate(outo, [0, fadeOut], [0, 1]);
  return 1;
};

export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
