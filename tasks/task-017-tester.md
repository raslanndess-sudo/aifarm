# task-017: Providers Foundation — Verification

## Проверки

1. `npx tsc --noEmit` — 0 ошибок
2. Файлы существуют: `src/lib/providers/types.ts`, `src/lib/providers/kling-api.ts`, `src/lib/providers/index.ts`
3. `src/app/api/kling/generate-video/route.ts` — импортирует из `@/lib/providers`, НЕ из `@/lib/kling`
4. `src/app/api/kling/task-status/route.ts` — импортирует из `@/lib/providers`, НЕ из `@/lib/kling`
5. `src/lib/kling.ts` — файл на месте, НЕ удалён
6. `src/lib/types.ts` — содержит re-export `ProviderMode`, `VideoProvider`, `GenerationJob`
7. `src/components/Settings.tsx` — содержит секцию Generation Provider с admin-гейтом
8. `src/components/Studio.tsx` — содержит pill badge провайдера

Отпиши результат каждой проверки.
