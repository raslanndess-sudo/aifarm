# Task 008: generateImage/generateVideo — end-to-end через реальные UI клики

## Приоритет: ВЫСОКИЙ
## Зависимости: task-006 (singleton), task-007 (helpers)
## Блокирует: task-009

## Описание

Переписать `HiggsfieldWebProvider.generateImage()` и `.generateVideo()` так, чтобы они **реально кликали UI** через helpers из task-007, а не полагались на URL-параметры. Плюс — поддержка pause checkpoint'ов между шагами, плюс rewrite webp→png для Kling.

### Шаг 1: `generateImage()` — Seedream 5 Lite через клики

```ts
async generateImage(
  prompt: string,
  opts?: { model?: ImageModel; count?: number },
): Promise<string[]> {
  if (!this.context) throw new Error('Not connected — call connect() first');
  const model: ImageModel = opts?.model ?? 'seedream_v5_lite';
  const count = opts?.count ?? 1;
  const jobId = `img_${Date.now()}`;
  const outDir = path.join(process.cwd(), 'public', 'generations', jobId);
  mkdirSync(outDir, { recursive: true });

  auditLog('generateImage:start', `model=${model} jobId=${jobId} prompt="${prompt.slice(0, 80)}"`);

  const page = this.context.pages()[0] || await this.context.newPage();

  // 1. Navigate (domcontentloaded, NOT networkidle — higgsfield.ai never idles)
  await page.goto('https://higgsfield.ai/ai/image', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await checkpointPause('generateImage:loaded');

  // 2. Select the target model via real UI click
  await selectModel(page, 'image', model);
  await checkpointPause('generateImage:model-selected');

  // 3. Enable Unlimited (real switch)
  await enableUnlimited(page, 'image');
  await checkpointPause('generateImage:unlimited-on');

  // 4. Type prompt into Lexical
  await typeInLexical(page, '[contenteditable="true"]', prompt);
  await sleep(randomDelay(600, 1400));
  await checkpointPause('generateImage:prompt-typed');

  // 5. Click Generate
  await humanClick(page, 'button:has-text("Generate")');
  auditLog('generateImage:submitted', 'clicked Generate');

  // 6. Wait for results + download
  await page.waitForSelector('img[src*="generation"]', { timeout: 180000 });
  await sleep(randomDelay(2000, 4000));

  const imageUrls = await page.evaluate((max) => {
    return Array.from(document.querySelectorAll('img[src*="generation"]'))
      .map((img) => (img as HTMLImageElement).src)
      .slice(0, max);
  }, count);

  const savedPaths: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const res = await fetch(imageUrls[i]);
    const buf = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(outDir, `image_${i}.png`);
    writeFileSync(filePath, buf);
    savedPaths.push(`/generations/${jobId}/image_${i}.png`);
    auditLog('generateImage:downloaded', `image_${i}.png`);
  }

  auditLog('generateImage:done', `${savedPaths.length} images saved`);
  return savedPaths;
}
```

### Шаг 2: `generateVideo()` — Kling 2.5 Turbo через клики

