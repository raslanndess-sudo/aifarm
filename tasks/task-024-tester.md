# Task 024 — Tester: проверка кейфреймов

## Проверки

### TypeScript
1. `npx tsc --noEmit` — 0 ошибок

### Backend (endImageUrl)
2. `src/lib/kling.ts` — функция `submitKlingImageToVideo` принимает `tailImage?: string` и добавляет `body.tail_image` если передан
3. `src/lib/providers/kling-api.ts` — `generateVideo()` передаёт `tailImage: params.endImageUrl` в submitKlingImageToVideo
4. `src/app/api/kling/generate-video/route.ts` — извлекает `endImageUrl` из body, конвертит в base64, передаёт в `provider.generateVideo()`

### Frontend (Studio.tsx)
5. Интерфейс `Keyframe` существует с полями: id, prompt, imageUrl, status
6. Интерфейс `Scene` содержит `keyframes: Keyframe[]` и `videoSegments` массив (НЕ одиночные prompt/imageUrl/videoUrl)
7. Storyboard (step 3): каждая карточка сцены содержит keyframe strip (маленькие миниатюры) + кнопку "+"
8. Можно добавить кейфрейм (макс 6) и удалить (мин 1) — ищи функции addKeyframe / removeKeyframe
9. Текст duration info присутствует (например "2 frames → 1 clip")
10. Prompt textarea редактирует промпт ВЫБРАННОГО кейфрейма (ищи selectedKeyframe)
11. generateKlingVideo передаёт `endImageUrl` при наличии второго кейфрейма

### Регрессия
12. Step 1 (Script) работает без изменений
13. Step 2 (Character) работает без изменений
14. Animation Prompt остаётся общим для сцены (не per-keyframe)
