# task-017: Providers Foundation — Frontend

## Что делать

### 1. Settings.tsx — секция Generation Provider

- Добавь новую секцию **Generation Provider** ПЕРЕД секцией API Keys
- Секция видна ТОЛЬКО если текущий user — admin
- Внутри: `<select>` с двумя вариантами:
  - `'api'` — label: "Kling API"
  - `'higgsfield'` — label: "Higgsfield (Unlimited)", `disabled: true`
- Значение читай из `/api/settings?key=provider_mode` при загрузке. Если нет — дефолт `'api'`
- При изменении — `POST /api/settings` с `{ key: 'provider_mode', value: selectedValue }`
- Стилизуй в том же стиле что остальные секции Settings

### 2. Studio.tsx — бейдж провайдера

- Добавь маленький pill/badge рядом с кнопкой Generate
- Текст бейджа:
  - `'via Kling API'` когда `provider_mode === 'api'` — серый фон
  - `'via Higgsfield ∞'` когда `provider_mode === 'higgsfield'` — зелёный фон
- Читай `provider_mode` из `/api/settings?key=provider_mode` при загрузке компонента
- Стиль: маленький pill badge, полупрозрачный фон, мелкий шрифт

## НЕ ТРОГАЙ

- API роуты (`src/app/api/`)
- Библиотеки (`src/lib/`)
- Только компоненты!
