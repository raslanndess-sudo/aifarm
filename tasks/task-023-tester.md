# task-023: Regression — End-to-End Verification

## Цель

Финальная проверка всей системы после 7 тасков.

## Проверки

### TypeScript
1. `npx tsc --noEmit` — 0 ошибок

### Provider Foundation (task-017)
2. `src/lib/providers/types.ts` — интерфейсы VideoProvider, GenerationJob
3. `src/lib/providers/kling-api.ts` — KlingApiProvider implements VideoProvider
4. `src/lib/providers/index.ts` — фабрика getProvider, экспортирует ProviderMode
5. `src/lib/types.ts` — re-export ProviderMode, VideoProvider, GenerationJob

### Higgsfield Provider (task-018/019/020)
6. `src/lib/providers/higgsfield-web.ts` — HiggsfieldWebProvider
7. В higgsfield-web.ts: `connectOverCDP` (НЕ launch)
8. В higgsfield-web.ts: `generateImage` — реальный код (не заглушка)
9. В higgsfield-web.ts: `generateVideo` — реальный код (не заглушка)
10. В higgsfield-web.ts: `getStatus` — реальный код (не заглушка)
11. `src/lib/providers/browser-helpers.ts` — humanClick, typeInLexical, auditLog
12. `scripts/higgsfield-canary.ts` существует
13. package.json содержит script `higgsfield:canary`

### Routing (task-021)
14. `src/lib/providers/resolve-provider.ts` — resolveProvider()
15. `src/app/api/kling/generate-video/route.ts` — использует resolveProvider (НЕ прямой getProvider)
16. `src/app/api/kling/task-status/route.ts` — использует resolveProvider
17. `src/app/api/emergency-stop/route.ts` — POST endpoint

### Безопасность: обычный пользователь НЕ видит Higgsfield
18. В resolve-provider.ts — проверка `session === 'admin'`, не-admin всегда получает 'api'
19. В Settings.tsx — секция Generation Provider имеет admin gate (проверяй grep)
20. В getProvider('api') — возвращает KlingApiProvider (НЕ Higgsfield)

### UI (task-021/022)
21. Settings.tsx — Emergency Stop кнопка
22. Studio.tsx — pill badge провайдера
23. Studio.tsx — Emergency Stop при higgsfield
24. Studio.tsx — progress bar генерации
25. Studio.tsx — Download кнопка
26. Studio.tsx — превью готовых сцен

### Files & Config
27. `data/higgsfield-audit.log` существует
28. `playwright-core` в node_modules
29. `src/lib/kling.ts` на месте (не удалён)

Отпиши результат КАЖДОЙ проверки (29 штук). Формат: номер — PASS/FAIL — коммент если FAIL.
