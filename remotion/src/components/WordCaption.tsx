import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { scalePunch } from '../primitives';

type Props = {
  word: string;
  highlight?: boolean;
};

const fitFontSize = (word: string): number => {
  const len = word.length;
  if (len <= 4) return 110;
  if (len <= 7) return 90;
  if (len <= 10) return 74;
  if (len <= 13) return 62;
  return 52;
};

export const WordCaption: React.FC<Props> = ({ word, highlight = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = scalePunch(frame, 0, fps);
  const size = fitFontSize(word);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '28%',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          fontFamily: FONTS.display,
          fontWeight: 900,
          fontSize: size,
          color: highlight ? COLORS.bg : COLORS.fg,
          backgroundColor: highlight ? COLORS.accent : 'transparent',
          padding: highlight ? '10px 26px' : '0',
          WebkitTextStroke: highlight ? '0' : `5px ${COLORS.bg}`,
          textTransform: 'uppercase',
          letterSpacing: '-2px',
          lineHeight: 1,
          textShadow: highlight ? '0 0 20px rgba(20,224,197,.4)' : 'none',
        }}
      >
        {word}
      </div>
    </div>
  );
};
