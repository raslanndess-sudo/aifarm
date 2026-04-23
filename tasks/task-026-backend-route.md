# task-026: Route generate-scene через resolveProvider — Backend

## Цель

`POST /api/cref/generate-scene` сейчас жёстко зовёт Leonardo. Надо: если admin + provider_mode=higgsfield → идти через `higgsfield-web.generateImage({ model: 'seadream-5-lite' })`, иначе — Leonardo как раньше.

## Зависимость

Задача **зависит** от task-026-backend-seadream (там `generateImage` параметризован). Не начинай пока backend-seadream не зарепортит done.

## Шаги

### 1. Прочти existing код

- `src/app/api/cref/generate-scene/route.ts` — понять текущий Leonardo-флоу
- `src/app/api/kling/generate-video/route.ts` — пример как resolveProvider + connect/disconnect используется

### 2. Добавь ветку в `/api/cref/generate-scene/route.ts`

В начале POST-хэндлера — вызов `resolveProvider()` (импортировать из `@/lib/providers/resolve-provider`):

```ts
import { resolveProvider } from '@/lib/providers/resolve-provider';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scenePrompt, style, aspectRatio } = body;

  const { provider, mode } = await resolveProvider();

  // --- Higgsfield branch ---
  if (mode === 'higgsfield') {
    const hf = provider as any;
    await hf.connect();
    try {
      // Комбинируем промпт: scene + style hint
      const fullPrompt = `${scenePrompt}, ${style} style`;
      const images = await hf.generateImage(fullPrompt, { model: 'seadream-5-lite', count: 1 });
      if (!images || images.length === 0) {
        return NextResponse.json({ error: 'SeaDream returned no images' }, { status: 502 });
      }
      return NextResponse.json({ imageUrl: images[0] });
    } finally {
      await hf.disconnect();
    }
  }

  // --- Leonardo branch (existing code) ---
  // ...оставляешь как было
}
```

**Важно:**
- Master character (`characterDescription`, `characterRefImageUrl`) в higgsfield-ветке пока **игнорируется** — SeaDream не поддерживает character ref на higgsfield через данный UI. В промпте можно приклеить текстовое описание персонажа если оно пришло, но без cref-картинки.
- Для Leonardo-ветки ничего не ломай — она остаётся дефолтом для не-admin.

### 3. TypeScript и запуск

- `npx tsc --noEmit` → 0 ошибок
- Поправь любые import'ы которые ругается TS

### 4. Проверка поведения

Запусти dev-сервер (если не запущен: `npm run dev`), залогинься как admin, в Settings переключи provider на higgsfield. В Studio на шаге 3 нажми Generate у одной сцены — в терминале видно что идёт Playwright-вызов, в `data/higgsfield-audit.log` должны появиться записи `generateImage:start model=seadream-5-lite`.

## Отчёт в chat.md

- tsc clean (да/нет)
- Ветка higgsfield работает (описать что увидел в аудит-логе)

## НЕ ТРОГАЙ

- higgsfield-web.ts (это backend-seadream зона)
- Studio.tsx
- Любые другие API routes
