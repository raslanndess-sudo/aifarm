# task-021: Admin Toggle + Emergency Stop — Frontend

## Цель

Settings получает Emergency Stop кнопку. Studio показывает что Higgsfield активен когда включён.

## Шаги

### 1. Settings.tsx — Emergency Stop кнопка

В секции Generation Provider (которая уже есть), ПОСЛЕ select-а добавь:

- Красная кнопка "Emergency Stop" — видна ТОЛЬКО когда `providerMode === 'higgsfield'`
- При клике: `POST /api/emergency-stop`, после ответа — обновить providerMode на 'api'
- Стиль: красный фон, белый текст, иконка AlertTriangle или подобная
- Confirmation перед отправкой: `if (!confirm('Stop all Higgsfield operations?')) return;`

### 2. Settings.tsx — Разблокировать Higgsfield option

Сейчас option `higgsfield` в select-е имеет `disabled: true`. Убери disabled — теперь admin может реально переключить.

### 3. Studio.tsx — визуальный индикатор режима

Обнови существующий pill badge:
- Когда `higgsfield` — badge зелёный с пульсирующей точкой (анимация), текст "via Higgsfield ∞"
- Когда `api` — badge серый, текст "via Kling API"

Добавь рядом с badge маленькую красную кнопку "Stop" (видна только при higgsfield), которая вызывает тот же `POST /api/emergency-stop`.

## НЕ ТРОГАЙ

- API роуты
- src/lib/
