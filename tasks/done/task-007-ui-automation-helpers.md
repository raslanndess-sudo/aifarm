# Task 007: UI-automation helpers — selectModel() + enableUnlimited() + setPromptTextarea()

## Приоритет: ВЫСОКИЙ
## Зависимости: task-006 (singleton context + pause checkpoint)
## Блокирует: task-008

## Описание

Вынести в `src/lib/providers/browser-helpers.ts` **три новых helper**'а для UI-автоматизации Higgsfield. Критично: все helpers должны **явно детектить** что требуемый селектор не найден и **падать с понятной ошибкой в audit-log**, а не тихо проходить дальше. Это предотвратит повторение сценария "сгенерировали через Nano Banana Pro вместо SeaDream".

Все селекторы и поведение — из `docs/higgsfield-selectors.md`.

### Шаг 1: `selectModel(page, pageType, targetModel)`

```ts
// src/lib/providers/browser-helpers.ts

type PageType = 'image' | 'video';
type ImageModel = 'seedream_v5_lite' | 'nano-banana-pro' | 'flux' | 'soul';
type VideoModel = 'kling-2-5-turbo' | 'kling-3-0' | 'kling-3-0-motion-control' | 'seedance-2';

export async function selectModel(
  page: Page,
  pageType: PageType,
  targetModel: ImageModel | VideoModel,
): Promise<void> {
  auditLog('selectModel:start', `page=${pageType} target=${targetModel}`);

  if (pageType === 'image') {
    // 1. Click composer button
    const btn = page.locator('button:has(svg)')
      .filter({ hasText: /Nano Banana|Seedream|Flux|Soul/i })
      .last();
    if (await btn.count() === 0) {
      auditLog('selectModel:error', 'image composer button not found');
      throw new Error('selectModel: composer button not found on /ai/image');
    }
    await btn.click({ delay: 100 });
    await page.waitForTimeout(1500);

    // 2. Find option by display name
    const displayName = imageModelToDisplayName(targetModel as ImageModel);
    const option = page.locator('button').filter({ hasText: new RegExp(displayName, 'i') });
    if (await option.count() === 0) {
      auditLog('selectModel:error', `image option "${displayName}" not found in dropdown`);
      throw new Error(`selectModel: option "${displayName}" not found`);
    }
    await option.first().click({ delay: 100 });
    await page.waitForTimeout(2000);

    // 3. Verify: composer button now shows the selected model
    const composer = page.locator('button:has(svg)').filter({ hasText: new RegExp(displayName, 'i') });
    if (await composer.count() === 0) {
      auditLog('selectModel:error', `after click, composer does not show "${displayName}"`);
      throw new Error(`selectModel: failed to switch to ${displayName}`);
    }
    auditLog('selectModel:done', `image=${displayName}`);
  }

  if (pageType === 'video') {
    // 1. Click composer Model button (aria-label stable)
    const btn = page.locator('button[aria-label="Model"]');
    if (await btn.count() === 0) {
      auditLog('selectModel:error', 'video composer Model button not found');
      throw new Error('selectModel: button[aria-label="Model"] not found');
    }
    await btn.click({ delay: 100 });
    await page.waitForTimeout(1500);

    // 2. For Kling 2.5 Turbo — need to expand "Kling" category first
    if (targetModel === 'kling-2-5-turbo') {
      const klingCategory = page.locator('button')
        .filter({ hasText: /^Kling\b/i })
        .filter({ hasText: /Perfect motion/i });
      if (await klingCategory.count() === 0) {
        auditLog('selectModel:error', 'Kling category button not found');
        throw new Error('selectModel: Kling category not found in video dropdown');
      }
      await klingCategory.click({ delay: 100 });
      await page.waitForTimeout(2000);
    }

    // 3. Find specific Kling variant
    const displayName = videoModelToDisplayName(targetModel as VideoModel);
    const option = page.locator('button').filter({ hasText: new RegExp(displayName, 'i') });
    if (await option.count() === 0) {
      auditLog('selectModel:error', `video option "${displayName}" not found`);
      throw new Error(`selectModel: option "${displayName}" not found on /ai/video`);
    }
    await option.first().click({ delay: 100 });
    await page.waitForTimeout(2500);

    // 4. Verify
    const composerVerify = page.locator('button[aria-label="Model"]').filter({ hasText: new RegExp(displayName, 'i') });
    if (await composerVerify.count() === 0) {
      auditLog('selectModel:error', `after click, Model button does not show "${displayName}"`);
      throw new Error(`selectModel: failed to switch to ${displayName}`);
    }
    auditLog('selectModel:done', `video=${displayName}`);
  }
}

function imageModelToDisplayName(m: ImageModel): string {
  const map: Record<ImageModel, string> = {
    'seedream_v5_lite': 'Seedream 5.0 lite',
    'nano-banana-pro': 'Nano Banana Pro',
    'flux': 'Flux',
    'soul': 'Soul',
  };
  return map[m];
}

function videoModelToDisplayName(m: VideoModel): string {
  const map: Record<VideoModel, string> = {
    'kling-2-5-turbo': 'Kling 2.5 Turbo',
    'kling-3-0': 'Kling 3.0',
    'kling-3-0-motion-control': 'Kling 3.0 Motion Control',
    'seedance-2': 'Seedance 2.0',
  };
  return map[m];
}
```

