# task-021: Admin Toggle + Provider Routing — Backend

## Цель

API роуты генерации теперь выбирают провайдер динамически: если user=admin и settings.higgsfield_mode=true → HiggsfieldWebProvider, иначе → KlingApiProvider. Плюс emergency stop роут.

## Шаги

### 1. Создай `src/app/api/emergency-stop/route.ts`

POST endpoint — убивает все активные Playwright-соединения и выключает higgsfield_mode:

```ts
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function POST() {
  // 1. Выключаем флаг в БД
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('provider_mode', 'api')`).run();
  
  // 2. Логируем
  const fs = require('fs');
  const line = `[${new Date().toISOString()}] EMERGENCY STOP triggered\n`;
  fs.appendFileSync('data/higgsfield-audit.log', line);
  
  return NextResponse.json({ success: true, message: 'Higgsfield mode disabled, provider reset to API' });
}
```

### 2. Создай хелпер `src/lib/providers/resolve-provider.ts`

Функция которая определяет какой провайдер использовать на основе сессии и настроек:

```ts
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { getProvider, type ProviderMode } from './index';
import type { VideoProvider } from './types';

export async function resolveProvider(): Promise<{ provider: VideoProvider; mode: ProviderMode }> {
  // Проверяем сессию — admin ли пользователь
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const isAdmin = session === 'admin';
  
  if (!isAdmin) {
    return { provider: getProvider('api'), mode: 'api' };
  }
  
  // Проверяем настройку provider_mode
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'provider_mode'`).get() as { value: string } | undefined;
  const mode: ProviderMode = (row?.value === 'higgsfield') ? 'higgsfield' : 'api';
  
  return { provider: getProvider(mode), mode };
}
```

### 3. Обнови `src/app/api/kling/generate-video/route.ts`

Замени хардкод `getProvider('api')` на `resolveProvider()`:

```ts
import { resolveProvider } from '@/lib/providers/resolve-provider';
```

Внутри POST:
```ts
const { provider, mode } = await resolveProvider();

// Если Higgsfield — нужно сначала connect()
if (mode === 'higgsfield') {
  const hf = provider as any;
  await hf.connect();
  try {
    const job = await provider.generateVideo({ imageUrl: imageBase64, prompt: animationPrompt, model: modelName, duration, mode: videoMode });
    return NextResponse.json({ success: true, taskId: job.jobId, status: job.status });
  } finally {
    await hf.disconnect();
  }
} else {
  const job = await provider.generateVideo({ imageUrl: imageBase64, prompt: animationPrompt, model: modelName, duration, mode: videoMode });
  return NextResponse.json({ success: true, taskId: job.jobId, status: job.status });
}
```

### 4. Обнови `src/app/api/kling/task-status/route.ts`

Аналогично — используй `resolveProvider()`. Для Higgsfield getStatus не требует connect (проверяет файлы локально).

### 5. Добавь emergency-stop в middleware

В `src/middleware.ts` — добавь `/api/emergency-stop` в список публичных путей (доступен без авторизации на случай если сессия глючит). Нет, на самом деле оставь его под авторизацией — только admin должен иметь доступ.

## НЕ ТРОГАЙ

- Компоненты
- browser-helpers.ts
- higgsfield-web.ts (уже готов)
- KlingApiProvider
