# Task 002: CRUD API — Videos

## Приоритет: ВЫСОКИЙ
## Зависимости: task-001 (БД должна быть готова)
## Блокирует: task-006 (фронт Video Library)

## Описание

Создать полный CRUD API для видео-библиотеки.

### Эндпоинты

#### `GET /api/videos`
- Возвращает список всех видео
- Query параметры для фильтрации:
  - `status` — фильтр по статусу (complete, rendering, scheduled, failed)
  - `platform` — фильтр по платформе (TikTok, Reels, Shorts)
  - `style` — фильтр по стилю
- Сортировка по `created_at DESC`

#### `POST /api/videos`
- Создаёт новое видео
- Body: `{ title, thumbnail?, duration?, status?, platform?, style? }`
- Валидация: title обязателен
- Возвращает созданное видео с id

#### `GET /api/videos/[id]`
- Возвращает одно видео по id
- 404 если не найдено

#### `PATCH /api/videos/[id]`
- Обновляет поля видео
- Body: частичный объект (любые поля кроме id)
- Важно для Studio: обновление статуса `queued → processing → complete/failed`

#### `DELETE /api/videos/[id]`
- Удаляет видео
- Возвращает `{ success: true }`
- 404 если не найдено

### Типы (src/lib/types.ts или в том же файле)
```typescript
interface Video {
  id: number;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  status: 'queued' | 'processing' | 'complete' | 'failed' | 'scheduled';
  platform: 'TikTok' | 'Reels' | 'Shorts' | null;
  views: number;
  style: string | null;
  created_at: string;
}
```

### Важно
- Все ответы оборачивать в `NextResponse.json()`
- HTTP статусы: 200 (ok), 201 (created), 400 (bad request), 404 (not found)
- Валидация входных данных — проверять типы и обязательные поля
- Никаких `any` в TypeScript

## Критерии готовности
- [ ] Все 5 эндпоинтов работают
- [ ] Фильтрация по status, platform, style
- [ ] Валидация: POST без title → 400
- [ ] DELETE несуществующего → 404
- [ ] TypeScript без ошибок
