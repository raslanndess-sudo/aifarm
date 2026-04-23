# task-026: Сохранение финального видео + DB — Backend

## Цель

После `mergeAllVideos()` финальный mp4 должен:
1. Лежать физическим файлом в `public/generations/{jobId}/final.mp4`
2. Иметь запись в таблице `videos` с полем `video_url` указывающим на этот файл
3. Отображаться в `VideoLibrary` как скачиваемая карточка

## Шаг 1 — Миграция schema

Файл: `src/lib/schema.sql`

В блок `CREATE TABLE IF NOT EXISTS videos` добавь колонку `video_url`:

```sql
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  thumbnail TEXT,
  duration TEXT,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','processing','complete','failed','scheduled')),
  platform TEXT CHECK(platform IN ('TikTok','Reels','Shorts')),
  views INTEGER DEFAULT 0,
  style TEXT,
  video_url TEXT,  -- ← NEW
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

SQLite не делает автомиграцию — для существующей БД нужен `ALTER TABLE`. Добавь в `src/lib/db-init.ts` (или там где инициализация БД) идемпотентный fallback:

```ts
try {
  db().prepare(`ALTER TABLE videos ADD COLUMN video_url TEXT`).run();
} catch (e) {
  // Колонка уже существует — SQLite кидает "duplicate column name"
}
```

## Шаг 2 — `/api/kling/merge-video` сохраняет файл

Файл: `src/app/api/kling/merge-video/route.ts`

Сейчас: ffmpeg пишет в tmpdir, потом читается в base64, tmp стирается.

Надо: **до** удаления tmp — копировать `outPath` в `public/generations/merge_{ts}/final.mp4`. Возвращать в ответе `videoUrl: '/generations/merge_{ts}/final.mp4'` **плюс** существующий `videoBase64` (оставь для обратной совместимости — фронт пока на нём).

```ts
import { mkdirSync, copyFileSync } from 'fs';

// После ffmpeg, до чтения base64:
const jobId = `merge_${Date.now()}`;
const publicDir = path.join(process.cwd(), 'public', 'generations', jobId);
mkdirSync(publicDir, { recursive: true });
const finalPublicPath = path.join(publicDir, 'final.mp4');
copyFileSync(outPath, finalPublicPath);
const publicUrl = `/generations/${jobId}/final.mp4`;

// Дальше — чтение base64 как было
const merged = await fs.readFile(outPath);
const base64 = merged.toString('base64');

return NextResponse.json({
  success: true,
  videoBase64: base64,
  videoUrl: publicUrl,        // ← NEW
  mimeType: 'video/mp4',
  sceneCount: videoUrls.length,
});
```

**Важно:** `copyFileSync` должен быть **до** `finally` блока который стирает `tmpDir`.

## Шаг 3 — `/api/videos` POST принимает video_url

Файл: `src/app/api/videos/route.ts`

Найди INSERT в videos (строка ~53), добавь колонку `video_url`:

```ts
db().prepare(
  `INSERT INTO videos (title, thumbnail, duration, status, platform, views, style, video_url)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  body.title,
  body.thumbnail ?? null,
  body.duration ?? null,
  body.status ?? 'queued',
  body.platform ?? null,
  body.views ?? 0,
  body.style ?? null,
  body.video_url ?? null,  // ← NEW
);
```

То же самое в GET — возвращать `video_url` в каждой записи (SELECT * уже его заберёт, но проверь что TS-тип `Video` в `src/lib/types.ts` содержит `video_url?: string`).

## Шаг 4 — TS-тип

Файл: `src/lib/types.ts`

В интерфейсе `Video` добавить:

```ts
video_url?: string;
```

## Шаг 5 — TypeScript проверка

- `npx tsc --noEmit` → 0 ошибок
- Перезапусти dev-сервер если запущен — чтобы миграция ALTER TABLE выполнилась
- Проверь БД: `sqlite3 data/app.db "PRAGMA table_info(videos);"` → колонка `video_url` видна

## Отчёт в chat.md

- tsc clean (да/нет)
- `video_url` в PRAGMA table_info (да/нет)
- Новый merge_job пишется в `public/generations/merge_*` (можно проверить вручную: dummy-запрос к merge-video с двумя тестовыми клипами)

## НЕ ТРОГАЙ

- higgsfield-web.ts
- Studio.tsx (авто-merge = задача фронта)
- VideoLibrary.tsx (Download-кнопка = задача фронта)
