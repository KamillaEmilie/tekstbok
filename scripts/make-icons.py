"""Lager app-ikonene (PNG) uten eksterne pakker. Kjør: python3 scripts/make-icons.py"""
import struct, zlib, os

BG = (17, 17, 17)
LINES = [((255, 126, 182), 0.62), ((255, 210, 63), 0.80), ((94, 224, 122), 0.50), ((244, 241, 234), 0.70)]

def render(size):
    px = [[BG] * size for _ in range(size)]
    m = size * 0.2          # marg (innenfor «maskable» trygg sone)
    h = size * 0.075        # strektykkelse
    gap = (size - 2 * m - h) / (len(LINES) - 1)
    r = h / 2
    for i, (col, frac) in enumerate(LINES):
        y0 = m + i * gap
        x0, x1 = m, m + (size - 2 * m) * frac
        for y in range(int(y0), int(y0 + h) + 1):
            for x in range(int(x0), int(x1) + 1):
                cy = y0 + r
                # avrundede ender
                cx = min(max(x, x0 + r), x1 - r)
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r and 0 <= y < size and 0 <= x < size:
                    px[y][x] = col
    return px

def png(path, px):
    size = len(px)
    raw = b''.join(b'\x00' + bytes(c for p in row for c in p) for row in px)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

out = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(out, exist_ok=True)
for s in (180, 192, 512):
    png(os.path.join(out, f'icon-{s}.png'), render(s))
png(os.path.join(out, 'apple-touch-icon.png'), render(180))

svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#111"/>']
gap = (100 - 40 - 7.5) / 3
for i, (c, f) in enumerate(LINES):
    svg.append(f'<rect x="20" y="{20 + i * gap:.1f}" width="{60 * f:.1f}" height="7.5" rx="3.75" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
svg.append('</svg>')
open(os.path.join(out, 'icon.svg'), 'w').write(''.join(svg))
print('Ikoner laget i public/icons')
