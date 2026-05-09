import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from 'remotion';
import { COLORS, FONTS } from '../tokens';
import { lineSweep } from '../primitives';

type Props = {
  variant?: 'dark' | 'accent' | 'light';
  tag?: string;
  index?: string;
  showGrid?: boolean;
  showCorners?: boolean;
  showScanLine?: boolean;
};

export const DecorBackground: React.FC<Props> = ({
  variant = 'dark',
  tag,
  index,
  showGrid = true,
  showCorners = true,
  showScanLine = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textColor =
    variant === 'dark' ? COLORS.accent : variant === 'accent' ? COLORS.bg : COLORS.bg;
  const lineColor = textColor;

  // scan-line зациклена — каждые 2.5 сек сверху-вниз
  const cycleLen = fps * 2.5;
  const cycle = frame % cycleLen;
  const scanY = interpolate(cycle, [0, cycleLen], [-20, 620]);
  const scanOp = interpolate(cycle, [0, 4, cycleLen * 0.85, cycleLen], [0, 0.55, 0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // grid дрейфует очень медленно — заметное но не отвлекающее движение
  const gridShiftX = (frame * 0.25) % 28;
  const gridShiftY = (frame * 0.15) % 28;

  // дыхание — мягкое пульсирование на кронштейнах и декоре
  const pulse = 0.85 + Math.sin(frame * 0.14) * 0.15;

  const bracketSweep = lineSweep(frame, 0, 10);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {showGrid && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(circle, ${lineColor}22 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
            backgroundPosition: `${gridShiftX}px ${gridShiftY}px`,
            opacity: 0.85,
          }}
        />
      )}

      {showScanLine && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: scanY,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${lineColor}, transparent)`,
            opacity: scanOp,
          }}
        />
      )}

      {/* второй медленный scan-line в противофазе */}
      {showScanLine && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: interpolate(((frame + cycleLen / 2) % cycleLen), [0, cycleLen], [-20, 620]),
            height: 1,
            background: lineColor,
            opacity: 0.15,
          }}
        />
      )}

      {showCorners && (
        <>
          {['tl', 'tr', 'bl', 'br'].map((pos) => {
            const base: React.CSSProperties = {
              position: 'absolute',
              width: 36,
              height: 36,
              transformOrigin: pos.includes('l')
                ? pos.includes('t') ? 'top left' : 'bottom left'
                : pos.includes('t') ? 'top right' : 'bottom right',
              transform: `scale(${bracketSweep * pulse})`,
            };
            if (pos === 'tl')
              return <div key={pos} style={{ ...base, top: 18, left: 18, borderTop: `3px solid ${lineColor}`, borderLeft: `3px solid ${lineColor}` }} />;
            if (pos === 'tr')
              return <div key={pos} style={{ ...base, top: 18, right: 18, borderTop: `3px solid ${lineColor}`, borderRight: `3px solid ${lineColor}` }} />;
            if (pos === 'bl')
              return <div key={pos} style={{ ...base, bottom: 18, left: 18, borderBottom: `3px solid ${lineColor}`, borderLeft: `3px solid ${lineColor}` }} />;
            return <div key={pos} style={{ ...base, bottom: 18, right: 18, borderBottom: `3px solid ${lineColor}`, borderRight: `3px solid ${lineColor}` }} />;
          })}
        </>
      )}

      {tag && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: 64,
            fontFamily: FONTS.mono,
            fontWeight: 700,
            color: lineColor,
            fontSize: 16,
            letterSpacing: '2px',
            opacity: bracketSweep,
          }}
        >
          {tag}
          <span style={{ opacity: Math.floor(frame / 6) % 2 === 0 ? 1 : 0, marginLeft: 4 }}>▮</span>
        </div>
      )}

      {index && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            right: 64,
            fontFamily: FONTS.mono,
            fontWeight: 700,
            color: lineColor,
            fontSize: 16,
            letterSpacing: '2px',
            opacity: bracketSweep,
          }}
        >
          {index}
        </div>
      )}
    </AbsoluteFill>
  );
};
