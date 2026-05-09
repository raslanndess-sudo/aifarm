# Task-008 — User live testing instructions

**Для кого:** пользователь (не backend-agent).
**Что проверяет:** `generateImage()` и `generateVideo()` из `src/lib/providers/higgsfield-web.ts` — реальная генерация через Higgsfield UI клики + webp→png конвертация через sharp.
**Запускается:** из Windows PowerShell. Каждый тест — отдельный скрипт в `scripts/`.

---

## 0. Что у тебя должно быть

- Проект в `E:\Users\rasla\Desktop\ai-video-platform`
- Node.js установлен (`node --version` > 18)
- `npm install sharp` выполнен из Windows PowerShell (v0.34.5+)
- Chrome установлен, залогинен в Higgsfield через user-data-dir `E:\Users\rasla\chrome-automation-safe`

---

## 1. Prerequisites — поднять Chrome

Закрой все Chrome-процессы на `chrome-automation-safe`:

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'chrome-automation-safe' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

Запусти Chrome с remote-debugging:

```powershell
& "E:\Users\rasla\Desktop\ai-video-platform\skrpt auth hg\start.ps1" -Mode playwright
```

Проверь:

```powershell
Invoke-WebRequest -Uri "http://localhost:9223/json/version" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Должно вернуть `{"Browser":"Chrome/..."}`.

---

## 2. Подготовь evidence-папку

```powershell
cd E:\Users\rasla\Desktop\ai-video-platform
New-Item -ItemType Directory -Force -Path data\task-008-evidence | Out-Null
```

---

## 3. План прогонки

### Сессия 1 (основной критический путь)

| Порядок | Скрипт | Что проверяет | Время |
|---|---|---|---|
| 1 | `task-008-test1-image.ts` | generateImage через Seedream | ~3 мин |
| 2 | `task-008-test2-video.ts` | generateVideo через Kling (использует image из TEST 1) | ~6 мин |
| 3 | `task-008-test5-two-scenes.ts` | 2 сцены подряд, singleton reuse | ~20 мин |

### Сессия 2 (дополнительные)

| Порядок | Скрипт | Что проверяет | Prerequisite |
|---|---|---|---|
| 4 | `task-008-test3-webp.ts` | webp→png конвертация через sharp | .webp файл в корне |
| 5 | `task-008-test4-pause.ts` | pause/resume во время генерации | `npm run dev` на localhost:3000 |

---

## TEST 1 — generateImage

```powershell
cd E:\Users\rasla\Desktop\ai-video-platform
npx tsx scripts/task-008-test1-image.ts
```

Можно передать свой промпт:
```powershell
npx tsx scripts/task-008-test1-image.ts "A red dragon on a mountain, fantasy style"
```

### Что происходит в Chrome

1. Открывается `higgsfield.ai/ai/image`
2. Composer-кнопка → **"Seedream 5.0 lite"**
3. Unlimited switch → включён
4. Промпт вводится в Lexical
5. Кликается Generate
6. Ожидание до 3 мин → картинка скачивается

### Чек-лист

- [ ] В консоли видно `TEST 1 PASS`
- [ ] `public/generations/img_*/image_0.png` — содержит сгенерированную картинку
- [ ] `data/task-008-evidence/test1/image_0.png` — копия
- [ ] `data/task-008-evidence/test1/audit-extract.log` — `selectModel:done image=Seedream 5.0 lite`, `enableUnlimited:done image`
- [ ] Сделай скриншот Chrome в момент генерации → `data/task-008-evidence/image-generate.png`

---

## TEST 2 — generateVideo

**Prerequisite:** TEST 1 прошёл (нужна картинка как start frame).

```powershell
npx tsx scripts/task-008-test2-video.ts
```

### Что происходит в Chrome

1. Открывается `higgsfield.ai/ai/video`
2. Model → **"Kling 2.5 Turbo"**
3. Start frame загружается из TEST 1
4. Unlimited активируется (toggle или баннер)
5. Промпт → `textarea#prompt`
6. Кликается Generate
7. Ожидание до 5 мин → видео скачивается

### Чек-лист

- [ ] В консоли видно `TEST 2 PASS`
- [ ] `public/generations/vid_*/clips/clip_0.mp4` — существует, >500KB
- [ ] `data/task-008-evidence/test2/clip_0.mp4` — копия
- [ ] `data/task-008-evidence/test2/audit-extract.log` — `selectModel:done video=Kling 2.5 Turbo`, `enableUnlimited:done`, `generateVideo:downloaded`
- [ ] Сделай скриншот Chrome → `data/task-008-evidence/video-generate.png`

