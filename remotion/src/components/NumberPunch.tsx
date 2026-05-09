import React from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { scalePunch, scrambleNumber, cameraShake } from '../primitives';
import { DecorBackground } from './DecorBackground';

type Props = {
  value: string;
  unit?: string;
  bg?: string;
  fg?: string;
  splitAt?: number;
  accent?: string;
  decor?: { tag?: string; index?: string } | false;
};

// так чтобы при scale 1.4 ширина не превышала 720 * 0.85
const fitFontSize = (value: string): number => {
  const len = value.length;
  if (len <= 2) return 340;
  if (len === 3) return 230;
  if (len === 4) return 180;
  if (len === 5) return 150;
  return 130;
};

const fitLetterSpacing = (value: string): string => {
  const len = value.length;
  if (len <= 2) return '-18px';
  if (len === 3) return '-14px';
  if (len === 4) return '-10px';
  return '-6px';
};

export const NumberPunch: React.FC<Props> = ({
  value,
  unit,
  bg = COLORS.accent,
  fg = COLORS.bg,
  splitAt,
  accent = COLORS.accent,
  decor,
}) => {
  const variant = bg === COLORS.accent ? 'accent' : bg === COLORS.fg ? 'light' : 'dark';
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = scalePunch(frame, 0, fps);
  const shake = cameraShake(frame, frame < 6 ? 4 : 0);
  const displayValue = scrambleNumber(frame, 0, value, 6);
  const size = fitFontSize(value);
  const ls = fitLetterSpacing(value);

  const renderValue = () => {
    if (splitAt === undefined) return displayValue;
    const a = displayValue.slice(0, splitAt);
    const b = displayValue.slice(splitAt);
    return (
      <>
        <span style={{ color: fg }}>{a}</span>
        <span style={{ color: accent }}>{b}</span>
      </>
    );
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {decor && <DecorBackground variant={variant} tag={decor.tag} index={decor.index} />}
      <div
        style={{
          transform: `translate(${shake.x}px, ${shake.y}px) scale(${scale})`,
          fontFamily: FONTS.display,
          fontWeight: 900,
          color: fg,
          fontSize: size,
          lineHeight: 0.82,
          letterSpacing: ls,
          textAlign: 'center',
          padding: '0 20px',
        }}
      >
        {renderValue()}
      </div>
      {unit && (
        <div
          style={{
            marginTop: 24,
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: fg,
            fontSize: 44,
            letterSpacing: '6px',
            textTransform: 'uppercase',
          }}
        >
          {unit}
        </div>
      )}
    </AbsoluteFill>
  );
};
