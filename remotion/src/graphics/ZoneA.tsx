import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 0:08 – 0:12 (4s) — летербокс: парень с мик снизу, верх ЧЁРНЫЙ
// narrative: "thinner than an iPhone / it's not a keyboard, it's a computer"

const START = 8.0;
const END = 12.0;

export const ZoneA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.25, 0.35);

  // Phase 1: "THINNER THAN" + "AN iPHONE" (0-1.5s)
  // Phase 2: transition (1.5-2s)
  // Phase 3: "NOT A" + "KEYBOARD" + strikethrough (2-3s)
  // Phase 4: "A COMPUTER." stamp (3-4s)

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 60,
      }}
    >
      {local < 2.2 ? <Phase1 local={local} fps={fps} /> : <Phase2 local={local - 2.2} fps={fps} />}
    </AbsoluteFill>
  );
};

const Phase1: React.FC<{ local: number; fps: number }> = ({ local, fps }) => {
  const frame = local * fps;
  const s1 = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const tx = interpolate(s1, [0, 1], [-500, 0]);

  const s2 = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 10, stiffness: 160 } });
  const tx2 = interpolate(s2, [0, 1], [500, 0]);
  const scale2 = interpolate(s2, [0, 0.5, 1], [1.8, 0.95, 1]);

  const lineW = interpolate(local, [0.9, 1.7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const outO = interpolate(local, [1.9, 2.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ opacity: outO }}>
      <div
        style={{
          fontFamily: FONTS.hero,
          fontSize: 90,
          color: 'white',
          letterSpacing: '-0.01em',
          lineHeight: 0.88,
          textAlign: 'center',
          transform: `translateX(${tx}px)`,
          textShadow: '0 4px 24px rgba(0,0,0,.9)',
        }}
      >
        THINNER<br />THAN AN
      </div>
      <div
        style={{
          fontFamily: FONTS.heroAlt,
          fontSize: 160,
          color: 'white',
          letterSpacing: '-0.03em',
          lineHeight: 0.9,
          textAlign: 'center',
          marginTop: -10,
          transform: `translateX(${tx2}px) scale(${scale2})`,
          textShadow: '0 6px 30px rgba(0,0,0,.95)',
          position: 'relative',
          display: 'inline-block',
        }}
      >
        iPHONE
        <div
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            top: '50%',
            height: 10,
            background: 'white',
            transformOrigin: 'left',
            transform: `scaleX(${lineW}) rotate(-5deg)`,
            boxShadow: '0 0 20px rgba(255,255,255,.6)',
          }}
        />
      </div>
    </div>
  );
};

const Phase2: React.FC<{ local: number; fps: number }> = ({ local, fps }) => {
  const frame = local * fps;

  // "NOT A KEYBOARD" appears (0-0.4s), then strikethrough (0.4-0.8s)
  // "IT'S A COMPUTER." stamps in (0.8-1.6s)
  const s1 = spring({ frame, fps, config: { damping: 11, stiffness: 170 } });
  const topOpacity = interpolate(local, [0, 0.3, 1.0, 1.4], [0, 1, 1, 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const topScale = interpolate(s1, [0, 1], [1.2, 1]);

  const strikeProgress = interpolate(local, [0.35, 0.75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const stampFrame = Math.max(0, frame - 18);
  const s2 = spring({ frame: stampFrame, fps, config: { damping: 6, stiffness: 240 } });
  const stampTy = interpolate(s2, [0, 1], [-200, 0]);
  const stampScale = interpolate(s2, [0, 0.55, 1], [2.2, 0.9, 1]);
  const stampOp = interpolate(stampFrame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <>
      <div
        style={{
          fontFamily: FONTS.hero,
          fontSize: 100,
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: '-0.01em',
          textAlign: 'center',
          lineHeight: 0.9,
          transform: `scale(${topScale})`,
          opacity: topOpacity,
          position: 'relative',
          display: 'inline-block',
          textShadow: '0 4px 20px rgba(0,0,0,.9)',
        }}
      >
        NOT A<br />KEYBOARD
        <div
          style={{
            position: 'absolute',
            left: '5%',
            right: '5%',
            top: '74%',
            height: 14,
            background: 'white',
            transformOrigin: 'left',
            transform: `scaleX(${strikeProgress}) rotate(-4deg)`,
            boxShadow: '0 0 24px rgba(255,255,255,.8)',
          }}
        />
      </div>

      <div
        style={{
          fontFamily: FONTS.heroAlt,
          fontSize: 136,
          color: 'white',
          letterSpacing: '-0.03em',
          textAlign: 'center',
          lineHeight: 0.9,
          marginTop: 8,
          transform: `translateY(${stampTy}px) scale(${stampScale})`,
          opacity: stampOp,
          textShadow: '0 0 30px rgba(255,255,255,.3), 0 8px 40px rgba(0,0,0,.95)',
        }}
      >
        A COMPUTER.
      </div>
    </>
  );
};
