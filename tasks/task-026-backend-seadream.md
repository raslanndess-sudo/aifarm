# task-026: SeaDream 5 Lite в Higgsfield provider — Backend

## Цель

Расширить `higgsfield-web.ts:generateImage()` поддержкой модели **SeaDream 5 Lite** (на higgsfield.ai это визуальный-image-генератор). Параметризовать модель, сохранить бэк-совместимость с `nano-banana-2`.

## Шаг 1 — СПАЙК (~10 минут)

До того как писать код — зайди в higgsfield.ai через Playwright и разведай модель вручную. Без этого имплементация наугад не полетит.

```ts
// scripts/seadream-spike.ts
import { chromium } from 'playwright';

async function main() {
  const port = process.env.HIGGSFIELD_CDP_PORT ?? '9223';
  const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'networkidle' });

  console.log('Current URL:', page.url());
  console.log('Title:', await page.title());

  // Открой меню моделей, найди SeaDream, запиши точный название и URL-параметр
  // Сохрани скриншот в data/seadream-spike.png
  await page.screenshot({ path: 'data/seadream-spike.png', fullPage: true });

  await browser.close();
}
main();
```

Запусти: `npx tsx scripts/seadream-spike.ts`. Убедись что Chrome на 9223 запущен (`skrpt auth hg/start.bat playwright`).

В chat.md (через say.sh) зарепорть:
- Точный URL когда SeaDream 5 Lite выбран (вида `?model=seedream-5-lite` или другое)
- Количество картинок в выдаче (1 или 4)
- Если меню моделей скрыто — как до него докликаться

**Не переходи к шагу 2 пока не задокументирован URL.**

## Шаг 2 — Параметризация `generateImage`

Файл: `src/lib/providers/higgsfield-web.ts`

Сейчас сигнатура: `generateImage(prompt: string, count: number = 4): Promise<string[]>`

Меняешь на:

```ts
async generateImage(
  prompt: string,
  opts?: { model?: 'nano-banana-2' | 'seadream-5-lite'; count?: number }
): Promise<string[]>
```

Внутри:
- `const model = opts?.model ?? 'nano-banana-2'`
- `const count = opts?.count ?? (model === 'seadream-5-lite' ? 1 : 4)` — SeaDream обычно отдаёт 1
- URL берёшь на основе спайка:
  - `nano-banana-2` → `https://higgsfield.ai/ai/image?model=nano-banana-2` (как сейчас)
  - `seadream-5-lite` → тот URL что нашёл в спайке
- `page.waitForSelector('img[src*="generation"]', { timeout: 120000 })` — может остаться тем же, если нет — подставь правильный селектор из спайка
- `.slice(0, count)` — отрезаем нужное количество

Промежуточные `auditLog()` вызовы — сохранить, но с `model` в сообщении: `generateImage:start model=seadream-5-lite jobId=...`.

## Шаг 3 — TypeScript проверка

- `npx tsc --noEmit` → 0 ошибок
- В `src/lib/providers/types.ts` обнови сигнатуру `generateImage` в `VideoProvider` интерфейсе если нужно (сделай второй параметр опциональным, совместимо с `KlingApiProvider` — тот может игнорировать `opts`)

## Отчёт

В chat.md через say.sh:
- URL SeaDream 5 Lite (из спайка)
- Сколько картинок отдаёт (1 или 4)
- tsc clean (да/нет)

## НЕ ТРОГАЙ

- KlingApiProvider
- API routes (это task-024-backend-route)
- Studio.tsx
- browser-helpers.ts
