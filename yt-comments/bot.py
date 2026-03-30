"""
YouTube Comment Bot — Техно-Циник
Автоматические ответы на комментарии под Shorts с провокацией дискуссий.

Запуск: python bot.py
"""

import os
import json
import time
import random
import logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import anthropic

# ── Конфиг ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

CLIENT_SECRET  = os.getenv("CLIENT_SECRET_PATH")
TOKEN_FILE     = Path(os.getenv("TOKEN_FILE"))
STATE_FILE     = Path(os.getenv("STATE_FILE", Path(__file__).parent / "state.json"))
ANTHROPIC_KEY  = os.getenv("ANTHROPIC_API_KEY")

# Dashboard config path (6eye dashboard → public/config.json)
DASHBOARD_CONFIG = Path(os.getenv(
    "DASHBOARD_CONFIG_PATH",
    Path(__file__).parent.parent / "6eye-dashboard" / "public" / "config.json"
))

# Defaults (used if dashboard config not found)
MAX_PER_HOUR   = int(os.getenv("MAX_REPLIES_PER_HOUR", 20))
JITTER_MIN     = int(os.getenv("JITTER_MIN_MINUTES", 2))
JITTER_MAX     = int(os.getenv("JITTER_MAX_MINUTES", 3))
SLEEP_START    = int(os.getenv("SLEEP_START_HOUR", 1))
SLEEP_END      = int(os.getenv("SLEEP_END_HOUR", 7))

# Days map for weekly_activity
WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def load_dashboard_config() -> dict:
    """Читает config.json из дашборда. Возвращает пустой dict если файл не найден."""
    if DASHBOARD_CONFIG.exists():
        try:
            cfg = json.loads(DASHBOARD_CONFIG.read_text(encoding="utf-8"))
            ab = cfg.get("antiBan", {})
            log.info(f"[config] Загружен дашборд: minDelay={ab.get('minDelay')}s maxDelay={ab.get('maxDelay')}s maxPerHour={ab.get('maxRepliesPerHour')}")
            return cfg
        except Exception as e:
            log.warning(f"Не удалось прочитать dashboard config: {e}")
    else:
        log.warning(f"[config] config.json не найден по пути: {DASHBOARD_CONFIG} — используются дефолты из .env")
    return {}

SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]

# ── Stop-list темы ───────────────────────────────────────────────
STOP_KEYWORDS = [
    "политик", "война", "нато", "путин", "зеленск", "байден",
    "религи", "аллах", "церков", "бог", "мечет",
    "национ", "расист", "еврей", "мусульман",
    "убий", "убивай", "застрел", "взрыв",
    "акции купи", "инвестируй", "кредит", "займи",
]

SYSTEM_PROMPT = """Ты — автор YouTube-канала «Техно-Циник». Отвечаешь на комментарии под СВОИМИ видео — от первого лица, как живой человек за телефоном.

ГЛАВНАЯ ЦЕЛЬ: заставить человека ответить тебе. Не объяснить, не похвалить — а зацепить, задеть, заинтриговать.

ЖЕЛЕЗНОЕ ПРАВИЛО: в каждом ответе — крючок. Риторический вопрос, фактический вопрос в лоб, ирония которая заденет, сомнение в его словах. Человек должен захотеть возразить, оправдаться или доказать что-то. Даже в 3 словах — крючок обязателен.

━━━ ДЛИНА ОТВЕТА — ПО СМЫСЛУ ━━━

Короткие ответы (3–7 слов) — когда:
• Комментарий простой, очевидный, банальный («круто», «огонь», «хочу такой»)
• Человек высказал мнение без вопроса
• Достаточно одной колкости
Примеры: «ну и покупай» / «удачи с этим» / «я тебя предупреждал 🤡» / «ну-ну» / «серьёзно?»

Развёрнутые ответы (1–2 предложения) — когда:
• Человек задал вопрос или написал развёрнутый комментарий
• Есть конкретный тезис который можно разбить или поддержать
• Нужно подлить масла в огонь
Примеры: «Я именно об этом и говорил — платить за 60 Гц в 2026 нормально только если ты мазохист. 🤡» / «Все так говорят, пока не держат в руках — потом тихо возвращают.»

━━━ ХАРАКТЕР ━━━
- Циник, но не злобный. Острый, но не оскорбительный.
- Ставь под сомнение хайп, переплату, бессмысленные апгрейды.
- Хвалят? Прими, но добавь ложку дёгтя.
- Спорят? Не сдавайся — парируй или подлей масла.
- Говори как человек, не как бот. Никаких «Привет!», «Спасибо за комментарий», «Отличный вопрос».
- Только русский язык.
- В ~40% ответов добавляй ОДИН эмодзи в конце: 🤡 🤔 🤫 💅 🤦‍♂️ 🤣 📉 🔋
- Никогда не повторяй структуру предыдущих ответов.
- Отвечай от первого лица. Не пиши о себе в третьем лице.

ЗАПРЕЩЕНО: политика, религия, нацвопросы, внешность/возраст/ориентация, насилие, финансовые советы."""

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(Path(__file__).parent / "bot.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ── State ────────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {
        "replied": [],
        "hourly": [],
        "recent_replies": [],
        "tokens_today": 0,
        "tokens_total": 0,
        "bait_count_today": 0,
        "replies_today": 0,
        "last_date": None,
        "weekly_activity": {day: 0 for day in WEEKDAY_NAMES},
    }

