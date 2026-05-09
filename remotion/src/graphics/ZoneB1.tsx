import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 0:16.5 – 0:22 (5.5s) — клава сбоку, верх чёрный
// narrative: "Inside, AMD Ryzen AI 300 / 32GB RAM / 2TB SSD"

const START = 16.5;
const END = 22.0;

export const ZoneB1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.2, 0.5);

  const insideFrame = local * fps;
  const insideS = spring({ frame: insideFrame, fps, config: { damping: 10, stiffness: 150 } });
  const insideTx = interpolate(insideS, [0, 1], [-400, 0]);
  const insideOp = interpolate(local, [0, 0.3, 1.2, 1.8], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // "RYZEN AI 300" huge
  const ryzenLocal = Math.max(0, local - 0.3);
  const ryzenFrame = ryzenLocal * fps;
  const ryzenS = spring({ frame: ryzenFrame, fps, config: { damping: 12, stiffness: 180 } });
  const ryzenScale = interpolate(ryzenS, [0, 1], [0.3, 1]);
  const ryzenOp = interpolate(ryzenLocal, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  // RAM counter
  const ramLocal = Math.max(0, local - 1.8);
  const ramS = spring({ frame: ramLocal * fps, fps, config: { damping: 11, stiffness: 160 } });
  const ramTy = interpolate(ramS, [0, 1], [-80, 0]);
  const ramCount = Math.round(interpolate(ramLocal, [0, 0.9], [0, 32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));
  const ramOp = interpolate(ramLocal, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  // SSD counter
  const ssdLocal = Math.max(0, local - 2.8);
  const ssdS = spring({ frame: ssdLocal * fps, fps, config: { damping: 11, stiffness: 160 } });
  const ssdTy = interpolate(ssdS, [0, 1], [-80, 0]);
  const ssdCount = (Math.round(interpolate(ssdLocal, [0, 0.9], [0, 2.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }) * 10) / 10).toFixed(1);
  const ssdOp = interpolate(ssdLocal, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

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
      {/* "INSIDE" banner */}
      <div
        style={{
          fontFamily: FONTS.sub,
          fontSize: 42,
          fontWeight: 900,
          color: 'white',
          letterSpacing: '0.4em',
          opacity: insideOp,
          transform: `translateX(${insideTx}px)`,
          textShadow: '0 0 20px rgba(0,0,0,.9)',
          paddingLeft: '0.4em',
        }}
      >
        INSIDE
      </div>

      {/* RYZEN AI 300 */}
      <div
        style={{
          fontFamily: FONTS.heroAlt,
          fontSize: 108,
          color: 'white',
          letterSpacing: '-0.03em',
          lineHeight: 0.92,
          textAlign: 'center',
          marginTop: 14,
          opacity: ryzenOp,
          transform: `scale(${ryzenScale})`,
          textShadow: '0 6px 30px rgba(0,0,0,.95)',
        }}
      >
        RYZEN AI<br />300
      </div>

      {/* Two counters row */}
      <div
        style={{
          display: 'flex',
          gap: 40,
          marginTop: 20,
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {/* RAM */}
        <div
          style={{
            transform: `translateY(${ramTy}px)`,
            opacity: ramOp,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONTS.hero,
              fontSize: 160,
              color: 'white',
              letterSpacing: '-0.03em',
              lineHeight: 0.9,
              textShadow: '0 6px 30px rgba(0,0,0,.95)',
            }}
          >
            {ramCount}
          </div>
          <div
            style={{
              fontFamily: FONTS.sub,
              fontSize: 30,
              fontWeight: 900,
              color: 'white',
              letterSpacing: '0.25em',
              marginTop: -4,
            }}
          >
            GB RAM
          </div>
        </div>

        {/* divider */}
        <div
          style={{
            width: 2,
            alignSelf: 'stretch',
            background: 'rgba(255,255,255,0.25)',
            opacity: ssdOp,
          }}
        />

        {/* SSD */}
        <div
          style={{
            transform: `translateY(${ssdTy}px)`,
            opacity: ssdOp,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONTS.hero,
              fontSize: 160,
              color: 'white',
              letterSpacing: '-0.03em',
              lineHeight: 0.9,
              textShadow: '0 6px 30px rgba(0,0,0,.95)',
            }}
          >
            {ssdCount}
          </div>
          <div
            style={{
              fontFamily: FONTS.sub,
              fontSize: 30,
              fontWeight: 900,
              color: 'white',
              letterSpacing: '0.25em',
              marginTop: -4,
            }}
          >
            TB SSD
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
