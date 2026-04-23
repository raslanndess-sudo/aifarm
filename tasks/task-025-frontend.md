# Task 025 — Frontend: откат кейфреймов, простые сцены с +/× 

## Проблема
Task-024 добавил кейфреймы ВНУТРИ каждой сцены — это выглядит нелогично. Юзер хочет проще:
- Каждая сцена = один кадр (один image prompt, одна картинка)
- Кнопка "+" добавляет НОВУЮ сцену-карточку в конец
- Кнопка "×" на сцене удаляет её
- Видео генерится между ПАРАМИ СОСЕДНИХ сцен: Scene[i] → Scene[i+1] = один клип

## Что делать

### 1. Откатить типы — убрать Keyframe/VideoSegment, вернуть простой Scene

```ts
interface Scene {
  id: string;
  prompt: string;
  animationPrompt: string;
  imageUrl: string | null;
  videoUrl: string | null;        // клип ОТ этой сцены К следующей
  videoTaskId: string | null;
  useMasterChar: boolean;
  status: 'idle' | 'generating' | 'done';
  videoStatus: 'idle' | 'queued' | 'processing' | 'done' | 'failed';
  dbVideoId: number | null;
}
```

Удалить интерфейсы `Keyframe` и `VideoSegment`.

### 2. Убрать функции кейфреймов

Удалить: `addKeyframe`, `removeKeyframe`, `selectKeyframe`.

### 3. Добавить функции для сцен

```ts
const addScene = () => {
  const idx = scenes.length;
  setScenes(prev => [...prev, {
    id: `scene_${Date.now()}`,
    prompt: '',
    animationPrompt: deriveAnimationPrompt('', aspectRatio),
    imageUrl: null,
    videoUrl: null,
    videoTaskId: null,
    useMasterChar: masterCharLocked,
    status: 'idle',
    videoStatus: 'idle',
    dbVideoId: null,
  }]);
};

const removeScene = (sceneId: string) => {
  setScenes(prev => prev.filter(s => s.id !== sceneId));
};
```

### 4. Вернуть `updateScenePrompt` к простому виду

```ts
const updateScenePrompt = (id: string, prompt: string) => {
  setScenes(prev => prev.map(s => s.id === id ? { ...s, prompt } : s));
};
```

### 5. Storyboard UI (step 3) — вернуть к старому виду + добавить +/×

Каждая карточка сцены — КАК БЫЛО ДО task-024:
- Заголовок с номером + Cref checkbox + кнопка × (удалить сцену)
- Большой превью (aspect-ratio image)
- Image Prompt textarea
- Animation Prompt textarea
- Убрать keyframe strip
- Убрать "2 frames → 1 clip × 5s = 5s"

Добавить в КОНЦЕ grid (после всех сцен) — карточку "+":
```tsx
<button onClick={addScene} className="glass-card p-4 flex flex-col items-center justify-center border-2 border-dashed border-border-subtle hover:border-purple-500/30 transition-all min-h-[200px]">
  <Plus className="w-8 h-8 text-text-muted mb-2" />
  <span className="text-xs text-text-muted">Add Scene</span>
</button>
```

Кнопка × на каждой сцене — в правом верхнем углу заголовка, рядом с Cref:
```tsx
<button onClick={() => removeScene(scene.id)} className="..." title="Remove scene">
  <X className="w-3.5 h-3.5" />
</button>
```

### 6. Добавить info-текст общий (не per-scene)

В заголовке Storyboard (рядом с "6 scenes"):
```
{scenes.length} scenes → {Math.max(0, scenes.length - 1)} clips × {klingDuration}s = {Math.max(0, scenes.length - 1) * parseInt(klingDuration)}s
```

### 7. Генерация видео — между соседними сценами

`generateKlingVideo` теперь принимает текущую сцену И следующую:

```ts
const generateKlingVideoForPair = async (scene: Scene, nextScene: Scene | null) => {
  if (!scene.imageUrl) return;
  // ... mark scene.videoStatus = 'queued'
  const body: Record<string, unknown> = {
    imageUrl: scene.imageUrl,
    animationPrompt: scene.animationPrompt,
    modelName: klingModel,
    duration: klingDuration,
    mode: 'std',
    waitForResult: false,
  };
  // Если есть следующая сцена с картинкой — передать как end frame
  if (nextScene?.imageUrl) {
    body.endImageUrl = nextScene.imageUrl;
  }
  // ... остальное как раньше (fetch, poll, etc.)
};
```

В `generateAllScenes`:
- Сначала сгенерировать ВСЕ изображения
- Потом для каждой сцены (кроме последней): `generateKlingVideoForPair(scenes[i], scenes[i+1])`
- Последняя сцена: `generateKlingVideoForPair(scenes[last], null)` — без end frame

### 8. mergeAllVideos — собрать videoUrl из всех сцен по порядку

```ts
const videoUrls = scenes
  .filter(s => s.videoStatus === 'done' && s.videoUrl)
  .map(s => s.videoUrl!);
```

### 9. Step 4 (Generate) — вернуть к простому виду

Каждая сцена в grid — как до task-024:
- Превью image/video
- Scene номер + статус иконки
- Prompt текст
- Кнопки Photo/Video/Retry/Download

**doneCount** = scenes с imageUrl. **videoDoneCount** = scenes с videoStatus==='done'.

### 10. parseScenes — вернуть к простому виду

Каждая сцена создаётся с одним промптом (не массив кейфреймов):
```ts
setScenes(lines.map((p, i) => ({
  id: `scene_${i}`,
  prompt: p,
  animationPrompt: deriveAnimationPrompt(p, aspectRatio),
  imageUrl: null,
  videoUrl: null,
  videoTaskId: null,
  useMasterChar: masterCharLocked,
  status: 'idle',
  videoStatus: 'idle',
  dbVideoId: null,
})));
```

## Важно
- Весь рефакторинг только в `src/components/Studio.tsx`
- НЕ трогай API, lib, providers
- Стиль как был — glass-card, dark theme
- Кнопка × НЕ показывается если осталась 1 сцена
- Проверь tsc --noEmit в конце