def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")

def reset_daily_counters_if_needed(state: dict):
    """Сбрасывает _today счётчики если сменилась дата."""
    today = datetime.now().date().isoformat()
    if state.get("last_date") != today:
        log.info(f"Новый день ({today}), сбрасываю дневные счётчики.")
        state["tokens_today"] = 0
        state["bait_count_today"] = 0
        state["replies_today"] = 0
        state["last_date"] = today

def update_stats(state: dict, input_tokens: int, output_tokens: int):
    """Обновляет статистику после успешного ответа."""
    tokens_used = input_tokens + output_tokens
    state["tokens_today"] = state.get("tokens_today", 0) + tokens_used
    state["tokens_total"] = state.get("tokens_total", 0) + tokens_used
    state["replies_today"] = state.get("replies_today", 0) + 1
    state["bait_count_today"] = state.get("bait_count_today", 0) + 1

    # Обновляем weekly_activity
    day_name = WEEKDAY_NAMES[datetime.now().weekday()]
    if "weekly_activity" not in state:
        state["weekly_activity"] = {day: 0 for day in WEEKDAY_NAMES}
    state["weekly_activity"][day_name] = state["weekly_activity"].get(day_name, 0) + 1

def already_replied(state: dict, comment_id: str) -> bool:
    return comment_id in state.get("replied", [])

def mark_replied(state: dict, comment_id: str, reply_text: str):
    state.setdefault("replied", []).append(comment_id)
    # Храним последние 50 ответов для проверки уникальности
    state.setdefault("recent_replies", []).append(reply_text)
    if len(state["recent_replies"]) > 50:
        state["recent_replies"] = state["recent_replies"][-50:]

def hourly_count(state: dict) -> int:
    now = time.time()
    state["hourly"] = [t for t in state.get("hourly", []) if now - t < 3600]
    return len(state["hourly"])

def record_reply(state: dict):
    state.setdefault("hourly", []).append(time.time())


# ── YouTube API ──────────────────────────────────────────────────
def get_youtube():
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    # cache_discovery=False — устраняет предупреждение "file_cache is only supported with oauth2client<4.0.0"
    return build("youtube", "v3", credentials=creds, cache_discovery=False)

def get_my_channel_id(yt) -> str:
    resp = yt.channels().list(part="id", mine=True).execute()
    return resp["items"][0]["id"]

def get_recent_videos(yt, channel_id: str, max_results: int = 10) -> list[dict]:
    """Последние видео канала с описанием."""
    # Шаг 1: получаем ID видео через search
    resp = yt.search().list(
        part="id,snippet",
        channelId=channel_id,
        order="date",
        type="video",
        maxResults=max_results,
    ).execute()
    video_ids = [item["id"]["videoId"] for item in resp.get("items", [])]
    titles = {item["id"]["videoId"]: item["snippet"]["title"] for item in resp.get("items", [])}

    if not video_ids:
        return []

    # Шаг 2: получаем полное описание через videos.list
    details = yt.videos().list(
        part="snippet",
        id=",".join(video_ids),
    ).execute()

    result = []
    for item in details.get("items", []):
        vid_id = item["id"]
        snippet = item["snippet"]
        description = snippet.get("description", "")[:500]  # первые 500 символов описания
        result.append({
            "id": vid_id,
            "title": snippet.get("title", titles.get(vid_id, "")),
            "description": description,
        })
    return result

