import React from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { scalePunch, cameraShake } from '../primitives';
import { DecorBackground } from './DecorBackground';

type Props = {
  num: number;
  price: string;
  label?: string;
  decor?: boolean;
};

export const PriceCard: React.FC<Props> = ({ num, price, label = 'МИНУС', decor = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = scalePunch(frame, 0, fps);
  const shake = cameraShake(frame, frame < 6 ? 3 : 0);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {decor && <DecorBackground variant="dark" tag="[PRICE.USD]" index="−01" />}
      <div
        style={{
          transform: `translate(${shake.x}px, ${shake.y}px) scale(${scale})`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: FONTS.mono,
            fontWeight: 700,
            color: COLORS.accent,
            fontSize: 40,
            letterSpacing: '8px',
            marginBottom: 22,
            textTransform: 'uppercase',
          }}
        >
          ◆ {label} #{num}
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontWeight: 900,
            color: COLORS.fg,
            fontSize: 190,
            lineHeight: 1,
            letterSpacing: '-10px',
          }}
        >
          {price}
        </div>
      </div>
    </AbsoluteFill>
  );
};
