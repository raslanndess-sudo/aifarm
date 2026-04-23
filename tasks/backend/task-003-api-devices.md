# Task 003: CRUD API — Devices (Phone Farm)

## Приоритет: ВЫСОКИЙ
## Зависимости: task-001 (БД должна быть готова)
## Блокирует: task-007 (фронт Phone Farm)

## Описание

Создать API для управления устройствами телефонной фермы.

### Эндпоинты

#### `GET /api/devices`
- Список всех устройств
- Сортировка по имени

#### `POST /api/devices`
- Создать новое устройство
- Body: `{ name, platform, account? }`
- Валидация: name и platform обязательны
- Дефолты: status='idle', posts_today=0, battery=100

#### `PATCH /api/devices/[id]`
- Обновить устройство (статус, battery, posts_today и т.д.)
- Используется для:
  - Смена статуса при постинге: idle → posting → cooldown → idle
  - Инкремент posts_today
  - Обновление last_post
  - Обновление battery

#### `DELETE /api/devices/[id]`
- Удалить устройство
- 404 если не найдено

### Типы
```typescript
interface Device {
  id: number;
  name: string;
  platform: 'TikTok' | 'Reels' | 'Shorts';
  account: string | null;
  status: 'idle' | 'posting' | 'cooldown' | 'error';
  posts_today: number;
  last_post: string | null;
  battery: number;
}
```

## Критерии готовности
- [ ] GET, POST, PATCH, DELETE работают
- [ ] Валидация: POST без name → 400
- [ ] PATCH обновляет только переданные поля
- [ ] TypeScript без ошибок
