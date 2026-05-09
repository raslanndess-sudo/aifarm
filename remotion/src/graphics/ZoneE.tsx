import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 1:18 – 1:19.75 (1.75s) — макро Enter клавиша
// narrative: "downsides exist / 1500 bucks"

const START = 78.0;
const END = 79.75;

export const ZoneE: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.1, 0.25);

  const frameLocal = local * fps;

  const s = spring({ frame: frameLocal, fps, config: { damping: 5, stiffness: 250, mass: 0.5 } });
  const priceScale = interpolate(s, [0, 0.55, 1], [2.5, 0.85, 1]);
  const priceTy = interpolate(s, [0, 1], [-200, 0]);
  const rotation = interpolate(s, [0, 1], [-10, -6]);

  const shakeX = frameLocal < 10 ? Math.sin(frameLocal * 3) * interpolate(frameLocal, [0, 10], [14, 0]) : 0;

  // "downsides" tag small
  const dsOp = interpolate(local, [0.6, 0.9], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        paddingTop: 60,
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontFamily: FONTS.sub,
          fontSize: 32,
          fontWeight: 900,
          color: 'rgba(255,255,255,.75)',
          letterSpacing: '0.3em',
          marginBottom: 14,
          opacity: dsOp,
        }}
      >
        DOWNSIDE #1
      </div>

      <div
        style={{
          transform: `translate(${shakeX}px, ${priceTy}px) scale(${priceScale}) rotate(${rotation}deg)`,
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 4,
          padding: '20px 40px',
          background: 'white',
          color: 'black',
          boxShadow: '0 0 60px rgba(255,255,255,.3), 0 16px 60px rgba(0,0,0,.8)',
          borderRadius: 12,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.heroAlt,
            fontSize: 60,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          $
        </span>
        <span
          style={{
            fontFamily: FONTS.heroAlt,
            fontSize: 130,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          1500
        </span>
      </div>
    </AbsoluteFill>
  );
};
