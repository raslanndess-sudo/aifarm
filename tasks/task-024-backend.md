# Task 024 — Backend: endImageUrl (tail frame) support

## Context
Сейчас Kling API вызывается только с одним start frame. Нужно добавить поддержку end frame (tail_image), чтобы фронтенд мог отправлять пары кейфреймов для генерации клипов.

## Шаги

### 1. `src/lib/kling.ts` — добавить `tailImage` в `submitKlingImageToVideo`

В параметрах функции добавить:
```ts
tailImage?: string; // base64 end frame
```

В теле запроса (`body`), если `tailImage` передан:
```ts
if (tailImage) {
  body.tail_image = tailImage;
}
```

### 2. `src/lib/providers/kling-api.ts` — прокинуть `endImageUrl`

В `generateVideo()`, при вызове `submitKlingImageToVideo`, добавить:
```ts
tailImage: params.endImageUrl,
```

### 3. `src/app/api/kling/generate-video/route.ts` — принять `endImageUrl`

Из body запроса извлечь `endImageUrl`:
```ts
const { imageUrl, endImageUrl, animationPrompt, ... } = body;
```

Если `endImageUrl` есть — сконвертировать в base64 так же как `imageUrl` (тот же блок if http/data:/raw).

Передать в `provider.generateVideo()`:
```ts
const job = await provider.generateVideo({
  imageUrl: imageBase64,
  endImageUrl: endImageBase64, // undefined если не передан
  prompt: animationPrompt,
  ...
});
```

### 4. Проверить `tsc --noEmit`

## Важно
- API контракт РАСШИРЯЕТСЯ (новое опциональное поле), не ломается
- Если `endImageUrl` не передан — поведение идентично текущему
- `tail_image` — это имя параметра в Kling API для end frame
