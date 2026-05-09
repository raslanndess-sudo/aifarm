import React from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { scalePunch, cameraShake, lineSweep } from '../primitives';
import { DecorBackground } from './DecorBackground';

type DecorProps = {
  tag?: string;
  index?: string;
};

type Props = {
  lines: string[];
  accentLineIndex?: number;
  bg?: string;
  fg?: string;
  accent?: string;
  showLine?: boolean;
  decor?: DecorProps | false;
};

// подобрано так чтобы при scale 1.4 (пик punch) текст не вылезал за 720×1280
const fitFontSize = (lines: string[]): number => {
  const longest = Math.max(...lines.map((l) => l.length));
  if (longest <= 3) return 180;
  if (longest <= 5) return 140;
  if (longest <= 7) return 100;
  if (longest <= 9) return 78;
  if (longest <= 11) return 64;
  if (longest <= 13) return 56;
  if (longest <= 16) return 46;
  return 40;
};

export const FullBleedStatement: React.FC<Props> = ({
  lines,
  accentLineIndex = -1,
  bg = COLORS.bg,
  fg = COLORS.fg,
  accent = COLORS.accent,
  showLine = true,
  decor,
}) => {
  const variant = bg === COLORS.accent ? 'accent' : bg === COLORS.fg ? 'light' : 'dark';
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = scalePunch(frame, 0, fps);
  const shake = cameraShake(frame, frame < 6 ? 3 : 0);
  const sweep = lineSweep(frame, 2, 10);
  const size = fitFontSize(lines);

  return (
    <AbsoluteFill
      style={{ backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}
    >
      {decor && <DecorBackground variant={variant} tag={decor.tag} index={decor.index} />}
      <div
        style={{
          transform: `translate(${shake.x}px, ${shake.y}px) scale(${scale})`,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: fg,
          fontSize: size,
          lineHeight: 0.88,
          letterSpacing: '-3px',
          textAlign: 'center',
          textTransform: 'uppercase',
          padding: '0 40px',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ color: i === accentLineIndex ? accent : fg }}>
            {line}
          </div>
        ))}
      </div>
      {showLine && (
        <div
          style={{
            position: 'absolute',
            bottom: 160,
            left: '10%',
            width: '80%',
            height: 8,
            backgroundColor: accent,
            transform: `scaleX(${sweep})`,
            transformOrigin: 'left',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
