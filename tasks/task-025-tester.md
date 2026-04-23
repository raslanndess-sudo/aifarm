# Task 025 — Tester: проверка отката кейфреймов

## Проверки

### TypeScript
1. `npx tsc --noEmit` — 0 ошибок

### Типы
2. `Keyframe` и `VideoSegment` интерфейсы НЕ существуют в Studio.tsx (удалены)
3. `Scene` интерфейс имеет простые поля: prompt, imageUrl, videoUrl, videoTaskId, status, videoStatus, dbVideoId (НЕ keyframes[], НЕ videoSegments[])

### Функции сцен
4. `addScene` функция существует — создаёт новую сцену с пустым промптом
5. `removeScene` функция существует — удаляет сцену по id
6. НЕТ функций `addKeyframe`, `removeKeyframe`, `selectKeyframe` (удалены)

### UI Storyboard (step 3)
7. Карточка "Add Scene" с иконкой Plus существует в конце grid
8. Кнопка × (removeScene) существует на каждой карточке сцены, скрыта при `scenes.length <= 1`
9. НЕТ keyframe strip (маленьких миниатюр кейфреймов внутри сцены)
10. Каждая сцена имеет один Image Prompt textarea (не "keyframe N")
11. Info-строка содержит "scenes →" и "clips ×" (общая, не per-scene)

### Генерация видео
12. `generateKlingVideoForPair` функция существует и принимает (scene, nextScene)
13. Передаёт `endImageUrl` когда nextScene имеет imageUrl

### Регрессия
14. `updateScenePrompt` обновляет `scene.prompt` напрямую (не через keyframes)
15. `mergeAllVideos` собирает `scene.videoUrl` (не videoSegments)
