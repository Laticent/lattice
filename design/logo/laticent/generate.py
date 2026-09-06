#!/usr/bin/env python3
"""Laticent org mark — the incised L. Run: python3 generate.py

The mark is the letter drawn as a piece of construction: an L with the load
path cut into it, running down the stem and turning out along the arm.

  latus  (broad, expansive)   the arm runs 68 against an 84 cap height. A
                              Garamond L is nearer 0.60 of its cap; this is
                              0.81, so the letter's own stance is broad.
  latere (the hidden bedrock) the channel is cut THROUGH the letter to the
                              ground it stands on. What carries the letter is
                              not drawn on it — it is the material showing
                              through from underneath.

WHAT THE CHANNEL IS, AND WHY IT IS NOT A GOLD STRIPE

An earlier version inlaid a brass seam into the letter and fenced it with a
ground-color recess. Rendered on a real dark ground it fails, and the failure
is structural rather than a matter of taste:

  gold on slate is 1.23:1 on dark      the same value, separated only by hue.
                                       The letter reads as two disconnected
                                       pieces, and in grayscale it is one flat
                                       slate L.
  the recess made it worse             slate / near-black / gold / near-black /
                                       slate is FIVE bands across a 20-unit
                                       stem. On dark the near-black recess is
                                       the ground, so it does not frame the
                                       seam — it severs the letter into two
                                       floating rails.

Cutting the channel to the ground instead leaves three bands and needs no
second color to survive: the channel is the ground, so it sits at whatever
contrast the letter itself has (10.6:1 on cream, 8.5:1 on dark) in either
scheme, in grayscale, in mono print, and under a color vision deficiency. It
also degrades honestly — below ~28px the channel closes and the mark becomes a
solid L, which is a reduction, not a defect.

The family's shared gold lives in the TILE, where it measures 3.06:1 against
the cream letter and never touches the slate ground it could not hold against.

WHY THIS LETTER AND NOT TWO RECTANGLES

An earlier L scored 6.5 in review for a nameable reason: no typographic craft.
Each move below was picked against a rendered sweep in both schemes, not
asserted.

  stem at 20 of 84        0.24 of the cap height. At 25 (0.30) it read as
                          machined angle iron rather than a letter; at 16 it
                          went wiry by 24px.
  arm at 68 of 84         at 76 it read as a bracket or a carpenter's square at
                          EVERY stem weight — the widest thing that is still
                          legibly an L, not the widest thing that fits.
  arm lighter than stem   ah = sw * 0.80. A horizontal of equal measure reads
                          heavier than a vertical.
  bracketed crook         a quadratic transition from stem to arm, not a dead
                          90-degree miter. This is what makes it read as drawn.
  no stem taper           a 3.5-unit slope over 84 never lands on the pixel
                          grid, so the mark's most prominent vertical rendered
                          fuzzy at 48px while the right edge stayed razor
                          sharp. Craft that costs sharpness is not craft.

Two constraints are enforced here rather than eyeballed, because both were
caught failing in review and neither is visible at 128px:

  SAFE_R  nothing in a free-standing mark is painted past 58 of the round
          avatar crop's 64-unit radius (GitHub org, Slack). It is ASSERTED at
          generate time, not claimed here — the number carried in prose said 54
          while the letter measured 56.4. Cross-check with audit.py.

  the channel never breaks out of the letter. Gold on the tile ground is
  1.61:1 — below the 3:1 graphical floor — so the tile's channel is safe only
  while cream surrounds it on every side. assert_channel_contained() proves it
  from the numbers instead of trusting the drawing.
"""
import os
import sys

from wordmark import CAP_H, INK_W, PATH

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette — the achromatic parent among chromatic children ───────────
# The five products each carry one hue plus a shared warm gold. The parent
# takes no product hue, so it reads as the root rather than a sixth sibling.
STONE, STONE_DM = "#2C3A43", "#9DB2BE"
GOLD, GOLD_DM = "#C67A12", "#F6B64A"
HALO, HALO_DM = "#F6F3EC", "#101314"
WM, WM_DM = "#241F1B", "#E6E2DD"

# A round avatar crop (GitHub org, Slack) is a circle of radius 64. SAFE_R is
# that circle with a ~10% margin for platforms that crop a shade tighter, and
# assert_invariants() ENFORCES it — the previous 54 was a docstring claim
# nothing checked, and the letter had grown past it to 56.4 unnoticed. The
# five product marks measure 41-61 by the same audit.
SAFE_R = 58.0