def get_comments(yt, video_id: str) -> list[dict]:
    """Все toplevel-комментарии + ответы в ветках."""
    comments = []
    page_token = None
    while True:
        resp = yt.commentThreads().list(
            part="snippet,replies",
            videoId=video_id,
            maxResults=100,
            pageToken=page_token,
        ).execute()
        for thread in resp.get("items", []):
            top = thread["snippet"]["topLevelComment"]
            comments.append({
                "id": top["id"],
                "text": top["snippet"]["textDisplay"],
                "author": top["snippet"]["authorDisplayName"],
                "parent_id": None,
                "thread_id": thread["id"],
                "video_id": video_id,
                "published_at": top["snippet"]["publishedAt"],
            })
            # Ответы в ветке
            for reply in thread.get("replies", {}).get("comments", []):
                comments.append({
                    "id": reply["id"],
                    "text": reply["snippet"]["textDisplay"],
                    "author": reply["snippet"]["authorDisplayName"],
                    "parent_id": top["id"],
                    "thread_id": thread["id"],
                    "video_id": video_id,
                    "published_at": reply["snippet"]["publishedAt"],
                })
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return comments

def post_reply(yt, parent_id: str, video_id: str, text: str):
    """Опубликовать ответ на комментарий с retry (exponential backoff)."""
    delays = [5, 15, 45]
    last_error = None
    for attempt, delay in enumerate(delays, start=1):
        try:
            yt.comments().insert(
                part="snippet",
                body={
                    "snippet": {
                        "parentId": parent_id,
                        "textOriginal": text,
                    }
                },
            ).execute()
            return  # успех
        except HttpError as e:
            last_error = e
            log.warning(f"HttpError при публикации (попытка {attempt}/3): {e}. Жду {delay}с...")
            if attempt < len(delays):
                time.sleep(delay)
        except Exception as e:
            last_error = e
            log.warning(f"Ошибка при публикации (попытка {attempt}/3): {e}. Жду {delay}с...")
            if attempt < len(delays):
                time.sleep(delay)
    raise last_error  # все попытки исчерпаны


# ── AI генерация ─────────────────────────────────────────────────
def is_safe(text: str) -> bool:
    lower = text.lower()
    return not any(kw in lower for kw in STOP_KEYWORDS)

def build_system_prompt(base_prompt: str, toxicity: int, emoji_freq: int, length_bias: int) -> str:
    """Строит финальный системный промпт с учётом слайдеров дашборда."""

    # Токсичность/ирония (0–100)
    if toxicity >= 80:
        tone = "Тон: максимально острый, саркастичный, провокационный. Задевай, не бойся резкости."
    elif toxicity >= 50:
        tone = "Тон: умеренно циничный, с иронией. Острый но не грубый."
    else:
        tone = "Тон: мягкий, дружелюбный цинизм. Скорее подшучиваешь, чем колешь."

    # Частота эмодзи (0–100)
    if emoji_freq >= 70:
        emoji_rule = "Эмодзи: добавляй почти в каждый ответ, 1–2 штуки."
    elif emoji_freq >= 30:
        emoji_rule = f"Эмодзи: добавляй примерно в {emoji_freq}% ответов, не более одного."
    else:
        emoji_rule = "Эмодзи: почти не используй, максимум в 10% случаев."

    # Длина ответа (0–100, где 0=3-5 слов, 100=2 предложения)
    if length_bias <= 25:
        length_rule = "Длина: ВСЕГДА 3–6 слов. Никаких длинных ответов. Максимум одна короткая фраза."
    elif length_bias <= 60:
        length_rule = "Длина: чаще 3–8 слов, иногда одно предложение. Не растекайся."
    else:
        length_rule = "Длина: 1–2 предложения когда нужно, но не больше. Короткие ответы тоже уместны."

    return f"{base_prompt}\n\n━━━ ТЕКУЩИЕ ПАРАМЕТРЫ ━━━\n{tone}\n{emoji_rule}\n{length_rule}"


