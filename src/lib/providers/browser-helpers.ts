import type { Page } from 'playwright-core';

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
