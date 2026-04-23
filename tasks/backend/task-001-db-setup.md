# Task 001: SQLite — схема, подключение, миграция, seed

## Приоритет: ВЫСОКИЙ
## Зависимости: нет (фундамент)
## Блокирует: task-002, task-003, task-004, task-005

## Описание

Создать фундамент базы данных для всего приложения.

### Шаг 1: Установить better-sqlite3
```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

### Шаг 2: Создать `src/lib/db.ts`
- Подключение к `data/app.db` (путь от корня проекта)
- Singleton паттерн — одно подключение на процесс
- WAL mode для производительности
- Создать директорию `data/` если не существует

### Шаг 3: Создать `src/lib/schema.sql`
Таблицы:

```sql
characters (id INTEGER PK, name TEXT, description TEXT, style TEXT, hero_image_url TEXT, locked INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)

videos (id INTEGER PK, title TEXT NOT NULL, thumbnail TEXT, duration TEXT, status TEXT DEFAULT 'queued' CHECK(status IN ('queued','processing','complete','failed','scheduled')), platform TEXT CHECK(platform IN ('TikTok','Reels','Shorts')), views INTEGER DEFAULT 0, style TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)

devices (id INTEGER PK, name TEXT NOT NULL, platform TEXT NOT NULL, account TEXT, status TEXT DEFAULT 'idle' CHECK(status IN ('idle','posting','cooldown','error')), posts_today INTEGER DEFAULT 0, last_post TEXT, battery INTEGER DEFAULT 100)

schedule (id INTEGER PK, video_id INTEGER REFERENCES videos(id), device_id INTEGER REFERENCES devices(id), platform TEXT, account TEXT, scheduled_at TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','posted','failed')), created_at TEXT DEFAULT CURRENT_TIMESTAMP)

transactions (id INTEGER PK, description TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT CHECK(type IN ('credit','debit')), created_at TEXT DEFAULT CURRENT_TIMESTAMP)

settings (key TEXT PK, value TEXT)

analytics_daily (id INTEGER PK, date TEXT NOT NULL, platform TEXT, views INTEGER DEFAULT 0, followers INTEGER DEFAULT 0, engagement REAL DEFAULT 0)
```

### Шаг 4: Создать `src/lib/db-init.ts`
- Читает `schema.sql` и выполняет
- Seed данными из текущих моков (`mock-data.ts`):
  - 6 видео, 8 устройств, 8 записей расписания
  - 5 транзакций, 7 дней аналитики
  - settings: balance=7430, totalCredits=10000, plan=Pro, renewDate="May 1, 2026"
- Идемпотентность: `CREATE TABLE IF NOT EXISTS`

### Шаг 5: API route `POST /api/db/init`
- Вызывает db-init
- Возвращает `{ success: true, tables: [...] }`
- Защита от повторного вызова (проверить существование таблиц)

### Шаг 6: Добавить `data/` в `.gitignore`

## Критерии готовности
- [ ] `npm install` проходит без ошибок
- [ ] `POST /api/db/init` создаёт `data/app.db` со всеми 7 таблицами
- [ ] Seed данные загружены — SELECT count(*) из каждой таблицы возвращает ожидаемое количество
- [ ] Повторный вызов init не дублирует данные
- [ ] TypeScript компилируется без ошибок