---

## TEST 3 — webp→png конвертация

**Prerequisite:** .webp файл. Если нет:

```powershell
Invoke-WebRequest -Uri "https://www.gstatic.com/webp/gallery/1.webp" -OutFile test-webp.webp
```

```powershell
npx tsx scripts/task-008-test3-webp.ts
```

Или с явным путём:
```powershell
npx tsx scripts/task-008-test3-webp.ts my-image.webp
```

### Чек-лист

- [ ] В консоли видно `PNG verification: PASS` и `TEST 3 PASS`
- [ ] `public/generations/vid_*/start_frame.png` — магия `89 50 4E 47` (PNG)
- [ ] `data/task-008-evidence/test3/webp-test.log` — `downloadToTempPng:converted webp → png`
- [ ] Upload в Kling прошёл без ошибки формата

---

## TEST 4 — pause/resume

**Prerequisite:** dev-server на localhost:3000.

```powershell
# Терминал 1:
npm run dev

# Терминал 2:
npx tsx scripts/task-008-test4-pause.ts
```

Скрипт сам:
1. Запускает generateImage
2. Через 8 секунд шлёт POST /pause
3. Проверяет GET /status → `status: "paused"`
4. Через 5 секунд шлёт POST /resume
5. Ждёт завершения генерации

### Чек-лист

- [ ] В консоли видно `PAUSE VERIFIED` и `TEST 4 PASS`
- [ ] `data/task-008-evidence/test4/pause-during-gen.log` — статус `paused` + checkpoint audit lines

---

## TEST 5 — 2 сцены подряд

```powershell
npx tsx scripts/task-008-test5-two-scenes.ts
```

Долгий тест (~20 мин): генерит 2 image + 2 video последовательно.

### Чек-лист

- [ ] В консоли `TEST 5 PASS`
- [ ] `data/task-008-evidence/test5/scene1_clip.mp4` и `scene2_clip.mp4` — оба воспроизводятся
- [ ] `data/task-008-evidence/test5/scene1_image.png` и `scene2_image.png`
- [ ] `data/task-008-evidence/test5/two-scenes-audit.log`:
  - `selectModel:done image=Seedream 5.0 lite` × 2
  - `generateVideo:downloaded` × 2
  - `launchPersistentContext` ≤ 1 (singleton reuse)
- [ ] Сделай скриншот → `data/task-008-evidence/two-scenes-done.png`

---

## Если упало

### `Cannot find module 'sharp'`
**Фикс:** `npm install sharp` из Windows PowerShell (не WSL).

### `selectModel: option "..." not found`
**Фикс:** открой higgsfield.ai вручную, убедись что залогинен и модели видны в dropdown.

### `generateVideo: no start-frame input found`
**Фикс:** `/ai/video` не загрузилась. Перезапусти тест.

### `Generation timeout after 5 min`
**Причина:** Higgsfield перегружен. Проверь Chrome — если спиннер крутится, подожди и запусти снова.

### `No img_* dirs found — run TEST 1 first`
**Фикс:** запусти TEST 1 перед TEST 2.

### Собрать логи при любом fail

```powershell
Get-Content data\higgsfield-audit.log -Tail 50 > data\task-008-evidence\audit-tail.log
```

Каждый скрипт пишет свой лог в `data/task-008-evidence/testN/testN.log`.

---

## Финальный evidence pack

После всех тестов в `data/task-008-evidence/` должно быть:

- [ ] `image-generate.png` — скриншот Chrome (TEST 1)
- [ ] `video-generate.png` — скриншот Chrome (TEST 2)
- [ ] `two-scenes-done.png` — скриншот Chrome (TEST 5)
- [ ] `test1/` — image_0.png, audit-extract.log, test1.log
- [ ] `test2/` — clip_0.mp4, audit-extract.log, test2.log
- [ ] `test3/` — webp-test.log, test3.log
- [ ] `test4/` — pause-during-gen.log, test4.log
- [ ] `test5/` — scene1_clip.mp4, scene2_clip.mp4, scene1_image.png, scene2_image.png, two-scenes-audit.log, test5.log

Скажи «evidence в data/task-008-evidence/, готово» — tester проверит.
