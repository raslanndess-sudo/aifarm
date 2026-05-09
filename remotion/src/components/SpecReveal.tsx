import React from 'react';
import { Sequence, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { FullBleedStatement } from './FullBleedStatement';
import { NumberPunch } from './NumberPunch';
import { DecorBackground } from './DecorBackground';
import { COLORS, FONTS } from '../tokens';

// Общая длина зоны = 5.5 сек (16.5-22.0).
// Sync под голос:
//   18.52-21.00 — "Inside, AMD Ryzen AI 300 series"
//   21.00-23.52 — "Up to 32 gigs of RAM, up to two terabytes of SSD"
// Относительно начала зоны (16.5s): Ryzen = 2.0-4.5, RAM/SSD = 4.5+
// SpecReveal активен 0..5.5s локально = 0..132 frames @24fps.

// Intro-кадр: 0..2с — INSIDE + teaser specs
const IntroFrame: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ry = interpolate(frame, [0, 12], [40, 0], { extrapolateRight: 'clamp' });
  const op = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const flicker = Math.floor(frame / 3) % 2 === 0 ? 1 : 0.4;

  return (
    <AbsoluteFill style={{ background: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
      <DecorBackground variant="dark" tag="[BOOT.SEQ]" index="00 / 03" />
      <div style={{ transform: `translateY(${ry}px)`, opacity: op, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 22,
            letterSpacing: '6px',
            color: COLORS.accent,
            opacity: flicker,
          }}
        >
          ◆ INITIALIZE
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 120,
            fontWeight: 900,
            color: COLORS.fg,
            letterSpacing: '-2px',
            lineHeight: 0.9,
            marginTop: 10,
          }}
        >
          INSIDE
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: FONTS.mono,
            fontSize: 18,
            letterSpacing: '4px',
            color: COLORS.accent,
          }}
        >
          · CPU · MEM · STORAGE ·
        </div>
      </div>
    </AbsoluteFill>
  );
};

// RYZEN — 2.0-4.5s (от локального 0): 48-108 frames
const RyzenFrame: React.FC = () => (
  <FullBleedStatement
    lines={['RYZEN', 'AI 300']}
    accentLineIndex={1}
    bg={COLORS.bg}
    fg={COLORS.fg}
    accent={COLORS.accent}
    decor={{ tag: '[CPU.PROC]', index: '01 / 03' }}
  />
);

// 32 GB RAM — 4.5-5.5s + extend
const RamFrame: React.FC = () => (
  <NumberPunch
    value="32"
    unit="GB RAM"
    bg={COLORS.accent}
    fg={COLORS.bg}
    decor={{ tag: '[MEM.DDR5]', index: '02 / 03' }}
  />
);

// 2TB — последний. Его 2TB в голосе на ~22.5s — это уже в зоне B2. Ок, SpecReveal расширю за пределы.
const SsdFrame: React.FC = () => (
  <NumberPunch
    value="2TB"
    unit="NVMe SSD"
    bg={COLORS.fg}
    fg={COLORS.bg}
    splitAt={1}
    accent={COLORS.accent}
    decor={{ tag: '[STOR.NVME]', index: '03 / 03' }}
  />
);

export const SpecReveal: React.FC = () => {
  // Распределение по 5.5s (132 frames @24fps):
  // 0-2.0s (0-48) — IntroFrame "INSIDE"
  // 2.0-4.2s (48-100) — Ryzen AI 300
  // 4.2-5.5s (100-132) — RAM 32 (2TB покажем в следующем зонесоне)
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={48}>
        <IntroFrame />
      </Sequence>
      <Sequence from={48} durationInFrames={52}>
        <RyzenFrame />
      </Sequence>
      <Sequence from={100} durationInFrames={40}>
        <RamFrame />
      </Sequence>
    </AbsoluteFill>
  );
};

// Отдельный компонент для 2TB кадра — будет в B2 зоне (22.0+)
export const SsdRevealFrame = SsdFrame;
