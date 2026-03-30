from __future__ import annotations
from pathlib import Path
from typing import Iterable, Tuple
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

WIDTH, HEIGHT = 1920, 1080
WORKSPACE = Path(r"E:/Users/rasla/.openclaw/workspace")
FONT_FILES = {
    "Regular": WORKSPACE / "assets/fonts/extras/ttf/Inter-Regular.ttf",
    "Medium": WORKSPACE / "assets/fonts/extras/ttf/Inter-Medium.ttf",
    "SemiBold": WORKSPACE / "assets/fonts/extras/ttf/Inter-SemiBold.ttf",
    "Bold": WORKSPACE / "assets/fonts/extras/ttf/Inter-Bold.ttf",
    "ExtraBold": WORKSPACE / "assets/fonts/extras/ttf/Inter-ExtraBold.ttf",
}
ICON_DIR = WORKSPACE / "assets/icons/twemoji"
OUT_DIR = WORKSPACE / "packages/macbook_neo/screen_cards"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WHITE = (247, 248, 251)
GRAY = (199, 205, 216)
ACCENT = (245, 230, 75)
BG_TOP = (4, 7, 13)
BG_BOTTOM = (17, 24, 32)
DARKEST = (9, 12, 20)

inter_cache: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}
icon_cache: dict[str, Image.Image] = {}
ICON_MAP = {
    "brain": "1f9e0.png",
    "bolt": "26a1.png",
    "money": "1f4b8.png",
    "shield": "1f6e1.png",
    "warning": "26a0.png",
    "plane": "2708.png",
}

def get_font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    key = (size, weight)
    if key not in inter_cache:
        font_path = FONT_FILES.get(weight, FONT_FILES["Regular"])
        inter_cache[key] = ImageFont.truetype(str(font_path), size=size)
    return inter_cache[key]

def get_icon(name: str) -> Image.Image:
    if name not in ICON_MAP:
        raise KeyError(f"Unknown icon key: {name}")
    if name not in icon_cache:
        path = ICON_DIR / ICON_MAP[name]
        if not path.exists():
            raise FileNotFoundError(f"Missing icon file: {path}")
        icon_cache[name] = Image.open(path).convert("RGBA")
    return icon_cache[name]


def paste_icon(base: Image.Image, name: str, center: Tuple[int, int], size: int = 140):
    icon = get_icon(name)
    icon_resized = ImageOps.contain(icon, (size, size))
    x = center[0] - icon_resized.width // 2
    y = center[1] - icon_resized.height // 2
    base.alpha_composite(icon_resized, (x, y))

def gradient_background() -> Image.Image:
    img = Image.new("RGBA", (WIDTH, HEIGHT), BG_TOP + (255,))
    draw = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        ratio = y / (HEIGHT - 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * ratio)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * ratio)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * ratio)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))
    return img

def add_glow(base: Image.Image, center: Tuple[int, int], radius: int, color: Tuple[int, int, int], alpha: int = 120) -> None:
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    x, y = center
    gdraw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color + (alpha,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius / 2))
    base.alpha_composite(glow)

def draw_text(draw: ImageDraw.ImageDraw, text: str, xy: Tuple[int, int], font: ImageFont.FreeTypeFont, fill: Tuple[int, int, int] = WHITE):
    draw.text(xy, text, font=font, fill=fill)

def text_size(text: str, font: ImageFont.FreeTypeFont) -> Tuple[int, int]:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

def draw_bullet_block(draw: ImageDraw.ImageDraw, start_xy: Tuple[int, int], lines: Iterable[str], font: ImageFont.FreeTypeFont, color: Tuple[int, int, int] = WHITE, bullet: str = "•", gap: int = 22):
    x, y = start_xy
    for line in lines:
        draw.text((x, y), f"{bullet} {line}", font=font, fill=color)
        y += font.size + gap

def draw_card_1():
    img = gradient_background()
    draw = ImageDraw.Draw(img)
    # top translucent bar
    draw.rectangle((0, 0, WIDTH, 360), fill=(17, 24, 32, 200))
    title_font = get_font(72, "ExtraBold")
    sub_font = get_font(30, "Medium")
    title = "MacBook Neo"
    title_x, title_y = 150, 140
    draw_text(draw, title, (title_x, title_y), title_font)
    pre = "MacBook "
    pre_w, _ = text_size(pre, title_font)
    neo_w, _ = text_size("Neo", title_font)
    accent_y = title_y + 92
    draw.rectangle((title_x + pre_w, accent_y, title_x + pre_w + neo_w, accent_y + 12), fill=ACCENT)
    subline = "Легендарный 12\" возвращается"
    draw_text(draw, subline, (title_x, title_y + 120), sub_font, GRAY)
    brain_center = (WIDTH - 320, 180)
    bolt_center = (WIDTH - 200, 240)
    add_glow(img, brain_center, 160, ACCENT)
    add_glow(img, bolt_center, 140, WHITE)
    paste_icon(img, "brain", brain_center, 140)
    paste_icon(img, "bolt", bolt_center, 120)
    draw_text(draw, "MacBook Neo", (140, 40), get_font(24, "Regular"), GRAY)
    img.convert("RGB").save(OUT_DIR / "card01_title.png", quality=95)