### Шаг 2: `enableUnlimited(page, pageType)`

```ts
export async function enableUnlimited(page: Page, pageType: PageType): Promise<void> {
  auditLog('enableUnlimited:start', `page=${pageType}`);

  if (pageType === 'image') {
    // Real switch on /ai/image
    const sw = page.locator('button[role="switch"]').last();
    if (await sw.count() === 0) {
      auditLog('enableUnlimited:error', 'image role=switch not found');
      throw new Error('enableUnlimited: switch not found on /ai/image');
    }
    const checked = await sw.getAttribute('aria-checked');
    if (checked === 'true') {
      auditLog('enableUnlimited:skip', 'image switch already on');
      return;
    }
    await sw.click({ delay: 100 });
    await page.waitForTimeout(1000);
    const verifyChecked = await sw.getAttribute('aria-checked');
    if (verifyChecked !== 'true') {
      auditLog('enableUnlimited:error', 'image switch did not toggle');
      throw new Error('enableUnlimited: failed to toggle image switch');
    }
    auditLog('enableUnlimited:done', 'image');
  }

  if (pageType === 'video') {
    // Clickable banner "Change to 720p 5s for Unlimited"
    // Important: banner only appears AFTER start-frame is uploaded and cost > 0
    const banner = page.locator('button, a, div').filter({
      hasText: /Change to 720p 5s[\s\S]*for Unlimited/i,
    }).first();
    const count = await banner.count();
    if (count === 0) {
      // Maybe we're already at 720p 5s — check Generate cost
      const gen = page.locator('button:has-text("Generate")').first();
      const genText = (await gen.textContent()) || '';
      if (/Generate\s*0|Generate\s*\+\s*0/i.test(genText)) {
        auditLog('enableUnlimited:skip', 'video already at 720p 5s (Generate=0)');
        return;
      }
      auditLog('enableUnlimited:error', 'video Unlimited banner not found and Generate cost > 0');
      throw new Error('enableUnlimited: 720p 5s banner not found on /ai/video');
    }
    await banner.click({ delay: 100 });
    await page.waitForTimeout(1500);

    // Verify: Generate cost becomes 0
    const gen = page.locator('button:has-text("Generate")').first();
    const genText = (await gen.textContent()) || '';
    if (!/Generate\s*\n?\s*0/i.test(genText)) {
      auditLog('enableUnlimited:error', `video Generate cost still not 0: "${genText}"`);
      throw new Error(`enableUnlimited: Generate still costs money after banner click: "${genText}"`);
    }
    auditLog('enableUnlimited:done', 'video');
  }
}
```

### Шаг 3: `setPromptTextarea(page, text)` — специально для /ai/video

`typeInLexical()` уже есть для `[contenteditable="true"]` (/ai/image). Но на /ai/video prompt — обычный `<textarea id="prompt">`. Добавить:

