#!/usr/bin/env python3
"""Render the LightTab logo (assets/logo.svg) to PNG assets with Pillow.

Kept as a script so the raster assets can be regenerated deterministically
without any SVG toolchain installed. Geometry mirrors assets/logo.svg 1:1
on a 512x512 grid; everything is supersampled 4x and downsampled for AA.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
S = 4  # supersample factor
SIZE = 512

BG_FROM, BG_TO = (0x2C, 0x20, 0x4D), (0x1B, 0x11, 0x35)
V300, V500, V600 = (0xA7, 0x8B, 0xFA), (0x8B, 0x5C, 0xF6), (0x7C, 0x3A, 0xED)
DOT = (0xC4, 0xB5, 0xFD)


def lerp(a, b, u):
    return tuple(round(x + (y - x) * u) for x, y in zip(a, b))


def diagonal_gradient(w, h, c0, c1):
    """135-degree linear gradient (top-left -> bottom-right)."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = lerp(c0, c1, (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2)
    return img


def vertical_gradient(w, h, c0, c1):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(c0, c1, y / max(h - 1, 1)))
    return img


def horizontal_gradient(w, h, stops):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for x in range(w):
        u = x / max(w - 1, 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= u <= p1:
                d.line([(x, 0), (x, h)], fill=lerp(c0, c1, (u - p0) / (p1 - p0)))
                break
    return img


def stroke_mask(size, paths, width):
    """Round-cap / round-join polyline mask."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = width / 2
    for pts in paths:
        d.line(pts, fill=255, width=width, joint="curve")
        for x, y in pts:  # round caps
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return m


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def build(size=SIZE):
    w = size * S
    scale = w / 512

    def sc(v):
        return v * scale

    canvas = diagonal_gradient(w, w, BG_FROM, BG_TO)

    # L: vertical stem + bottom bar (vertical gradient)
    l_mask = stroke_mask(w, [[(sc(152), sc(128)), (sc(152), sc(344)), (sc(256), sc(344))]], round(sc(32)))
    canvas.paste(vertical_gradient(w, w, V300, V600), (0, 0), l_mask)

    # T crossbar (symmetric horizontal gradient)
    bar_mask = stroke_mask(w, [[(sc(288), sc(152)), (sc(408), sc(152))]], round(sc(32)))
    canvas.paste(horizontal_gradient(w, w, [(0.0, V300), (0.5, V600), (1.0, V300)]), (0, 0), bar_mask)

    # T stem
    stem_mask = stroke_mask(w, [[(sc(348), sc(152)), (sc(348), sc(344))]], round(sc(32)))
    canvas.paste(vertical_gradient(w, w, V500, V600), (0, 0), stem_mask)

    # accent dot
    d = ImageDraw.Draw(canvas)
    d.ellipse([sc(254 - 16), sc(398 - 16), sc(254 + 16), sc(398 + 16)], fill=DOT)

    out = canvas.convert("RGBA")
    out.putalpha(rounded_mask(w, round(sc(92))))
    return out.resize((size, size), Image.LANCZOS)


def social_preview(logo, w=1280, h=640):
    """GitHub social preview card: logo + wordmark on a darker brand backdrop."""
    card = diagonal_gradient(w, h, (0x17, 0x10, 0x2E), (0x0B, 0x07, 0x16)).convert("RGBA")

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([120, 40, 720, 600], fill=(124, 58, 237, 90))
    card = Image.alpha_composite(card, glow.filter(ImageFilter.GaussianBlur(110)))

    # drop shadow so the tile lifts off the backdrop
    mark = logo.resize((300, 300), Image.LANCZOS)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 170), (150, 190), mark.split()[3])
    card = Image.alpha_composite(card, shadow.filter(ImageFilter.GaussianBlur(26)))
    card.alpha_composite(mark, (150, 170))

    d = ImageDraw.Draw(card)
    title = sub = None
    for path in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ):
        if Path(path).exists():
            from PIL import ImageFont

            try:
                title = ImageFont.truetype(path, 96)
                sub = ImageFont.truetype(path, 38)
            except OSError:
                continue
            break
    if title is None:
        print("[warn] no TrueType font found, used bitmap fallback")

    d.text((520, 230), "LightTab", fill=(0xF5, 0xF3, 0xFF), font=title)
    d.text((526, 352), "Minimal new tab for Chrome", fill=(0xC4, 0xB5, 0xFD), font=sub)
    d.text((526, 404), "Local-first  ·  Bilingual  ·  Zero tracking", fill=(0x8B, 0x7D, 0xB8), font=sub)
    return card.convert("RGB")


def main():
    logo = build(512)
    logo.save(ROOT / "logo.png")
    print("[OK] assets/logo.png 512x512")

    social_preview(logo).save(ROOT / "social-preview.png")
    print("[OK] assets/social-preview.png 1280x640")


if __name__ == "__main__":
    main()
