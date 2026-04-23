import { KlingApiProvider } from './kling-api';
import { HiggsfieldWebProvider } from './higgsfield-web';
import type { VideoProvider } from './types';

export type ProviderMode = 'api' | 'higgsfield';

export function getProvider(mode: ProviderMode = 'api'): VideoProvider {
  if (mode === 'higgsfield') return new HiggsfieldWebProvider();
  return new KlingApiProvider();
}

export { type VideoProvider, type GenerationJob } from './types';
