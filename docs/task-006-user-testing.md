# Task-006 — Тест singleton Chrome

Закрой ВСЕ окна Chrome. Открой **Windows PowerShell**. Перейди в проект.

---

### Шаг 1. Перейди в папку проекта

```powershell
cd E:\Users\rasla\Desktop\ai-video-platform
```

**На экране:** путь в промпте сменился на `ai-video-platform`.

**Не сменился?** Проверь что папка существует: `ls E:\Users\rasla\Desktop\ai-video-platform`.

---

### Шаг 2. Запусти тест

```powershell
npx tsx scripts/task-006-live-test.ts
```

**На экране:** откроется окно Chrome, в консоли побегут строки:
```
Request 1 OK
Request 2 OK — same context, Chrome NOT restarted
=== TEST PASSED ===
```

**Не запустилось?** Если ошибка `launchPersistentContext` — значит Chrome не закрыт. Закрой все Chrome через Task Manager и повтори.

---

### Шаг 3. Проверь результат

```powershell
cat data\task-006-evidence\live-test.log
```

**На экране:** лог с `TEST PASSED` в конце, без строк `FAIL`.

**Нет файла?** Тест упал раньше — скопируй ошибку из консоли в `data\task-006-evidence\error.log`.

---

### Шаг 4. Проверь скриншот

```powershell
start data\task-006-evidence\live-browser-test.png
```

**На экране:** откроется PNG со страницей higgsfield.ai.

**Файла нет?** См. шаг 3 — тест не дошёл до скриншота.

---

### Шаг 5. Закрой Chrome

Chrome остался открытым — это по дизайну. Закрой его руками.

---

## Чеклист

```
- [ ] Шаг 1 — Chrome запущен
- [ ] Шаг 2 — dev-сервер запущен
- [ ] Шаг 3 — тест прогнан
- [ ] Шаг 4 — скриншоты сделаны
- [ ] Шаг 5 — логи сохранены
```