def generate_reply(comment_text: str, video_title: str, recent_replies: list[str], video_description: str = "", system_prompt: str = SYSTEM_PROMPT, toxicity: int = 65, emoji_freq: int = 40, length_bias: int = 35):
    """Возвращает (reply_text, usage) или (None, None)."""
    if not is_safe(comment_text):
        log.info(f"SKIP (стоп-лист): {comment_text[:60]}")
        return None, None

    if not ANTHROPIC_KEY:
        log.error("Проверь ANTHROPIC_API_KEY в .env — ключ не найден!")
        return None, None

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    # Строим промпт с учётом слайдеров
    final_prompt = build_system_prompt(system_prompt, toxicity, emoji_freq, length_bias)

    context = ""
    if recent_replies:
        last = recent_replies[-5:]
        context = "\n\nТвои последние ответы (не повторяй структуру и не повторяй слова):\n" + "\n".join(f"- {r}" for r in last)

    video_context = f"Название видео: «{video_title}»"
    if video_description:
        video_context += f"\nОписание видео: {video_description}"

    # Определяем тип комментария для подсказки модели
    is_question = any(c in comment_text for c in ["?", "как", "почему", "зачем", "что думаешь", "стоит ли", "можно ли"])
    is_short = len(comment_text.strip()) < 40

    if is_short and not is_question:
        length_hint = "Комментарий короткий — ответь коротко и с крючком."
    elif is_question:
        length_hint = "Задал вопрос — ответь по теме + встречный вопрос или провокация в конце."
    else:
        length_hint = "Ответь в рамках параметров длины выше. Крючок обязателен."

    user_msg = (
        f"{video_context}\n\n"
        f"Комментарий: «{comment_text}»\n"
        f"{context}\n\n"
        f"{length_hint}\n"
        "Только текст ответа, без кавычек."
    )

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=150,
            system=final_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        return msg.content[0].text.strip(), msg.usage
    except anthropic.AuthenticationError:
        log.error("Проверь ANTHROPIC_API_KEY в .env — ключ недействителен (401)!")
        return None, None
    except Exception as e:
        log.error(f"Claude error: {e}")
        return None, None


# ── Антибан ──────────────────────────────────────────────────────
def is_sleep_time(sleep_start: int = SLEEP_START, sleep_end: int = SLEEP_END) -> bool:
    hour = datetime.now().hour
    if sleep_start < sleep_end:
        return sleep_start <= hour < sleep_end
    return hour >= sleep_start or hour < sleep_end

def human_delay(min_s: int, max_s: int, randomize: bool = True) -> float:
    """Задержка с нормальным распределением — как у живого человека.
    
    Большинство ответов приходят через ~середину диапазона,
    редко — через минимум или максимум. Не равномерно.
    """
    if not randomize:
        return float(min_s)
    mu = (min_s + max_s) / 2        # среднее
    sigma = (max_s - min_s) / 4     # стандартное отклонение
    delay = random.gauss(mu, sigma)
    return max(min_s, min(max_s, delay))  # clamp в диапазон

def jitter_sleep(min_s: int = JITTER_MIN * 60, max_s: int = JITTER_MAX * 60, randomize: bool = True):
    delay = human_delay(min_s, max_s, randomize)
    log.info(f"Жду {int(delay) // 60} мин {int(delay) % 60} сек перед ответом...")
    time.sleep(delay)

# Веса активности по часам суток (0–23)
# Чем выше число — тем охотнее бот отвечает в этот час
HOUR_WEIGHTS = {
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0,   # ночь — сон (настраивается через sleepStart/End)
    6: 1, 7: 2, 8: 3,                        # раннее утро — редко
    9: 5, 10: 6, 11: 6,                      # утро — умеренно
    12: 4, 13: 5, 14: 5,                     # день — чуть меньше (занят)
    15: 6, 16: 7, 17: 8,                     # после обеда — активнее
    18: 9, 19: 10, 20: 10, 21: 9,           # вечер — пик активности
    22: 6, 23: 3,                            # поздний вечер — спадает
}

