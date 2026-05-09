import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 0:43.5 – 0:46.5 (3s) — леттербокс: чувак за столом
// narrative: "spill resistant / coffee in meeting"

const START = 43.5;
const END = 46.5;

export const ZoneC: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.2, 0.35);

  const frameLocal = local * fps;

  const s1 = spring({ frame: frameLocal, fps, config: { damping: 8, stiffness: 200 } });
  const spillScale = interpolate(s1, [0, 1], [0.3, 1]);
  const spillOp = interpolate(local, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  // "RESISTANT" drops in 0.6s later
  const resLocal = Math.max(0, local - 0.7);
  const resS = spring({ frame: resLocal * fps, fps, config: { damping: 7, stiffness: 220 } });
  const resTy = interpolate(resS, [0, 1], [-180, 0]);
  const resScale = interpolate(resS, [0, 0.55, 1], [2.4, 0.9, 1]);
  const resOp = interpolate(resLocal, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  // animated droplet — pulses + falls
  const dropPulse = 1 + Math.sin(local * 10) * 0.15;
  const ripple = interpolate(local, [0.3, 1.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        paddingTop: 50,
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      {/* droplet icon */}
      <div
        style={{
          position: 'relative',
          width: 120,
          height: 150,
          marginBottom: 10,
          opacity: spillOp,
          transform: `scale(${spillScale * dropPulse})`,
        }}
      >
        <svg viewBox="0 0 100 130" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 0 30px rgba(255,255,255,.4))' }}>
          <path
            d="M 50 5 C 50 5 10 60 10 90 C 10 112 28 125 50 125 C 72 125 90 112 90 90 C 90 60 50 5 50 5 Z"
            fill="white"
            stroke="none"
          />
        </svg>
        {/* ripple */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -20,
            width: 160 * ripple,
            height: 160 * ripple,
            transform: 'translateX(-50%)',
            border: '3px solid white',
            borderRadius: '50%',
            opacity: 1 - ripple,
          }}
        />
      </div>

      {/* "SPILL" */}
      <div
        style={{
          fontFamily: FONTS.heroAlt,
          fontSize: 120,
          color: 'white',
          letterSpacing: '-0.03em',
          lineHeight: 0.9,
          textAlign: 'center',
          opacity: spillOp,
          transform: `scale(${spillScale})`,
          textShadow: '0 6px 30px rgba(0,0,0,.95)',
        }}
      >
        SPILL
      </div>

      {/* "RESISTANT" */}
      <div
        style={{
          fontFamily: FONTS.hero,
          fontSize: 136,
          color: 'white',
          letterSpacing: '-0.02em',
          lineHeight: 0.9,
          textAlign: 'center',
          opacity: resOp,
          transform: `translateY(${resTy}px) scale(${resScale})`,
          textShadow: '0 6px 30px rgba(0,0,0,.95)',
          marginTop: -6,
        }}
      >
        RESISTANT
      </div>
    </AbsoluteFill>
  );
};
