from __future__ import annotations
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

WIDTH, HEIGHT = 1920, 1080
FPS = 30
DURATION = 3.2
FRAMES = int(FPS * DURATION)

WORKSPACE = Path(r"E:/Users/rasla/.openclaw/workspace")
FONT_FILES = {
    "Regular": WORKSPACE / "assets/fonts/extras/ttf/Inter-Regular.ttf",
    "Medium": WORKSPACE / "assets/fonts/extras/ttf/Inter-Medium.ttf",
    "SemiBold": WORKSPACE / "assets/fonts/extras/ttf/Inter-SemiBold.ttf",
    "Bold": WORKSPACE / "assets/fonts/extras/ttf/Inter-Bold.ttf",
    "ExtraBold": WORKSPACE / "assets/fonts/extras/ttf/Inter-ExtraBold.ttf",
}
ICON_PATH = WORKSPACE / "assets/icons/twemoji/1f4b8.png"
OUT_DIR = WORKSPACE / "packages/macbook_neo/screen_cards/value_anim"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WHITE = (247, 248, 251)
GRAY = (199, 205, 216)
ACCENT = (245, 230, 75)
BG_LEFT = (7, 9, 18)
BG_RIGHT_TOP = (9, 12, 20)
BG_RIGHT_BOTTOM = (17, 24, 32)

font_cache: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}
icon_cache: Image.Image | None = None


def get_font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    key = (size, weight)
    if key not in font_cache:
        path = FONT_FILES.get(weight, FONT_FILES["Regular"])
        font_cache[key] = ImageFont.truetype(str(path), size=size)
    return font_cache[key]


def get_icon() -> Image.Image:
    global icon_cache
    if icon_cache is None:
        icon_cache = Image.open(ICON_PATH).convert("RGBA")
    return icon_cache


def clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def ease_out_cubic(x: float) -> float:
    return 1 - pow(1 - x, 3)


def ease_out_back(x: float, s: float = 1.4) -> float:
    x -= 1
    return 1 + pow(x, 3) + s * pow(x, 2)


def gradient_background() -> Image.Image:
    img = Image.new("RGBA", (WIDTH, HEIGHT), BG_LEFT + (255,))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, WIDTH // 2, HEIGHT), fill=BG_LEFT + (255,))
    for y in range(HEIGHT):
        ratio = y / (HEIGHT - 1)
        r = int(BG_RIGHT_TOP[0] + (BG_RIGHT_BOTTOM[0] - BG_RIGHT_TOP[0]) * ratio)
        g = int(BG_RIGHT_TOP[1] + (BG_RIGHT_BOTTOM[1] - BG_RIGHT_TOP[1]) * ratio)
        b = int(BG_RIGHT_TOP[2] + (BG_RIGHT_BOTTOM[2] - BG_RIGHT_TOP[2]) * ratio)
        draw.line((WIDTH // 2, y, WIDTH, y), fill=(r, g, b, 255))
    return img


def add_highlight(img: Image.Image, t: float) -> None:
    sweep = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sweep)
    center_y = int(HEIGHT * (0.2 + 0.6 * t))
    draw.rectangle((WIDTH // 2, center_y - 5, WIDTH, center_y + 45), fill=(255, 255, 255, 35))
    sweep = sweep.filter(ImageFilter.GaussianBlur(25))
    img.alpha_composite(sweep)


def draw_left_column(img: Image.Image, t: float) -> None:
    progress = ease_out_cubic(clamp((t - 0.05) / 0.28))
    offset = int((1 - progress) * 80)
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    header_font = get_font(48, "SemiBold")
    bullet_font = get_font(34, "Medium")
    x = 130
    y = 210 + offset
    draw.text((x, y), "Что входит", font=header_font, fill=WHITE)
    bullets = ["M5 chip", "<1 кг", "Fanless"]
    by = y + 90
    for text in bullets:
        draw.text((x, by), f"• {text}", font=bullet_font, fill=WHITE)
        by += 60
    layer.putalpha(int(255 * progress))
    img.alpha_composite(layer)


def draw_price_block(img: Image.Image, t: float) -> None:
    progress = ease_out_back(clamp((t - 0.2) / 0.35))
    eased = clamp(progress)
    value = int(round(999 * eased))
    price_text = "$999" if eased >= 0.999 else f"${value:03d}" if value else "$0"
    offset = int((1 - eased) * 40)
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    header_font = get_font(46, "SemiBold")
    price_font = get_font(130, "ExtraBold")
    sub_font = get_font(34, "Regular")
    x = WIDTH // 2 + 140
    y = 210 + offset
    draw.text((x, y), "За сколько", font=header_font, fill=WHITE)
    price_y = y + 90
    draw.text((x, price_y), price_text, font=price_font, fill=ACCENT)
    draw.text((x, price_y + 140), "–$100 vs Air", font=sub_font, fill=GRAY)
    layer.putalpha(int(255 * eased))
    img.alpha_composite(layer)


def draw_pill(img: Image.Image, t: float) -> None:
    progress = ease_out_cubic(clamp((t - 0.45) / 0.30))
    eased = clamp(progress)
    offset = int((1 - eased) * 160)
    width, height = 640, 120
    x = WIDTH // 2 + 140 + offset
    y = 620
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=60, fill=(17, 24, 32, 230), outline=ACCENT, width=3)
    pill_font = get_font(38, "Medium")
    draw.text((x + 150, y + 34), 'Full spec за "штуку"', font=pill_font, fill=WHITE)
    icon = ImageOps.contain(get_icon(), (96, 96))
    angle = (1 - eased) * -18
    icon_rot = icon.rotate(angle, resample=Image.BICUBIC, expand=True)
    icon_x = x + 70 - icon_rot.width // 2
    icon_y = y + height // 2 - icon_rot.height // 2
    layer.alpha_composite(icon_rot, (icon_x, icon_y))
    layer.putalpha(int(255 * eased))
    img.alpha_composite(layer)

    if eased > 0:
        glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow)
        gdraw.rounded_rectangle((x - 10, y - 10, x + width + 10, y + height + 10), radius=70, outline=ACCENT, width=6)
        glow = glow.filter(ImageFilter.GaussianBlur(20))
        glow.putalpha(int(120 * eased))
        img.alpha_composite(glow)


def render_frame(frame_idx: int) -> Image.Image:
    t = frame_idx / max(1, FRAMES - 1)
    img = gradient_background()
    add_highlight(img, t)
    draw_left_column(img, t)
    draw_price_block(img, t)
    draw_pill(img, t)
    return img


def encode_video() -> Path:
    output = OUT_DIR / "macbook_neo_value_card.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(FPS),
        "-i", str(OUT_DIR / "frame_%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-profile:v", "high",
        str(output),
    ]
    subprocess.run(cmd, check=True)
    return output


def main():
    missing = []
    for weight, path in FONT_FILES.items():
        if not path.exists():
            missing.append(f"Font missing ({weight}): {path}")
    if not ICON_PATH.exists():
        missing.append(f"Icon missing: {ICON_PATH}")
    if missing:
        raise FileNotFoundError("\n".join(missing))

    print(f"Rendering {FRAMES} frames...")
    for idx in range(FRAMES):
        frame = render_frame(idx)
        frame_path = OUT_DIR / f"frame_{idx:04d}.png"
        frame.convert("RGB").save(frame_path, quality=95)
    print("Encoding video...")
    video_path = encode_video()
    print(f"Saved animation to {video_path}")


if __name__ == "__main__":
    main()
