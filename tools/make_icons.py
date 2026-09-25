# -*- coding: utf-8 -*-
"""
Génère les icônes du plugin Copilot Export (16, 48, 128 px) sans dépendance
externe : PNG écrit manuellement avec struct + zlib.

Design : carré arrondi en dégradé bleu -> cyan, flèche blanche de
téléchargement au-dessus d'une barre (symbole « export »).
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "copilot-exporter", "icons")


def lerp(a, b, t):
    return a + (b - a) * t


def inside_rounded_rect(x, y, size, radius):
    """True si (x, y) est dans un carré arrondi [0, size) x [0, size)."""
    if x < 0 or y < 0 or x >= size or y >= size:
        return False
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= radius * radius


def arrow_color(x, y, size):
    """Retourne 1 si le pixel appartient à la flèche blanche, sinon 0."""
    c = size / 2.0
    # tige verticale
    stem_hw = size * 0.105
    stem_top, stem_bot = size * 0.24, size * 0.52
    if abs(x - c) <= stem_hw and stem_top <= y <= stem_bot:
        return 1
    # pointe (triangle)
    head_top, head_bot = size * 0.50, size * 0.66
    if head_top <= y <= head_bot:
        t = (y - head_top) / (head_bot - head_top)
        half = lerp(stem_hw, size * 0.215, t)
        if abs(x - c) <= half:
            return 1
    # barre inférieure (réceptacle)
    tray_top, tray_bot = size * 0.76, size * 0.76 + size * 0.055
    if tray_top <= y <= tray_bot and size * 0.27 <= x <= size * 0.73:
        return 1
    return 0


def make_icon(size):
    ss = 4  # sur-échantillonnage pour l'anticrénelage
    radius = size * 0.23
    top = (37, 99, 235)     # bleu
    bottom = (6, 182, 212)  # cyan

    rows = []
    for py in range(size):
        row = bytearray([0])  # filtre PNG : aucun
        for px in range(size):
            hits_bg = 0
            hits_arrow = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = px + (sx + 0.5) / ss
                    y = py + (sy + 0.5) / ss
                    if not inside_rounded_rect(x, y, size, radius):
                        continue
                    hits_bg += 1
                    if arrow_color(x, y, size):
                        hits_arrow += 1
            total = ss * ss
            if hits_bg == 0:
                row += bytes((0, 0, 0, 0))
                continue
            t = py / max(size - 1, 1)
            bg = tuple(lerp(top[i], bottom[i], t) for i in range(3))
            arrow_ratio = hits_arrow / total
            cover = hits_bg / total
            alpha = int(255 * cover)
            rgb = tuple(lerp(bg[i], 255, arrow_ratio) for i in range(3))
            row += bytes((int(rgb[0]), int(rgb[1]), int(rgb[2]), alpha))
        rows.append(bytes(row))

    raw = b"".join(rows)
    return b"".join([
        b"\x89PNG\r\n\x1a\n",
        chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)),
        chunk(b"IDAT", zlib.compress(raw, 9)),
        chunk(b"IEND", b""),
    ])


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        with open(path, "wb") as f:
            f.write(make_icon(size))
        print(f"écrit : {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
