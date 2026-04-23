# Task 024 — Frontend: кейфреймы в Storyboard

## Концепция
Каждая сцена получает 1–6 ключевых кадров (keyframes). Между каждой парой кейфреймов генерируется видео-клип. Итого: N кейфреймов → (N-1) клипов. 6 кейфреймов × 5с = 25с видео.

## Шаги

### 1. Новые типы — добавить в начало Studio.tsx

```ts
interface Keyframe {
  id: string;
  prompt: string;
  imageUrl: string | null;
  status: 'idle' | 'generating' | 'done';
}
```

### 2. Обновить интерфейс Scene

Заменить одиночные `prompt` / `imageUrl` / `status` на массив кейфреймов:

```ts
interface Scene {
  id: string;
  keyframes: Keyframe[];           // 1-6 кейфреймов
  selectedKeyframe: number;        // индекс выбранного для редактирования (дефолт 0)
  animationPrompt: string;         // общий для сцены
  useMasterChar: boolean;
  // Видео — массив сегментов (между парами кейфреймов)
  videoSegments: Array<{
    videoUrl: string | null;
    videoTaskId: string | null;
    videoStatus: 'idle' | 'queued' | 'processing' | 'done' | 'failed';
    dbVideoId: number | null;
  }>;
}
```

Убрать из Scene старые поля: `prompt`, `imageUrl`, `status`, `videoUrl`, `videoTaskId`, `videoStatus`, `dbVideoId`.

### 3. Обновить `splitIntoScenes` / `parseScenes`

При создании сцен — каждая сцена получает 2 кейфрейма по умолчанию:
- Keyframe 1: prompt = строка из скрипта
- Keyframe 2: prompt = "" (пустой, юзер заполнит)

```ts
keyframes: [
  { id: `scene_${i}_kf_0`, prompt: line, imageUrl: null, status: 'idle' },
  { id: `scene_${i}_kf_1`, prompt: '', imageUrl: null, status: 'idle' },
],
selectedKeyframe: 0,
videoSegments: [{ videoUrl: null, videoTaskId: null, videoStatus: 'idle', dbVideoId: null }],
```

### 4. UI Storyboard (step 3) — редизайн карточки сцены

Каждая карточка сцены:

```
┌─────────────────────────────────────────────┐
│ [1] Scene 1                      Cref □     │
│ 2 frames → 1 clip × 5s = 5s                │
│                                             │
│ ┌────┐ ┌────┐ ┌──┐                          │
│ │ KF1│ │ KF2│ │ +│    ← keyframe strip      │
│ │    │ │    │ │  │    (выбранный highlighted)│
│ └────┘ └────┘ └──┘                          │
│                                             │
│ 🖼 Image Prompt (keyframe 1)               │
│ [textarea — промпт выбранного кейфрейма]    │
│                                             │
│ 🎬 Animation Prompt                         │
│ [textarea — общий для сцены]                │
└─────────────────────────────────────────────┘
```

**Keyframe strip:**
- Миниатюры кейфреймов в ряд (ширина ~80px, aspect-ratio как у выбранного формата)
- Выбранный кейфрейм — подсветка border-purple-500
- Если есть imageUrl — показать миниатюру, иначе номер кейфрейма
- Кнопка "×" на hover для удаления кейфрейма (минимум 1 остаётся)
- Кнопка "+" для добавления (максимум 6)

**Duration info:**
- Текст под заголовком сцены: `{N} frames → {N-1} clip(s) × {klingDuration}s = {(N-1)*klingDuration}s`
- Читать klingDuration из состояния (пока дефолт 5)

**Prompt editing:**
- Показывать лейбл "Image Prompt (keyframe {selectedKeyframe+1})"
- textarea редактирует промпт ВЫБРАННОГО кейфрейма
- При клике на другой кейфрейм — переключается

### 5. Обновить функции-хелперы

- `updateScenePrompt(sceneId, prompt)` → обновлять промпт ВЫБРАННОГО кейфрейма в сцене
- `toggleUseMasterChar` — без изменений
- `updateAnimationPrompt` — без изменений
- Добавить `addKeyframe(sceneId)` — добавляет кейфрейм (макс 6) + добавляет videoSegment
- Добавить `removeKeyframe(sceneId, kfIndex)` — удаляет кейфрейм (мин 1) + удаляет videoSegment
- Добавить `selectKeyframe(sceneId, kfIndex)` — переключает selectedKeyframe
- `switchAspectRatio` — обновить для работы с keyframes[].prompt вместо scene.prompt

### 6. Step 4 (Generate) — обновить генерацию

**generateScene(scene):**
- Теперь генерирует изображения для ВСЕХ кейфреймов сцены последовательно
- Для каждого кейфрейма вызывает `/api/cref/generate-scene` с промптом этого кейфрейма
- Обновляет `keyframes[i].imageUrl` и `keyframes[i].status` по мере готовности
- Сцена считается `done` когда ВСЕ кейфреймы done

**generateKlingVideo(scene):**
- Теперь генерирует видео для каждого СЕГМЕНТА (пары кейфреймов):
  - Сегмент 0: keyframes[0].imageUrl → keyframes[1].imageUrl
  - Сегмент 1: keyframes[1].imageUrl → keyframes[2].imageUrl
  - и т.д.
- При вызове `/api/kling/generate-video` передавать:
  - `imageUrl` = start keyframe imageUrl
  - `endImageUrl` = end keyframe imageUrl (НОВОЕ поле, бэкенд добавит)
- Если у сцены 1 кейфрейм — генерить как раньше (только start frame, без endImageUrl)
- Полить каждый сегмент отдельно

**UI сцены в step 4:**
- Показывать прогресс по сегментам: "Segment 1/3 processing..."
- Видео-плеер показывает первый готовый сегмент (или merged если все готовы)
- Статусы: иконки для каждого сегмента

**doneCount:**
- Сцена done = все keyframes имеют imageUrl
- Сцена video done = все videoSegments имеют videoStatus === 'done'

### 7. Обновить mergeAllVideos

Собирать videoUrls из ВСЕХ сегментов ВСЕХ сцен (не из scene.videoUrl):
```ts
const videoUrls = scenes.flatMap(s => 
  s.videoSegments
    .filter(seg => seg.videoStatus === 'done' && seg.videoUrl)
    .map(seg => seg.videoUrl!)
);
```

### 8. Обновить Download All

Скачивать images всех кейфреймов + видео всех сегментов.

## Важно
- НЕ трогай API роуты, lib/, providers/
- Вся работа в `src/components/Studio.tsx`
- `klingDuration` уже есть в состоянии компонента — используй для расчёта длительности
- Стиль: dark theme, glass-card, те же цвета что сейчас
