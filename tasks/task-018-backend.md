# task-018: Higgsfield Provider — Canary (только чтение)

## Цель

Первый контакт с браузером. Playwright подключается к уже запущенному Chrome через CDP. Никаких кликов, никакого ввода — только диагностика.

## Шаги

### 1. Установи `playwright-core`

```bash
npm install playwright-core
```

Именно `playwright-core`, НЕ `playwright` — нам не нужны bundled browsers, мы подключаемся к существующему Chrome через CDP.

### 2. Создай `src/lib/providers/higgsfield-web.ts`

Класс `HiggsfieldWebProvider implements VideoProvider`:

```ts
import { chromium, type Browser, type Page } from 'playwright-core';
import type { GenerationJob, VideoProvider } from './types';

export class HiggsfieldWebProvider implements VideoProvider {
  name = 'higgsfield-web';
  private browser: Browser | null = null;

  // CDP connection — подключается к Chrome который уже запущен через start.bat
  async connect(cdpUrl = 'http://localhost:9222'): Promise<void> {
    this.browser = await chromium.connectOverCDP(cdpUrl);
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // --- Диагностика (canary) ---

  async listPages(): Promise<Array<{ url: string; title: string }>> {
    if (!this.browser) throw new Error('Not connected — call connect() first');
    const contexts = this.browser.contexts();
    const pages: Array<{ url: string; title: string }> = [];
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        pages.push({ url: page.url(), title: await page.title() });
      }
    }
    return pages;
  }

  async screenshot(outputPath: string): Promise<string> {
    if (!this.browser) throw new Error('Not connected — call connect() first');
    const contexts = this.browser.contexts();
    const page = contexts[0]?.pages()[0];
    if (!page) throw new Error('No pages found in browser');
    await page.screenshot({ path: outputPath, fullPage: false });
    return outputPath;
  }

  // --- VideoProvider interface (заглушки, реализация в task-019/020) ---

  async generateImage(): Promise<string[]> {
    throw new Error('Not implemented yet — coming in task-019');
  }

  async generateVideo(): Promise<GenerationJob> {
    throw new Error('Not implemented yet — coming in task-020');
  }

  async getStatus(): Promise<GenerationJob> {
    throw new Error('Not implemented yet — coming in task-020');
  }
}
```

### 3. Обнови `src/lib/providers/index.ts`

Добавь импорт `HiggsfieldWebProvider` и обнови фабрику:

```ts
import { KlingApiProvider } from './kling-api';
import { HiggsfieldWebProvider } from './higgsfield-web';
import type { VideoProvider } from './types';

export type ProviderMode = 'api' | 'higgsfield';

export function getProvider(mode: ProviderMode = 'api'): VideoProvider {
  if (mode === 'higgsfield') return new HiggsfieldWebProvider();
  return new KlingApiProvider();
}

export { type VideoProvider, type GenerationJob } from './types';
```

Убери throw — теперь higgsfield возвращает реальный инстанс (с заглушками на generate).

### 4. Создай canary-скрипт `scripts/higgsfield-canary.ts`

```ts
import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  const provider = new HiggsfieldWebProvider();
  
  console.log('Connecting to Chrome via CDP on localhost:9222...');
  await provider.connect();
  
  console.log('Listing pages...');
  const pages = await provider.listPages();
  console.log(`Found ${pages.length} page(s):`);
  pages.forEach((p, i) => console.log(`  [${i}] ${p.title} — ${p.url}`));
  
  const outDir = join(process.cwd(), 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `canary-${Date.now()}.png`);
  
  console.log(`Taking screenshot → ${outPath}`);
  await provider.screenshot(outPath);
  
  console.log('Done. Disconnecting...');
  await provider.disconnect();
}

main().catch(err => {
  console.error('Canary failed:', err.message);
  process.exit(1);
});
```

### 5. Добавь npm script в `package.json`

Добавь в секцию `"scripts"`:
```json
"higgsfield:canary": "npx tsx scripts/higgsfield-canary.ts"
```

### 6. Создай `data/higgsfield-audit.log`

Создай пустой файл — будет использоваться в следующих тасках для логирования каждого действия.

## ВАЖНО

- НЕ запускай canary — Chrome не запущен в этом окружении. Только создай код.
- НЕ трогай существующие API роуты.
- `connectOverCDP` — НЕ `launch()`. Мы НЕ запускаем свой Chrome.
