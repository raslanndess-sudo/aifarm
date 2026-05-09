# Reel Design System (variant A)

Эталон — `E:/Users/rasla/Downloads/ai_video_script_variants.html` (variant A · Reel).
Editorial / screenplay aesthetic. Применяется ко всему проекту: Studio, Library, PhoneFarm, Scheduler, Analytics, Billing, Settings, login, Sidebar.

---

## 1. Цветовая палитра

| Назначение | Token / value | Примечание |
|---|---|---|
| Page background base | `#0a0a0a` | угольный |
| Surface 1 (cards) | `transparent` over background | карточки строятся на бордерах, не на фонах |
| Surface 2 (subtle wash) | `rgba(245,230,211,0.03)` | для секций |
| Border subtle | `rgba(245,230,211,0.08)` | разделители |
| Border default | `rgba(245,230,211,0.12)` | основные линии |
| Border emphasis | `rgba(245,230,211,0.18-0.30)` | hover/focus |
| Text primary | `#f5e6d3` | cream |
| Text secondary | `rgba(245,230,211,0.7)` | тело |
| Text muted | `rgba(245,230,211,0.45)` | meta/labels |
| Text faded | `rgba(245,230,211,0.3)` | disabled/placeholder |
| Accent primary | `#ff3344` | red |
| Accent on accent | `#fff` | текст поверх красного |
| Status success | `#88a584` | sage green (sparingly) |
| Status warning | `#c9a86a` | gold (sparingly) |
| Status danger | `#ff3344` | сам акцент |

**Background gradients (apply to body in globals.css):**
```css
background:
  radial-gradient(1200px 800px at 20% -10%, rgba(255,51,68,0.08), transparent 60%),
  radial-gradient(800px 600px at 100% 100%, rgba(245,230,211,0.04), transparent 60%),
  #0a0a0a;
```

**Noise overlay** (фиксированный фон под body, не блокирует клики):
```css
body::before {
  content: '';
  position: fixed; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none; opacity: 0.6; mix-blend-mode: overlay;
  z-index: 0;
}
```
Контент должен быть `position: relative; z-index: 1;`.

---

## 2. Типографика

Импорты в `globals.css` (заменить текущий Inter):
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,700&family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
```

| Роль | Шрифт | Использование |
|---|---|---|
| Body / UI text | **Fraunces** serif | основной текст, описания, body |
| Display headings | **DM Serif Display** italic | большие заголовки шагов, hero text, кнопки CTA |
| Mono / labels | **JetBrains Mono** | uppercase лейблы, scene numbers, meta info, tracking 0.15-0.20em |

Дефолтная семья на body: `font-family: 'Fraunces', 'Georgia', serif;`

**Размеры:**
- Hero headline (Step title): DM Serif Display italic 64px line-height 0.95 letter-spacing -0.03em
- Section eyebrow: JetBrains Mono 10-11px uppercase tracking 0.20em
- Card title: DM Serif Display 24-32px italic
- Body: Fraunces 15px line-height 1.7
- Meta/labels: JetBrains Mono 10-11px uppercase tracking 0.15em
- Buttons (primary CTA): DM Serif Display 17-18px italic
- Buttons (secondary): JetBrains Mono 11px uppercase tracking 0.15em

**Italic-as-emphasis pattern** (везде где есть `<em>`): красный `#ff3344` italic. Используется в заголовках для подчёркивания ключевого слова: «Write your *screenplay*», «Begin with a *line*».

---

## 3. Spacing & Layout

- Container max-width: `1280-1440px`, центрировать
- Page padding: `64-80px` сверху, `40-64px` по бокам на desktop, `20px` на mobile
- Section gap: `48-64px` между блоками, `32px` внутри блока
- Card inner padding: `24-32px`
- Inline gap: `12-24px` для рядов кнопок/чипов

Радиусы:
- **Card / button: 0** (квадратные углы — это ключевой signature Reel)
- Только pill-status и круглые-аватары имеют радиус
- Никаких border-radius: 16px как раньше

---

## 4. Компоненты

### 4.1. Top Nav (Sidebar.tsx становится TopNav)

Вертикальный sidebar убираем. Делаем горизонтальный nav сверху страницы.

