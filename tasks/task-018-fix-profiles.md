# task-018 fix: Раздельные Chrome-профили

## Проблема

Сейчас один user-data-dir `E:\Users\rasla\chrome-automation` для MCP (ручной) и Playwright (автомат). Если Cloudflare забанит Playwright — бан ляжет и на ручной MCP. Нужны два профиля.

## Что сделать

### 1. Обнови `skrpt auth hg/start.ps1`

Добавь параметр `--profile`:

```powershell
param(
    [ValidateSet('manual','playwright')]
    [string]$Profile = 'manual'
)
```

Два user-data-dir:
- `manual` → `E:\Users\rasla\chrome-automation` (как сейчас, страховочный)
- `playwright` → `E:\Users\rasla\chrome-automation-safe`

Порты тоже разные:
- `manual` → 9222 (как сейчас)
- `playwright` → 9223

Логика выбора:
```powershell
if ($Profile -eq 'playwright') {
    $UserData = 'E:\Users\rasla\chrome-automation-safe'
    $Port = 9223
} else {
    $UserData = 'E:\Users\rasla\chrome-automation'
    $Port = 9222
}
```

Остальная логика скрипта — без изменений, только $UserData и $Port берутся из условия выше.

### 2. Обнови `skrpt auth hg/start.bat`

Аналогично — принимает первый аргумент `manual` или `playwright`:
```bat
set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=manual"

if "%PROFILE%"=="playwright" (
    set "USERDATA=E:\Users\rasla\chrome-automation-safe"
    set "PORT=9223"
) else (
    set "USERDATA=E:\Users\rasla\chrome-automation"
    set "PORT=9222"
)
```

### 3. Обнови `src/lib/providers/higgsfield-web.ts`

Метод `connect()` — дефолтный порт 9223 (playwright), не 9222:
```ts
async connect(cdpUrl = 'http://localhost:9223'): Promise<void> {
```

### 4. Обнови `scripts/higgsfield-canary.ts`

Тоже порт 9223:
```ts
await provider.connect('http://localhost:9223');
```

### 5. Обнови `skrpt auth hg/README.md`

Добавь документацию:
```
## Профили

- `start.bat` или `start.bat manual` — ручной профиль (MCP, порт 9222)
- `start.bat playwright` — автоматизация (Playwright, порт 9223)

Два профиля изолированы. Бан одного не затрагивает другой.
Первый запуск playwright-профиля требует ручной логин в Higgsfield.
```
