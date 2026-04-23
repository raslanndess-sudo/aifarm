# task-022: UI Progress + Download — Verification

## Проверки

1. `npx tsc --noEmit` — 0 ошибок
2. `src/components/Studio.tsx` — содержит state `generationProgress` (или аналогичный)
3. Studio.tsx — содержит polling через setInterval/useEffect с `/api/videos/`
4. Studio.tsx — содержит текст прогресса типа "сцену X из Y" или "Scene X of Y"
5. Studio.tsx — содержит progress bar (div с динамической шириной или CSS progress)
6. Studio.tsx — содержит кнопку Download (текст Download All или подобный)
7. Studio.tsx — содержит превью/миниатюры готовых сцен

Отпиши результат каждой проверки.
