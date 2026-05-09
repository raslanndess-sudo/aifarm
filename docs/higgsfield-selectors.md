# Higgsfield UI selectors — верифицированы спайками v1/v2/v3

**Chrome:** 147.0.7727.116 · **Playwright:** 1.59.1 через `launchPersistentContext`
**user-data-dir:** `E:/Users/rasla/chrome-automation-safe`
**Дата последнего спайка:** 2026-04-24

**Артефакты:**
- `scripts/higgsfield-ui-spike.ts` (v1/v2 — /ai/image)
- `scripts/higgsfield-ui-spike-v3.ts` (v3 — /ai/video → Kling 2.5 Turbo)
- `data/spike-screens/*.png` (v1/v2)
- `data/spike-v3-screens/*.png` (v3)
- `data/spike-dump.json`, `data/spike-v3-dump.json`

---

## 1. `/ai/image` → Seedream 5.0 lite (финальная модель)

### 1.1 Факты
- **Дефолт без параметров:** `https://higgsfield.ai/ai/image?model=nano-banana-pro`
- **Отображаемое имя цели:** `"Seedream 5.0 lite"` (с пробелом, "v5" прописано как "5.0"), имеет **UNLIMITED** бейдж
- **URL после выбора Seedream:** `https://higgsfield.ai/ai/image?model=seedream_v5_lite` — **underscore, не hyphen**

### 1.2 Composer model button
```ts
// Tailwind-классы меняются, якоримся на поведение:
const btn = page.locator('button:has(svg)')
  .filter({ hasText: /Nano Banana|Seedream|Flux|Soul|Kling/i })
  .last();  // composer-bar всегда последний из списка
```
- **Rect:** `x=41, y=986, w=182, h=40`
- После клика → DOM вырастает (101 → 130 элементов), открывается portal overlay с `z-index > 10`

### 1.3 Model option в overlay
```ts
// Опция Seedream
page.locator('button').filter({ hasText: /Seedream 5\.?0? lite/i });
```
- Контент кнопки: `"Seedream 5.0 lite\nUNLIMITED\nIntelligent visual reasoning"`
- **Подтверждение выбора:** composer-кнопка после клика содержит `"Seedream 5.0 lite"` — это invariant для проверки успеха

### 1.4 Unlimited toggle (обязательно кликать)
```ts
// Настоящий switch, aria-checked="false" по умолчанию
const unlimitedSwitch = page.locator('button[role="switch"]').last();
// Кликать если aria-checked="false"
```
- **Rect:** `x=570, y=994, w=36, h=24`
- **Проверка успеха:** `aria-checked="true"` после клика; `Generate` кнопка показывает `"Generate\n0"` вместо `"Generate\n1"`

### 1.5 Prompt input
```ts
page.locator('[contenteditable="true"]');
// Lexical editor. Placeholder: "Describe the scene you imagine"
```
- **Rect:** `y=940, h=40`
- Ввод — через `typeInLexical()` из `browser-helpers.ts` (уже реализован)

### 1.6 Generate button
```ts
page.locator('button:has-text("Generate")');
// Текст: "Generate\n<cost>" — cost=0 означает Unlimited применился
```

---

## 2. `/ai/video` → Kling 2.5 Turbo (финальная модель)

### 2.1 Факты
- **Дефолт:** `https://higgsfield.ai/ai/video` (без query-параметра)
- **URL после выбора Kling 2.5 Turbo:** `https://higgsfield.ai/ai/video` — **URL не меняется!** Модель хранится в state, не в route
- **Отображаемое имя:** `"Kling 2.5 Turbo\nUNLIMITED\n1080p\n5s-10s"`
- **UNLIMITED** бейдж на 2026-04-24 есть ⇒ это *целевая* модель
- Kling 2.5 Turbo **не в "Featured models"** — лежит под категорией **"Kling"**. Требуется двойной клик: сначала категория, потом сам вариант

### 2.2 Composer model button (Video)
```ts
// Куда стабильнее — через aria-label:
page.locator('button[aria-label="Model"]');
```
- **Rect:** `x=33, y=544, w=286, h=48`
- outerHTML содержит `aria-label="Model"` + `data-rac=""` (RAC = React Aria Components)

### 2.3 Раскрыть категорию "Kling"
```ts
// Выбираем именно категорию-родитель, а не версии:
const klingCategory = page.locator('button').filter({
  has: page.locator('text=/^Kling\\s*$/'),
  hasText: /Perfect motion/i,
});
await klingCategory.click();
```
- Контент: `"Kling\n\nPerfect motion with advanced video control"`
- После клика — раскрывается секция с вариантами (DOM: 44 → 58 элементов)

### 2.4 Выбор Kling 2.5 Turbo
```ts
page.locator('button').filter({ hasText: /Kling 2\.5 Turbo/i });
```
- Полный текст кнопки: `"Kling 2.5 Turbo\nUNLIMITED\n1080p\n5s-10s"`
- outerHTML — кнопка с вложенным `<span>Unlimited</span>` badge
- **Подтверждение выбора:** `button[aria-label="Model"]` теперь содержит `"Model\n\nKling 2.5 Turbo"`

