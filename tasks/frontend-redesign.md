# Задача для Frontend — UX/UI Redesign

## Цель
Сделать визуально потрясающий, премиальный дизайн дашборда. Сейчас UI функциональный, но базовый. Нужен WOW-эффект уровня Vercel / Linear / Raycast.

## Профиль: .claude/profiles/frontend.md
**Обязательно** используй UI/UX скилл перед каждым решением.

## Что переделать

### 1. Sidebar (header nav)
- Добавить subtle glow на активный таб (gradient underline или pill background)
- Лого — добавить анимацию при hover (pulse или rotate)
- Микро-анимации при переключении табов (fade + slide)
- Добавить badge-счётчики (кол-во видео, pending posts и т.д.)

### 2. Общий Layout
- Gradient mesh background (subtle, animated) вместо plain #09090b
- Floating glass cards с более выраженным glassmorphism
- Добавить subtle grid pattern или dot pattern на фон
- Улучшить spacing и breathing room между элементами
- Smooth page transitions при смене табов (framer-motion или CSS transitions)

### 3. Cards & Components
- Hover эффекты: lift + glow border (gradient border на hover)
- Skeleton loading states (animated shimmer)
- Micro-interactions: кнопки с ripple, иконки с bounce
- Status indicators с pulse animation (online/posting/error)
- Tooltips стилизованные под общий дизайн

### 4. Typography & Colors
- Проверить через UI/UX скилл лучшую шрифтовую пару для dashboard
- Gradient accents (purple→cyan уже есть, развить тему)
- Добавить color-coded sections (каждый таб — свой accent color)
- Улучшить contrast и hierarchy текста

### 5. Графики (Analytics)
- Gradient fill под линиями графиков
- Animated появление данных
- Красивые tooltips
- Glow эффект на точках данных

### 6. Phone Farm
- Карточки устройств с реалистичным phone frame
- Battery indicator с цветовой индикацией (green→yellow→red)
- Status LED с pulse animation
- Progress bar для posting с gradient

### 7. Video Library
- Grid с hover preview (zoom + overlay с деталями)
- Thumbnail с gradient overlay
- Status badge с иконкой и цветом
- Фильтры как pill buttons с анимацией

### 8. Billing
- Pricing cards с featured/popular highlight
- Animated counter для баланса
- Transaction list с цветными type indicators
- Progress bar для usage

## Технические требования
- Tailwind CSS 4 — никаких inline styles
- Framer Motion допустим для сложных анимаций (установить если нужно)
- Все анимации должны быть performant (transform/opacity only)
- Responsive: хорошо выглядеть от 1280px+
- Тёмная тема ONLY
- Не ломать существующую функциональность — только визуальные улучшения

## Приоритет
1. Layout + Sidebar + общие стили (globals.css)
2. Cards + hover эффекты
3. Конкретные компоненты (Analytics, PhoneFarm, VideoLibrary)
4. Micro-interactions + polish

## Запуск
```bash
claude --profile frontend
```
Читай этот файл и выполняй.