# The TILE — the parent's primary symbol.
#
# Measured, not assumed: every one of the five product marks places a haloed
# hub at exactly (64,64), radius 13-16.5. The family is not merely "has a hub",
# it is ORGANIZED AROUND one — every child is centripetal. A letterform cannot
# be centripetal without ceasing to be a letter, so transplanting a hub into
# the L fails on geometry, not taste: its node lands 38 units off center and
# reads as a bolted-on dot.
#
# So the parent does not imitate its children, it differs by CLASS. A contained
# mark beside five free-standing ones is INTENDED to read as the thing they
# live inside. Note the limit of that argument: the real containered-letter
# precedent (Facebook's f, Pinterest's P) is for PRODUCT marks, not parent
# marks, and a critic reports that "different class" and "doesn't belong" look
# identical here. Unresolved.
#
# TILE_BG was #25333C and that was a blocking defect: a near-black tile
# measures 1.28-1.46:1 against the dark grounds it has to sit on (GitHub dark,
# zinc-900, VS Code dark), so the container was invisible exactly where a
# container has to hold. Nothing dark can clear 3:1 against a dark ground —
# a visible container must be mid-tone. #526D7D is the deepest slate found that
# clears 3:1 on cream AND on every common dark ground; for a bedrock brand it
# is also more on-brief than near-black.
#
# The tile does NOT adapt to the color scheme. An app-icon tile is a brand
# constant; letting it follow `prefers-color-scheme` inverted it into a glaring
# bright block on dark. Only the ground behind a lockup and the wordmark shift.
TILE_BG = "#526D7D"      # >=3:1 on cream and on every common dark ground
TILE_INK = HALO          # the letter, reversed out of the tile
TILE_CHANNEL = GOLD      # 3.06:1 on the cream letter — and 1.61:1 on the tile,
                         # so it must never break out of the letter
TILE_R = 22              # 17% of 128. Vetrina's rect is rx 22.5% of its side,
                         # so the family's squircle is spoken for; this reads
                         # as an app-icon tile without borrowing that corner.
TILE_PAD = 11            # picked against a sweep: at 19 the letter floats and
                         # reads timid, at 8 it crowds the corners by 24px.
TILE_DX = 3              # nudge right. An L's center of MASS sits 13.3 units
                         # left of its bbox center (stem 20x84 at x-center 10,
                         # arm 48x16 at 44), so a bbox-centerd letter reads as
                         # drifting left against the tile's corners. Full mass
                         # centering would be far too much; 3 is the correction
                         # that looked right, and it applies to the TILE only —
                         # the bare mark is the drawing itself and stays
                         # centerd in its own box.

# ── The drawing ────────────────────────────────────────────────────────
# FINAL is the mark. MIN keeps the same silhouette and drops the channel —
# below ~28px it is under 1px and only muddies the stem. It is a reduction of
# one drawing, never a second one.
#
# The channel is drawn at two widths, and that is an optical correction rather
# than a fudge. In the bare mark it is a VOID — it removes ink, so the ground
# floods it and it reads wider than its measure. In the tile it is a FILL —
# brass substitutes for cream and holds its own edge. Swept side by side at a
# common width, the void hollowed the letter into two rails at exactly the
# measure where the fill still read as an inlay.
FINAL = {"sw": 20, "H": 84, "A": 68, "arm": 0.80, "bracket": 0.52,
         "channel": 2.8, "tile_channel": 3.4, "inset": 15, "tail": 8, "dy": 3}
MIN = {**FINAL, "sw": 23, "channel": 0, "tile_channel": 0}


def _geom(p):
    ah = p["sw"] * p["arm"]
    x0 = 64 - p["A"] / 2
    base = 64 + p["H"] / 2 - p["dy"]
    return x0, base, base - p["H"], ah


def letter_d(p):
    x0, base, top, ah = _geom(p)
    sw, A = p["sw"], p["A"]
    br = sw * p["bracket"]
    xk, yk = x0 + sw, base - ah
    return (f'M{x0:.2f} {top:.2f} L{x0 + sw:.2f} {top:.2f} '
            f'L{xk:.2f} {yk - br:.2f} Q{xk:.2f} {yk:.2f} {xk + br:.2f} {yk:.2f} '
            f'L{x0 + A:.2f} {yk:.2f} L{x0 + A:.2f} {base:.2f} '
            f'L{x0:.2f} {base:.2f} Z')


