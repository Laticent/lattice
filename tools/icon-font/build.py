"""
Build the Lattice Icons font: the curated Tabler drawings as glyphs, one woff2 per line weight.

Run through `npm run icons:font` (tools/build-icon-font.js), which hands this script a JSON job:
  { "icons": { name: "<svg …>…</svg>" }, "codepoints": { name: "E000" }, "faces": [ { "weight": 400,
    "stroke": 2, "file": "lattice-icons-400" } ], "out": "<dir>", "version": "1.000" }

Each drawing is a 24-unit Tabler icon drawn with round-capped strokes. A font holds filled outlines, so picosvg
turns every stroke into its outline (skia-pathops does the geometry) at the face's stroke width, and the outline is
scaled onto a 1000-unit em: the 24-unit grid fills the em, its top at the ascender (800) and its foot at the
descender (-200). So an icon set in a box of 1em by 1em, line-height 1, lands exactly where the SVG would.

Two things the bake-off (engineering/decisions/2026-11-01-icon-font.md §5) found and this pins:
  - Every glyph's left side bearing is its own xMin. A renderer that trusts hmtx (Chrome does) moves the outline so
    its left edge sits at the bearing; a bearing of 0 slid every icon left by its own margin.
  - The bytes are reproducible: the head dates are fixed, so the same drawings give the same file.

Requirements (Python 3.10+): `pip install -r tools/icon-font/requirements.txt`.
"""

import json
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from picosvg.svg import SVG

UPM = 1000
ASCENT = 800
DESCENT = -200
GRID = 24
SCALE = UPM / GRID
# 2026-01-01T00:00:00Z in seconds since 1904-01-01, the epoch the head table counts from.
FIXED_DATE = 3849984000
FAMILY = 'Lattice Icons'


def glyph_name(name):
    return 'i_' + name.replace('-', '_')


def outline(svg, stroke):
    """The drawing as a TrueType glyph: strokes outlined at `stroke` grid units, cubics to quadratics."""
    pico = SVG.fromstring(svg.replace('stroke-width="2"', f'stroke-width="{stroke}"')).topicosvg()
    pen = TTGlyphPen(None)
    flip = TransformPen(Cu2QuPen(pen, 0.5, reverse_direction=False), (SCALE, 0, 0, -SCALE, 0, ASCENT))
    for shape in pico.shapes():
        parse_path(shape.d, flip)
    return pen.glyph()


def build(job, face):
    names = sorted(job['icons'])
    order = ['.notdef', 'space'] + [glyph_name(n) for n in names]
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    cmap = {0x20: 'space'}
    for n in names:
        glyphs[glyph_name(n)] = outline(job['icons'][n], face['stroke'])
        cmap[int(job['codepoints'][n], 16)] = glyph_name(n)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    metrics = {}
    for g in order:
        gl = glyf[g]
        gl.recalcBounds(glyf)
        advance = UPM // 4 if g == 'space' else UPM
        metrics[g] = (advance, gl.xMin if gl.numberOfContours else 0)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    style = {300: 'Light', 400: 'Regular', 500: 'Medium'}[face['weight']]
    fb.setupNameTable({
        'familyName': FAMILY,
        'styleName': style,
        'uniqueFontIdentifier': f"{FAMILY} {style} {job['version']}",
        'fullName': f'{FAMILY} {style}',
        'psName': f"LatticeIcons-{style}",
        'version': f"Version {job['version']}",
        'copyright': 'Drawings: Tabler Icons, Copyright (c) 2020-2026 Pawel Kuna (MIT). Font: Laticent.',
        'licenseDescription': 'MIT License. The drawings are Tabler Icons (https://tabler.io/icons), MIT.',
    })
    # fsType 0: installable embedding, so a PDF, PowerPoint or ODP may carry it and a recipient may edit with it.
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=DESCENT, sTypoLineGap=0, usWinAscent=ASCENT,
                usWinDescent=-DESCENT, usWeightClass=face['weight'], fsType=0, achVendID='LTCT',
                fsSelection=0x40 | 0x80)
    fb.setupPost()
    head = fb.font['head']
    head.created = head.modified = FIXED_DATE
    head.fontRevision = float(job['version'])
    fb.font.flavor = 'woff2'
    path = os.path.join(job['out'], face['file'] + '.woff2')
    fb.font.save(path)
    # Read it back: what was written is what a renderer gets.
    TTFont(path)
    return path


def main():
    with open(sys.argv[1], encoding='utf-8') as f:
        job = json.load(f)
    missing = [n for n in job['icons'] if n not in job['codepoints']]
    if missing:
        sys.exit(f'icon-font: no codepoint for {", ".join(missing)}')
    for face in job['faces']:
        print(build(job, face))


if __name__ == '__main__':
    main()
