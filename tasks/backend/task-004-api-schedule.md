# Task 004: CRUD API — Schedule

## Приоритет: ВЫСОКИЙ
## Зависимости: task-001 (БД должна быть готова)
## Блокирует: task-008 (фронт Scheduler)

## Описание

API для управления расписанием постов.

### Эндпоинты

#### `GET /api/schedule`
- Список всех запланированных постов
- JOIN с videos (title) и devices (name) для полных данных
- Query: `status` фильтр (pending, posted, failed)
- Сортировка по scheduled_at ASC

#### `POST /api/schedule`
- Создать запись в расписании
- Body: `{ video_id, device_id, platform, account, scheduled_at }`
- Валидация: video_id, device_id, scheduled_at обязательны
- Проверить что video и device существуют (FK)

#### `PATCH /api/schedule/[id]`
- Обновить статус: pending → posted / failed
- Обновить время

#### `DELETE /api/schedule/[id]`
- Удалить из расписания (только pending)
- Если статус не pending → 400

#### `POST /api/schedule/process`
- Обработать очередь: найти все записи где scheduled_at <= NOW и status = 'pending'
- Для каждой:
  - Установить status = 'posted'
  - Обновить device: posts_today + 1, last_post = now
  - Добавить просмотры к видео (рандом 1000-50000)
  - Обновить analytics_daily за сегодня
- Возвращает количество обработанных

## Критерии готовности
- [ ] CRUD работает
- [ ] JOIN возвращает данные из связанных таблиц
- [ ] POST /api/schedule/process обрабатывает pending посты
- [ ] Нельзя удалить уже опубликованный пост
- [ ] TypeScript без ошибок
