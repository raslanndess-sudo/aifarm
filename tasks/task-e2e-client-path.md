# E2E: Клиентский путь — не-admin через KlingApiProvider

## Цель

Убедиться что обычный пользователь (не admin) НИКОГДА не попадает в Higgsfield. Даже если provider_mode='higgsfield' в БД.

## Проверки

### 1. Код resolve-provider.ts
- Прочитай `src/lib/providers/resolve-provider.ts`
- Убедись: если session !== 'admin' → ВСЕГДА возвращает `getProvider('api')`, независимо от значения provider_mode в БД
- Это критично: даже если кто-то руками запишет provider_mode='higgsfield' в БД, не-admin должен получить KlingApiProvider

### 2. Код generate-video/route.ts
- Прочитай `src/app/api/kling/generate-video/route.ts`
- Убедись: используется `resolveProvider()`, НЕ прямой `getProvider()`
- Убедись: нет прямого импорта из `higgsfield-web` или `playwright-core`
- Убедись: playwright connect/disconnect вызывается ТОЛЬКО при mode === 'higgsfield'

### 3. Код task-status/route.ts
- Прочитай `src/app/api/kling/task-status/route.ts`
- Те же проверки что и для generate-video

### 4. Код getProvider('api')
- Прочитай `src/lib/providers/index.ts`
- Убедись: `getProvider('api')` возвращает `new KlingApiProvider()`, НЕ HiggsfieldWebProvider
- Убедись: HiggsfieldWebProvider импортируется, но возвращается ТОЛЬКО при mode === 'higgsfield'

### 5. KlingApiProvider не использует playwright
- Прочитай `src/lib/providers/kling-api.ts`
- Убедись: НЕТ импорта playwright-core, НЕТ импорта browser-helpers, НЕТ connectOverCDP
- Только импорты из `@/lib/kling` и `./types`

### 6. Симуляция запроса (статический анализ)
Проследи полный путь вызова для не-admin:
```
POST /api/kling/generate-video (session cookie НЕ 'admin')
  → resolveProvider()
    → session !== 'admin' → getProvider('api')
      → new KlingApiProvider()
        → submitKlingImageToVideo() из kling.ts
          → klingFetch() → Kling API
```
Убедись что на КАЖДОМ шаге нет ветки которая может увести в Playwright/Higgsfield.

Отпиши результат КАЖДОЙ проверки (6 штук). Если хоть одна FAIL — это критический баг.
