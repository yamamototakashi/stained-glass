#!/usr/bin/env python3
"""Generate PWA icons for Stained Glass Drift using stdlib only.

Produces a warm rose-window style glyph: radial wedges of jewel colors
with dark lead separators and a bright warm hotspot in the center.
"""
import math, struct, zlib, os

def png_bytes(width, height, rgba):
    def chunk(t, d):
        crc = zlib.crc32(t + d) & 0xffffffff
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', crc)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter: None
        raw.extend(rgba[y*stride:(y+1)*stride])
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

# Jewel-tone wedges (RGB)
WEDGES = [
    (58, 22, 78),    # amethyst
    (24, 38, 104),   # indigo
    (30, 96, 116),   # deep teal
    (140, 26, 44),   # ruby
    (120, 76, 20),   # amber
    (24, 86, 48),    # emerald
]

def lerp(a, b, t): return a + (b - a) * t
def smooth(t):    return t*t*(3 - 2*t)

def render(size, maskable=False):
    W = H = size
    cx = cy = size / 2
    # inner-safe radius for maskable (10% padding) so glyph survives masking
    safe = size * (0.42 if maskable else 0.48)
    lead_frac = 0.04  # angular width of lead between wedges
    out = bytearray(W*H*4)
    n_wedges = len(WEDGES)
    two_pi = math.pi * 2
    wedge_arc = two_pi / n_wedges
    center_r = safe * 0.18
    for y in range(H):
        for x in range(W):
            dx = (x - cx); dy = (y - cy)
            r = math.hypot(dx, dy)
            # Outside circle -> very dark background (with soft vignette)
            if r > safe:
                # dark body with tiny radial shadow outside the glass
                t = min(1.0, (r - safe) / (size*0.12))
                v = int(10 * (1 - t) + 6)
                i = (y*W + x)*4
                out[i] = 10; out[i+1] = 11; out[i+2] = 16; out[i+3] = 255
                continue
            a = math.atan2(dy, dx) + math.pi  # 0..2pi
            wi = int(a // wedge_arc) % n_wedges
            frac = (a - wi*wedge_arc) / wedge_arc  # 0..1 within wedge
            # distance to nearest lead (wedge edge) in angular space
            d_edge = min(frac, 1 - frac)  # 0..0.5
            lead_mask = 1.0
            if d_edge < lead_frac:
                lead_mask = smooth(d_edge / lead_frac)
            # radial gradient: slight brighter near center, dark at rim
            rr = r / safe  # 0..1
            depth = smooth(1.0 - rr)  # 1 at center, 0 at rim
            base = WEDGES[wi]
            # translucent color: warm it at center, darken at edge
            br = lerp(0.35, 1.15, depth)
            rgb = [min(255, int(base[k] * br)) for k in range(3)]
            # add glass gradient streak per wedge (gentle)
            streak = 0.1 * math.sin(rr*6 + wi*0.7) + 0.05
            rgb = [min(255, max(0, int(rgb[k] * (1 + streak*0.2)))) for k in range(3)]
            # fade toward dark rim
            edge_fade = smooth(max(0, 1.0 - (rr - 0.82) / 0.18)) if rr > 0.82 else 1.0
            rgb = [int(v * edge_fade + 6 * (1 - edge_fade)) for v in rgb]
            # apply lead mask (darken)
            rgb = [int(v * lead_mask) for v in rgb]
            # central warm bloom
            if r < safe * 0.55:
                bloom = smooth(1.0 - r / (safe * 0.55))
                rgb[0] = min(255, int(rgb[0] + 220 * bloom * 0.5))
                rgb[1] = min(255, int(rgb[1] + 190 * bloom * 0.45))
                rgb[2] = min(255, int(rgb[2] + 120 * bloom * 0.3))
            # outer ring lead
            if rr > 0.955:
                rgb = [int(v * smooth((1.0 - rr) / 0.045)) for v in rgb]
            # safety clamp
            rgb = [max(0, min(255, v)) for v in rgb]
            i = (y*W + x)*4
            out[i] = rgb[0]; out[i+1] = rgb[1]; out[i+2] = rgb[2]; out[i+3] = 255
    # Background fill for maskable variant (fills full square)
    if maskable:
        # second pass: composite glass glyph over a dark warm square bg
        for y in range(H):
            for x in range(W):
                i = (y*W + x)*4
                if out[i] == 10 and out[i+1] == 11 and out[i+2] == 16:
                    # outside the glass: fill with warm near-black
                    out[i] = 14; out[i+1] = 12; out[i+2] = 20
    return png_bytes(W, H, out)

def write(name, size, maskable=False):
    path = os.path.join(os.path.dirname(__file__), name)
    data = render(size, maskable=maskable)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'wrote {name} ({size}x{size})')

if __name__ == '__main__':
    write('icon-192.png', 192, maskable=False)
    write('icon-512.png', 512, maskable=False)
    write('icon-maskable-512.png', 512, maskable=True)
    write('apple-touch-icon.png', 180, maskable=False)