def should_skip_by_hour() -> bool:
    """Иногда пропускает итерацию в часы низкой активности.
    
    В часы с весом 10 — никогда не пропускает.
    В часы с весом 5 — пропускает ~50% итераций.
    В часы с весом 1 — пропускает ~90%.
    В выходные (сб/вс) веса снижены на 40% — автор отдыхает.
    """
    hour = datetime.now().hour
    weight = HOUR_WEIGHTS.get(hour, 5)
    if weight == 0:
        return True

    # Выходные — снижаем активность на 40%
    weekday = datetime.now().weekday()  # 5=сб, 6=вс
    if weekday >= 5:
        weight = weight * 0.6

    skip_prob = 1.0 - (weight / 10.0)
    return random.random() < skip_prob

def is_fresh_comment(published_at: str, max_age_hours: int = 24) -> bool:
    """Возвращает True если комментарий свежее max_age_hours часов."""
    try:
        # YouTube возвращает время в формате ISO 8601: "2026-03-24T10:30:00Z"
        pub = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - pub
        return age.total_seconds() < max_age_hours * 3600
    except Exception:
        return True  # если не смогли распарсить — не пропускаем

def simulate_human_browsing(yt, video_ids: list[str]):
    """Имитирует чтение контента без публикации.
    
    YouTube видит что аккаунт листает видео/комментарии —
    это нормальное поведение автора, не только публикация ответов.
    Вызывается случайно между ответами.
    """
    if not video_ids or random.random() > 0.4:
        return   # 60% времени — не делаем ничего лишнего
    try:
        vid = random.choice(video_ids)
        yt.commentThreads().list(
            part="snippet",
            videoId=vid,
            maxResults=random.randint(5, 20),
        ).execute()
        log.info(f"[browse] Просмотрел комментарии видео {vid[:8]}...")
        time.sleep(random.uniform(2.0, 8.0))   # пауза как будто читает
    except Exception:
        pass   # молча игнорируем — это не критично


