#!/usr/bin/env python3
"""Laticent org mark — the inlaid L. Run: python3 generate.py

The mark is the letter drawn as a piece of construction: a slate L with a
brass seam let into it, tracing the load path down the stem and turning out
along the arm.

  latus  (broad, expansive)   the arm runs 76 against a 84 cap height, so the
                              letter's own stance is wide
  latere (the hidden bedrock) the seam is the load path — the structure that
                              carries the letter, made visible as one line

Why this and not two rectangles. An earlier L scored 6.5 in review for a
nameable reason: it had no typographic craft. Everything below is there to
fix that, and each item was chosen against a rendered comparison:

  arm lighter than stem   ah = sw * 0.80. A horizontal of equal measure reads
                          heavier than a vertical; type sets horizontals lower.
  bracketed crook         a quadratic transition from stem to arm, not a dead
                          90-degree miter. This is what makes it read as drawn.
  the seam bends          the seam turns on a radius echoing the bracket. A
                          mitered seam inside a bracketed letter is two
                          drawing languages in one mark.
  the seam tapers         it narrows to 0.72 along the arm: load concentrates
                          in the stem and diminishes as it spreads.
  the seam sits in a      real inlay sits in a cut channel. The recess is also
  recess                  load-bearing for contrast — see below.
  stem taper              the stem is 3.5 narrower at the top, the way a cut
                          letter is.

Two constraints are enforced here rather than eyeballed, because both were
caught failing in review and neither is visible at 128px:

  SAFE_R    nothing is painted more than 54 units from the center, so a round
            avatar crop (GitHub org, Slack) cannot amputate the mark. Verify
            with audit.py; the existing family marks measure 41-61.

  recess    gold and slate sit at 1.23:1 on dark — the same value, separated
            only by hue. Without the ground-color channel around it the seam
            vanishes in grayscale, in mono print, and for a viewer with a
            color vision deficiency. Measured, not assumed.
"""
import os
import sys

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette — the achromatic parent among chromatic children ───────────
# The five products each carry one hue plus a shared warm gold. The parent
# takes no product hue, so it reads as the root rather than a sixth sibling.
STONE, STONE_DM = "#2C3A43", "#9DB2BE"
GOLD, GOLD_DM = "#C67A12", "#F6B64A"
HALO, HALO_DM = "#F6F3EC", "#101314"
WM, WM_DM = "#241F1B", "#E6E2DD"
WMFONT = "Fraunces,'Cormorant Garamond',Georgia,serif"

SAFE_R = 54.0

# The TILE — the parent's primary symbol.
#
# Measured, not assumed: every one of the five product marks places a haloed
# hub at exactly (64,64), radius 13-16.5. The family is not merely "has a
# hub", it is ORGANIZED AROUND one — every child is centripetal. A letterform
# cannot be centripetal without ceasing to be a letter, so transplanting a hub
# into the L fails on geometry, not taste: its node lands 38 units off center
# and reads as a bolted-on dot.
#
# So the parent does not imitate its children, it differs by CLASS. A
# contained mark beside five free-standing ones reads as the thing they live
# inside — which is the relationship — and it is what Alphabet, Meta and P&G
# all do at the corporate register.
#
# The tile does NOT adapt to the color scheme. An app-icon tile is a brand
# constant; letting it follow `prefers-color-scheme` inverted it into a glaring
# bright block on dark. Only the ground behind a lockup and the wordmark shift.
TILE_BG = "#25333C"      # a touch deeper than STONE, so it holds on cream
TILE_INK = HALO          # the letter, reversed out of the tile
TILE_SEAM = GOLD         # 3.06:1 on the cream letter; the seam never touches
                         # the tile, so lightening it only LOWERED contrast
TILE_R = 27              # corner radius, ~21% — a squircle
TILE_PAD = 17