```tsx
<nav className="reel-nav">
  <div className="reel-brand">
    AI Video <span>Reel · 26</span>
  </div>
  <div className="reel-tabs">
    <button className={isActive ? 'active' : ''}>Studio</button>
    <button>Library</button>
    <button>Phone Farm</button>
    <button>Scheduler</button>
    <button>Analytics</button>
    <button>Billing</button>
    <button>Settings</button>
  </div>
  <button className="reel-logout">Logout ↗</button>
</nav>
```

CSS:
- `display:flex; align-items:center; justify-content:space-between; padding-bottom:32px; border-bottom:1px solid rgba(245,230,211,0.12)`
- brand: DM Serif Display italic 24px + красный JetBrains Mono badge (10px, border, 3px 8px)
- tabs: JetBrains Mono 11px uppercase tracking 0.15em, color muted
- active tab: text primary cream, `border-bottom: 1px solid #ff3344`
- logout: JetBrains Mono 11px muted

### 4.2. Stepper (для Studio — 5 шагов)

Roman numerals **I, II, III, IV, V** для Script/Character/Storyboard/Voiceover/Generate.

```tsx
<div className="reel-stepper">
  <div className="reel-step active">
    <div className="num">I</div>
    <div className="lbl">Script</div>
    <div className="div" />
  </div>
  // ... etc
</div>
```

- num: DM Serif Display italic 38px, muted при inactive (`rgba(245,230,211,0.18)`), red `#ff3344` при active
- lbl: JetBrains Mono 10px uppercase tracking 0.20em, muted; cream при active
- div (separator): 40px wide × 1px line `rgba(245,230,211,0.12)`
- gap между шагами: padding 0 28px

### 4.3. Card (универсальная)

Заменить `.glass-card` на:
```css
.reel-card {
  background: rgba(245,230,211,0.025);
  border: 1px solid rgba(245,230,211,0.08);
  border-radius: 0;
  padding: 24px;
  position: relative;
}
.reel-card:hover { border-color: rgba(245,230,211,0.18); }
```

Без backdrop-blur, без скруглений, только тонкая cream-линия рамкой.

### 4.4. Buttons

**Primary CTA (большая красная):**
```css
.reel-btn-primary {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 16px 32px;
  background: #ff3344; color: #fff;
  font-family: 'DM Serif Display', serif;
  font-size: 18px; font-style: italic;
  border-radius: 0; border: none;
  transition: all 0.2s;
}
.reel-btn-primary:hover { background: #fff; color: #ff3344; }
```

**Secondary (outline, mono):**
```css
.reel-btn-secondary {
  padding: 10px 18px;
  border: 1px solid rgba(245,230,211,0.2);
  color: #f5e6d3;
  background: transparent;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
  border-radius: 0;
}
.reel-btn-secondary:hover { border-color: #ff3344; color: #ff3344; }
```

**Icon button (mini):**
```css
.reel-btn-icon {
  width: 28px; height: 28px;
  border: 1px solid rgba(245,230,211,0.2);
  color: #f5e6d3; font-size: 14px;
  background: transparent; border-radius: 0;
}
.reel-btn-icon:hover { border-color: #ff3344; color: #ff3344; }
```

### 4.5. Chips / Tags (для Style, Provider, Category)

```css
.reel-chip {
  padding: 10px 18px;
  border: 1px solid rgba(245,230,211,0.18);
  font-family: 'Fraunces', serif;
  font-size: 13px; letter-spacing: 0.02em;
  color: rgba(245,230,211,0.7);
  background: transparent;
  border-radius: 0;
  transition: all 0.2s;
}
.reel-chip:hover { border-color: rgba(245,230,211,0.5); color: #f5e6d3; }
.reel-chip.active {
  background: #ff3344; color: #fff;
  border-color: #ff3344;
  font-style: italic;
}
.reel-chip.active::before { content: '✦'; margin-right: 8px; font-style: normal; }
```

### 4.6. Inputs / Textareas

```css
.reel-input, .reel-textarea {
  background: transparent;
  border: none;
  border-left: 2px solid rgba(255,51,68,0.3);
  padding: 16px 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px; line-height: 1.9;
  color: #f5e6d3;
  caret-color: #ff3344;
  border-radius: 0;
  outline: none;
  width: 100%;
}
.reel-input:focus, .reel-textarea:focus {
  border-left-color: #ff3344;
}
.reel-input::placeholder, .reel-textarea::placeholder {
  color: rgba(245,230,211,0.25);
}
```

