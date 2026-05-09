# task-028-tester: автономный E2E loop через Studio UI

## Цель

Скрипт `scripts/auto-e2e-loop.ts` который:
1. Открывает localhost:3000 в Playwright (свежий Chrome, НЕ 9223 — там Higgsfield)
2. Логинится admin/admin
3. Идёт в Studio
4. На Step 1 пишет рандомный 2-сцен сценарий
5. Проходит Steps 1→2→3→4 (Script → Character → Storyboard → Generate)
6. Триггерит генерацию (использует уже-залогиненный Higgsfield Chrome 9223 как provider)
7. Ждёт завершения, валидирует результат
8. Репортит в `chat.md` через `say.sh tester pass|fail "..."`

После репорта PM читает chat.md, диспатчит фикс если нужно, тестер запускается снова.

## Зависимость

- task-027-backend-collect-fix (миграция БД + фильтр collectStart)

Можешь начать писать скрипт сразу — но запускать ПОСЛЕ того как BE закроет task-027 (иначе будут ловиться те же баги).

## Шаг 1 — генератор рандомных сценариев

В начале скрипта — пул 2-строчных сценариев:
```ts
const SCRIPTS = [
  'кавказский мальчик знакомится с русской девушкой на патриках в москве\nони идут вместе по улице и смеются',
  'старый рыбак чинит сети на берегу моря\nк нему подходит молодой парень и предлагает помощь',
  'девушка-блогер снимает влог в Tokyo neon district\nпрохожий улыбается ей в камеру и машет рукой',
  'самурай тренируется в бамбуковом лесу на рассвете\nон поднимает катану и делает резкий выпад',
  'двое программистов спорят перед монитором с кодом\nодин показывает другому что-то на экране и оба смеются',
];

const randomScript = () => SCRIPTS[Math.floor(Math.random() * SCRIPTS.length)];
```

## Шаг 2 — Playwright прохождение UI

Используй `playwright` (уже установлен) с `chromium.launchPersistentContext` на отдельный профиль `data/test-profile/` (чтобы login кеш сохранялся между прогонами).

```ts
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext('E:/Users/rasla/Desktop/ai-video-platform/data/test-profile', {
  headless: false,
  channel: 'chrome',
  viewport: { width: 1440, height: 900 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
```

### Login

Если на странице форма /login — заполни:
```ts
if (page.url().includes('/login')) {
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|studio|$)/);
}
```

### Step 1 — Script

```ts
await page.goto('http://localhost:3000/'); // Studio = /
// Кликни нав-таб Studio если не на нём
const studioTab = page.getByRole('button', { name: /Studio/i }).or(page.locator('a[href="/"]'));
if (await studioTab.first().isVisible()) await studioTab.first().click();

const script = randomScript();
const textarea = page.locator('textarea').first();
await textarea.fill(script);

// Кнопка перехода — ищи по тексту "Continue"/"Next"/иконкой
await page.getByRole('button', { name: /Continue|Next|→/i }).first().click();
```

### Step 2 — Character

Если есть форма мастер-персонажа — пропусти (дефолтные значения), нажми Continue.

### Step 3 — Storyboard

Здесь должны появиться карточки сцен с image_prompt и animation_prompt. Жди их рендера:
```ts
await page.waitForSelector('[data-scene-card], .scene-card, textarea[placeholder*="Image Prompt" i]', { timeout: 30_000 });
const sceneCount = await page.locator('textarea[placeholder*="Image Prompt" i]').count();
if (sceneCount < 2) throw new Error(`Expected 2 scenes, got ${sceneCount}`);

await page.getByRole('button', { name: /Continue|Next/i }).first().click();
```

### Step 4 — Generate

Найди кнопку "Generate" / "Generate All Scenes". Кликни. Жди финальной модалки `Final video ready` с таймаутом 15 минут (Higgsfield Unlimited Relax может долго).

```ts
await page.getByRole('button', { name: /Generate (All|Scenes)|Render/i }).first().click();

const start = Date.now();
const TIMEOUT = 15 * 60_000;
let finalReady = false;
while (Date.now() - start < TIMEOUT) {
  const modalText = await page.locator('text=/Final video ready/i').count();
  if (modalText > 0) { finalReady = true; break; }
  await page.waitForTimeout(15_000);
  // лог промежуточного прогресса
  console.log(`[${Math.round((Date.now()-start)/1000)}s] waiting for final modal...`);
}
if (!finalReady) throw new Error('Final modal did not appear within 15 min');
```