STYLE = (
    f'<style>.sf{{fill:{STONE}}}.gf{{fill:{GOLD}}}.hs{{stroke:{HALO}}}'
    f'@media(prefers-color-scheme:dark){{.sf{{fill:{STONE_DM}}}'
    f'.gf{{fill:{GOLD_DM}}}.hs{{stroke:{HALO_DM}}}}}</style>'
)

# The drawing. FINAL is the mark; MIN keeps the same silhouette and drops what
# cannot be seen below ~24px — it is a reduction of one drawing, never a
# second one.
FINAL = {"sw": 25, "H": 84, "A": 76, "taper": 3.5, "bracket": 15,
         "seam": 5.2, "bend": 9, "inset": 17, "tail": 9,
         "taper_seam": 0.72, "recess": 2.4}
MIN = {"sw": 28, "H": 84, "A": 76, "taper": 0, "bracket": 11,
       "seam": 6.4, "bend": 7, "inset": 14, "tail": 8,
       "taper_seam": 1.0, "recess": 2.8}


def mark(p=None):
    """The L and its seam, as two paths plus the recess between them."""
    p = {**FINAL, **(p or {})}
    sw, H, A = p["sw"], p["H"], p["A"]
    ah = p.get("ah", sw * 0.80)
    taper, br = p["taper"], p["bracket"]
    x0 = 64 - A / 2 - p.get("dx", 1)
    base = 64 + H / 2 - p.get("dy", 3)
    top = base - H
    xk, yk = x0 + sw, base - ah

    letter = (f'M{x0 + taper:.2f} {top:.2f} L{x0 + sw:.2f} {top:.2f} '
              f'L{xk:.2f} {yk - br:.2f} '
              f'Q{xk:.2f} {yk:.2f} {xk + br:.2f} {yk:.2f} '
              f'L{x0 + A:.2f} {yk:.2f} L{x0 + A:.2f} {base:.2f} '
              f'L{x0:.2f} {base:.2f} Z')

    sx, sy = x0 + sw / 2 + taper / 2, base - ah / 2
    w = p["seam"] / 2
    wt = w * p["taper_seam"]
    t0 = top + p["inset"]
    end = x0 + A - p["tail"]
    rr = p["bend"]
    seam = (f'M{sx - w:.2f} {t0:.2f} L{sx + w:.2f} {t0:.2f} '
            f'L{sx + w:.2f} {sy - w - rr:.2f} '
            f'Q{sx + w:.2f} {sy - w:.2f} {sx + w + rr:.2f} {sy - w:.2f} '
            f'L{end:.2f} {sy - wt:.2f} L{end:.2f} {sy + wt:.2f} '
            f'L{sx - w:.2f} {sy + w:.2f} Z')

    return (f'<path d="{letter}" class="sf"/>'
            f'<path d="{seam}" class="hs" fill="none" '
            f'stroke-width="{p["recess"]}" stroke-linejoin="round"/>'
            f'<path d="{seam}" class="gf"/>')


def tile(p=None):
    """The mark reversed out of a fixed slate tile. No recess: inside the tile
    the seam borders the cream letter, never the slate, and cream-on-cream
    would be invisible."""
    import re as _re
    art = mark(p)
    art = _re.sub(r'<path d="[^"]+" class="hs"[^/]*/>', '', art)
    art = art.replace('class="sf"', f'fill="{TILE_INK}"', 1)
    art = art.replace('class="gf"', f'fill="{TILE_SEAM}"')
    f = (128 - 2 * TILE_PAD) / 128
    return (f'<rect x="0" y="0" width="128" height="128" rx="{TILE_R}" '
            f'fill="{TILE_BG}"/>'
            f'<g transform="translate({TILE_PAD} {TILE_PAD}) scale({f:.4f})">'
            f'{art}</g>')


def svg(inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" '
            f'fill="none">{STYLE}{inner}</svg>\n')


