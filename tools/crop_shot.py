# -*- coding: utf-8 -*-
"""Rogne une capture PNG (Chrome headless) à la hauteur réelle du contenu
sombre, en gérant les images RGB (type 2) et RGBA (type 6)."""

import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    pos = 8
    w = h = None
    bd = ct = None
    idat = b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', payload[:10])
        elif tag == b'IDAT':
            idat += payload
        pos += 12 + ln
    assert bd == 8, 'profondeur non geree: %s' % bd
    assert ct in (2, 6), 'type couleur non gere: %s' % ct
    bpp = 3 if ct == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * bpp + 1
    rows = []
    prev = bytearray(w * bpp)
    for y in range(h):
        ft = raw[y * stride]
        line = bytearray(raw[y * stride + 1:(y + 1) * stride])
        for i in range(len(line)):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif ft == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        prev = line
        rows.append(bytes(line))
    return w, h, bpp, rows


def write_png(path, w, h, bpp, rows):
    def chunk(tag, d):
        return (struct.pack('>I', len(d)) + tag + d
                + struct.pack('>I', zlib.crc32(tag + d) & 0xFFFFFFFF))

    color_type = 2 if bpp == 3 else 6
    raw = b''.join(b'\x00' + r for r in rows)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b''))


def main(src, dst, pad=12):
    w, h, bpp, rows = read_png(src)
    # couleur de fond = pixel du coin bas-droit ; on rogne dès que le contenu
    # s'arrête (le fond body se propage sur toute la page).
    bg = rows[h - 1][(w - 2) * bpp:(w - 2) * bpp + 3]
    last = 0
    for y in range(h - 1, -1, -1):
        px = rows[y]
        for x in range(0, w * bpp, bpp):
            r, g, b = px[x], px[x + 1], px[x + 2]
            if (abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])) > 30:
                last = y
                break
        if last:
            break
    new_h = min(h, last + pad)
    write_png(dst, w, new_h, bpp, rows[:new_h])
    print('%s : %dx%d -> %s : %dx%d' % (src, w, h, dst, w, new_h))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 12)