```ts
async generateVideo(params: {
  imageUrl: string;
  endImageUrl?: string;
  prompt?: string;
  model?: VideoModel;
  duration?: '5' | '10';
}): Promise<GenerationJob> {
  if (!this.context) throw new Error('Not connected — call connect() first');
  const model = params.model ?? 'kling-2-5-turbo';
  const jobId = `vid_${Date.now()}`;
  const outDir = path.join(process.cwd(), 'public', 'generations', jobId, 'clips');
  mkdirSync(outDir, { recursive: true });

  auditLog('generateVideo:start', `jobId=${jobId} model=${model}`);

  const page = this.context.pages()[0] || await this.context.newPage();

  // 1. Navigate
  await page.goto('https://higgsfield.ai/ai/video', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await checkpointPause('generateVideo:loaded');

  // 2. Select Kling 2.5 Turbo (category → variant)
  await selectModel(page, 'video', model);
  await checkpointPause('generateVideo:model-selected');

  // 3. Download + normalize start frame to PNG (Kling rejects webp)
  const startFramePath = await this.downloadToTempPng(params.imageUrl, jobId, 'start_frame.png');

  const fileInputs = await page.locator('input[type="file"]').all();
  if (fileInputs.length < 1) {
    auditLog('generateVideo:error', 'no file inputs on /ai/video');
    throw new Error('generateVideo: no start-frame input found');
  }
  await fileInputs[0].setInputFiles(startFramePath);
  await sleep(randomDelay(1800, 2800));
  auditLog('generateVideo:startFrame', 'uploaded');
  await checkpointPause('generateVideo:start-frame-uploaded');

  // 4. Optional end frame
  if (params.endImageUrl) {
    const endFramePath = await this.downloadToTempPng(params.endImageUrl, jobId, 'end_frame.png');
    const refreshedInputs = await page.locator('input[type="file"]').all();
    if (refreshedInputs.length < 2) {
      auditLog('generateVideo:warn', 'end-frame input missing despite endImageUrl provided — skipping');
    } else {
      await refreshedInputs[1].setInputFiles(endFramePath);
      await sleep(randomDelay(1800, 2800));
      auditLog('generateVideo:endFrame', 'uploaded');
    }
  }
  await checkpointPause('generateVideo:frames-ready');

  // 5. Enable Unlimited banner (switches 1080p→720p, 5s stays)
  await enableUnlimited(page, 'video');
  await checkpointPause('generateVideo:unlimited-on');

  // 6. Type prompt into <textarea id="prompt">
  if (params.prompt) {
    await setPromptTextarea(page, params.prompt);
    await sleep(randomDelay(600, 1200));
  }
  await checkpointPause('generateVideo:prompt-typed');

  // 7. Click Generate
  await humanClick(page, 'button:has-text("Generate")');
  auditLog('generateVideo:submitted', 'clicked Generate');

  // 8. Wait for result (up to 5 min)
  try {
    await page.waitForSelector('video source, a[href*=".mp4"], video[src]', { timeout: 300000 });
  } catch {
    auditLog('generateVideo:timeout', 'video not ready after 5 min');
    return { jobId, status: 'failed', error: 'Generation timeout after 5 min' };
  }
  await sleep(randomDelay(2000, 4000));

  // 9. Download video
  const videoUrl = await page.evaluate(() => {
    const v = document.querySelector('video source, video[src]') as HTMLVideoElement | HTMLSourceElement | null;
    if (v) return (v as HTMLSourceElement).src || (v as HTMLVideoElement).src;
    const a = document.querySelector('a[href*=".mp4"]') as HTMLAnchorElement | null;
    return a?.href || null;
  });
  if (!videoUrl) {
    auditLog('generateVideo:error', 'video URL not extractable');
    return { jobId, status: 'failed', error: 'Video URL not found' };
  }
  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const videoPath = path.join(outDir, 'clip_0.mp4');
  writeFileSync(videoPath, buf);
  auditLog('generateVideo:downloaded', `clip_0.mp4 (${buf.length} bytes)`);

  return {
    jobId,
    status: 'succeed',
    resultUrl: `/generations/${jobId}/clips/clip_0.mp4`,
  };
}
```

### Шаг 3: `downloadToTempPng()` — явная конвертация webp→png

Kling UI отвергает webp. Добавь метод который принудительно сохраняет как PNG:

```ts
private async downloadToTempPng(
  urlOrPath: string,
  jobId: string,
  filename: string,
): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'public', 'generations', jobId);
  mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, filename);

  // 1. Fetch bytes
  let buf: Buffer;
  if (urlOrPath.startsWith('http')) {
    const r = await fetch(urlOrPath);
    buf = Buffer.from(await r.arrayBuffer());
  } else if (urlOrPath.startsWith('data:')) {
    const b64 = urlOrPath.split(',')[1] ?? urlOrPath;
    buf = Buffer.from(b64, 'base64');
  } else if (urlOrPath.startsWith('/generations/')) {
    // Internal path from our public dir
    buf = readFileSync(path.join(process.cwd(), 'public', urlOrPath));
  } else {
    buf = readFileSync(urlOrPath);
  }

  // 2. Detect format. If webp → convert via sharp.
  const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (isWebp) {
    const sharp = (await import('sharp')).default;
    buf = await sharp(buf).png().toBuffer();
    auditLog('downloadToTempPng:converted', 'webp → png');
  }

  writeFileSync(outPath, buf);
  return outPath;
}
```

**Добавить зависимость:** `npm install sharp` (если ещё нет — проверь `package.json`).

## Критерии готовности

### Общие
- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] `sharp` в `package.json` (если был отсутствующ)

### Browser automation (DoD §2 — КРИТИЧНО, live-test не опционален)

**Test #1 — image end-to-end (live)**
- [ ] Запусти dev-сервер, зайди в Studio как admin, включи higgsfield-mode
- [ ] Создай 1 сцену с простым промптом ("A white cat in a field, anime style")
- [ ] Нажми Generate в Storyboard для этой сцены
- [ ] Подтверди:
  - [ ] Composer на /ai/image показывает "Seedream 5.0 lite" (не Nano Banana Pro)
  - [ ] aria-checked="true" на Unlimited switch
  - [ ] Файл сохранён в `public/generations/img_*/image_0.png`
  - [ ] Скрин higgsfield.ai в момент Submit в `data/task-008-evidence/image-generate.png`
  - [ ] Audit-log содержит `selectModel:done image=Seedream 5.0 lite` и `enableUnlimited:done image`

**Test #2 — video end-to-end (live)**
- [ ] В той же Studio-сессии дёрни Video на сцене
- [ ] Подтверди:
  - [ ] Composer на /ai/video показывает "Kling 2.5 Turbo"
  - [ ] После upload start-frame банner "Change to 720p 5s for Unlimited" кликнут → Generate показывает стоимость 0
  - [ ] `textarea#prompt` заполнен animation prompt
  - [ ] `public/generations/vid_*/clips/clip_0.mp4` сохранён, >500KB
  - [ ] Скрин в `data/task-008-evidence/video-generate.png`
  - [ ] Audit-log содержит `selectModel:done video=Kling 2.5 Turbo`, `enableUnlimited:done video`, `generateVideo:downloaded`

