import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 0:22 – 0:26.5 (4.5s) — леттербокс: чувак за столом с лэптопом
// narrative: "spec sheet of my work PC / on the outside it looks ordinary"

const START = 22.0;
const END = 26.5;

export const ZoneB2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.2, 0.4);

  const frameLocal = local * fps;

  // "MY WORK PC" slides in from left, then is struck through
  const s1 = spring({ frame: frameLocal, fps, config: { damping: 11, stiffness: 160 } });
  const myTx = interpolate(s1, [0, 1], [-500, 0]);
  const myOp = interpolate(local, [0, 0.25], [0, 1], { extrapolateRight: 'clamp' });

  // arrow draws between (1.4-1.9s)
  const arrowProgress = interpolate(local, [1.4, 2.1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // "= KEYBOARD" stamps in (2-2.8s)
  const kbLocal = Math.max(0, local - 2.0);
  const kbS = spring({ frame: kbLocal * fps, fps, config: { damping: 6, stiffness: 240 } });
  const kbTy = interpolate(kbS, [0, 1], [140, 0]);
  const kbScale = interpolate(kbS, [0, 0.55, 1], [2.2, 0.9, 1]);
  const kbOp = interpolate(kbLocal, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        paddingTop: 50,
        alignItems: 'center',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* MY WORK PC */}
      <div
        style={{
          fontFamily: FONTS.hero,
          fontSize: 110,
          color: 'white',
          letterSpacing: '-0.02em',
          lineHeight: 0.9,
          textAlign: 'center',
          opacity: myOp,
          transform: `translateX(${myTx}px)`,
          textShadow: '0 6px 30px rgba(0,0,0,.95)',
        }}
      >
        MY WORK<br />PC
      </div>

      {/* giant "=" sign drawn/fading in */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 10,
          opacity: arrowProgress,
        }}
      >
        <div
          style={{
            width: 180,
            height: 14,
            background: 'white',
            boxShadow: '0 0 16px rgba(255,255,255,.6)',
            transformOrigin: 'left',
            transform: `scaleX(${arrowProgress})`,
          }}
        />
        <div
          style={{
            width: 180,
            height: 14,
            background: 'white',
            boxShadow: '0 0 16px rgba(255,255,255,.6)',
            transformOrigin: 'right',
            transform: `scaleX(${arrowProgress})`,
          }}
        />
      </div>

      {/* KEYBOARD stamp */}
      <div
        style={{
          fontFamily: FONTS.heroAlt,
          fontSize: 148,
          color: 'white',
          letterSpacing: '-0.03em',
          lineHeight: 0.9,
          textAlign: 'center',
          marginTop: 10,
          opacity: kbOp,
          transform: `translateY(${kbTy}px) scale(${kbScale})`,
          textShadow: '0 0 30px rgba(255,255,255,.25), 0 8px 40px rgba(0,0,0,.95)',
        }}
      >
        KEYBOARD
      </div>
    </AbsoluteFill>
  );
};
