# Task 010: Higgsfield automation status indicator + pause/resume UI

## Приоритет: СРЕДНИЙ (UI-качество, не блокер backend)
## Зависимости: task-006 (endpoints `/api/admin/higgsfield/{status,pause,resume}`)
## Блокирует: — (полирующая задача)

## Описание

Юзер хочет видеть в Studio **цветной индикатор статуса** Playwright-автоматизации, чтобы:
- понимать когда Chrome занят платформой (🔴 — не трогать руками)
- иметь возможность **поставить паузу** если нужно самому потыкать higgsfield.ai (🟡)
- видеть что Chrome свободен для ручной работы (🟢)

Всё через API из task-006.

### Шаг 1: `useHfStatus` hook

Создай `src/hooks/useHfStatus.ts`:

```ts
import { useEffect, useState } from 'react';

export type HfStatus = 'idle' | 'running' | 'paused';
export interface HfStatusResponse {
  status: HfStatus;
  currentOp: string | null;
}

export function useHfStatus(pollMs = 2000) {
  const [data, setData] = useState<HfStatusResponse>({ status: 'idle', currentOp: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/admin/higgsfield/status');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const j = (await res.json()) as HfStatusResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const interval = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollMs]);

  const pause = async () => {
    await fetch('/api/admin/higgsfield/pause', { method: 'POST' });
  };
  const resume = async () => {
    await fetch('/api/admin/higgsfield/resume', { method: 'POST' });
  };

  return { ...data, error, pause, resume };
}
```

### Шаг 2: `HiggsfieldStatusIndicator` компонент

Создай `src/components/HiggsfieldStatusIndicator.tsx`:

```tsx
'use client';
import { useHfStatus } from '@/hooks/useHfStatus';

export default function HiggsfieldStatusIndicator() {
  const { status, currentOp, pause, resume } = useHfStatus(2000);

  const label = {
    idle: 'Chrome свободен — можно работать руками',
    running: `Automation: ${currentOp ?? 'running'}`,
    paused: `Paused: ${currentOp ?? 'idle'}`,
  }[status];

  const dotClass = {
    idle: 'bg-emerald-400',
    running: 'bg-red-400 animate-pulse',
    paused: 'bg-yellow-400',
  }[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-border-subtle text-xs">
      <div className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className="text-text-secondary">{label}</span>
      {status === 'running' && (
        <button
          onClick={() => void pause()}
          className="ml-2 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 text-[11px]"
        >
          Pause
        </button>
      )}
      {status === 'paused' && (
        <button
          onClick={() => void resume()}
          className="ml-2 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[11px]"
        >
          Resume
        </button>
      )}
    </div>
  );
}
```

### Шаг 3: Разместить в Studio

Файл: `src/components/Studio.tsx`

В шапке step 4 (рядом с текущим badge "via Higgsfield ∞") добавить `<HiggsfieldStatusIndicator />`. **Только при provider_mode === 'higgsfield'** (чтобы не мешать api-юзерам):

```tsx
{providerMode === 'higgsfield' && <HiggsfieldStatusIndicator />}
```

Точное место — по соседству с существующим "via Higgsfield ∞" badge в header Generate Video-секции.

## Критерии готовности

### Общие (DoD §1)
- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] Код написан согласно задаче, ничего лишнего

### UI (DoD §4)
- [ ] **Live в браузере:** открой Studio step 4, higgsfield-mode включён → виден компонент с зелёной точкой и текстом «Chrome свободен — можно работать руками»
- [ ] **Live flow #1:** нажми Generate All (или Generate на одной сцене) — точка становится **красной пульсирующей**, текст показывает `Automation: generateImage:...` или аналогичное, рядом кнопка **Pause**
- [ ] **Live flow #2:** нажми **Pause** — точка становится **жёлтой**, текст меняется на `Paused: ...`, кнопка Pause заменяется на **Resume**. Убедись что Playwright действительно застыл (окно Chrome не дёргается)
- [ ] **Live flow #3:** нажми **Resume** — точка снова красная, автоматизация продолжается с того же места, результат появляется в UI
- [ ] **Live flow #4:** когда автоматизация завершилась — точка становится зелёной, кнопок Pause/Resume нет
- [ ] **Не-higgsfield mode:** в Settings переключи provider на `api` → индикатор пропал (не показывается)

### Screenshots (DoD §4)
- [ ] `data/task-010-evidence/01-idle.png` — зелёная точка (idle состояние)
- [ ] `data/task-010-evidence/02-running.png` — красная пульсирующая во время генерации, с кнопкой Pause
- [ ] `data/task-010-evidence/03-paused.png` — жёлтая после клика Pause, с кнопкой Resume
- [ ] `data/task-010-evidence/04-api-mode-hidden.png` — индикатор отсутствует при provider_mode=api

### Polling (DoD §1 — качество)
- [ ] Polling раз в **2 секунды** — не раз в 100ms (лишний трафик), не раз в 30 сек (ленивый UX)
- [ ] При unmount компонента interval очищается (нет warnings в React DevTools о memory leak)
- [ ] Ошибки fetch не ломают UI — отображаются как `idle` fallback

## Файлы
- **Создать:** `src/hooks/useHfStatus.ts`, `src/components/HiggsfieldStatusIndicator.tsx`
- **Изменить:** `src/components/Studio.tsx` (один импорт + одна строка-вставка в JSX)
- **НЕ трогать:** API routes, higgsfield-web.ts, browser-helpers.ts, backend

## Параллелизация с backend
Этот таск можно **начинать до завершения task-006**, если frontend-агент хочет работать впрок:
- `useHfStatus` и `HiggsfieldStatusIndicator` можно написать и дойти до типовой проверки `npx tsc --noEmit`
- Live-тесты (§4 DoD) требуют существующих endpoint'ов — их нужно ждать завершения task-006
- После того как backend отдаёт /status — frontend сразу может пройти acceptance

Tester не закрывает task-010 пока **все 4 live flow** не прошли и 4 скриншота не в evidence pack.
