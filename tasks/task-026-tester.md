# task-026: SeaDream + Auto-merge + Final Library — Verification

## Зависимости

Жди пока все три backend-задачи (seadream, route, merge) и frontend зарепортят done в chat.md.

## 13 проверок

### Backend: SeaDream (task-026-backend-seadream)

1. `npx tsc --noEmit` — 0 ошибок
2. `src/lib/providers/higgsfield-web.ts` — сигнатура `generateImage(prompt, opts?)` — второй параметр объект `{model?, count?}`, НЕ позиционный `count: number`
3. `src/lib/providers/higgsfield-web.ts` — содержит URL для seadream (grep: `seadream-5-lite` или `seedream-5-lite`). Процитируй строку
4. `scripts/seadream-spike.ts` — существует
5. `data/seadream-spike.png` — существует

### Backend: Route (task-026-backend-route)

6. `src/app/api/cref/generate-scene/route.ts` — импортирует `resolveProvider`
7. `src/app/api/cref/generate-scene/route.ts` — ветка `if (mode === 'higgsfield')` присутствует, зовёт `generateImage(..., { model: 'seadream-5-lite' })`, есть try/finally с `disconnect()`

### Backend: Merge + DB (task-026-backend-merge)

8. `src/lib/schema.sql` — таблица `videos` содержит колонку `video_url TEXT`
9. PRAGMA table_info — колонка `video_url` есть. Проверь через:
   ```
   node -e "const db=require('better-sqlite3')('data/app.db'); console.log(db.prepare('PRAGMA table_info(videos)').all())"
   ```
10. `src/app/api/kling/merge-video/route.ts` — пишет файл в `public/generations/` (grep `copyFileSync` и `public/generations`), возвращает `videoUrl` в JSON-ответе

### Frontend (task-026-frontend)

11. `src/components/Studio.tsx` — useEffect auto-trigger `mergeAllVideos` (grep `every(s => s.videoStatus === 'done'` или похожее)
12. `src/components/Studio.tsx` — финальная модалка (grep `showFinalModal`)
13. `src/components/VideoLibrary.tsx` — Download для карточек с `video_url` (grep `video_url` или `video.video_url`)

## Формат отчёта

На каждую — строка:
```
✅ #1 tsc clean
✅ #2 generateImage signature (нашёл: "opts?: { model?: ..., count?: number }")
❌ #3 — FAIL, причина
```

В конце — `N/13 PASS`.

## НЕ ТРОГАЙ

- Ничего. Только проверки.
