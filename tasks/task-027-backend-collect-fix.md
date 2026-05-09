# task-027-backend: фикс collectAndDownloadVideos + миграция БД

## Контекст бага (диагностика PM от 2026-05-05)

Юзер сгенерировал 2 видео в Higgsfield (Kling 2.5 Turbo Unlimited). На сайте оба готовы. Финальная модалка в Studio показала **чужое 15-секундное видео мужика-стримера** вместо результата.

**Аудит-лог `data/higgsfield-audit.log` (13:13:21–13:14:51):**
```
collectAndDownloadVideos:start — expected=2 collectStart=1777986801138
collectAndDownloadVideos:click-scan — 0 figures, need 2 more
collectAndDownloadVideos:poll #1 total=1/2 elapsed=4s     ← откуда взялся 1?
... 9 опросов с total=1/2 ...
collectAndDownloadVideos:poll #10 total=2/2 elapsed=89s
collectAndDownloadVideos:saved — vid_1777986648450 → 3204322 bytes
collectAndDownloadVideos:done — saved 1/2                  ← only 1 saved!
```

**Что в `public/generations/scenario_1777986891500/`:**
- `scene_01.mp4` 15.07s — НЕ свежак, старое видео из истории Higgsfield
- `final.mp4` 15.09s — re-encoded copy of scene_01

**Папки `vid_1777986769306/clips/`** — пустая (вторая сцена вообще не сохранилась).

## Корневые причины (3 бага)

### Баг #1: `scrapeDomMp4s()` игнорирует `collectStart`

Файл: `src/lib/providers/higgsfield-web.ts` (строка 530).

`scrapeDomMp4s()` хватает `<video src>` и `a[href]` со всей страницы /ai/video — а там лента ВСЕЙ истории пользователя. Никакого фильтра по дате нет. На первом же polling в `mp4Urls[0]` попадает старое видео из истории.

`tryDomClickExtract()` (строка 578) — та же проблема. Кликает по figure[0..12] и хватает любой mp4.

`getCapturedMp4sSince(collectStart)` (строка 628) — вот этот корректный, фильтрует по timestamp. Но он один из трёх источников.

### Баг #2: тихий пропуск пустых slot'ов

Цикл сохранения (строка 658):
```ts
for (let i = 0; i < submittedJobs.length; i++) {
  const mp4Url = mp4Urls[i];
  if (!mp4Url) {
    results.push({ jobId, resultUrl: null, error: 'no mp4 captured for this slot' });
    continue;   // ← НЕТ auditLog
  }
  ...
}
```

Если `mp4Urls.length < expectedCount`, цикл тихо ставит `error` без `auditLog`. Из лога не видно сколько слотов пропущено.

### Баг #3: миграция БД не накатилась

Колонки `video_url` в `videos` НЕТ. Юзер делал генерации, фронт делает `POST /api/videos { video_url: ... }`, но при INSERT `video_url` не сохраняется (или ломает запрос).

Проверка:
```bash
node -e "const Database = require('better-sqlite3'); console.log(new Database('data/app.db', {readonly:true}).prepare('PRAGMA table_info(videos)').all().map(r=>r.name))"
```

Должна быть колонка `video_url` (TEXT). Сейчас её нет.

## Что чинить

### Шаг 1 — миграция БД

Файл: `src/lib/db-init.ts`

Найди функцию инициализации. После создания таблиц добавь идемпотентный ALTER:
```ts
try {
  db().prepare(`ALTER TABLE videos ADD COLUMN video_url TEXT`).run();
} catch (e) {
  // Колонка уже есть — SQLite кидает "duplicate column name"
}
```

В `src/lib/schema.sql` тоже добавь `video_url TEXT` в CREATE TABLE videos (для свежих БД).

Проверь: перезапусти dev-сервер (или дёрни POST /api/db/init), потом `PRAGMA table_info(videos)` должен показать `video_url`.

### Шаг 2 — фильтр по collectStart на ВСЕХ источниках

Файл: `src/lib/providers/higgsfield-web.ts`

Higgsfield пишет timestamp в URL: `hf_20260505_131618_d70003e5-...`. Парсим его и сравниваем с `collectStart`.

Добавь утилиту в начале файла или прямо перед `collectAndDownloadVideos`:
```ts
function extractHfTimestamp(url: string): number | null {
  // hf_YYYYMMDD_HHMMSS_<uuid>.mp4
  const m = url.match(/hf_(\d{8})_(\d{6})_/);
  if (!m) return null;
  const ymd = m[1], hms = m[2];
  const yyyy = +ymd.slice(0, 4);
  const mm = +ymd.slice(4, 6) - 1;
  const dd = +ymd.slice(6, 8);
  const HH = +hms.slice(0, 2);
  const MM = +hms.slice(2, 4);
  const SS = +hms.slice(4, 6);
  return Date.UTC(yyyy, mm, dd, HH, MM, SS);
}
```

В `mergeInto` добавь фильтр (с буфером −60s на drift):
```ts
const mergeInto = (urls: string[]) => {
  for (const u of urls) {
    if (capturedSet.has(u)) continue;
    if (!(/cloudfront\.net\/user_/i.test(u) || /amazonaws\.com\/.+\.mp4/i.test(u))) continue;
    const ts = extractHfTimestamp(u);
    if (ts !== null && ts < collectStart - 60_000) {
      // старое видео из истории — пропускаем
      continue;
    }
    capturedSet.add(u);
    mp4Urls.push(u);
  }
};
```

Если `extractHfTimestamp` вернул null (urls без даты в имени) — НЕ отбрасываем (могут быть amazonaws-урлы), пусть проходят.

### Шаг 3 — явный лог пропущенных slot'ов

В цикле сохранения (строка 658):
```ts
if (!mp4Url) {
  auditLog('collectAndDownloadVideos:slot-empty', `slot[${i}] jobId=${jobId} — no mp4 captured`);
  results.push({ jobId, resultUrl: null, error: 'no mp4 captured for this slot' });
  continue;
}
```

И перед циклом залогируй итог:
```ts
auditLog('collectAndDownloadVideos:final-mp4-list', `count=${mp4Urls.length} urls=${JSON.stringify(mp4Urls.map(u => u.slice(-80)))}`);
```

### Шаг 4 — TypeScript

`npx tsc --noEmit` → 0 ошибок.

## Отчёт через say.sh

- `say.sh backend done "task-027 done: видим миграция (PRAGMA показал video_url), фильтр по hf_timestamp в mergeInto, slot-empty audit, tsc clean"`
- Если в spike-режиме нашёл что-то ещё странное — отдельным `say.sh backend status "..."`.

## НЕ ТРОГАЙ

- Studio.tsx
- merge-video route (это отдельная задача)
- Higgsfield browser-helpers
