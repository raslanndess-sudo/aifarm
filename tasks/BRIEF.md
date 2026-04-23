# BRIEF — Content Matrix AI: от мока к рабочему продукту

## Цель
Превратить дашборд из визуального прототипа в рабочую платформу. Убрать все моки, подключить реальное хранилище, сделать каждый раздел функциональным.

## Стек
- Next.js 15 + TypeScript + Tailwind CSS 4
- БД: SQLite через better-sqlite3 (файл `data/app.db`)
- API: Next.js Route Handlers (src/app/api/)
- Уже есть: Kling AI интеграция, CREF-движок

---

## Блок 1: База данных (ПРИОРИТЕТ ВЫСОКИЙ)

### 1.1 Создать SQLite схему и подключение
- Установить `better-sqlite3`
- Создать `src/lib/db.ts` — подключение к `data/app.db`
- Создать `src/lib/schema.sql` — таблицы:
  - `characters` — CREF персонажи (id, name, description, style, hero_image_url, locked, created_at)
  - `videos` — библиотека видео (id, title, thumbnail, duration, status, platform, views, style, created_at)
  - `devices` — телефоны фермы (id, name, platform, account, status, posts_today, last_post, battery)
  - `schedule` — расписание постов (id, video_id, device_id, platform, account, scheduled_at, status)
  - `transactions` — биллинг (id, description, amount, type, created_at)
  - `settings` — настройки (key, value) — для баланса, плана, API ключей
  - `analytics_daily` — дневная статистика (date, platform, views, followers, engagement)
- Создать `src/lib/db-init.ts` — миграция: создание таблиц + seed начальными данными из текущих моков
- API route `POST /api/db/init` — запуск миграции

### 1.2 CRUD API для каждой сущности
- `GET/POST /api/videos` — список и создание
- `GET/PATCH/DELETE /api/videos/[id]` — конкретное видео
- `GET/POST /api/devices` — список и добавление устройств
- `PATCH /api/devices/[id]` — обновить статус устройства
- `GET/POST /api/schedule` — расписание
- `PATCH /api/schedule/[id]` — обновить статус поста
- `GET /api/analytics` — статистика (с фильтром по дате)
- `GET /api/billing` — баланс + транзакции
- `POST /api/billing/transactions` — списание/пополнение

---

## Блок 2: Video Library (ПРИОРИТЕТ ВЫСОКИЙ)

### 2.1 Подключить к БД
- Заменить `mockVideos` на fetch из `/api/videos`
- Добавить реальные статусы: когда Studio генерирует видео → оно появляется в Library
- Фильтры по статусу, платформе, стилю
- Удаление видео

### 2.2 Связь со Studio
- Когда Kling рендерит видео — создать запись в `videos` через API
- Обновлять статус по мере рендеринга (queued → processing → done/failed)

---

## Блок 3: Phone Farm (ПРИОРИТЕТ СРЕДНИЙ)

### 3.1 Управление устройствами
- Заменить `mockDevices` на fetch из `/api/devices`
- CRUD: добавить/удалить/редактировать устройство
- Реальные статусы: idle, posting, cooldown, error
- Кнопка "добавить устройство" — форма с именем, платформой, аккаунтом

### 3.2 Логика постинга (симуляция)
- При нажатии "Post Now" на устройстве:
  - Статус → posting
  - Через 10 сек → cooldown (30 сек) → idle
  - posts_today + 1
  - Списать кредиты через billing API
- Лог действий устройства (последние 10 событий)

---

## Блок 4: Scheduler (ПРИОРИТЕТ СРЕДНИЙ)

### 4.1 Подключить к БД
- Заменить `mockSchedule` на fetch из `/api/schedule`
- Форма создания поста: выбрать видео из Library, устройство из Phone Farm, время
- Календарный вид (уже есть) — показывать реальные данные

### 4.2 Автопостинг
- API route `POST /api/schedule/process` — обрабатывает посты, у которых scheduledAt <= now и status = pending
- Меняет статус pending → posted, обновляет устройство
- Фронт: кнопка "Process Queue" для ручного запуска

---

## Блок 5: Analytics (ПРИОРИТЕТ СРЕДНИЙ)

### 5.1 Подключить к БД
- Заменить `mockAnalytics` на fetch из `/api/analytics`
- KPI считать из реальных данных: сумма views из videos, количество видео, и т.д.
- График — из `analytics_daily`
- Разбивка по платформам — агрегация из videos

### 5.2 Запись статистики
- При каждом "постинге" видео — обновлять analytics_daily
- Симуляция просмотров: при постинге добавлять рандомное кол-во views

---

## Блок 6: Billing (ПРИОРИТЕТ НИЗКИЙ)

### 6.1 Подключить к БД
- Баланс и транзакции из БД
- При генерации (Studio) и постинге (Phone Farm) — списывать кредиты
- История транзакций с пагинацией
- Выбор плана (визуально, сохранять в settings)

---

## Блок 7: Авторизация (ПРИОРИТЕТ НИЗКИЙ)

### 7.1 Простая авторизация
- Страница логина `/login`
- Middleware проверки (хотя бы через cookie/JWT)
- Страница настроек `/settings` — API ключи (Kling), план

---

## Правила для агентов
- Удалить `mock-data.ts` когда все компоненты переведены на API
- Каждый компонент: loading state + error state
- API routes: валидация входных данных
- TypeScript строгий — никаких any