**Test #3 — webp→png конвертация (live)**
- [ ] Передай в `generateVideo()` imageUrl указывающий на .webp файл (можно balloon.webp из корня)
- [ ] Подтверди:
  - [ ] `public/generations/*/start_frame.png` сохранён и реально PNG (первые 4 байта = `89 50 4E 47`)
  - [ ] Upload в Kling прошёл без ошибки "only .jpg/.jpeg/.png supported"
  - [ ] Audit-log содержит `downloadToTempPng:converted webp → png`

**Test #4 — pause во время активной генерации (live)**
- [ ] Запусти generateImage через Studio. На половине пути — `POST /api/admin/higgsfield/pause`
- [ ] Подтверди: Playwright застыл на ближайшем `checkpointPause`, GET /status возвращает `{status:'paused', currentOp:'generateImage:...'}`
- [ ] `POST /resume` — генерация продолжилась, результат есть
- [ ] Лог переходов в `data/task-008-evidence/pause-during-gen.log`

**Test #5 — 2 сцены preparation для task-009 (live, КРИТИЧНО)**
Это smoke-проверка что два последовательных вызова пайплайна через один singleton Chrome работают корректно и **не мешают друг другу**. Финальная склейка тестируется в task-009, здесь — только что оба клипа создаются.
- [ ] В Studio создай **2 сцены** с осмысленным переходом (например: "white cat on porch" → "white cat in flower field")
- [ ] Нажми Generate All (auto-video=ON)
- [ ] Подтверди:
  - [ ] Обе картинки сгенерированы через Seedream (audit: 2 × `selectModel:done image=Seedream 5.0 lite`)
  - [ ] Обе видео-сессии использовали **один и тот же context** (audit не содержит 4 × `launchPersistentContext`)
  - [ ] В `public/generations/` есть 2 папки с клипами (`vid_*/clips/clip_0.mp4`)
  - [ ] В audit-log `generateVideo:downloaded` встречается ровно 2 раза
  - [ ] Оба клипа воспроизводятся и **имеют визуальный переход** от start→end frame (не просто одинаковый кадр)
  - [ ] Скрин Studio после завершения обоих видео в `data/task-008-evidence/two-scenes-done.png`
  - [ ] Выдержка audit-log за прогон в `data/task-008-evidence/two-scenes-audit.log`

### Failure modes (DoD §3)
- [ ] Если `selectModel` падает с "option not found" — API возвращает 502 с понятным error.message, НЕ 500 Internal
- [ ] Если Kling таймаутит 5 мин — возвращается `{status:'failed', error:'Generation timeout after 5 min'}`, клип не создаётся

### Selectors (DoD §2) — жёстко
- [ ] **Все селекторы** в generateImage/generateVideo идут **только через helpers из task-007** (`selectModel`, `enableUnlimited`, `setPromptTextarea`, `typeInLexical`, `humanClick`). Прямых `page.locator(...)` для model/unlimited/prompt в этом файле **нет вообще**
- [ ] Допускаются прямые селекторы ТОЛЬКО для: `input[type="file"]`, `img[src*="generation"]`, `video source, a[href*=".mp4"], video[src]` — они задокументированы в `docs/higgsfield-selectors.md` разделы 2.7, 2.9 и невидимы через UI (не зависят от tailwind-дизайна)
- [ ] Ни одной tailwind-utility-class hardcoded строки (типа `.ring-primary`, `.text-font-brand`) в селекторах
- [ ] Ни один селектор не помечен как ПРИМЕРНЫЙ/ПРИБЛИЗИТЕЛЬНЫЙ/TODO (automatic fail per DoD §2)

### Fail-closed propagation (DoD §2+§3)
- [ ] Если `selectModel` / `enableUnlimited` / `setPromptTextarea` из task-007 кидают ошибку — generateImage/generateVideo **НЕ** заворачивает их в try/catch, просто даёт пройти вверх к API route handler, который вернёт 502 с понятным текстом
- [ ] `waitForSelector` для результатов (img[src*="generation"] / video tag) при таймауте → возвращает `{status:'failed', error: 'timeout ...'}`, не 200 с пустым массивом
- [ ] Ни один `catch {}` или `catch (e) { /* ignore */ }` в этом файле не появляется

## Файлы
- **Изменить:** `src/lib/providers/higgsfield-web.ts` (generateImage, generateVideo, downloadToTempPng)
- **Изменить (возможно):** `package.json` (добавить sharp если нет)
- **НЕ трогать:** browser-helpers.ts (task-007), Studio.tsx, routes

## Evidence pack
В `data/task-008-evidence/` должно быть **минимум**:
- image-generate.png
- video-generate.png
- pause-during-gen.log
- webp-test.log
- final-audit.log (выдержка из `data/higgsfield-audit.log` охватывающая все 4 теста)