## Шаг 3 — Валидация после рендера

После появления модалки — проверки:

```ts
// 1. БД должен иметь свежую запись с video_url
const fetch = (await import('node-fetch')).default;
const dbResp = await fetch('http://localhost:3000/api/videos').then(r => r.json());
const latest = (dbResp as any[])[0]; // assuming desc order
if (!latest?.video_url) throw new Error(`Latest video has no video_url: ${JSON.stringify(latest)}`);

// 2. Файл по video_url должен открываться (HEAD 200)
const fileCheck = await fetch(`http://localhost:3000${latest.video_url}`, { method: 'HEAD' });
if (!fileCheck.ok) throw new Error(`video_url ${latest.video_url} returns ${fileCheck.status}`);

// 3. ffprobe — длительность должна быть ≈ N*5s (где N = sceneCount-1 для пар, или N = sceneCount)
import { execSync } from 'child_process';
const localPath = require('path').join(process.cwd(), 'public', latest.video_url);
const probe = execSync(`ffprobe -v quiet -show_format -of json "${localPath}"`).toString();
const duration = parseFloat(JSON.parse(probe).format.duration);
const expectedMin = 4, expectedMax = 12; // 1 clip = 5s, 2 clips = 10s ± buffer
if (duration < expectedMin || duration > expectedMax) {
  throw new Error(`Duration ${duration}s outside expected [${expectedMin}-${expectedMax}]`);
}

// 4. Размер файла адекватный (>500KB на сцену, sanity)
const stat = require('fs').statSync(localPath);
if (stat.size < 500_000) throw new Error(`final.mp4 suspiciously small: ${stat.size} bytes`);

// 5. ВАЖНО: проверка что видео НЕ из старой истории
// Прочти Higgsfield audit log за последние 5 минут, найди collectAndDownloadVideos:saved
// Сверь что timestamp в URL hf_YYYYMMDD_HHMMSS МАХ 5 минут до сейчас
const auditLog = require('fs').readFileSync('data/higgsfield-audit.log', 'utf8');
const recentSaved = auditLog.split('\n').filter(l => l.includes('collectAndDownloadVideos:saved')).slice(-3);
console.log('Recent saved:', recentSaved);
// Если в saved-логе bytes резко отличается между запусками — флаг
```

## Шаг 4 — Репорт через say.sh

При успехе:
```ts
import { execSync } from 'child_process';
execSync(`bash .claude/agents/say.sh tester done "auto-e2e-loop PASS — script='${script.split('\n')[0].slice(0, 50)}...', duration=${duration}s, size=${stat.size}, video_url=${latest.video_url}"`, { stdio: 'inherit' });
```

При ошибке:
```ts
execSync(`bash .claude/agents/say.sh tester blocked "auto-e2e-loop FAIL — ${err.message.slice(0, 200)}"`, { stdio: 'inherit' });
```

После репорта — НЕ закрывай браузер сразу (может PM попросит скриншот). Подожди 30 сек, потом `ctx.close()`.

## Шаг 5 — Команда запуска

```bash
$env:HIGGSFIELD_CDP_HOST='127.0.0.1'; $env:HIGGSFIELD_CDP_PORT='9223'; npx tsx scripts/auto-e2e-loop.ts
```

(Higgsfield Chrome 9223 нужен для самой генерации — UI зовёт API который зовёт Higgsfield-провайдер).

## Loop-режим (опционально, но желательно)

Заверни всё в `for (let attempt = 1; attempt <= 5; attempt++)` — после ошибки `say.sh tester blocked "..."`, ждёт 60 сек чтобы PM/BE задиспатчили фикс, затем следующий attempt.

Между attempts — подчисти БД и `public/generations/`:
```ts
// reset video records, NEW scenario folder
```

Можно начать БЕЗ loop-обёртки — один прогон. Loop добавим итеративно.

## TypeScript

`npx tsc --noEmit` → 0 ошибок.

## Отчёт

`say.sh tester status "auto-e2e-loop script готов, начинаю прогон"` перед стартом.
`say.sh tester done|blocked "..."` после.

## НЕ ТРОГАЙ

- Любой код в `src/`
- Higgsfield-web.ts
- API routes

Только скрипт `scripts/auto-e2e-loop.ts`.
