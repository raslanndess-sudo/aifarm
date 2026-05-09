import React from 'react';
import { AbsoluteFill, OffthreadVideo, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { FullBleedStatement } from '../components/FullBleedStatement';
import { NumberPunch } from '../components/NumberPunch';
import { PriceCard } from '../components/PriceCard';
import { SpecReveal } from '../components/SpecReveal';
import { TopHalfBox } from '../components/TopHalfBox';
import { ConstantSubtitles } from '../subtitles/ConstantSubtitles';
import { HeroTitle } from '../subtitles/HeroTitle';
import { AudioLayer } from '../audio/AudioLayer';
import type { SceneDef } from '../videoConfig';

/**
 * Универсальный рендер композиции из конфига.
 * Не зависит от конкретного видео — просто читает данные.
 */
export type CompositionProps = {
  video: {
    src: string;
    muted?: boolean;
    volume?: number;
  };
  voice?: {
    src: string;
    volume?: number;
  } | null;
  scenes: SceneDef[];
  heroes: Array<{
    id: number;
    startSec: number;
    endSec: number;
    text: string;
    sublabel?: string;
    effect: string;
  }>;
};

export const buildScenes = (scenes: SceneDef[], fps: number) => {
  return scenes.map((scene, i) => {
    const fromFrame = Math.round(scene.from * fps);
    const toFrame = Math.round(scene.to * fps);
    const duration = Math.max(1, toFrame - fromFrame);

    let inner: React.ReactNode;
    if (scene.kind === 'statement') {
      inner = (
        <FullBleedStatement
          lines={scene.lines}
          accentLineIndex={scene.accentLineIndex}
          bg={scene.bg}
          fg={scene.fg}
          showLine={scene.showLine !== false}
          decor={scene.decor}
        />
      );
    } else if (scene.kind === 'number') {
      inner = (
        <NumberPunch
          value={scene.value}
          unit={scene.unit}
          bg={scene.bg}
          fg={scene.fg}
          splitAt={scene.splitAt}
          decor={scene.decor}
        />
      );
    } else if (scene.kind === 'price') {
      inner = <PriceCard num={scene.num} price={scene.price} label={scene.label} decor />;
    } else if (scene.kind === 'spec-reveal') {
      inner = <SpecReveal />;
    }

    return (
      <Sequence key={i} from={fromFrame} durationInFrames={duration}>
        <TopHalfBox height={scene.kind === 'price' ? 640 : 600}>{inner}</TopHalfBox>
      </Sequence>
    );
  });
};

export const buildHeroes = (heroes: CompositionProps['heroes'], fps: number) => {
  return heroes.map((hero) => {
    const from = Math.round(hero.startSec * fps);
    const to = Math.round(hero.endSec * fps);
    return (
      <Sequence key={hero.id} from={from} durationInFrames={Math.max(1, to - from)}>
        <HeroTitle hero={hero as any} />
      </Sequence>
    );
  });
};

export const MainFromConfig: React.FC<CompositionProps> = ({
  video,
  voice,
  scenes,
  heroes,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo
        src={staticFile(video.src)}
        muted={video.muted ?? false}
        volume={video.volume ?? 1}
      />

      {buildScenes(scenes, fps)}

      {buildHeroes(heroes, fps)}

      <ConstantSubtitles />

      {voice && (
        <Audio src={staticFile(voice.src)} volume={voice.volume ?? 1} />
      )}

      <AudioLayer />
    </AbsoluteFill>
  );
};