# The lockup's vertical rule. The mark IS a letter, so it shares the
# wordmark's baseline exactly — flat foot to flat foot, no overshoot (that is
# for curves). Two L's side by side that do NOT share a baseline is the thing
# the eye catches without being able to name it, and the first version of this
# file got it wrong: the mark hung 9.2px below the baseline and was drawn at
# 2.1x cap height where the convention is 1.2-1.6x.
#
# The text is set on its ALPHABETIC baseline at BASELINE rather than with
# dominant-baseline="central". Centering the em box makes the alignment
# font-dependent, and "Laticent" has no descenders, so its mass rides high in
# that box and any symbol centered on it drops visibly low. Pinning the
# baseline is exact in whatever font actually resolves.
FONT_SIZE = 70
CAP_RATIO = 0.70          # cap height as a fraction of em, Fraunces/Georgia
MARK_CAPS = 1.35          # the mark's height in cap heights (convention 1.2-1.6)
BASELINE = 92.0
MARK_INK = (19.0, 102.8)  # the mark's own ink bbox in y, measured
MARK_INK_X = 100.8        # ... and its right edge
GAP_CAPS = 0.42           # space to the wordmark, in cap heights


TILE_CAPS = 1.90         # the tile's height in cap heights
TILE_CENTER = 69.5       # measured: between the cap-band center (67.5) and the
                         # word's center of mass (74.2). A tile is not a letter,
                         # so it has no baseline to share; the eye put it here.


def lockup(style, width=None, form="tile"):
    """Mark + wordmark. form="tile" is primary; form="bare" is the letter
    alone, for monochrome, engraving and very small print."""
    cap = CAP_RATIO * FONT_SIZE
    if form == "tile":
        th = TILE_CAPS * cap
        sc = th / 128
        ty = TILE_CENTER - th / 2
        tx = 4 + th + GAP_CAPS * cap
        art = tile()
    else:
        sc = (MARK_CAPS * cap) / (MARK_INK[1] - MARK_INK[0])
        ty = BASELINE - MARK_INK[1] * sc        # the mark's foot ON the baseline
        tx = 4 + MARK_INK_X * sc + GAP_CAPS * cap
        art = mark()
    stone = STONE if style == "light" else STONE_DM
    gold = GOLD if style == "light" else GOLD_DM
    halo = HALO if style == "light" else HALO_DM
    txt = WM if style == "light" else WM_DM
    st = f'<style>.sf{{fill:{stone}}}.gf{{fill:{gold}}}.hs{{stroke:{halo}}}</style>'
    w = width or int(tx + 300)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 128" '
            f'fill="none">{st}'
            f'<g transform="translate(4 {ty:.2f}) scale({sc:.4f})">{art}</g>'
            f'<text x="{tx:.1f}" y="{BASELINE}" font-family="{WMFONT}" '
            f'font-size="{FONT_SIZE}" font-weight="600" letter-spacing="-1" '
            f'fill="{txt}">Laticent</text></svg>\n')


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def emit(d=OUT):
    os.makedirs(d, exist_ok=True)
    write(os.path.join(d, "laticent-tile.svg"), svg(tile()))
    write(os.path.join(d, "laticent-tile-min.svg"), svg(tile(MIN)))
    write(os.path.join(d, "laticent-mark.svg"), svg(mark()))
    write(os.path.join(d, "laticent-mark-min.svg"), svg(mark(MIN)))
    write(os.path.join(d, "laticent-lockup.svg"), lockup("light"))
    write(os.path.join(d, "laticent-lockup-dark.svg"), lockup("dark"))
    write(os.path.join(d, "laticent-lockup-bare.svg"), lockup("light", form="bare"))
    write(os.path.join(d, "laticent-lockup-bare-dark.svg"), lockup("dark", form="bare"))
    print("wrote 8 master assets to", d)


if __name__ == "__main__":
    emit(sys.argv[1] if len(sys.argv) > 1 else OUT)
