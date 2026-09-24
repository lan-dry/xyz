"""Render crisp t-shirt print art from official SVG via Chrome headless.

Run: python docs/brand/build-tshirt-print.py
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parent
HTML = BRAND / "tshirt-print-render.html"
PRINT_PNG = BRAND / "tshirt-chest-print.png"
PREVIEW_PNG = BRAND / "tshirt-chest-preview-on-black.png"

CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

WIDTH = 1062
HEIGHT = 1180
DPI = 300


def browser() -> Path:
    if CHROME.exists():
        return CHROME
    if EDGE.exists():
        return EDGE
    raise FileNotFoundError("Install Chrome or Edge for headless render")


def screenshot(url: str, out: Path, bg: str) -> None:
    exe = browser()
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(exe),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={WIDTH},{HEIGHT}",
        f"--default-background-color={bg}",
        f"--screenshot={out}",
        url,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def trim_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        return rgba
    return rgba.crop(bbox)


def pad_center(img: Image.Image, target_w: int) -> Image.Image:
    if img.width >= target_w:
        return img
    canvas = Image.new("RGBA", (target_w, img.height), (0, 0, 0, 0))
    x = (target_w - img.width) // 2
    canvas.paste(img, (x, 0), img)
    return canvas


def build() -> None:
    if not HTML.exists():
        raise FileNotFoundError(f"Missing {HTML}")

    url = HTML.resolve().as_uri()
    raw = BRAND / "_tshirt-render-raw.png"

    screenshot(url, raw, "00000000")

    art = trim_transparent(Image.open(raw))
    art = pad_center(art, WIDTH)
    art.save(PRINT_PNG, dpi=(DPI, DPI))

    preview = Image.new("RGB", (art.width, art.height), (10, 12, 11))
    preview.paste(art, (0, 0), art)
    preview.save(PREVIEW_PNG, dpi=(DPI, DPI))

    raw.unlink(missing_ok=True)

    print(f"Wrote {PRINT_PNG} ({art.width}x{art.height}px, official SVG)")
    print(f"Wrote {PREVIEW_PNG}")


if __name__ == "__main__":
    build()
