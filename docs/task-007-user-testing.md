# Task-007 — User live testing instructions

**Для кого:** пользователь (не backend-agent).
**Что проверяет:** `selectModel()`, `enableUnlimited()`, `setPromptTextarea()` из `src/lib/providers/browser-helpers.ts`.
**Запускается:** из Windows-PowerShell. Backend-agent в WSL не может драйвить Windows-Chrome.

---

## 0. Что у тебя должно быть

- Проект в `E:\Users\rasla\Desktop\ai-video-platform`
- Node.js установлен (`node --version` > 18)
- Chrome установлен в `E:\Program Files\Google\Chrome\Application\chrome.exe`
- Залогинен в Higgsfield один раз в user-data-dir `E:\Users\rasla\chrome-automation-safe` (если не — сделай это руками при первом запуске Chrome через start.ps1)

---

## 1. Prerequisites — поднять Chrome

Закрой все Chrome-процессы использующие `chrome-automation-safe` (во избежание singleton-конфликта):

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'chrome-automation-safe' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

Запусти Chrome с remote-debugging:

```powershell
& "E:\Users\rasla\Desktop\ai-video-platform\skrpt auth hg\start.ps1" -Mode playwright
```

Ожидаемый вывод: `[OK] DevTools ready.` Откроется окно Chrome. **Не закрывай его**.

Проверь:

```powershell
Invoke-WebRequest -Uri "http://localhost:9223/json/version" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Должно вернуть `{"Browser":"Chrome/147..."}`.

---

## 2. Подготовь evidence-папку

```powershell
cd E:\Users\rasla\Desktop\ai-video-platform
New-Item -ItemType Directory -Force -Path data\task-007-evidence | Out-Null
```

---

## 3. Правка в скрипте перед запуском (одна строка)

В `scripts/task-007-live-test.ts` есть два `page.goto(..., { waitUntil: 'networkidle' })` — нужно заменить на `domcontentloaded` **только для этого прогона** (higgsfield.ai никогда не достигает network-idle, таймаутит за 30s). Backend это поправит в основном коде, но для твоей прогонки сделай руками:

```powershell
(Get-Content scripts\task-007-live-test.ts) -replace "waitUntil: 'networkidle'", "waitUntil: 'domcontentloaded'" | Set-Content scripts\task-007-live-test.ts
```

Проверь что заменилось:

```powershell
Select-String -Path scripts\task-007-live-test.ts -Pattern "waitUntil"
```

Ожидается 2 строки с `domcontentloaded`.

---

## 4. Прогон — основная команда

```powershell
cd E:\Users\rasla\Desktop\ai-video-platform
npx tsx scripts/task-007-live-test.ts
```

Скрипт сам возьмёт Chrome на `localhost:9223` через `ensureContext()`.

### Что скрипт делает (6 тестов последовательно)

| # | Действие | Ожидаемый результат в UI Chrome | Скриншот |
|---|---|---|---|
| 1 | Открывает `/ai/image`, зовёт `selectModel('image', 'seedream_v5_lite')` | Composer-кнопка внизу меняется на **"Seedream 5.0 lite"** | `image-select.png` |
| 2 | `enableUnlimited('image')` — кликает toggle | Switch справа от модели становится **включённым** (жёлтый). Кнопка Generate показывает **"Generate + 0"** | `image-unlimited.png` |
| 3 | Переходит на `/ai/video`, зовёт `selectModel('video', 'kling-2-5-turbo')` | В composer bar слева **"Model → Kling 2.5 Turbo"** (после раскрытия категории Kling) | `video-select.png` |
| 4 | Загружает 1x1 PNG как start-frame, зовёт `enableUnlimited('video')` | Клик по баннеру **"Change to 720p 5s for Unlimited"** → Generate показывает **"+0"** | `video-unlimited.png` *или* `video-unlimited-attempt.png` если 1x1 не даёт баннер |
| 5 | `setPromptTextarea('A cinematic scene...')` | В textarea промпта появляется текст | `video-prompt.png` |
| 6 | Пробует вызвать `selectModel('video', 'kling-1-5')` — несуществующая модель | **Throw с ошибкой** `selectModel: option "Kling 1.5" not found on /ai/video`. В логе `fail-test.log` запись | (нет скрина — только лог) |

---

## 5. Чек-лист после прогона

Проверь что в `data/task-007-evidence/` появилось:

- [ ] `image-select.png` — видно Seedream 5.0 lite в composer
- [ ] `image-unlimited.png` — видно включённый switch или бейдж Unlimited, Generate показывает `+0`
- [ ] `video-select.png` — видно "Model / Kling 2.5 Turbo" в composer
- [ ] `video-unlimited.png` **или** `video-unlimited-attempt.png` — видно состояние после попытки enable. **Если** `attempt` — это OK (1x1 PNG не триггерит баннер — достаточно посмотреть на страницу, что Kling 2.5 Turbo выбрана)
- [ ] `video-prompt.png` — в textarea реально введён текст "A cinematic scene of ocean waves..."
- [ ] `live-test.log` — содержит `TEST 1 PASS` ... `TEST 5 PASS` и `TEST 6 PASS — threw: selectModel: option "Kling 1.5" not found`
- [ ] `fail-test.log` — содержит запись с expected error
- [ ] `test-frame.png` — 1x1 pixel PNG (артефакт теста 4)

---

## 6. Если упало

### Симптом: скрипт виснет на `page.goto`
**Причина:** забыл заменить `networkidle` → `domcontentloaded` (шаг 3).
**Фикс:** прерви (`Ctrl+C`), применяй replace команду, запускай снова.

### Симптом: `Error: browserType.launchPersistentContext ... exitCode=21`
**Причина:** живые Chrome процессы на `chrome-automation-safe`.
**Фикс:**
```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'chrome-automation-safe' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
Потом запусти скрипт снова. **Не** запускай start.ps1 повторно — скрипт сам поднимет Chrome через `ensureContext()`.

