"""Generate 1200×630 default blog OG / list cover PNG.

Run: python docs/brand/build-blog-og.py
Output: apps/web-marketing/public/blog/default-og.png
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web-marketing" / "public" / "blog" / "default-og.png"

W, H = 1200, 630
BG = (12, 18, 22)
TEAL = (67, 194, 169)
MUTED = (148, 163, 184)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    for y in range(H):
        t = y / H
        r = int(BG[0] + (20 - BG[0]) * t * 0.4)
        g = int(BG[1] + (28 - BG[1]) * t * 0.4)
        b = int(BG[2] + (32 - BG[2]) * t * 0.4)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    draw.rounded_rectangle((56, 56, W - 56, H - 56), radius=24, outline=TEAL, width=3)

    try:
        title_font = ImageFont.truetype("arialbd.ttf", 72)
        sub_font = ImageFont.truetype("arial.ttf", 36)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    draw.text((96, 220), "Salanor", fill=TEAL, font=title_font)
    draw.text((96, 310), "Blog", fill=(240, 245, 250), font=title_font)
    draw.text((96, 420), "Governed automation · Finance · Risk", fill=MUTED, font=sub_font)

    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
