# Task 009: FFmpeg merge двух клипов + сохранение в public/ + запись в Library

## Приоритет: ВЫСОКИЙ
## Зависимости: task-006, task-007, task-008
## Блокирует: — (финальная задача пайплайна)

## Описание

После того как оба видео клипа (scene1→scene2, scene2→end) готовы — склеить их в один финальный mp4, сохранить в `public/generations/{mergeJobId}/final.mp4`, создать запись в таблице `videos` с `video_url` указывающим на этот файл.

**Большая часть уже есть** в `src/app/api/kling/merge-video/route.ts` — но сейчас он пишет в tmpdir и возвращает base64. Надо добавить сохранение в public + правильный URL в ответе.

**Это чисто backend-работа** — никакого Studio.tsx/VideoLibrary.tsx. Frontend auto-merge и Download UI уже были реализованы в task-026-frontend и закоммичены (commit `04374bc`), они просто не работали потому что видео не доходили до `done`.

### Шаг 1: Убедиться что миграция `video_url` применена

Файл: `src/lib/schema.sql`

Проверь что таблица `videos` содержит колонку `video_url TEXT` (должна быть — уже добавлена в task-026-backend-merge):

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
  video_url TEXT,  -- present? if not, add.
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Если нет — добавить, плюс idempotent `ALTER TABLE` в `db-init.ts`:

```ts
try {
  db().prepare(`ALTER TABLE videos ADD COLUMN video_url TEXT`).run();
} catch {
  /* column exists */
}
```

### Шаг 2: Проверить merge-video route

Файл: `src/app/api/kling/merge-video/route.ts`

Должен содержать (commit `04374bc` это добавил):

```ts
const jobId = `merge_${Date.now()}`;
const publicDir = path.join(process.cwd(), 'public', 'generations', jobId);
mkdirSync(publicDir, { recursive: true });
const finalPublicPath = path.join(publicDir, 'final.mp4');
copyFileSync(outPath, finalPublicPath);
const publicUrl = `/generations/${jobId}/final.mp4`;

return NextResponse.json({
  success: true,
  videoBase64: base64,   // keep for backward compat
  videoUrl: publicUrl,   // NEW — Studio writes this into videos.video_url
  mimeType: 'video/mp4',
  sceneCount: videoUrls.length,
});
```

Если `copyFileSync` / `videoUrl` отсутствует — добавить.

### Шаг 3: Проверить что `/api/videos` POST принимает `video_url`

Файл: `src/app/api/videos/route.ts`

INSERT должен включать колонку `video_url`:

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
  body.video_url ?? null,
);
```

И GET должен вернуть `video_url` (`SELECT *` уже делает, но проверь что тип `Video` в `src/lib/types.ts` содержит `video_url?: string`).

### Шаг 4: Усилить error handling при FFmpeg

Текущий merge route:
- не проверяет что ffmpeg доступен в PATH — упадёт с generic error
- timeout 120s — для 2 × 5s клипов ок, но можно уменьшить до 60s
- не логирует stderr ffmpeg при неудаче

Добавь:

```ts
try {
  const { stderr } = await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`,
    { timeout: 60_000 },
  );
  if (stderr) console.log('[ffmpeg]', stderr.slice(0, 500));
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[merge-video] ffmpeg failed:', msg);
  return NextResponse.json(
    { error: `ffmpeg failed: ${msg.slice(0, 200)}` },
    { status: 500 },
  );
}
```

## Критерии готовности

### Общие
- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] **Pre-condition** (не критерий, а setup): `ffmpeg --version` доступен в PATH

### Browser automation / UI (DoD §2 + §4) — ПОЛНЫЙ E2E PIPELINE
Это **финальный acceptance test** всего провайдера — от пустого Studio до скачанного финального mp4 в Library. Если этот тест не проходит — все предыдущие 006/007/008 откатываются.

