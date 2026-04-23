# task-019: Higgsfield Provider — Image Generation (Nano Banana 2)

## Цель

Первая реальная автоматизация. HiggsfieldWebProvider получает метод `generateImage(prompt, count)` который:
1. Навигирует на `higgsfield.ai/ai/image?model=nano-banana-2`
2. Вводит промпт
3. Ждёт генерации
4. Скачивает картинки в `public/generations/{jobId}/`

## КРИТИЧНО: Lexical contenteditable

Промпт-поле в Higgsfield — это **Lexical contenteditable div**, НЕ `<textarea>` и НЕ `<input>`. 

**НЕ ДЕЛАЙ ТАК:**
```ts
await page.fill('textarea', prompt); // СЛОМАЕТСЯ — textarea нет
await page.fill('[contenteditable]', prompt); // СЛОМАЕТСЯ — fill() не работает с contenteditable
```

**ДЕЛАЙ ТАК:**
```ts
// 1. Кликни в contenteditable div
await page.click('[contenteditable="true"]');
// 2. Выдели всё (очистка)
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
// 3. Печатай посимвольно с задержкой
for (const char of prompt) {
  await page.keyboard.type(char, { delay: randomBetween(40, 120) });
}
```

## Шаги

### 1. Создай хелпер `src/lib/providers/browser-helpers.ts`

```ts
// Рандомная задержка
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Mouse-move перед кликом (антидетект)
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = await page.waitForSelector(selector, { timeout: 10000 });
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box: ${selector}`);
  // Двигаем мышь к элементу с небольшим рандомным смещением
  const x = box.x + box.width / 2 + (Math.random() - 0.5) * 4;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * 4;
  await page.mouse.move(x, y, { steps: randomDelay(5, 15) });
  await sleep(randomDelay(100, 300));
  await page.mouse.click(x, y);
}

// Ввод текста в Lexical contenteditable
export async function typeInLexical(page: Page, selector: string, text: string): Promise<void> {
  await humanClick(page, selector);
  await sleep(randomDelay(200, 500));
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(randomDelay(100, 300));
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomDelay(40, 120) });
  }
}

// Запись в аудит-лог
export function auditLog(action: string, details?: string): void {
  const fs = require('fs');
  const line = `[${new Date().toISOString()}] ${action}${details ? ' — ' + details : ''}\n`;
  fs.appendFileSync('data/higgsfield-audit.log', line);
}
```

Не забудь импорт `import type { Page } from 'playwright-core';` в начале файла.

### 2. Обнови `src/lib/providers/higgsfield-web.ts` — метод `generateImage`

Замени заглушку `generateImage` на реальную реализацию:

```ts
async generateImage(prompt: string, count: number = 4): Promise<string[]> {
  if (!this.browser) throw new Error('Not connected — call connect() first');
  
  const jobId = `img_${Date.now()}`;
  const outDir = path.join(process.cwd(), 'public', 'generations', jobId);
  mkdirSync(outDir, { recursive: true });
  
  auditLog('generateImage:start', `jobId=${jobId} prompt="${prompt.slice(0, 50)}..."`);
  
  const context = this.browser.contexts()[0];
  if (!context) throw new Error('No browser context');
  const page = context.pages()[0] || await context.newPage();
  
  // Навигация
  await page.goto('https://higgsfield.ai/ai/image?model=nano-banana-2', { waitUntil: 'networkidle' });
  await sleep(randomDelay(1500, 3000));
  
  auditLog('generateImage:navigated', 'nano-banana-2 page loaded');
  
  // Ввод промпта в Lexical
  await typeInLexical(page, '[contenteditable="true"]', prompt);
  await sleep(randomDelay(800, 2000));
  
  // Клик Generate
  await humanClick(page, 'button:has-text("Generate")');
  
  auditLog('generateImage:submitted', 'clicked Generate');
  
  // Ожидание результатов — картинки появляются как <img> внутри результатов
  // Ждём до 120 секунд пока появятся картинки
  await page.waitForSelector('img[src*="generation"]', { timeout: 120000 });
  await sleep(randomDelay(2000, 4000)); // подождать все картинки
  
  // Скачивание картинок
  const imageUrls = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img[src*="generation"]');
    return Array.from(imgs).map(img => (img as HTMLImageElement).src).slice(0, 4);
  });
  
  const savedPaths: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imgUrl = imageUrls[i];
    const res = await fetch(imgUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(outDir, `image_${i}.png`);
    writeFileSync(filePath, buf);
    savedPaths.push(`/generations/${jobId}/image_${i}.png`);
    
    auditLog('generateImage:downloaded', `image_${i}.png`);
    await sleep(randomDelay(500, 1500));
  }
  
  await sleep(randomDelay(15000, 30000)); // пауза между генерациями
  
  auditLog('generateImage:done', `${savedPaths.length} images saved`);
  return savedPaths;
}
```

Добавь нужные импорты вверху файла:
```ts
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { humanClick, typeInLexical, sleep, randomDelay, auditLog } from './browser-helpers';
```

### 3. Важные замечания

- Селекторы `img[src*="generation"]` и `button:has-text("Generate")` — ПРИБЛИЗИТЕЛЬНЫЕ. Реальные селекторы могут отличаться. Это нормально — мы подправим после canary-теста когда увидим реальный DOM.
- `waitUntil: 'networkidle'` — ждём пока страница полностью загрузится.
- `count` параметр пока не используется — Higgsfield сам генерит 4 картинки за раз.
- Пауза 15-30 сек между генерациями — антидетект.

## НЕ ТРОГАЙ

- API роуты
- Компоненты (frontend)
- Существующий KlingApiProvider
