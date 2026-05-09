# Task 006: Singleton persistent Chrome context + pause/resume API

## Приоритет: ВЫСОКИЙ
## Зависимости: нет
## Блокирует: task-007, task-008, task-009

## Описание

Сейчас `HiggsfieldWebProvider.connect()` / `.disconnect()` вызываются на каждый API-запрос → Chrome открывается/закрывается 4 раза на один видео-пайплайн (2 фото + 2 видео). Юзер хочет один браузер на всю dev-сессию, и возможность **поставить на паузу** автоматизацию, чтобы руками в этом же Chrome делать свои генерации.

### Шаг 1: Module-level singleton context

В `src/lib/providers/higgsfield-singleton.ts` (новый файл):

```ts
import { chromium, type BrowserContext } from 'playwright-core';

export type HfStatus = 'idle' | 'running' | 'paused';

interface HfState {
  context: BrowserContext | null;
  status: HfStatus;
  currentOperation: string | null; // человекочитаемое: "generateImage scene 1" и т.д.
  pauseRequested: boolean;
  lastActivityAt: number;
}

const state: HfState = {
  context: null,
  status: 'idle',
  currentOperation: null,
  pauseRequested: false,
  lastActivityAt: 0,
};

export async function ensureContext(): Promise<BrowserContext> {
  if (state.context && !state.context.pages().some((p) => p.isClosed())) {
    return state.context;
  }
  // Lazy launch on first use
  const userDataDir = process.env.HIGGSFIELD_USER_DATA_DIR || 'E:/Users/rasla/chrome-automation-safe';
  state.context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  // When user closes the Chrome window manually, clean state
  state.context.on('close', () => {
    state.context = null;
    state.status = 'idle';
    state.currentOperation = null;
  });
  return state.context;
}

export function getStatus(): HfStatus {
  return state.status;
}
export function getCurrentOperation(): string | null {
  return state.currentOperation;
}
export function setStatus(s: HfStatus, op: string | null = null) {
  state.status = s;
  state.currentOperation = op;
  state.lastActivityAt = Date.now();
}
export function requestPause() { state.pauseRequested = true; }
export function requestResume() { state.pauseRequested = false; }
export function isPauseRequested() { return state.pauseRequested; }

// Call at the start of each automation step — if pause was requested,
// wait here (polling) until resumed.
export async function checkpointPause(stepName: string): Promise<void> {
  if (!state.pauseRequested) return;
  const prevOp = state.currentOperation;
  setStatus('paused', `paused at: ${stepName}`);
  while (state.pauseRequested) {
    await new Promise((r) => setTimeout(r, 500));
  }
  setStatus('running', prevOp);
}

export async function shutdown(): Promise<void> {
  if (state.context) {
    await state.context.close().catch(() => {});
    state.context = null;
  }
  state.status = 'idle';
  state.currentOperation = null;
}
```

### Шаг 2: Переписать `HiggsfieldWebProvider.connect/disconnect`

В `src/lib/providers/higgsfield-web.ts`:

```ts
import { ensureContext, setStatus, getStatus } from './higgsfield-singleton';

async connect(): Promise<void> {
  // Singleton — just confirm context is alive. Do NOT close it in disconnect().
  this.context = await ensureContext();
  setStatus('running');
}

async disconnect(): Promise<void> {
  // No-op by design. Context lives until manual shutdown or Chrome window close.
  // Only release our in-provider pointer.
  setStatus('idle');
  this.context = null;
}
```

`generateImage` и `generateVideo` не меняем в структуре — только убеждаемся что они вызывают `checkpointPause('...')` перед ключевыми шагами (см. task-007).

### Шаг 3: API routes

Создай `src/app/api/admin/higgsfield/pause/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requestPause, getStatus, getCurrentOperation } from '@/lib/providers/higgsfield-singleton';

export async function POST() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  requestPause();
  return NextResponse.json({ ok: true, status: getStatus(), currentOp: getCurrentOperation() });
}
```

Симметрично `src/app/api/admin/higgsfield/resume/route.ts`:

```ts
export async function POST() {
  const cookieStore = await cookies();
  if (!cookieStore.get('session')?.value) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  requestResume();
  return NextResponse.json({ ok: true });
}
```

И `src/app/api/admin/higgsfield/status/route.ts` (GET, возвращает `{status, currentOp, isPaused}`).

### Шаг 4: Shutdown хук (graceful)

В `src/lib/providers/higgsfield-singleton.ts` — обработчик `beforeExit`:

```ts
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}
```

## Критерии готовности

### Общие
- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] Код написан согласно задаче, ничего лишнего

### Browser automation (DoD §2)
- [ ] **Live e2e:** запусти dev server, дёрни `/api/cref/generate-scene` 2 раза подряд — Chrome открывается **один** раз, второй запрос использует тот же контекст. Скриншот `tasklist | findstr chrome` до и после двух вызовов в `data/task-006-evidence/`
- [ ] **Live pause test:** во время активной генерации дёрни `POST /api/admin/higgsfield/pause` — `GET /api/admin/higgsfield/status` возвращает `{status: 'paused'}`, Playwright завис на ближайшем `checkpointPause()`. Затем `POST /resume` — генерация продолжается. Лог в `data/task-006-evidence/pause-test.log`

### API (DoD §3)
- [ ] POST /api/admin/higgsfield/pause под auth (cookie session) — без cookie → 401
- [ ] GET /api/admin/higgsfield/status отвечает валидным JSON

### Fail-closed (DoD §2 принцип)
- [ ] `ensureContext()` **не глотает** ошибки `launchPersistentContext` — если Chrome не стартует (exit code, singleton conflict, missing binary), ошибка пробрасывается вверх с понятным сообщением. В логе провайдера — строка `ensureContext:error <message>`. Проверено теcтом: запустить с заведомо занятым user-data-dir → ожидать чёткий error, не тихий null
- [ ] `checkpointPause()` не глотает ошибки — если state структура повреждена, падаем наглую
- [ ] Любой `catch` в новом коде либо re-throw'ит, либо логирует в audit с уровнем `:error` и re-throw'ит. Пустых `catch {}` и `catch (e) { /* ignore */ }` нет

### Не в scope
- UI индикатор статуса (Studio) — делается отдельно, не в этой задаче
- Модификации generateImage/generateVideo самих по себе — это task-007/008
- Селекторы UI — этот таск не трогает автоматизацию, только lifecycle (§2 DoD не применим к selector-части)

## Файлы
- **Создать:** `src/lib/providers/higgsfield-singleton.ts`, `src/app/api/admin/higgsfield/{pause,resume,status}/route.ts`
- **Изменить:** `src/lib/providers/higgsfield-web.ts` (методы connect/disconnect)
- **НЕ трогать:** Studio.tsx, VideoLibrary.tsx, `/api/cref/*`, `/api/kling/*` routes

## Артефакты для task-007
После завершения task-006, следующая задача импортирует `ensureContext` + `checkpointPause` из этого файла.
