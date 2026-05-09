import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 1:12 – 1:14.5 (2.5s) — клава с брызгами/пылью, кинематограф
// narrative: "don't need mini PC / don't need laptop / you need this"

const START = 72.0;
const END = 74.5;

type Line = {
  text: string;
  appearAt: number;
  strike: boolean;
  highlight?: boolean;
};

const LINES: Line[] = [
  { text: 'NO PC.', appearAt: 0.0, strike: true },
  { text: 'NO LAPTOP.', appearAt: 0.5, strike: true },
  { text: 'JUST THIS.', appearAt: 1.0, strike: false, highlight: true },
];

export const ZoneD: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.15, 0.3);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        paddingTop: 60,
        alignItems: 'flex-start',
        paddingLeft: 30,
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {LINES.map((line, i) => {
        if (local < line.appearAt) return null;
        const lineLocal = local - line.appearAt;
        const lineFrame = lineLocal * fps;

        const s = spring({ frame: lineFrame, fps, config: { damping: 10, stiffness: 180 } });
        const tx = interpolate(s, [0, 1], [-400, 0]);
        const lineOp = interpolate(lineFrame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });

        const strikeProgress = line.strike
          ? interpolate(lineLocal, [0.25, 0.6], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 0;

        const highlightScale = line.highlight
          ? interpolate(lineFrame, [0, 8, 14], [0.7, 1.2, 1.0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;

        return (
          <div
            key={i}
            style={{
              position: 'relative',
              display: 'inline-block',
              fontFamily: line.highlight ? FONTS.heroAlt : FONTS.hero,
              fontSize: line.highlight ? 120 : 88,
              color: line.strike ? 'rgba(255,255,255,0.65)' : 'white',
              letterSpacing: '-0.02em',
              lineHeight: 0.9,
              transform: `translateX(${tx}px) scale(${highlightScale})`,
              transformOrigin: 'left',
              opacity: lineOp,
              textShadow: line.highlight
                ? '0 0 30px rgba(255,255,255,.4), 0 6px 30px rgba(0,0,0,.95)'
                : '0 4px 20px rgba(0,0,0,.95)',
            }}
          >
            {line.text}
            {line.strike && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '55%',
                  height: 10,
                  background: 'white',
                  transformOrigin: 'left',
                  transform: `scaleX(${strikeProgress}) rotate(-3deg)`,
                  boxShadow: '0 0 16px rgba(255,255,255,.6)',
                }}
              />
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
