# task-022: UI Progress + Download — Frontend

## Цель

Studio показывает прогресс генерации в реальном времени и даёт скачать результаты.

## Шаги

### 1. Studio.tsx — прогресс генерации

Когда генерация запущена (после клика Generate All), показывай прогресс:

- Текст: "Генерирую сцену 3 из 8" (обновляется по мере завершения каждой сцены)
- Под текстом — progress bar (ширина = процент завершённых сцен)
- Превью готовых кусков: по мере появления изображений/видео показывай их миниатюры в ряд
- Polling: каждые 5 секунд дёргай `/api/videos/{id}` для проверки статуса текущего видео

Логика:
```ts
// Когда генерация идёт
const [generationProgress, setGenerationProgress] = useState<{
  currentScene: number;
  totalScenes: number;
  completedItems: Array<{ type: 'image' | 'video'; url: string }>;
} | null>(null);

// Polling
useEffect(() => {
  if (!generationProgress) return;
  const interval = setInterval(async () => {
    // Проверяем статус через API
    const res = await fetch(`/api/videos/${currentVideoId}`);
    const data = await res.json();
    if (data.status === 'complete') {
      clearInterval(interval);
      setGenerationProgress(null);
      // Обновить список видео
    }
  }, 5000);
  return () => clearInterval(interval);
}, [generationProgress]);
```

### 2. Studio.tsx — кнопка Download

Когда все сцены сгенерированы (или после завершения генерации):

- Кнопка "Download All" — скачивает zip со всеми картинками и видео
- Вызывает `GET /api/videos/{id}/download` (бэкенд создаст этот endpoint)
- Пока endpoint не существует — кнопка делает простой `window.open('/generations/{jobId}/')` чтобы открыть папку
- Стиль: зелёная кнопка с иконкой Download, появляется только когда есть что скачать

### 3. Studio.tsx — предпросмотр готовых кусков

В секции генерации (Step 4) добавь горизонтальный скролл-контейнер:
- Показывает миниатюры готовых изображений (из `public/generations/{jobId}/`)
- Показывает превью видео (маленький video player с controls)
- Каждый элемент — карточка с подписью "Scene 1", "Scene 2" и т.д.

## НЕ ТРОГАЙ

- API роуты
- src/lib/
