# task-021: Admin Toggle + Routing — Verification

## Проверки

1. `npx tsc --noEmit` — 0 ошибок
2. `src/app/api/emergency-stop/route.ts` существует, экспортирует POST
3. `src/lib/providers/resolve-provider.ts` существует, экспортирует `resolveProvider`
4. `resolve-provider.ts` проверяет cookie session и settings provider_mode
5. `src/app/api/kling/generate-video/route.ts` использует `resolveProvider()` (не хардкод `getProvider('api')`)
6. `src/app/api/kling/task-status/route.ts` использует `resolveProvider()`
7. `src/components/Settings.tsx` — option higgsfield НЕ disabled
8. `src/components/Settings.tsx` — содержит Emergency Stop кнопку
9. `src/components/Studio.tsx` — содержит Emergency Stop кнопку при higgsfield

Отпиши результат каждой проверки.