### 2.5 Unlimited mode — НЕ toggle, а кликабельный баннер
**Важно:** на `/ai/video` у Kling 2.5 Turbo **нет `role="switch"`**. Вместо него есть жёлтый баннер внизу сайдбара:

```
Change to 720p 5s
for Unlimited
```

Селектор:
```ts
page.locator('*').filter({ hasText: /Change to 720p 5s[\s\S]*for Unlimited/i }).first();
// или по точному тексту:
page.getByText('Change to 720p 5s').locator('..'); // parent clickable
```

- Клик переключает resolution с `1080p` → `720p` и duration на `5s`
- **Проверка успеха:** `Generate` кнопка меняется с `"Generate\n6"` на `"Generate\n0"`
- Баннер **появляется только после загрузки start-frame** (до этого стоимость = 0 и он не нужен)

### 2.6 Prompt — `<textarea>`, НЕ Lexical
```ts
page.locator('textarea#prompt');
// или:
page.locator('textarea[placeholder*="Describe the scene"]');
```
- `id="prompt"`, placeholder `"Describe the scene you imagine, with details."`
- **Rect:** `x=45, y=448, w=262, h=78`
- Ввод — **обычный `page.fill()`** или `textarea.pressSequentially()` для human-like. **НЕ через typeInLexical()**

### 2.7 File inputs (start + end frame)
```ts
const fileInputs = await page.locator('input[type="file"]').all();
// fileInputs[0] — start frame
// fileInputs[1] — end frame (optional)
```
- **accept:** `".jpg,.jpeg,.png"` (⚠️ **webp НЕ принимается** — Kling выдаёт ошибку "Kling: only .jpg/.jpeg/.png are supported.")
- multiple: `false`
- Rect height=1px — инпуты визуально скрыты стилем, но `setInputFiles()` работает
- Оба существуют **сразу** при загрузке страницы с выбранной моделью — не нужно что-либо кликать чтобы они появились

**Конвертация webp→png:** если Studio передаёт URL с webp, провайдеру нужно скачать и конвертировать в PNG через `sharp` или `ffmpeg` до `setInputFiles()`. Это уже реализовано в текущем `downloadToTemp()` но сейчас оно сохраняет с исходным расширением — надо будет дописать явный rewrite `.webp` → `.png`.

### 2.8 Generate button
```ts
page.locator('button:has-text("Generate")');
```
- Текст: `"Generate\n<cost>"` — `cost=0` при успешном включении Unlimited (720p/5s)
- При 1080p или 10s — cost=6

### 2.9 Ожидание результата видео
Не верифицировано в спайке (не запускали реальный Generate). При имплементации использовать существующий селектор из `higgsfield-web.ts:177`:
```ts
page.waitForSelector('video source, a[href*=".mp4"], video[src]', { timeout: 300000 });
```
DoD live-test должен это подтвердить.

---

## 3. Полная сводка селекторов

| # | Элемент | Страница | Селектор | Статус |
|---|---|---|---|---|
| 1 | Composer model button | /ai/image | `button:has(svg):has-text(/<текущая модель>/i):last` | ✅ верифицирован |
| 2 | Seedream 5.0 lite option | /ai/image | `button:has-text("Seedream 5.0 lite")` | ✅ кликнут |
| 3 | Unlimited switch | /ai/image | `button[role="switch"]:last` | ✅ найден, aria-checked toggleable |
| 4 | Prompt (Lexical) | /ai/image | `[contenteditable="true"]` | ✅ работает через `typeInLexical()` |
| 5 | Generate button | /ai/image | `button:has-text("Generate")` | ✅ |
| 6 | Composer model button | /ai/video | `button[aria-label="Model"]` | ✅ стабильный aria-label |
| 7 | Категория "Kling" | /ai/video | `button:has-text("Kling"):has-text("Perfect motion")` | ✅ кликнут |
| 8 | Kling 2.5 Turbo option | /ai/video | `button:has-text("Kling 2.5 Turbo")` | ✅ кликнут |
| 9 | Unlimited баннер | /ai/video | `*:has-text(/Change to 720p 5s[\s\S]*for Unlimited/i)` | ✅ текст в DOM подтверждён |
| 10 | Prompt (textarea) | /ai/video | `textarea#prompt` | ✅ ввод через `page.fill()` |
| 11 | Start frame input | /ai/video | `input[type="file"]:nth(0)` | ✅ `setInputFiles(png)` работает |
| 12 | End frame input | /ai/video | `input[type="file"]:nth(1)` | ✅ найден (нужен jpg/png, **не webp**) |
| 13 | Generate button | /ai/video | `button:has-text("Generate")` | ✅ cost=0 при Unlimited |

