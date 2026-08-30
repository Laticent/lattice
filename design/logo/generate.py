#!/usr/bin/env python3
"""Lattice brand mark generator — "Spectrum Cell".

A crystal-lattice unit cell (the structure) whose nodes are lit by the
brand spectrum ribbon swept left->right (the color), anchored by a single
gold core. Structure is ink, color is signal.

Emits four master assets into this directory:
  lattice-mark.svg        full mark, light+dark adaptive (one file)
  lattice-mark-min.svg    simplified mark for <=24px (favicon / app icon)
  lattice-lockup.svg      horizontal lockup, dark text (for light surfaces)
  lattice-lockup-dark.svg horizontal lockup, light text (for dark surfaces)

Palette is the Lattice brand axis: indaco navy (themes/indaco.css) + cuoio
gold (themes/cuoio.css) + the cuoio spectrum ribbon. Run: python3 generate.py
"""
import math, os
OUT = os.path.dirname(os.path.abspath(__file__))

# ── Brand palette ──────────────────────────────────────────────────────
NAVY_DEEP = "#003D66"   # indaco --brand-canvas — bonds on light
NAVY_DM   = "#4FA8DA"   # bonds on dark (reads on near-black canvas)
GOLD_BRIGHT = "#C8A040" # core fill
GOLD_DEEP   = "#7A5A10" # core ring
INK   = "#1E1A15"       # wordmark on light
CREAM = "#FAF7F2"       # node halos on light
DARKBG = "#15110D"      # node halos on dark
SPEC = ["#5B86B8", "#7B72C0", "#A8628A", "#C45D5D", "#D08C42", "#B8A032"]
WMFONT = "Fraunces,'Cormorant Garamond',Georgia,serif"

def _hx(c): c = c.lstrip('#'); return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))
def _hex(t): return "#%02X%02X%02X" % t
def spec(t):
    """Sample the spectrum ribbon at t in [0,1]."""
    t = max(0.0, min(1.0, t)); n = len(SPEC) - 1; f = t * n; i = int(f); f -= i
    if i >= n: return SPEC[-1]
    a, b = _hx(SPEC[i]), _hx(SPEC[i + 1])
    return _hex(tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3)))

_ROT = math.radians(45); _C = math.cos(_ROT); _S = math.sin(_ROT)
def _screen(i, j, stp): x = i * stp; y = j * stp; return (x * _C - y * _S, x * _S + y * _C)

def build(style="adaptive", minimal=False):
    """style: adaptive | light | dark. Returns a full <svg> string (vb 128)."""
    cx = cy = 64
    if minimal:
        stp = 33; bw = 6.4; rout = 11; rcen = 14
        grid = [(-1, -1), (1, -1), (1, 1), (-1, 1), (0, 0)]
        bonds = [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]
        node_col = {(-1, -1): SPEC[0], (1, -1): SPEC[2], (1, 1): SPEC[4], (-1, 1): SPEC[1]}
    else:
        stp = 25; bw = 5.2; rout = 8.0; rcen = 11.0
        grid = [(i, j) for i in (-1, 0, 1) for j in (-1, 0, 1)]
        bonds = []
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                if i < 1: bonds.append(((i, j), (i + 1, j)))
                if j < 1: bonds.append(((i, j), (i, j + 1)))
        node_col = None
    R = 2 * stp * _C
    bstroke = NAVY_DM if style == "dark" else NAVY_DEEP
    halo = DARKBG if style == "dark" else CREAM
    bcls = ' class="bond"' if style == "adaptive" else ''
    hcls = ' class="halo"' if style == "adaptive" else ''
    head = ""
    if style == "adaptive":
        head = (f'<style>.bond{{stroke:{NAVY_DEEP}}}.halo{{fill:{CREAM}}}'
                f'@media(prefers-color-scheme:dark){{.bond{{stroke:{NAVY_DM}}}'
                f'.halo{{fill:{DARKBG}}}}}</style>')
    p = [head, f'<g transform="rotate(45 {cx} {cy})" stroke-linecap="round">']
    for a, b in bonds:
        ax, ay = cx + a[0] * stp, cy + a[1] * stp
        bx, by = cx + b[0] * stp, cy + b[1] * stp
        p.append(f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="{bstroke}"{bcls} stroke-width="{bw}"/>')
    p.append("</g>")
    for (i, j) in grid:
        sx, sy = _screen(i, j, stp); X, Y = cx + sx, cy + sy
        if (i, j) == (0, 0):
            p.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rcen + 2.2:.1f}" fill="{halo}"{hcls}/>')
            p.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rcen:.1f}" fill="{GOLD_BRIGHT}"/>')
            p.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rcen - 3.6:.1f}" fill="none" stroke="{GOLD_DEEP}" stroke-width="1.5" opacity="0.55"/>')
        else:
            col = node_col[(i, j)] if minimal else spec((sx + R) / (2 * R))
            p.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rout + 1.7:.1f}" fill="{halo}"{hcls}/>')
            p.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{rout:.1f}" fill="{col}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">{"".join(p)}</svg>\n'

def lockup(style):
    """style: light | dark."""
    icon = build("light" if style == "light" else "dark")
    inner = icon.split('fill="none">', 1)[1].rsplit('</svg>', 1)[0]
    txt = INK if style == "light" else CREAM
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 128" fill="none">'
            f'<g transform="translate(4 4) scale(0.9375)">{inner}</g>'
            f'<text x="156" y="66" dominant-baseline="central" font-family="{WMFONT}" '
            f'font-size="70" font-weight="600" letter-spacing="-1" fill="{txt}">Lattice</text></svg>\n')

def _w(name, s): open(os.path.join(OUT, name), "w").write(s)
if __name__ == "__main__":
    _w("lattice-mark.svg", build("adaptive"))
    _w("lattice-mark-min.svg", build("adaptive", minimal=True))
    _w("lattice-lockup.svg", lockup("light"))
    _w("lattice-lockup-dark.svg", lockup("dark"))
    print("wrote 4 master assets to", OUT)
