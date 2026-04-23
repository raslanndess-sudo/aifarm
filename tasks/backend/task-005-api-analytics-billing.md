# Task 005: API — Analytics + Billing

## Приоритет: ВЫСОКИЙ
## Зависимости: task-001 (БД должна быть готова)
## Блокирует: task-009 (фронт Analytics), task-010 (фронт Billing)

## Описание

API для аналитики и биллинга.

### Analytics

#### `GET /api/analytics`
- KPI: вычислять агрегатами из БД:
  - totalViews: SUM(views) из videos
  - totalFollowers: SUM(followers) из analytics_daily (последняя запись)
  - avgEngagement: AVG(engagement) из analytics_daily (последние 7 дней)
  - videosPublished: COUNT(*) из videos WHERE status='complete'
- viewsChart: SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 7
- platformBreakdown: SELECT platform, SUM(views) FROM videos GROUP BY platform
- topVideos: SELECT * FROM videos WHERE status='complete' ORDER BY views DESC LIMIT 3

#### `POST /api/analytics`
- Добавить/обновить запись analytics_daily
- Body: `{ date, platform, views, followers?, engagement? }`
- UPSERT: если запись за эту дату+платформу есть — обновить

### Billing

#### `GET /api/billing`
- Баланс из settings (key='balance')
- План из settings (key='plan')
- Дата обновления из settings (key='renewDate')
- totalCredits из settings (key='totalCredits')
- usedThisMonth: totalCredits - balance
- transactions: SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20

#### `POST /api/billing/transactions`
- Создать транзакцию
- Body: `{ description, amount, type }`
- Если type='debit': уменьшить balance в settings на amount
- Если type='credit': увеличить balance
- Валидация: нельзя уйти в минус (balance < 0 → 400)
- Возвращает новый баланс

## Критерии готовности
- [ ] GET /api/analytics возвращает все KPI, chart, breakdown, topVideos
- [ ] GET /api/billing возвращает баланс + транзакции
- [ ] POST /api/billing/transactions списывает/пополняет баланс
- [ ] Нельзя списать больше чем есть
- [ ] TypeScript без ошибок
