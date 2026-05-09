import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { FONTS } from '../fonts';
import { fadeInOut } from './zoneUtils';

// 0:26.5 – 0:32.5 (6s) — клава сбоку, верх чёрный
// narrative: "flat keys, membrane switches, thin profile / copilot key"

const START = 26.5;
const END = 32.5;

type Feature = {
  label: string;
  appearAt: number;
  highlight?: boolean;
};

const FEATURES: Feature[] = [
  { label: 'FLAT KEYS', appearAt: 0.2 },
  { label: 'MEMBRANE', appearAt: 1.0 },
  { label: 'THIN', appearAt: 1.8 },
  { label: 'COPILOT KEY', appearAt: 3.0, highlight: true },
];

export const ZoneB3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < START || t > END) return null;

  const local = t - START;
  const op = fadeInOut(t, START, END, 0.2, 0.4);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: op,
        paddingTop: 40,
        paddingLeft: 30,
        paddingRight: 30,
        alignItems: 'flex-start',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {FEATURES.map((f, i) => {
        const visible = local > f.appearAt;
        const itemLocal = Math.max(0, local - f.appearAt);
        const itemFrame = itemLocal * fps;

        const s = spring({ frame: itemFrame, fps, config: { damping: 11, stiffness: 170 } });
        const tx = interpolate(s, [0, 1], [-600, 0]);
        const itemOp = interpolate(itemFrame, [0, 5], [0, 1], { extrapolateRight: 'clamp' });

        const highlightScale = f.highlight
          ? interpolate(itemFrame, [0, 8, 14, 22], [0.5, 1.18, 1.0, 1.05], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;

        if (!visible) return null;

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              transform: `translateX(${tx}px) scale(${highlightScale})`,
              opacity: itemOp,
              transformOrigin: 'left',
            }}
          >
            {/* check box */}
            <div
              style={{
                width: f.highlight ? 58 : 46,
                height: f.highlight ? 58 : 46,
                borderRadius: 8,
                background: f.highlight ? 'white' : 'rgba(255,255,255,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'black',
                fontSize: f.highlight ? 34 : 26,
                fontWeight: 900,
                fontFamily: FONTS.sub,
                boxShadow: f.highlight ? '0 0 30px rgba(255,255,255,.6)' : 'none',
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontFamily: f.highlight ? FONTS.heroAlt : FONTS.hero,
                fontSize: f.highlight ? 88 : 70,
                color: 'white',
                letterSpacing: '-0.02em',
                lineHeight: 0.95,
                textShadow: f.highlight
                  ? '0 0 20px rgba(255,255,255,.3), 0 4px 20px rgba(0,0,0,.95)'
                  : '0 3px 16px rgba(0,0,0,.9)',
              }}
            >
              {f.label}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
