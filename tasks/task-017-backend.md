# task-017: Providers Foundation — Backend

## Что делать

### 1. Создай `src/lib/providers/types.ts`

```ts
export interface GenerationJob {
  jobId: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  resultUrl?: string;
  error?: string;
}

export interface VideoProvider {
  name: string;
  generateImage(prompt: string, count?: number): Promise<string[]>;
  generateVideo(params: {
    imageUrl: string;
    endImageUrl?: string;
    prompt?: string;
    model?: string;
    duration?: '5' | '10';
    mode?: 'std' | 'pro';
  }): Promise<GenerationJob>;
  getStatus(jobId: string): Promise<GenerationJob>;
}
```

### 2. Создай `src/lib/providers/kling-api.ts`

Класс `KlingApiProvider implements VideoProvider`:
- `name = 'kling-api'`
- `generateImage()` → `throw new Error('Not implemented — use Leonardo/CREF routes')`
- `generateVideo()` → внутри вызывает `submitKlingImageToVideo()` из `src/lib/kling.ts`, возвращает `GenerationJob` с `jobId=taskId`, `status='submitted'`
- `getStatus()` → вызывает `klingFetch("/videos/image2video/${jobId}")`, маппит `KlingVideoTask` в `GenerationJob`

### 3. Создай `src/lib/providers/index.ts`

```ts
export type ProviderMode = 'api' | 'higgsfield';

export function getProvider(mode: ProviderMode = 'api'): VideoProvider {
  if (mode === 'higgsfield') throw new Error('Higgsfield provider not yet available');
  return new KlingApiProvider();
}

export { type VideoProvider, type GenerationJob } from './types';
```

### 4. Обнови `src/app/api/kling/generate-video/route.ts`

- Замени `import { submitKlingImageToVideo } from '@/lib/kling'` на `import { getProvider } from '@/lib/providers'`
- Внутри POST: `const provider = getProvider('api'); const job = await provider.generateVideo({...})`
- Ответ НЕ МЕНЯЕТСЯ: `{ success: true, taskId: job.jobId, status: 'submitted' }`

### 5. Обнови `src/app/api/kling/task-status/route.ts`

- Замени `import { klingFetch } from '@/lib/kling'` на `import { getProvider } from '@/lib/providers'`
- Внутри GET: `const provider = getProvider('api'); const job = await provider.getStatus(taskId)`
- Ответ маппи в тот же формат: `{ taskId, status, statusMsg, videoUrl, videoDuration }`

### 6. `src/lib/kling.ts` НЕ УДАЛЯТЬ — KlingApiProvider его импортирует

### 7. В `src/lib/types.ts` добавь

```ts
export type { ProviderMode, VideoProvider, GenerationJob } from './providers';
```

## ВАЖНО

API контракт (request/response) роутов НЕ МЕНЯЕТСЯ. Это чистый рефакторинг.