```ts
export async function setPromptTextarea(page: Page, text: string): Promise<void> {
  const ta = page.locator('textarea#prompt');
  if (await ta.count() === 0) {
    auditLog('setPromptTextarea:error', 'textarea#prompt not found');
    throw new Error('setPromptTextarea: textarea#prompt not found');
  }
  await ta.click({ delay: 100 });
  await ta.fill(''); // clear existing
  // pressSequentially для human-like ввода
  await ta.pressSequentially(text, { delay: randomDelay(25, 60) });
  auditLog('setPromptTextarea:done', `"${text.slice(0, 50)}..."`);
}
```

### Шаг 4: checkpointPause между шагами

В `selectModel`, `enableUnlimited`, `setPromptTextarea` — **перед каждым клик-шагом** звать `await checkpointPause('step-name')` из `higgsfield-singleton.ts`. Это даёт юзеру возможность поставить паузу в середине пайплайна.

```ts
import { checkpointPause } from './higgsfield-singleton';

// В selectModel, перед каждым клик-шагом:
await checkpointPause(`selectModel:${pageType}:${stepNum}`);
```

## Критерии готовности

### Общие
- [ ] `npx tsc --noEmit` — 0 ошибок

### Browser automation (DoD §2 — КРИТИЧНО)
- [ ] **Live e2e #1:** запусти `selectModel(page, 'image', 'seedream_v5_lite')` на /ai/image вручную через CLI-скрипт. Подтверди что composer button показывает "Seedream 5.0 lite" после. Скрин в `data/task-007-evidence/image-select.png`
- [ ] **Live e2e #2:** `enableUnlimited(page, 'image')` — aria-checked="true" после, Generate показывает "Generate\n0". Скрин в `data/task-007-evidence/image-unlimited.png`
- [ ] **Live e2e #3:** `selectModel(page, 'video', 'kling-2-5-turbo')` на /ai/video — категория Kling раскрывается, затем выбирается 2.5 Turbo, button[aria-label="Model"] содержит "Kling 2.5 Turbo". Скрин в `data/task-007-evidence/video-select.png`
- [ ] **Live e2e #4:** после upload стартового PNG → `enableUnlimited(page, 'video')` — Generate cost=0. Скрин в `data/task-007-evidence/video-unlimited.png`
- [ ] **Live e2e #5:** `setPromptTextarea(page, "test prompt")` — значение textarea совпадает с переданным
- [ ] **Live fail test:** намеренно передай `selectModel(page, 'video', 'kling-1-5' as VideoModel)` (несуществующая модель) — функция **должна throw** с понятной ошибкой, audit-log содержит `selectModel:error`, никакой тихой деградации. Лог в `data/task-007-evidence/fail-test.log`

### Selector hardening (DoD §2 последний пункт)
- [ ] **Все селекторы** взяты **только** из `docs/higgsfield-selectors.md` — разделы 1.2-1.6 для /ai/image и 2.2-2.8 для /ai/video. Ссылка на конкретный раздел в коде-комментарии рядом с каждой `page.locator(...)`
- [ ] Ни один селектор не помечен как ПРИМЕРНЫЙ/ПРИБЛИЗИТЕЛЬНЫЙ/TODO — все верифицированы на living UI (automatic fail per DoD §2)
- [ ] Ни один helper не имеет `try/catch` который глотает ошибки — все critical failures выходят через `throw` после `auditLog(':error', ...)`
- [ ] Каждый early-return в helper сопровождается либо успехом (aria-checked=true и т.п.) либо audit-log `:skip` с объяснением, никаких «молчаливых выходов»

### Pause integration
- [ ] `checkpointPause()` вызывается перед каждым клик-шагом в каждом helper'е
- [ ] Live-тест паузы: запусти `selectModel` в отдельном терминале, параллельно `POST /pause` — функция замирает на ближайшем checkpoint, после `/resume` продолжает

### Artifacts
Положи все скрины и логи в `data/task-007-evidence/`, закоммить туда же `proof.md` с описанием каждого теста.

## Файлы
- **Изменить:** `src/lib/providers/browser-helpers.ts`
- **НЕ трогать:** `higgsfield-web.ts` (task-008), Studio.tsx, API routes

## Известные риски
- Tailwind/RAC классы меняются — якоримся на `aria-label`, `role`, `id` там где есть; на text там где структурно логично (названия моделей)
- Категория Kling раскрывается не как традиционный submenu а как inline-expansion секции — не предполагать `role="menu"`
