import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack';

loadInter();
loadAnton();
loadArchivoBlack();

export const FONTS = {
  hero: '"Anton", "Impact", system-ui, sans-serif',
  heroAlt: '"Archivo Black", "Impact", system-ui, sans-serif',
  sub: '"Inter", system-ui, sans-serif',
};
