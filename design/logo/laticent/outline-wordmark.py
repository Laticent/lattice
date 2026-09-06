#!/usr/bin/env python3
"""Outline the Laticent wordmark to a path. On demand; needs network.

  python3 outline-wordmark.py        # rewrites wordmark.py

WHY the wordmark is a path and not live `<text>`.

The family's lockups set the wordmark as live text in
`Fraunces,'Cormorant Garamond',Georgia,serif`, and size the SVG's own viewBox
from a fixed allotment. Whichever face actually resolves decides the width, and
measured in real Chromium the chain spans 219.6 to 315.9 units for "Laticent"
at font-size 70 / weight 600 / letter-spacing -1:

    Fraunces           248.0     the intended face
    Cormorant Garamond 219.6
    Liberation Serif   240.8     what Linux gives for Georgia / Times
    DejaVu Serif       315.9     what a bare `serif` gives on Linux
    FreeSerif          236.4

No single allotment is both tight and safe across a 96-unit spread: the shipped
300 clipped DejaVu by 15.9, and widening it to 316 would leave 68 units of dead
space in the intended face. A path has no such spread — it is the same drawing
everywhere, which is what a logo has to be.

Fraunces is SIL OFL 1.1, which permits outlining glyphs into artwork; the
resulting path is artwork, not a font, and carries no license obligation of
its own.

Two things this script has to get right, both of which failed silently first:

  opsz  Fraunces' only axis here is optical size, and Chromium's default
        `font-optical-sizing: auto` pins it to the used font-size. Outlining at
        the font's own default (opsz 9) would draw a text face at display size.
        Instantiate at 70 BEFORE both shaping and outlining, so one font
        answers both.

  woff2 harfbuzz cannot read woff2. `hb.Blob.from_file_path` on one returns an
        empty face — upem 1000, every glyph .notdef, no error. Decompress to
        TTF first, and assert the shaped glyphs are real.
"""
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CSS = ("https://fonts.googleapis.com/css2"
       "?family=Fraunces:opsz,wght@9..144,600&display=swap")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")

TEXT = "Laticent"
FONT_SIZE = 70.0
LETTER_SPACING = -1.0
OPSZ = 70


def fetch_font():
    req = urllib.request.Request(CSS, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        css = r.read().decode("utf-8")
    m = re.findall(r"/\* latin \*/\s*@font-face \{.*?src: url\((https://[^)]+)\)",
                   css, re.S)
    if not m:
        sys.exit("could not find the latin subset in the Google Fonts CSS")
    with urllib.request.urlopen(m[0], timeout=30) as r:
        return r.read()


def build():
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.misc.transform import Transform
    from fontTools.pens.boundsPen import BoundsPen
    import io

    raw = fetch_font()
    tt = instantiateVariableFont(TTFont(io.BytesIO(raw)), {"opsz": OPSZ},
                                 inplace=False, updateFontNames=False)
    tt.flavor = None
    ttf = os.path.join(HERE, ".fraunces-opsz70.ttf")
    tt.save(ttf)
    try:
        face = hb.Face(hb.Blob.from_file_path(ttf))
        font = hb.Font(face)
        buf = hb.Buffer()
        buf.add_str(TEXT)
        buf.guess_segment_properties()
        hb.shape(font, buf)
        order = tt.getGlyphOrder()
        names = [order[i.codepoint] for i in buf.glyph_infos]
        if ".notdef" in names:
            sys.exit(f"shaping produced .notdef — the face did not load: {names}")

        gs = tt.getGlyphSet()
        s = FONT_SIZE / face.upem
        parts, bp, x = [], BoundsPen(gs), 0.0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            gn = order[info.codepoint]
            sp = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
            t = Transform(s, 0, 0, -s, x + pos.x_offset * s, -pos.y_offset * s)
            gs[gn].draw(TransformPen(sp, t))
            gs[gn].draw(TransformPen(bp, t))
            d = sp.getCommands()
            if d:
                parts.append(d)
            x += pos.x_advance * s + LETTER_SPACING
    finally:
        if os.path.exists(ttf):
            os.remove(ttf)

    x0, y0, x1, y1 = bp.bounds
    # Normalize so the ink's left edge is x=0. The baseline stays y=0: the
    # lockup puts the mark's foot on it, so it has to be the origin.
    d = re.sub(r"(-?\d+\.\d+) (-?\d+\.\d+)",
               lambda m: f"{float(m.group(1)) - x0:.2f} {m.group(2)}",
               "".join(parts))
    return d, (x1 - x0), -y0, y1


def main():
    d, ink_w, cap_h, desc = build()
    out = os.path.join(HERE, "wordmark.py")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(
            '"""The Laticent wordmark, outlined from Fraunces 600 at opsz 70.\n\n'
            "GENERATED by outline-wordmark.py — do not hand-edit.\n\n"
            "Baseline is y=0 and the ink's left edge is x=0, so the lockup can\n"
            "sit the mark's foot on the same baseline and butt the two by ink.\n"
            '"""\n'
            f"PATH = {d!r}\n"
            f"INK_W = {ink_w:.2f}\n"
            f"CAP_H = {cap_h:.2f}\n"
            f"DESCENT = {desc:.2f}\n"
        )
    print(f"wrote {out}")
    print(f"  ink width {ink_w:.2f}   cap height {cap_h:.2f}   descent {desc:.2f}")
    print(f"  path {len(d)} chars")


if __name__ == "__main__":
    main()
