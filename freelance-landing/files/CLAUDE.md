# Landing Visuals Factory — Decentralized Freelance Platform (CIS)

## Stack
Image generation: Higgsfield NanoBanana 2
Video generation: Seedance 2.0
Browser control: chrome-devtools-mcp

## Brand Direction
- Audience: СНГ, русскоязычные фрилансеры и заказчики (KZ, RU, UZ, UA, BY)
- Tone: clean modern tech, human-first, subtle Web3 hints (НЕ crypto-scam эстетика)
- People: ethnic mix для CIS — Slavic, Central Asian, Caucasian, mixed
- Palette: deep navy + warm off-white + electric accent (cyan или lime), matte textures
- NO: stock-photo smiles, NFT хлам, generic Silicon Valley loft

## Aspect Ratios by Scene Type
- `hero` → 16:9 (desktop), плюс 9:16 crop для mobile
- `feature` → 3:2
- `testimonial` → 1:1
- `promo_reels` → 9:16
- Settings в UI переключай перед каждым батчем

## Default Settings (Nano Banana 2)
Image count: 8
Quality: 2K unlimited ON
Extra free gens: OFF

## Default Settings (Seedance 2.0)
Duration: 8s
Audio: OFF (музыка добавляется в монтаже)
Motion: subtle cinematic push-in / parallax, no wild camera moves

## Workflow — Images
1. Navigate to higgsfield.ai/image/nano_banana_2
2. Screenshot → убедиться что aspect ratio, image count, quality совпадают с prompts.json
3. Для каждого prompt из prompts.json:
   a. Clear prompt bar via JS: `document.querySelector('textarea').value=''` + dispatch `input` event
   b. Screenshot → проверить что поле пустое
   c. Type prompt
   d. Click Generate
   e. Clear bar via JS снова
   f. Wait 12 seconds (Nano Banana 2 медленнее Nano Banana 1)
   g. Repeat
4. Когда все 8 картинок готовы — скачать в `/images/{scene_name}/YYYY-MM-DD/`

## Workflow — Videos
1. Из папки `/images/{scene_name}/` выбрать 1-2 best (я скажу какие, или по эвристике — самый чёткий сюжет)
2. Navigate to higgsfield.ai/create/video
3. Model: Seedance 2.0, duration 8s, aspect как у сцены
4. Upload картинку + использовать `video_prompt` из prompts.json
5. Generate → wait → скачать в `/videos/{scene_name}/YYYY-MM-DD/`

## Rules (hard)
- ВСЕГДА очищай prompt bar через JS — обычный type в Higgsfield залипает и клеит промпты
- ЕСЛИ settings сбились между сценами (aspect/quality) — остановись, скажи мне
- ЕСЛИ появился popup про credits / upgrade — НЕ кликай, сообщи мне
- НЕ принимай никакие cookie/consent банеры автоматически — пропускай или спрашивай
- НИКОГДА не вводи логин/пароль — я сам залогинюсь один раз
- После каждых 10 генераций — скриншот-отчёт, чтобы я проверил качество до продолжения

## Output Structure
```
/project-root
  /images
    /hero           → YYYY-MM-DD/*.png
    /feature_dev    → YYYY-MM-DD/*.png
    /feature_design → YYYY-MM-DD/*.png
    ...
  /videos
    /hero           → YYYY-MM-DD/*.mp4
    ...
  prompts.json
  CLAUDE.md
```

## When in doubt
Спроси меня. Лучше один лишний вопрос, чем 80 битых генераций на unlimited плане.
