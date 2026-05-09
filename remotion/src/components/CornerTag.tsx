import React from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { fadeIn } from '../primitives';

type Props = {
  text: string;
  corner?: 'tl' | 'tr' | 'bl' | 'br';
};

export const CornerTag: React.FC<Props> = ({ text, corner = 'tl' }) => {
  const frame = useCurrentFrame();
  const op = fadeIn(frame, 0, 5);

  const posStyle: React.CSSProperties = {};
  if (corner === 'tl') Object.assign(posStyle, { top: 60, left: 30 });
  if (corner === 'tr') Object.assign(posStyle, { top: 60, right: 30 });
  if (corner === 'bl') Object.assign(posStyle, { bottom: 60, left: 30 });
  if (corner === 'br') Object.assign(posStyle, { bottom: 60, right: 30 });

  return (
    <div
      style={{
        position: 'absolute',
        ...posStyle,
        fontFamily: FONTS.mono,
        fontWeight: 700,
        fontSize: 26,
        color: COLORS.accent,
        letterSpacing: '2px',
        opacity: op,
        background: 'rgba(0,0,0,0.55)',
        padding: '6px 12px',
        border: `1px solid ${COLORS.accent}`,
        borderRadius: 4,
      }}
    >
      {text}
    </div>
  );
};