Альтернатива для inline-полей (не textarea) — нижний бордер вместо левого:
```css
border: none;
border-bottom: 1px solid rgba(245,230,211,0.18);
padding: 8px 0;
```

### 4.7. Status pills / badges

```css
.reel-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border: 1px solid rgba(245,230,211,0.2);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase;
  color: #f5e6d3;
  border-radius: 999px;  /* ← pill для статуса оставляем округлой */
}
.reel-badge--accent { border-color: #ff3344; color: #ff3344; }
.reel-badge--success { border-color: rgba(136,165,132,0.4); color: #88a584; }
```

### 4.8. Voice cards (для Step 4 — переделать существующее)

Карточка-полоска, не glass.
```css
.reel-voice-card {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px;
  border: 1px solid rgba(245,230,211,0.08);
  background: transparent;
  cursor: pointer; transition: all 0.2s;
  min-height: 56px;
  border-radius: 0;
}
.reel-voice-card:hover { border-color: rgba(245,230,211,0.25); }
.reel-voice-card.selected {
  border-left: 2px solid #ff3344;
  background: rgba(255,51,68,0.04);
}
.reel-voice-card .gender { /* Fraunces italic 14px muted */ }
.reel-voice-card .name { /* DM Serif Display 22px italic cream */ }
.reel-voice-card .desc { /* JetBrains Mono 10px muted uppercase tracking 0.15em */ }
.reel-voice-card .play { /* reel-btn-icon */ }
```

### 4.9. Margin/sidebar accent (signature Reel deco)

В Studio Step 1 есть decorative left margin со scene numbers (см. `.reel-margin` в эталоне). Это **уникальная фича Reel** — на других экранах используем как боковую meta-полосу: `001 002 003...` или другие нумерации (например в Library — версии видео).

```css
.reel-margin {
  border-right: 1px solid rgba(245,230,211,0.08);
  padding-right: 24px;
}
.reel-margin-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; letter-spacing: 0.20em; text-transform: uppercase;
  color: rgba(245,230,211,0.3);
  transform: rotate(-90deg) translateY(-100%);
  transform-origin: top left;
  white-space: nowrap;
  margin-bottom: 24px;
}
.reel-scene-numbers {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; line-height: 1.9;
  color: rgba(245,230,211,0.3);
}
.reel-scene-numbers .active { color: #ff3344; }
```

---

## 5. Animations

- Hover transitions: `0.2s ease`
- prefers-reduced-motion: respected (отключать noise-shift, любые auto-animations)
- НЕТ pulsing-dot, glow-shadow, bouncing — это другая эстетика
- Page transition между табами: cross-fade 200ms

---

## 6. Accessibility

- Контраст текст cream `#f5e6d3` на `#0a0a0a` = 14.6:1 ✓ AAA
- Контраст muted text `rgba(245,230,211,0.45)` ≈ 6.8:1 на фоне ✓ AA для UI elements
- Focus-ring: `outline: 2px solid #ff3344; outline-offset: 2px` на интерактивных элементах
- Touch target ≥44×44 на кнопках
- Кнопки иконок имеют `aria-label`

---

## 7. Что заменяется / выпиливается

В globals.css **удалить или переделать** старые токены:
- `gradient-text` (purple→cyan) — выпиливаем, остаётся `<em>` red italic
- `glass-card` — заменить классом `reel-card` (или сохранить имя но переписать)
- `dot-pattern`, `mesh-gradient` — заменить на radial gradients из §1
- `btn-primary`, `btn-ghost` — заменить на `reel-btn-primary`, `reel-btn-secondary`
- `input-field` — заменить на `reel-input`
- `pulse-glow-*` — выпиливаем (Reel — не неоновая)
- `noise-bg` уже есть, но привязать к body::before
- `tab-content-enter` — оставляем, идеально подходит для cross-fade

---

## 8. Поэтапное применение

**Phase 1** (этот dispatch): tokens в globals.css + TopNav (Sidebar.tsx) + page.tsx (background) + Studio.tsx (5 шагов в Reel-эстетике)

**Phase 2** (после approval Phase 1): VideoLibrary.tsx, PhoneFarm.tsx, Scheduler.tsx

**Phase 3** (после Phase 2): Analytics.tsx, Billing.tsx, Settings.tsx, login

Не трогать в любой фазе: backend api routes, lib/, scripts/, providers/. Только UI.
