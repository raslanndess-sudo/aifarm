import React from 'react';
import './fonts';
import './tokens';
import { MainFromConfig } from './engine/buildComposition';
import { ASSETS, SCENES, HEROES_CONFIG } from './videoConfig';

/**
 * Тонкий entry — вся спецификация видео в videoConfig.ts
 * Для нового видео: скопируй videoConfig.ts и отредактируй значения,
 * смени импорт здесь.
 */
export const Main: React.FC = () => {
  return (
    <MainFromConfig
      video={{ src: ASSETS.video }}
      voice={ASSETS.voice ? { src: ASSETS.voice } : null}
      scenes={SCENES}
      heroes={HEROES_CONFIG}
    />
  );
};