def channel_d(p):
    """The channel's CENTERLINE. It is stroked, never outlined by hand.

    The previous seam was a hand-built polygon, and three separate defects came
    out of that one decision: it bulged to 113% at the crook (a round inner
    edge against a mitered outer one), its recess landed asymmetric because a
    hand-offset outline cannot be centerd, and it needed a taper parameter
    fitted by eye. A stroked centerline with a round linejoin holds a constant
    width around the bend and is symmetric by construction.
    """
    x0, base, top, ah = _geom(p)
    return (f'M{x0 + p["sw"] / 2:.2f} {top + p["inset"]:.2f} '
            f'L{x0 + p["sw"] / 2:.2f} {base - ah / 2:.2f} '
            f'L{x0 + p["A"] - p["tail"]:.2f} {base - ah / 2:.2f}')


def _stroke(d, w, **attrs):
    # rstrip the trailing underscore FIRST: `class_` is Python's escape for the
    # reserved word, and replacing every underscore turned it into `class-`, a
    # attribute nothing reads. The bare mark's channel then inherited no stroke
    # and was not painted at all — a solid L that looked like a design choice.
    a = "".join(f' {k.rstrip("_").replace("_", "-")}="{v}"'
                for k, v in attrs.items())
    return (f'<path d="{d}" fill="none" stroke-width="{w:.2f}" '
            f'stroke-linecap="butt" stroke-linejoin="round"{a}/>')


def mark(p=None, uid="lc"):
    """The bare letter, adaptive. The channel is a genuine HOLE, cut with a
    mask rather than painted in the ground's color.

    Painting it was the obvious approach and it is wrong: an SVG dropped on a
    page has no idea what is behind it. A channel stroked in this repo's own
    #101314 is a hair off on GitHub dark, visibly darker than zinc-900, and
    lighter than black — the drawing would only be correct on the one ground it
    was authored against. A mask shows whatever is actually there.
    """
    p = {**FINAL, **(p or {})}
    if not p["channel"]:
        return f'<path d="{letter_d(p)}" class="sf"/>'
    return (f'<mask id="{uid}" maskUnits="userSpaceOnUse" x="0" y="0" '
            f'width="128" height="128">'
            f'<rect width="128" height="128" fill="#fff"/>'
            f'{_stroke(channel_d(p), p["channel"], stroke="#000")}</mask>'
            f'<path d="{letter_d(p)}" class="sf" mask="url(#{uid})"/>')


def tile(p=None):
    """The letter reversed out of a fixed tile, with the channel in brass."""
    p = {**FINAL, **(p or {})}
    o = [f'<path d="{letter_d(p)}" fill="{TILE_INK}"/>']
    if p["tile_channel"]:
        o.append(_stroke(channel_d(p), p["tile_channel"], stroke=TILE_CHANNEL))
    f = (128 - 2 * TILE_PAD) / 128
    return (f'<rect x="0" y="0" width="128" height="128" rx="{TILE_R}" '
            f'fill="{TILE_BG}"/>'
            f'<g transform="translate({TILE_PAD + TILE_DX * f:.2f} {TILE_PAD}) '
            f'scale({f:.4f})">{"".join(o)}</g>')


STYLE = (f'<style>.sf{{fill:{STONE}}}'
         f'@media(prefers-color-scheme:dark){{.sf{{fill:{STONE_DM}}}}}</style>')


def svg(inner, w=128, h=128, style=STYLE):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'fill="none">{style}{inner}</svg>\n')


# ── The lockup ─────────────────────────────────────────────────────────
# The wordmark is an OUTLINE, not live `<text>`. Measured in real Chromium,
# "Laticent" at font-size 70 / 600 / letter-spacing -1 spans 219.6 to 315.9
# units across the family's own fallback chain, so no fixed allotment is both
# tight and safe — the shipped 300 clipped DejaVu Serif by 15.9. See
# outline-wordmark.py.
#
# The mark IS a letter, so in the bare form its foot sits on the wordmark's
# baseline — flat foot to flat foot, no overshoot (that is for curves). Two L's
# side by side that do NOT share a baseline is the thing the eye catches
# without being able to name it, and the first version of this file got it
# wrong: the mark hung 9.2px below the baseline at 2.1x cap height.
MARK_CAPS = 1.35          # the mark's height in cap heights (convention 1.2-1.6)
TILE_CAPS = 1.65          # the tile's height in cap heights. At 1.45 the tile
                          # reads subordinate to the word; at 1.90 it swamps it.
