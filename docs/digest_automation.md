# Digest Automation

## Scripts
- `news_fetch.py` – собирает ленты. Теперь для заблокированных источников использует `r.jina.ai` прокси.
- `digest_builder.py --limit <n> [--send]` – собирает и (опционально) шлёт дайджест.
- `run_digest.ps1` – оболочка для планировщика.
  - Аргументы: `-Limit <n>` (по умолчанию 12), `-Send` — включить отправку.
  - Логи: `logs/digest/digest_<timestamp>.log`.

## Разовый запуск
```powershell
# Тест без отправки
powershell -ExecutionPolicy Bypass -File run_digest.ps1 -Limit 8

# Боевой прогон
powershell -ExecutionPolicy Bypass -File run_digest.ps1 -Limit 12 -Send
```

## Планировщик задач (пример)
Создаём три задачи через `schtasks`:
```cmd
schtasks /Create /TN "DigestMorning" /TR "powershell -ExecutionPolicy Bypass -File E:\Users\rasla\.openclaw\workspace\run_digest.ps1 -Limit 12 -Send" /SC DAILY /ST 07:30
schtasks /Create /TN "DigestAfternoon" /TR "powershell -ExecutionPolicy Bypass -File E:\Users\rasla\.openclaw\workspace\run_digest.ps1 -Limit 12 -Send" /SC DAILY /ST 13:30
schtasks /Create /TN "DigestEvening" /TR "powershell -ExecutionPolicy Bypass -File E:\Users\rasla\.openclaw\workspace\run_digest.ps1 -Limit 12 -Send" /SC DAILY /ST 20:30
```
(Подставь свои часы/пользователя.)

## Алерты
`run_digest.ps1` при ошибке пинганёт Telegram через `openclaw message send` с краткой справкой и ссылкой на лог.

## Известные ограничения
- `r.jina.ai` может отдавать 451/422 (Verge, Reddit), значит понадобится реальный прокси, если важны конкретные статьи.
- `news_fetch` по умолчанию берёт максимум ~80 записей и отбрасывает дубли по title.
