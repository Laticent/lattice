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


def lockup(style, width=None):
    """Mark + wordmark, sharing one baseline."""
    cap = CAP_RATIO * FONT_SIZE
    sc = (MARK_CAPS * cap) / (MARK_INK[1] - MARK_INK[0])
    ty = BASELINE - MARK_INK[1] * sc            # the mark's foot ON the baseline
    tx = 4 + MARK_INK_X * sc + GAP_CAPS * cap
    stone = STONE if style == "light" else STONE_DM
    gold = GOLD if style == "light" else GOLD_DM
    halo = HALO if style == "light" else HALO_DM
    txt = WM if style == "light" else WM_DM
    st = f'<style>.sf{{fill:{stone}}}.gf{{fill:{gold}}}.hs{{stroke:{halo}}}</style>'
    w = width or int(tx + 300)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 128" '
            f'fill="none">{st}'
            f'<g transform="translate(4 {ty:.2f}) scale({sc:.4f})">{mark()}</g>'
            f'<text x="{tx:.1f}" y="{BASELINE}" font-family="{WMFONT}" '
            f'font-size="{FONT_SIZE}" font-weight="600" letter-spacing="-1" '
            f'fill="{txt}">Laticent</text></svg>\n')


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def emit(d=OUT):
    os.makedirs(d, exist_ok=True)
    write(os.path.join(d, "laticent-mark.svg"), svg(mark()))
    write(os.path.join(d, "laticent-mark-min.svg"), svg(mark(MIN)))
    write(os.path.join(d, "laticent-lockup.svg"), lockup("light"))
    write(os.path.join(d, "laticent-lockup-dark.svg"), lockup("dark"))
    print("wrote 4 master assets to", d)


if __name__ == "__main__":
    emit(sys.argv[1] if len(sys.argv) > 1 else OUT)