---

## 4. Unlimited toggle (composer) — `/ai/image`

Toggle switch в composer panel, рядом с текстом "Unlimited". НЕ путать с большой жёлтой кнопкой submit.

```ts
// Находим все [role="switch"] на странице, выбираем тот, чей предок содержит "Unlimited"
const allSwitches = page.locator('[role="switch"]');
// Перебираем — ищем ближайшего предка с текстом "Unlimited"
// Fallback: последний switch на странице (он в composer bar)
```

**Проверка состояния** — два атрибута (зависит от реализации: стандартный vs Radix/shadcn):
- `aria-checked="true"` — стандартный switch
- `data-state="checked"` — Radix Switch (`data-state="unchecked"` когда OFF)

Проверять ОБА после клика. Rect: `~x=570, y=994, w=36, h=24`.

---

## 5. Unlimited launch button (yellow) — `/ai/image`

Большая жёлтая кнопка "Unlimited ✨" в composer. Появляется ТОЛЬКО когда toggle (§4) активен. Если toggle OFF — вместо неё стоит "Generate N".

```ts
// Exclude role="switch" чтобы не перепутать с toggle
const unlimitedBtn = page.locator('button:not([role="switch"])')
  .filter({ hasText: /Unlimited/i })
  .last();
```

**Верификация:** если `useUnlimited` но текст кнопки не содержит "Unlimited" → toggle не сработал, бросай ошибку.

---

## 6. Image card click target — History grid

Thumbnail-карточки в гриде генераций. Свежие картинки появляются в верхнем ряду.

```ts
// Все figure.group в гриде
page.locator('figure.group')
// Внутри каждой: img с src содержащим "images.higgs.ai"
// Для top-row: берём фигуры с одинаковым getBoundingClientRect().top (±50px)
```

**URL-нормализация:** CloudFront proxy оборачивает URL в querystring. Каноничный URL — значение параметра `?url=`:
```ts
const u = new URL(img.src);
const canonical = u.searchParams.get('url') || img.src;
```

Клик по figure.group → открывается модалка с Details panel.

---

## 7. Modal download button

После клика на thumbnail (§6) открывается модалка. В Details panel справа ряд кнопок: Animate / Publish / Open in / Reference / **Download**.

```ts
// Modal container — один из вариантов:
const modalSelector = 'dialog, [role="dialog"], [data-state="open"]';
await page.waitForSelector(modalSelector, { timeout: 900000 });

// Download button внутри модалки
const downloadBtn = page.locator('button').filter({ hasText: /Download/i }).first();
```

**Перехват скачивания:**
```ts
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 900000 }),
  downloadBtn.click({ delay: 100 }),
]);
// suggestedFilename() обычно возвращает .webp или .png
```

Закрытие модалки: `page.keyboard.press('Escape')`.

---

## 8. Критические расхождения с текущим кодом `higgsfield-web.ts`

| Где | Что в коде | Что реально | Impact |
|---|---|---|---|
| `generateImage` line ~69 | `?model=seedream-5-lite` | `?model=seedream_v5_lite` (underscore) | Модель не переключается |
| `generateImage` line ~62 (default) | `?model=nano-banana-2` | `?model=nano-banana-pro` | Дефолт устарел |
| `generateImage` | Не кликает UI-dropdown, не включает Unlimited switch | URL-param не переключает активную модель | Платформа генерит через текущую активную (Nano Banana Pro), не через SeaDream |
| `generateVideo` line ~136 | `?model=kling-2-5-turbo` URL | URL не содержит model-param на /ai/video | goto с query не выберет модель |
| `generateVideo` | Не кликает Unlimited баннер | Стоимость 6 кредитов при 1080p/5s | Кредиты списываются там где должно быть 0 |
| `generateVideo` prompt | `typeInLexical()` на `[contenteditable="true"]` | На /ai/video это `<textarea id="prompt">` | Ничего не печатается |
| `downloadToTemp` | Сохраняет исходное расширение | Kling UI отвергает .webp | Leonardo возвращает PNG — ок; но если когда-либо webp попадёт, вся цепочка упадёт |
| `connect()` / `disconnect()` per-request | Chrome открывается/закрывается на каждый вызов API | должен быть singleton на dev session | UX: окно прыгает; производительность: +20-30 сек на launch |

---

## 5. Нерешённое / требует live-теста при имплементации

- **Motion `On` switch** на /ai/video слева (видим на скрине `04-after-png-upload.png`) — что он делает? Нужно ли явно выставлять `Off` для чистого start→end frame перехода? task-008 должна проверить вживую.
- **Preset "GENERAL"** на /ai/video — насколько влияет на результат? Возможно надо явно сбросить или оставить по дефолту. Проверить при live-тесте.
- **Поведение после клика Generate** — структура thumbnail-галереи результатов, как узнать что конкретно "наш" клип (не предыдущий). task-008 должна замерить и записать.
