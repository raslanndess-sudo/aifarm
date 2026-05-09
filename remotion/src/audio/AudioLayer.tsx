import React from 'react';
import { Audio, Sequence, staticFile, useVideoConfig, interpolate } from 'remotion';
import { AUDIO, ASSETS, LETTERBOX_RANGES, HEROES_CONFIG, SFX_CUES_CONFIG } from '../videoConfig';

const secToFrame = (sec: number, fps: number) => Math.round(sec * fps);

const DUCK_RANGES: Array<[number, number]> = [
  ...LETTERBOX_RANGES,
  ...HEROES_CONFIG.map((h) => [h.startSec - 0.3, h.endSec + 0.3] as [number, number]),
];

const makeMusicVolume = (fps: number) => {
  const { musicBaseVolume: base, musicQuietVolume: quiet, musicFadeTime: fadeTime } = AUDIO;
  return (f: number) => {
    const t = f / fps;
    for (const [a, b] of DUCK_RANGES) {
      if (t >= a && t <= b) return quiet;
      if (t > a - fadeTime && t < a) {
        return base - (base - quiet) * ((t - (a - fadeTime)) / fadeTime);
      }
      if (t > b && t < b + fadeTime) {
        return quiet + (base - quiet) * ((t - b) / fadeTime);
      }
    }
    return base;
  };
};

const makeSfxVolume = (baseVol: number, totalFrames: number, fps: number) => {
  const fadeIn = Math.round(fps * 0.03);
  const fadeOut = Math.round(fps * 0.4);
  return (f: number) => {
    if (f < fadeIn) {
      return interpolate(f, [0, fadeIn], [0, baseVol], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    if (f > totalFrames - fadeOut) {
      return interpolate(f, [totalFrames - fadeOut, totalFrames], [baseVol, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
    return baseVol;
  };
};

export const AudioLayer: React.FC = () => {
  const { fps } = useVideoConfig();
  const musicVolume = makeMusicVolume(fps);

  return (
    <>
      <Audio src={staticFile(ASSETS.music)} volume={musicVolume} />

      {SFX_CUES_CONFIG.map((cue, i) => {
        const duration = cue.durationSec ?? 2.0;
        const totalFrames = Math.round(fps * duration);
        const fromFrame = Math.max(0, secToFrame(cue.at, fps) - 1);
        return (
          <Sequence key={i} from={fromFrame} durationInFrames={totalFrames}>
            <Audio
              src={staticFile(cue.file)}
              volume={makeSfxVolume(cue.volume, totalFrames, fps)}
            />
          </Sequence>
        );
      })}
    </>
  );
};
