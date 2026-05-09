import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { TRANSCRIPT } from '../data/transcript';
import { secToFrame } from '../data/heroes';
import { FONTS } from '../fonts';
import { HEROES_CONFIG, LETTERBOX_RANGES } from '../videoConfig';

const isInHeroWindow = (sec: number): boolean => {
  return HEROES_CONFIG.some((h) => sec >= h.startSec && sec <= h.endSec);
};

const inLetterbox = (t: number): boolean =>
  LETTERBOX_RANGES.some(([a, b]) => t >= a && t < b);

type EnterStyle = 'pop' | 'slide-up' | 'blur-in' | 'stretch-y';

const pickStyle = (wordStartSec: number): EnterStyle => {
  const seed = Math.floor(wordStartSec * 97.3) % 4;
  if (seed === 0) return 'pop';
  if (seed === 1) return 'slide-up';
  if (seed === 2) return 'blur-in';
  return 'stretch-y';
};

export const ConstantSubtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;

  const activeWord = TRANSCRIPT.words.find(
    (w) => time >= w.start && time < w.end
  );

  if (!activeWord) return null;
  if (isInHeroWindow(time)) return null;

  const wordStartFrame = secToFrame(activeWord.start);
  const localFrame = frame - wordStartFrame;
  const style = pickStyle(activeWord.start);

  // Позиция: low (дефолт) или top (в летербоксе где лицо в низу)
  const isTop = inLetterbox(time);

  let transform = '';
  let opacity = 1;
  let filter = 'none';

  if (style === 'pop') {
    const s = interpolate(localFrame, [0, 3, 5], [0.7, 1.15, 1.0], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    transform = `scale(${s})`;
    opacity = interpolate(localFrame, [0, 2], [0, 1], { extrapolateRight: 'clamp' });
  } else if (style === 'slide-up') {
    const ty = interpolate(localFrame, [0, 5], [30, 0], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    transform = `translateY(${ty}px)`;
    opacity = interpolate(localFrame, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  } else if (style === 'blur-in') {
    const b = interpolate(localFrame, [0, 4], [10, 0], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
    });
    filter = `blur(${b}px)`;
    opacity = interpolate(localFrame, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  } else if (style === 'stretch-y') {
    const sx = interpolate(localFrame, [0, 4, 6], [1.6, 0.9, 1.0], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    const sy = interpolate(localFrame, [0, 4, 6], [0.5, 1.15, 1.0], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    transform = `scaleX(${sx}) scaleY(${sy})`;
    opacity = interpolate(localFrame, [0, 2], [0, 1], { extrapolateRight: 'clamp' });
  }

  const cleanWord = activeWord.word.replace(/[.,!?;:]$/g, '').toUpperCase();

  // В летербоксе: маленький размер, сверху тёмной области
  // Обычно: крупный, снизу над лицом безопасно
  const fontSize = isTop ? 44 : 60;

  const outerStyle: React.CSSProperties = isTop
    ? {
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 50,
      }
    : {
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 200,
      };

  return (
    <AbsoluteFill style={{ ...outerStyle, pointerEvents: 'none' }}>
      <div
        style={{
          fontFamily: FONTS.sub,
          fontWeight: 900,
          fontSize,
          color: 'white',
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          textShadow:
            '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 4px 14px rgba(0,0,0,.9)',
          transform,
          opacity,
          filter,
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        {cleanWord}
      </div>
    </AbsoluteFill>
  );
};