# ── Главный цикл ─────────────────────────────────────────────────
def run_once():
    # Читаем актуальный конфиг из дашборда
    dash = load_dashboard_config()
    anti_ban = dash.get("antiBan", {})
    sleep_start = anti_ban.get("sleepStart", SLEEP_START)
    sleep_end   = anti_ban.get("sleepEnd", SLEEP_END)
    max_per_hour = anti_ban.get("maxRepliesPerHour", MAX_PER_HOUR)
    min_delay   = anti_ban.get("minDelay", JITTER_MIN * 60)   # dashboard хранит в секундах
    max_delay   = anti_ban.get("maxDelay", JITTER_MAX * 60)
    randomize   = anti_ban.get("randomization", True)

    # Параметры персоны из дашборда (слайдеры)
    persona = dash.get("persona", {})
    system_prompt  = persona.get("systemPrompt", SYSTEM_PROMPT) or SYSTEM_PROMPT
    toxicity       = int(persona.get("toxicityLevel", 65))
    emoji_freq     = int(persona.get("emojiFrequency", 40))
    length_bias    = int(persona.get("responseLengthBias", 35))
    log.info(f"[persona] toxicity={toxicity} emoji={emoji_freq}% length_bias={length_bias}")

    if is_sleep_time(sleep_start, sleep_end):
        log.info(f"Режим сна ({sleep_start}:00–{sleep_end}:00). Пропускаю.")
        return

    # Рандомизация по времени суток — в "тихие" часы иногда пропускаем итерацию
    if should_skip_by_hour():
        hour = datetime.now().hour
        log.info(f"[{hour}:00] Низкая активность по расписанию, пропускаю итерацию.")
        return

    state = load_state()
    reset_daily_counters_if_needed(state)

    if hourly_count(state) >= max_per_hour:
        log.info(f"Лимит {max_per_hour} ответов/час достигнут. Жду.")
        return

    yt = get_youtube()
    channel_id = get_my_channel_id(yt)
    videos = get_recent_videos(yt, channel_id, max_results=5)

    log.info(f"Проверяю {len(videos)} видео...")
    video_ids = [v["id"] for v in videos]

    pending = []  # (comment, video_title, video_description)

    for video in videos:
        comments = get_comments(yt, video["id"])
        # Группируем комментарии по веткам
        threads: dict[str, list[dict]] = {}
        for c in comments:
            threads.setdefault(c["thread_id"], []).append(c)

        for c in comments:
            if already_replied(state, c["id"]):
                continue

            # Пропускаем комментарии от @mc.newsen
            if "mc.newsen" in c["author"].lower():
                continue

            # Пропускаем старые комментарии (> 24 часов) — отвечаем только на свежие
            if not is_fresh_comment(c["published_at"], max_age_hours=24):
                continue

            # Проверяем: если последний комментарий в этой ветке от @mc.newsen — пропускаем
            thread_comments = threads.get(c["thread_id"], [])
            sorted_thread = sorted(thread_comments, key=lambda x: x["published_at"])
            last_in_thread = sorted_thread[-1] if sorted_thread else None
            if last_in_thread and "mc.newsen" in last_in_thread["author"].lower():
                continue

            pending.append((c, video["title"], video.get("description", "")))

    log.info(f"Новых комментариев без ответа: {len(pending)}")

    for comment, video_title, video_description in pending:
        if is_sleep_time(sleep_start, sleep_end):
            log.info("Режим сна. Стоп.")
            break
        if hourly_count(state) >= max_per_hour:
            log.info("Лимит. Стоп.")
            break

        reply_text, usage = generate_reply(
            comment["text"], video_title, state.get("recent_replies", []), video_description,
            system_prompt=system_prompt,
            toxicity=toxicity,
            emoji_freq=emoji_freq,
            length_bias=length_bias,
        )
        if reply_text is None:
            # Если Claude вернул None из-за стоп-листа — пометить, чтобы не трогать снова
            # Если None из-за ошибки API — НЕ помечать, попробуем в следующей итерации
            if is_safe(comment["text"]):
                log.info(f"SKIP (ошибка API, попробуем позже): {comment['text'][:60]}")
            else:
                mark_replied(state, comment["id"], "")
                save_state(state)
            continue

        log.info(f"[{comment['author']}]: {comment['text'][:60]}")
        log.info(f"→ Ответ: {reply_text}")

        jitter_sleep(min_delay, max_delay, randomize)

        # Иногда "листает" комментарии перед ответом — имитация живого автора
        simulate_human_browsing(yt, video_ids)

        # Дополнительный случайный delay — имитация "думает перед отправкой"
        think_delay = random.uniform(0.5, 3.0)
        time.sleep(think_delay)

        try:
            # YouTube API принимает только ID топ-уровневого комментария как parentId
            parent_id = comment["parent_id"] if comment["parent_id"] else comment["id"]
            post_reply(yt, parent_id, comment["video_id"], reply_text)
            mark_replied(state, comment["id"], reply_text)
            record_reply(state)

            # Обновляем статистику
            if usage:
                update_stats(state, usage.input_tokens, usage.output_tokens)
            else:
                # Если usage недоступен — считаем примерно
                update_stats(state, 0, 0)

            save_state(state)
            log.info("✅ Опубликовано")

            # Логируем в формате JSON для дашборда
            log.info(f"REPLY_JSON: {json.dumps({'time': datetime.now().isoformat(), 'user': comment['author'], 'comment': comment['text'][:120], 'reply': reply_text, 'video': video_title}, ensure_ascii=False)}")

        except Exception as e:
            log.error(f"Ошибка публикации (все попытки исчерпаны): {e}")
            continue  # продолжаем со следующим комментарием, не останавливаемся

    save_state(state)
    log.info("Итерация завершена.")


def main():
    log.info("=== YouTube Comment Bot (Техно-Циник) запущен ===")
    while True:
        try:
            run_once()
        except Exception as e:
            log.error(f"Критическая ошибка: {e}", exc_info=True)

        # Рандомизированный интервал: от 12 до 18 минут
        CHECK_INTERVAL = random.randint(12 * 60, 18 * 60)
        log.info(f"Следующая проверка через {CHECK_INTERVAL // 60} мин {CHECK_INTERVAL % 60} сек.")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