GAP_CAPS = 0.42           # space to the wordmark, in cap heights
BASELINE = 88.0
PAD = 4.0
MARK_INK = (19.0, 103.0)  # the mark's own ink bbox in y (top, foot)
MARK_INK_X = 98.0         # ... and its right edge

# A tile is not a letter, so it shares no baseline — it is centerd on the
# wordmark's CAP BAND instead, which puts equal tile above the cap line and
# below the baseline. Dropping it toward the word's center of mass (measured
# at 71.2, because "Laticent" is mostly lowercase and the x-height band sits
# low in the cap band) looked plausible in isolation and visibly sagged once
# the options were seen side by side.
TILE_CENTER = BASELINE - CAP_H / 2


def lockup(scheme, form="tile"):
    if form == "tile":
        th = TILE_CAPS * CAP_H
        sc, ty = th / 128, TILE_CENTER - th / 2
        tx = PAD + th + GAP_CAPS * CAP_H
        art = tile()
    else:
        sc = (MARK_CAPS * CAP_H) / (MARK_INK[1] - MARK_INK[0])
        ty = BASELINE - MARK_INK[1] * sc          # the mark's foot ON the baseline
        tx = PAD + MARK_INK_X * sc + GAP_CAPS * CAP_H
        art = mark(uid="laticent-cut-lockup")
    dark = scheme == "dark"
    st = f'<style>.sf{{fill:{STONE_DM if dark else STONE}}}</style>' 
    return svg(
        f'<g transform="translate({PAD} {ty:.2f}) scale({sc:.4f})">{art}</g>'
        f'<g transform="translate({tx:.2f} {BASELINE})">'
        f'<path d="{PATH}" fill="{WM_DM if dark else WM}"/></g>',
        w=round(tx + INK_W + PAD), style=st)


def assert_invariants():
    """Prove the two constraints from the numbers instead of trusting the
    drawing. Both were carried as prose before and both were wrong: SAFE_R
    claimed 54 while the letter measured 56.4, and the channel's containment
    was never checked at all.

    1. The channel never breaks out of the letter. Gold measures 1.61:1
       against the tile — under the 3:1 graphical floor — so the tile's
       channel reads only while cream surrounds it on every side.
    2. Nothing in a free-standing mark is painted past SAFE_R, so a round
       avatar crop cannot amputate it.
    """
    p = FINAL
    x0, base, top, ah = _geom(p)
    half = max(p["channel"], p["tile_channel"]) / 2
    margins = {
        "left of stem": p["sw"] / 2 - half,
        "right of stem": p["sw"] / 2 - half,
        "above arm": ah / 2 - half,
        "below arm": ah / 2 - half,
        "channel head below stem top": p["inset"] - half,
        "channel tail short of arm end": p["tail"] - half,
    }
    bad = {k: round(v, 2) for k, v in margins.items() if v < 1.0}
    if bad:
        raise SystemExit(f"channel breaks out of the letter: {bad}")

    # Every corner of every variant, against the avatar circle.
    worst = 0.0
    for variant in (FINAL, MIN):
        vx0, vbase, vtop, _ = _geom(variant)
        for x in (vx0, vx0 + variant["A"]):
            for y in (vtop, vbase):
                worst = max(worst, ((x - 64) ** 2 + (y - 64) ** 2) ** 0.5)
    if worst > SAFE_R:
        raise SystemExit(f"mark paints {worst:.1f} from center, past SAFE_R {SAFE_R}")
    return margins, worst


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def emit(d=OUT):
    os.makedirs(d, exist_ok=True)
    margins, worst_r = assert_invariants()
    assets = {
        "laticent-tile.svg": svg(tile()),
        "laticent-tile-min.svg": svg(tile(MIN)),
        "laticent-mark.svg": svg(mark(uid="laticent-cut")),
        "laticent-mark-min.svg": svg(mark(MIN)),
        "laticent-lockup.svg": lockup("light"),
        "laticent-lockup-dark.svg": lockup("dark"),
        "laticent-lockup-bare.svg": lockup("light", form="bare"),
        "laticent-lockup-bare-dark.svg": lockup("dark", form="bare"),
    }
    for name, text in assets.items():
        write(os.path.join(d, name), text)
    print(f"wrote {len(assets)} master assets to {d}")
    print("  channel margins inside the letter: "
          + ", ".join(f"{k} {v:.1f}" for k, v in margins.items()))
    print(f"  furthest paint from center: {worst_r:.1f} "
          f"(SAFE_R {SAFE_R}, avatar circle 64)")


if __name__ == "__main__":
    emit(sys.argv[1] if len(sys.argv) > 1 else OUT)
