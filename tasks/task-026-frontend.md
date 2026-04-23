# task-026: Auto-merge + Final Download UI — Frontend

## Цель

Когда все видео сцен готовы — **автоматически** запускать склейку, после склейки создавать запись в БД с `video_url`, показывать модалку «Final video ready» со ссылкой в Library. В `VideoLibrary` — кнопка Download у карточек с `video_url`.

## Зависимость

- task-026-backend-merge (сохранение файла + миграция schema + `/api/videos` принимает video_url)

Не начинай пока backend-merge не зарепортит done.

## Шаг 1 — Auto-merge trigger в Studio

Файл: `src/components/Studio.tsx`

Добавь useEffect (после существующего auto-parse useEffect, строка ~562):

```tsx
// Auto-trigger merge когда все видео готовы
useEffect(() => {
  const allVideosDone =
    scenes.length > 0 &&
    scenes.every(s => s.videoStatus === 'done' && s.videoUrl);
  if (allVideosDone && !mergedVideoUrl && !isMerging) {
    void mergeAllVideos();
  }
}, [scenes, mergedVideoUrl, isMerging]);
```

## Шаг 2 — Сохранять `video_url` в БД при merge

В `mergeAllVideos()` (строка ~279) — после успеха ffmpeg в блоке сохранения в /api/videos добавь `video_url: data.videoUrl ?? null`:

```tsx
await fetch('/api/videos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: `${style} — Final Cut (${scenes.length} scenes)`,
    status: 'complete',
    style: style,
    duration: `${doneCount * parseInt(klingDuration)}s`,
    video_url: data.videoUrl ?? null,  // ← NEW
  }),
});
```

## Шаг 3 — Финальная модалка «Video ready»

Добавь state:

```tsx
const [showFinalModal, setShowFinalModal] = useState(false);
```

В `mergeAllVideos()` после `setMergedVideoUrl(...)` — `setShowFinalModal(true)`.

Модалка (внутри JSX step 4, в самом конце):

```tsx
{showFinalModal && mergedVideoUrl && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div className="glass-card p-8 max-w-md text-center">
      <div className="text-lg font-semibold text-text-primary mb-2">Final video ready</div>
      <p className="text-sm text-text-muted mb-5">
        Склейка готова и сохранена в Library.
      </p>
      <video src={mergedVideoUrl} controls className="w-full rounded-lg mb-5" />
      <div className="flex gap-2 justify-center">
        <a href={mergedVideoUrl} download="final.mp4" className="btn-primary px-4 py-2 rounded-lg text-sm">Download</a>
        <button onClick={() => setShowFinalModal(false)} className="px-4 py-2 rounded-lg text-sm bg-white/[0.06] text-text-primary">Close</button>
      </div>
    </div>
  </div>
)}
```

## Шаг 4 — Download в VideoLibrary

Файл: `src/components/VideoLibrary.tsx`

У каждой карточки — если `video.video_url` задан, показать Download-кнопку:

```tsx
{video.video_url && (
  <a
    href={video.video_url}
    download
    className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
  >
    <Download className="w-3.5 h-3.5" />
    Download
  </a>
)}
```

(Импорт `Download` из `lucide-react` добавить если нет)

## Шаг 5 — TypeScript проверка

`npx tsc --noEmit` → 0 ошибок. Тип `Video` в `src/lib/types.ts` должен содержать `video_url?: string` — это делает backend-merge.

## Отчёт в chat.md

- tsc clean
- Auto-merge useEffect добавлен
- Финальная модалка работает
- Download-кнопка в VideoLibrary

## НЕ ТРОГАЙ

- API routes
- higgsfield-web.ts
- resolve-provider.ts