def draw_card_2():
    img = gradient_background()
    draw = ImageDraw.Draw(img)
    header_font = get_font(48, "SemiBold")
    bullet_font = get_font(36, "Medium")
    price_font = get_font(110, "ExtraBold")
    sub_font = get_font(34, "Regular")
    pill_font = get_font(32, "Medium")
    # column dividers
    draw.rectangle((0, 0, WIDTH // 2, HEIGHT), fill=(12, 15, 25, 80))
    draw.line((WIDTH // 2, 140, WIDTH // 2, HEIGHT - 160), fill=(255, 255, 255, 40), width=2)
    draw_text(draw, "Что входит", (180, 200), header_font)
    draw_bullet_block(draw, (180, 280), ["M5 chip", "<1 кг", "Fanless"], bullet_font)
    draw_text(draw, "За сколько", (WIDTH // 2 + 140, 200), header_font, GRAY)
    draw_text(draw, "$999", (WIDTH // 2 + 140, 320), price_font, ACCENT)
    draw_text(draw, "–$100 vs Air", (WIDTH // 2 + 140, 470), sub_font, GRAY)
    pill_x, pill_y = WIDTH // 2 + 110, 620
    pill_w, pill_h = 780, 96
    draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_w, pill_y + pill_h), radius=48, fill=(17, 24, 32, 220), outline=ACCENT, width=2)
    paste_icon(img, "money", (pill_x + 70, pill_y + pill_h // 2), 70)
    draw_text(draw, "Full spec за “штуку”", (pill_x + 140, pill_y + 24), pill_font, WHITE)
    img.convert("RGB").save(OUT_DIR / "card02_value.png", quality=95)


def draw_card_3():
    img = gradient_background()
    draw = ImageDraw.Draw(img)
    header_font = get_font(46, "SemiBold")
    bullet_font = get_font(34, "Medium")
    draw.rectangle((0, 0, WIDTH // 2, HEIGHT), fill=(11, 15, 25, 210))
    draw.rectangle((WIDTH // 2, 0, WIDTH, HEIGHT), fill=(9, 12, 20, 230))
    draw.rectangle((WIDTH // 2 - 6, 140, WIDTH // 2 + 6, HEIGHT - 140), fill=ACCENT)
    draw_text(draw, "Идеальная печатная машинка", (160, 220), header_font)
    paste_icon(img, "brain", (120, 250), 90)
    draw_bullet_block(draw, (160, 320), ["Magic Keyboard", "All-day battery"], bullet_font)
    draw_text(draw, "Компромисс", (WIDTH // 2 + 160, 220), header_font, ACCENT)
    paste_icon(img, "warning", (WIDTH // 2 + 120, 250), 90)
    draw_bullet_block(draw, (WIDTH // 2 + 160, 320), ["1× USB-C", "Адаптер обязателен"], bullet_font)
    # silhouette line art for port
    port_start_x = WIDTH // 2 + 160
    port_y = 580
    draw.rounded_rectangle((port_start_x, port_y, port_start_x + 520, port_y + 90), radius=30, outline=GRAY, width=3)
    draw.rectangle((port_start_x + 460, port_y + 30, port_start_x + 485, port_y + 60), fill=GRAY)
    img.convert("RGB").save(OUT_DIR / "card03_ports.png", quality=95)


def draw_card_4():
    img = gradient_background()
    draw = ImageDraw.Draw(img)
    bubble = (260, 260, WIDTH - 260, 760)
    draw.rounded_rectangle(bubble, radius=90, fill=(17, 24, 32, 230))
    text_font = get_font(42, "Bold")
    question = "Берём Neo или это дорогой планшет?"
    q_w, q_h = text_size(question, text_font)
    draw_text(draw, question, (WIDTH // 2 - q_w // 2, 420), text_font)
    # buttons
    btn_font = get_font(36, "SemiBold")
    btn_w, btn_h = 360, 100
    gap = 60
    btn_y = 540
    btn1_x = WIDTH // 2 - btn_w - gap // 2
    btn2_x = WIDTH // 2 + gap // 2
    draw.rounded_rectangle((btn1_x, btn_y, btn1_x + btn_w, btn_y + btn_h), radius=60, fill=(15, 18, 26, 255), outline=ACCENT, width=3)
    draw_text(draw, "Беру", (btn1_x + 120, btn_y + 28), btn_font, ACCENT)
    draw.rounded_rectangle((btn2_x, btn_y, btn2_x + btn_w, btn_y + btn_h), radius=60, outline=GRAY, width=3)
    draw_text(draw, "Сомневаюсь", (btn2_x + 70, btn_y + 28), btn_font, WHITE)
    # Telegram pill
    pill = (WIDTH - 520, HEIGHT - 180, WIDTH - 160, HEIGHT - 110)
    draw.rounded_rectangle(pill, radius=45, fill=(15, 18, 26, 230))
    paste_icon(img, "plane", (WIDTH - 470, HEIGHT - 145), 50)
    draw_text(draw, "Пиши в комментах", (WIDTH - 430, HEIGHT - 166), get_font(30, "Regular"), GRAY)
    img.convert("RGB").save(OUT_DIR / "card04_cta.png", quality=95)


def main():
    missing = []
    for weight, path in FONT_FILES.items():
        if not path.exists():
            missing.append(f"Font not found ({weight}): {path}")
    for key, filename in ICON_MAP.items():
        path = ICON_DIR / filename
        if not path.exists():
            missing.append(f"Missing icon for {key}: {path}")
    if missing:
        raise FileNotFoundError("\n".join(missing))
    draw_card_1()
    draw_card_2()
    draw_card_3()
    draw_card_4()
    print(f"Exported cards to {OUT_DIR}")


if __name__ == "__main__":
    main()