**E2E шаги (строго в этом порядке):**
1. [ ] Dev-server чистый старт (`npm run dev`), в Studio войти как admin, higgsfield-mode включён
2. [ ] Script: **2 строки** ("A white cat on a wooden porch at sunset" / "The same cat lands in a flower field")
3. [ ] Style: Anime, Next до Step 4
4. [ ] Нажми **Generate All** (auto-video=ON)
5. [ ] Без ручного вмешательства дождись завершения
6. [ ] Подтверди каждое:
  - [ ] Оба фото: через Seedream 5 Lite с Unlimited (audit: 2 × `selectModel:done image=Seedream 5.0 lite` + 2 × `enableUnlimited:done image`)
  - [ ] Оба видео: через Kling 2.5 Turbo с Unlimited-баннером (audit: 2 × `selectModel:done video=Kling 2.5 Turbo` + 2 × `enableUnlimited:done video`)
  - [ ] **ОДИН** Chrome browser context использован на весь пайплайн (audit: ровно 1 × `ensureContext:launch` на всё про всё)
  - [ ] Стоимость каждой генерации = 0 кредитов (никаких `Generate\n6` в финальном UI)
  - [ ] auto-merge триггерится сам (useEffect в Studio, `04374bc`)
  - [ ] `public/generations/merge_*/final.mp4` существует, размер **> 1MB**, длительность **≈10s** (2 × 5s клипов)
  - [ ] final.mp4 реально воспроизводится: открой в VLC/Windows Media Player, визуально подтверди переход scene1→scene2
  - [ ] Запись в `videos`: `video_url LIKE '/generations/merge_%/final.mp4'`, `status='complete'`, `style='Anime'`
  - [ ] Studio-модалка "Final video ready" появилась автоматически, `<video>` играет
  - [ ] Кнопка Download в модалке скачивает именно этот final.mp4 (проверь checksum файла скачанного vs файла в public/)
  - [ ] В разделе VideoLibrary появилась новая карточка — у неё кнопка Download ведёт на тот же final.mp4
  - [ ] **Pause-тест посреди pipeline:** запусти ещё раз с 2 сценами, после начала первого видео — POST /pause → /status=`paused` → /resume → пайплайн завершается успешно

**Evidence pack (КРИТИЧНО — без этого tester не закрывает):**
- [ ] `data/task-009-evidence/e2e-full-run.log` — выдержка dev-server stdout за весь прогон (от первого POST /generate-scene до INSERT videos)
- [ ] `data/task-009-evidence/e2e-audit.log` — выдержка `data/higgsfield-audit.log` за весь прогон
- [ ] `data/task-009-evidence/final-modal.png` — Studio-модалка "Final video ready"
- [ ] `data/task-009-evidence/library-card.png` — карточка в VideoLibrary с Download
- [ ] `data/task-009-evidence/final-sample.mp4` — копия финального склеенного видео
- [ ] `data/task-009-evidence/pause-during-pipeline.log` — лог пауза-теста
- [ ] `data/task-009-evidence/db-dump.txt` — `SELECT id, title, status, video_url FROM videos ORDER BY id DESC LIMIT 5`

### API (DoD §3)
- [ ] ffmpeg stderr логируется даже при успехе (видно в dev-server logs)
- [ ] Error-таймаут ffmpeg: создай концат-файл с несуществующим путём, дёрни `/api/kling/merge-video`, получи 500 с понятным сообщением (не тикает 120s timeout)

### Migration (DoD §5)
- [ ] `PRAGMA table_info(videos)` содержит `video_url` колонку
- [ ] Существующие записи videos (если были seed'ом) не повреждены — `SELECT count(*)` до и после task-009 совпадает

## Файлы
- **Проверить/изменить:** `src/app/api/kling/merge-video/route.ts`, `src/app/api/videos/route.ts`, `src/lib/schema.sql`, `src/lib/db-init.ts`, `src/lib/types.ts`
- **НЕ трогать:** Studio.tsx, VideoLibrary.tsx (frontend уже сделан в commit 04374bc)
- **НЕ трогать:** higgsfield-web.ts, browser-helpers.ts (это задача 007/008)

## Evidence pack
В `data/task-009-evidence/`:
- final-modal.png
- library-card.png
- final-sample.mp4 (копия merged видео)
- merge-route.log (stdout/stderr dev-сервера во время merge)
- db-after.sql (выдача `SELECT * FROM videos WHERE video_url LIKE '/generations/merge_%'`)

## Примечания по интеграции

Поскольку frontend уже ждёт `videoUrl` в ответе от merge-video и пишет его в POST /api/videos с `video_url` ключом — достаточно, чтобы backend отдавал правильный формат. Если что-то в задаче 026 было недоделано — допилить. Но **не переписывать Studio.tsx или VideoLibrary.tsx**.
