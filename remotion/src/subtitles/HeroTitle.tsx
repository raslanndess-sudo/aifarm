import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { HeroMoment, secToFrame } from '../data/heroes';
import { FONTS } from '../fonts';

type Props = {
  hero: HeroMoment;
};

export const HeroTitle: React.FC<Props> = ({ hero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = secToFrame(hero.startSec);
  const endFrame = secToFrame(hero.endSec);
  const localFrame = frame - startFrame;
  const totalFrames = endFrame - startFrame;
  const framesFromEnd = totalFrames - localFrame;

  if (localFrame < 0 || localFrame > totalFrames) return null;

  return renderEffect(hero, localFrame, framesFromEnd, fps);
};

const renderEffect = (
  hero: HeroMoment,
  f: number,
  fromEnd: number,
  fps: number
): React.ReactElement => {
  switch (hero.effect) {
    case 'slide-rotate':
      return <SlideRotate hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'zoom-punch':
      return <ZoomPunch hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'typewriter-glitch':
      return <TypewriterGlitch hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'flip-stamp':
      return <FlipStamp hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'split-slide':
      return <SplitSlide hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'mask-wipe':
      return <MaskWipe hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    case 'stamp-drop':
      return <StampDrop hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
    default:
      return <ZoomPunch hero={hero} f={f} fromEnd={fromEnd} fps={fps} />;
  }
};

type EffectProps = {
  hero: HeroMoment;
  f: number;
  fromEnd: number;
  fps: number;
};

const exitOpacity = (fromEnd: number) =>
  interpolate(fromEnd, [0, 7], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

const exitBlur = (fromEnd: number) =>
  interpolate(fromEnd, [0, 7], [14, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

const exitScale = (fromEnd: number) =>
  interpolate(fromEnd, [0, 7], [1.2, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

const wrapper: React.CSSProperties = {
  justifyContent: 'flex-start',
  alignItems: 'center',
  paddingTop: 180,
  pointerEvents: 'none',
};

const bigStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: FONTS.hero,
  fontWeight: 400,
  fontSize: 140,
  color: 'white',
  letterSpacing: '-0.01em',
  textAlign: 'center',
  lineHeight: 0.92,
  textShadow: '0 6px 30px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,1)',
  textTransform: 'uppercase',
  ...extra,
});

const blackStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: FONTS.heroAlt,
  fontWeight: 900,
  fontSize: 110,
  color: 'white',
  letterSpacing: '-0.025em',
  textAlign: 'center',
  lineHeight: 0.92,
  textShadow: '0 6px 30px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,1)',
  textTransform: 'uppercase',
  ...extra,
});

// --- SLIDE + ROTATE (влетает по диагонали с вращением) ---
const SlideRotate: React.FC<EffectProps> = ({ hero, f, fromEnd, fps }) => {
  const s = spring({ frame: f, fps, config: { damping: 10, stiffness: 130, mass: 0.8 } });
  const tx = interpolate(s, [0, 1], [-600, 0]);
  const ty = interpolate(s, [0, 1], [280, 0]);
  const rot = interpolate(s, [0, 1], [-30, 0]);
  const op = interpolate(f, [0, 5], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${exitScale(fromEnd)})`,
          opacity: op * exitOpacity(fromEnd),
          filter: `blur(${exitBlur(fromEnd)}px)`,
        }}
      >
        <div style={bigStyle({ fontSize: 120 })}>{hero.text}</div>
        {hero.sublabel && (
          <div style={bigStyle({ fontSize: 120, fontStyle: 'italic', marginTop: 4 })}>
            {hero.sublabel}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// --- ZOOM-PUNCH (влетает с масштабом + тряска) ---
const ZoomPunch: React.FC<EffectProps> = ({ hero, f, fromEnd, fps }) => {
  const s = spring({ frame: f, fps, config: { damping: 7, stiffness: 200, mass: 0.5 } });
  const scale = interpolate(s, [0, 1], [0.25, 1]);
  const shakeX = f < 12 ? Math.sin(f * 2.5) * interpolate(f, [0, 12], [12, 0]) : 0;
  const shakeY = f < 12 ? Math.cos(f * 3) * interpolate(f, [0, 12], [6, 0]) : 0;
  const op = interpolate(f, [0, 4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale * exitScale(fromEnd)})`,
          opacity: op * exitOpacity(fromEnd),
          filter: `blur(${exitBlur(fromEnd)}px)`,
        }}
      >
        <div style={bigStyle({ fontSize: 130 })}>{hero.text}</div>
        {hero.sublabel && (
          <div
            style={{
              marginTop: 20,
              fontFamily: FONTS.sub,
              fontWeight: 900,
              fontSize: 50,
              color: 'white',
              letterSpacing: '0.1em',
              textAlign: 'center',
              textShadow: '0 3px 10px rgba(0,0,0,.8)',
            }}
          >
            {hero.sublabel}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// --- TYPEWRITER + GLITCH ---
const TypewriterGlitch: React.FC<EffectProps> = ({ hero, f, fromEnd }) => {
  const chars = hero.text.length;
  const progress = Math.min(1, f / (chars * 1.0));
  const visibleCount = Math.round(progress * chars);
  const visible = hero.text.slice(0, visibleCount);

  const glitch = f < 18 && f % 3 === 0;
  const glitchX = glitch ? (Math.random() - 0.5) * 8 : 0;
  const glitchY = glitch ? (Math.random() - 0.5) * 4 : 0;

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          transform: `translate(${glitchX}px, ${glitchY}px) scale(${exitScale(fromEnd)})`,
          opacity: exitOpacity(fromEnd),
          filter: `blur(${exitBlur(fromEnd)}px)`,
        }}
      >
        <div style={bigStyle({ fontSize: 110 })}>
          {visible}
          <span
            style={{
              opacity: Math.floor(f / 4) % 2 === 0 ? 1 : 0,
              color: 'white',
            }}
          >
            |
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- FLIP + STAMP (две строки) ---
const FlipStamp: React.FC<EffectProps> = ({ hero, f, fromEnd, fps }) => {
  const s1 = spring({ frame: f, fps, config: { damping: 14, stiffness: 150 } });
  const rot1 = interpolate(s1, [0, 1], [90, 0]);
  const op1 = interpolate(f, [0, 5, 18, 24], [0, 1, 1, 0.25], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const stampFrame = Math.max(0, f - 18);
  const s2 = spring({ frame: stampFrame, fps, config: { damping: 6, stiffness: 220 } });
  const ty2 = interpolate(s2, [0, 1], [-120, 0]);
  const scale2 = interpolate(s2, [0, 0.55, 1], [2, 0.92, 1]);
  const op2 = f > 18 ? interpolate(stampFrame, [0, 3], [0, 1], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          opacity: op1 * exitOpacity(fromEnd),
          transform: `perspective(800px) rotateY(${rot1}deg)`,
          filter: `blur(${exitBlur(fromEnd)}px)`,
        }}
      >
        <div style={bigStyle({ fontSize: 120 })}>{hero.text}</div>
      </div>
      {hero.sublabel && (
        <div
          style={{
            opacity: op2 * exitOpacity(fromEnd),
            transform: `translateY(${ty2}px) scale(${scale2})`,
            marginTop: 18,
          }}
        >
          <div style={bigStyle({ fontSize: 160, fontStyle: 'italic' })}>
            {hero.sublabel}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// --- SPLIT-SLIDE (половинки сходятся) ---
const SplitSlide: React.FC<EffectProps> = ({ hero, f, fromEnd, fps }) => {
  const s = spring({ frame: f, fps, config: { damping: 11, stiffness: 140 } });
  const offset = interpolate(s, [0, 1], [400, 0]);
  const op = interpolate(f, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  const words = hero.text.split(' ');
  const first = words.slice(0, Math.ceil(words.length / 2)).join(' ');
  const second = words.slice(Math.ceil(words.length / 2)).join(' ');

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          opacity: op * exitOpacity(fromEnd),
          filter: `blur(${exitBlur(fromEnd)}px)`,
          transform: `scale(${exitScale(fromEnd)})`,
        }}
      >
        <div style={{ ...bigStyle({ fontSize: 120 }), transform: `translateX(${-offset}px)` }}>
          {first}
        </div>
        {second && (
          <div style={{ ...bigStyle({ fontSize: 120 }), transform: `translateX(${offset}px)` }}>
            {second}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// --- MASK-WIPE ---
const MaskWipe: React.FC<EffectProps> = ({ hero, f, fromEnd }) => {
  const wipeProgress = interpolate(f, [0, 16], [0, 100], { extrapolateRight: 'clamp' });
  const op = exitOpacity(fromEnd);

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          opacity: op,
          filter: `blur(${exitBlur(fromEnd)}px)`,
          transform: `scale(${exitScale(fromEnd)})`,
          WebkitMaskImage: `linear-gradient(90deg, black ${wipeProgress}%, transparent ${wipeProgress}%)`,
          maskImage: `linear-gradient(90deg, black ${wipeProgress}%, transparent ${wipeProgress}%)`,
        }}
      >
        <div style={bigStyle({ fontSize: 140 })}>{hero.text}</div>
      </div>
    </AbsoluteFill>
  );
};

// --- STAMP-DROP ---
const StampDrop: React.FC<EffectProps> = ({ hero, f, fromEnd, fps }) => {
  const s = spring({ frame: f, fps, config: { damping: 5, stiffness: 230, mass: 0.6 } });
  const ty = interpolate(s, [0, 1], [-260, 0]);
  const scale = interpolate(s, [0, 0.55, 1], [2.4, 0.88, 1]);
  const op = interpolate(f, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  const glow = f < 22 ? interpolate(f, [0, 6, 16], [0, 60, 0], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={wrapper}>
      <div
        style={{
          opacity: op * exitOpacity(fromEnd),
          transform: `translateY(${ty}px) scale(${scale * exitScale(fromEnd)})`,
          filter: `blur(${exitBlur(fromEnd)}px)`,
        }}
      >
        <div
          style={{
            ...blackStyle({ fontSize: 140 }),
            textShadow: `0 0 ${glow}px white, 0 6px 30px rgba(0,0,0,.95)`,
          }}
        >
          {hero.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