**Либо** (если backend решил использовать `connectOverCDP`, не launchPersistentContext) — нужен Chrome от start.ps1 живой. Проверь `curl http://localhost:9223/json/version` — если отвечает, Chrome жив.

### Симптом: `selectModel: option "Seedream 5.0 lite" not found`
**Причина:** UI Higgsfield изменился (маловероятно за 1 день), или не залогинен.
**Фикс:** открой вкладку higgsfield.ai/ai/image в Chrome вручную, убедись что 1) ты залогинен, 2) модель Seedream 5 Lite видна в dropdown при клике на текущую модель. Если видна — приложи скрин `debug-seedream-dropdown.png`. Если не видна — это **отдельная находка**, сообщи.

### Симптом: TEST 4 SKIP
Это **ожидаемо** если 1x1 PNG не триггерит баннер "Change to 720p 5s for Unlimited". Баннер появляется при `Generate cost > 0`, а 1x1 может быть отвергнут ещё до calculate cost. Не проблема — достаточно `video-unlimited-attempt.png` как evidence попытки. TEST 4 на реальной генерации в task-008 подтвердит работу.

### Собрать логи при любом fail
Сохрани в `data/task-007-evidence/`:
- `live-test.log` (уже пишется автоматически)
- Весь stdout из PowerShell: `npx tsx scripts/task-007-live-test.ts 2>&1 | Tee-Object -FilePath data\task-007-evidence\stdout.log`
- Если есть `data/higgsfield-audit.log` — скопируй последние 50 строк в `data/task-007-evidence/audit-tail.log`
- Скриншот окна Chrome на моменте ошибки (Win+Shift+S → `data/task-007-evidence/error-state.png`)

---

## 7. После прогона

Отметь в этой же ветке что выполнил, приложи скрины (драгни в чат) или просто скажи «evidence в data/task-007-evidence/, готово».

**Не правь код task-007** — backend-agent не закрывает task-007 до тестер-утверждения evidence-pack. Если сам заметил косяк в тестах — не правь, скажи мне, я передам backend через PM.

---

## 8. Что делает tester после тебя

Tester-agent не запускает скрипт сам. Он:
1. Проверяет наличие всех 7 файлов из чек-листа §5
2. Открывает каждый скрин и глазами проверяет что в UI видно то что обещано
3. Читает `live-test.log` — ищет `TEST N PASS` для 1-5 и `TEST 6 PASS — threw:` для fail-test
4. Читает `fail-test.log` — подтверждает что expected error записана
5. Если всё совпадает — пишет в chat.md `task-007: PASS по evidence-pack` и задача закрыта
