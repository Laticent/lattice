#!/usr/bin/env python3
"""Laticent org mark — the incised L. Run: python3 generate.py

An L with the load path cut into it, running down the stem and turning out
along the arm.

  latus  (broad, expansive)   NOT expressed. An earlier version of this
                              docstring claimed the arm carried it — "a
                              Garamond L is nearer 0.60 of its cap; this is
                              0.81, so the letter's own stance is broad." That
                              is backwards. EB Garamond's L measures 0.847 by
                              pixel scan; every serif measured runs 0.74-0.93
                              and this mark's 0.810 is mid-range. The claim is
                              withdrawn, not replaced. Table in README.md.
  latere (the hidden bedrock) the load path is INCISED rather than drawn on —
                              present but recessive, the structure that carries
                              the letter, never shouting.

THE GROOVE IS A DARKER VALUE OF THE LETTER, NOT A HOLE

This is the difference between reading as an incision and reading as an
outline, and it was got wrong three times:

  brass seam on slate      1.23:1 on dark — the same value, different hue. The
                           letter read as two disconnected pieces and went flat
                           in grayscale.
  brass in a ground recess five bands across a 20-unit stem, and on dark the
                           recess IS the ground, so it severed the letter into
                           two floating rails rather than framing the seam.
  a hole cut to the ground identical value on BOTH SIDES of the contour, which
                           cannot signal depth — only edge. It read as a hollow
                           inline L or a corner bracket at every size, and below
                           48px stayed a spindly bracket instead of settling
                           into a letter.

A cut in a surface is darker than the surface. The groove measures 1.41:1
against the letter in light and 2.17:1 in dark — deliberately BELOW the 3:1
graphical floor, because it models depth and carries no information. The LETTER
holds 10.6:1 (cream) and 8.5:1 (dark) against the ground, and the mark is fully
legible with the groove invisible. Every earlier attempt failed by insisting the
channel clear 3:1, which is exactly what turns it into a stripe.

In the tile the same groove is brass, at 3.06:1 against the cream letter.

It is a STROKED CENTERLINE, never outlined by hand, and CLIPPED to the letter
in both forms. The original seam was a hand-built polygon and three defects came
out of that one decision: a 113% bulge at the crook (round inner edge against a
mitered outer one), a recess that could not land symmetric, and a taper fitted
by eye.

WHY THIS LETTER AND NOT TWO RECTANGLES

Each move was picked against a rendered sweep in both schemes.

  stem at 20 of an 84 cap  0.24. At 25 (0.30) it read as machined angle iron;
                           at 16 it went wiry by 24px.
  arm at 68                at 76 it read as a bracket or a carpenter's square at
                           EVERY stem weight. Note the limit of that: real serif
                           L's reach 0.93 and stay letters, so this is a fact
                           about this monoline drawing, not a general one.
  arm lighter than stem    ah = sw * 0.80. A horizontal of equal measure reads
                           heavier than a vertical.
  bracketed crook          a quadratic transition from stem to arm, not a dead
                           90-degree miter. What makes it read as drawn.
  no stem taper            a 3.5-unit slope over 84 never lands on the pixel
                           grid, so the mark's most prominent vertical rendered
                           fuzzy at 48px while the right edge stayed razor
                           sharp. Craft that costs sharpness is not craft.

WHAT IS ASSERTED HERE RATHER THAN CLAIMED

assert_invariants() proves four things from the geometry, and every arm was
mutation-tested until it fired. Two of them were previously carried as prose and
both were wrong in prose; a third was tautological on its first attempt and
could not fail. Read that function before trusting any number in this file.

READ README.md's "Known limits" BEFORE adding a claim here. Three
justifications in these documents turned out to be composed rather than checked,
and all three were the load-bearing sentence of their section.
"""
import os
import re
import sys

from wordmark import CAP_H, DESCENT, INK_W, PATH

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette — the achromatic parent among chromatic children ───────────
# The five products each carry one hue plus a shared warm gold. The parent
# takes no product hue, so it reads as the root rather than a sixth sibling.
STONE, STONE_DM = "#2C3A43", "#9DB2BE"
# The groove: a darker value OF THE LETTER, not a second brand colour. It
# models depth and carries no information, so it is deliberately below the 3:1
# graphical floor — the LETTER holds 10.6:1 (cream) and 8.5:1 (dark) against
# the ground, and the mark is fully legible with the groove invisible. Pushing
# it to 3:1 would make it a stripe again.
GROOVE, GROOVE_DM = "#16202A", "#5E7684"
GOLD, GOLD_DM = "#C67A12", "#F6B64A"
HALO, HALO_DM = "#F6F3EC", "#101314"
WM, WM_DM = "#241F1B", "#E6E2DD"

# A round avatar crop (GitHub org, Slack) is a circle of radius 64. SAFE_R is
# that circle with a ~10% margin for platforms that crop a shade tighter, and
# assert_invariants() ENFORCES it — the previous 54 was a docstring claim
# nothing checked, and the letter had grown past it to 56.4 unnoticed. The
# five product marks measure 41-61 by the same audit.
SAFE_R = 58.0
MASKABLE_R = 51.2        # 0.4 x 128 — the Android adaptive-icon safe circle

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
                         # arm 48x16 at 44), so a bbox-centered letter reads as
                         # drifting left against the tile's corners. Full mass
                         # centering would be far too much; 3 is the correction
                         # that looked right. It applies to the TILE only, and
                         # the stated reason for that does NOT follow from the
                         # premise: if bbox-centering makes an L drift left it
                         # does so free-standing too. The real reason is narrower
                         # — the drift is only VISIBLE against the tile's
                         # corners, and the bare mark's box is the coordinate
                         # system every consumer measures from, so shifting it
                         # would move the drawing relative to its own viewBox.

# ── The drawing ────────────────────────────────────────────────────────
# FINAL is the mark. MIN is the same drawing with the groove dropped: at 3.4
# units in a 128 box the groove falls under one device pixel at 128/3.4 = 38px
# and stops reading well before that, so below ~46px it only muddies the stem.
# ("~28px" stood here and in the README for two revisions and was arithmetic
# nobody did.) The ~46 is a judgment on top of the 38, not a derivation, and it
# is DPR-blind — at 2x the groove survives smaller than this rule allows.
FINAL = {"sw": 20, "H": 84, "A": 68, "arm": 0.80, "bracket": 0.52,
         "channel": 3.4, "inset": 15, "tail": 8, "dy": 3}
# MIN differs from FINAL by the groove and NOTHING else. It carried sw: 23 —
# a 15% heavier stem, which also widened the arm and the bracket — left over
# from the retired hole design, where a channel that REMOVED ink needed
# compensating. No rationale for 23 survived anywhere in this file, the README,
# the decision note or the changelog, while all three called MIN a "reduction"
# and "the same silhouette". Verified at 16px: sw 20 holds, so the claim is now
# simply true rather than nearly true.
MIN = {**FINAL, "channel": 0}


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


def outline_pts(p):
    """The letter's actual painted vertices.

    NOT the bounding-box corners: an L has no ink at its top-right, so a bbox
    corner over-reports how far the drawing reaches. Measuring the bbox put the
    tile's content at 48.2 against audit.py's real 45.3 — a gate disagreeing
    with the tool it exists to pre-empt is worse than no gate.
    """
    x0, base, top, ah = _geom(p)
    sw, A = p["sw"], p["A"]
    yk = base - ah
    return [(x0, top), (x0 + sw, top), (x0 + sw, yk), (x0 + A, yk),
            (x0 + A, base), (x0, base)]


def channel_d(p):
    """The channel's CENTERLINE. It is stroked, never outlined by hand.

    The previous seam was a hand-built polygon, and three separate defects came
    out of that one decision: it bulged to 113% at the crook (a round inner
    edge against a mitered outer one), its recess landed asymmetric because a
    hand-offset outline cannot be centered, and it needed a taper parameter
    fitted by eye. A stroked centerline with a round linejoin holds a constant
    width around the bend and is symmetric by construction.
    """
    x0, base, top, ah = _geom(p)
    return (f'M{x0 + p["sw"] / 2:.2f} {top + p["inset"]:.2f} '
            f'L{x0 + p["sw"] / 2:.2f} {base - ah / 2:.2f} '
            f'L{x0 + p["A"] - p["tail"]:.2f} {base - ah / 2:.2f}')


def _stroke(d, w, **attrs):
    # rstrip the trailing underscore FIRST: `class_` is Python's escape for the
    # reserved word, and replacing every underscore turns it into `class-`,
    # which nothing reads. That shipped once: the bare mark's channel inherited
    # no stroke and was never painted, and the solid L it produced was mistaken
    # for a design choice through a whole review cycle.
    a = "".join(f' {k.rstrip("_").replace("_", "-")}="{v}"'
                for k, v in attrs.items())
    return (f'<path d="{d}" fill="none" stroke-width="{w:.2f}" '
            f'stroke-linecap="butt" stroke-linejoin="round"{a}/>')


def mark(p=None, uid="lat-clip"):
    """The bare letter, adaptive, with the load path cut into it.

    The groove is a DARKER VALUE of the letter, not a hole to the ground, and
    that is the whole difference between reading as an incision and reading as
    an outline. A hole shows the same ground as the field around the letter, so
    the contour has identical value on both sides — which cannot signal depth,
    only edge. Rendered, the masked version read as a hollow inline L or a
    corner bracket at every size, and at 48px and below it stayed a spindly
    hollow bracket instead of settling into a letter. A cut in a surface is
    darker than the surface; that is what the eye reads as a cut.

    It is CLIPPED to the letter rather than fitted to it, so the groove
    physically cannot escape the shape it is cut into.
    """
    p = {**FINAL, **(p or {})}
    d = letter_d(p)
    if not p["channel"]:
        return f'<path d="{d}" class="lat-sf"/>'
    return (f'<clipPath id="{uid}"><path d="{d}"/></clipPath>'
            f'<path d="{d}" class="lat-sf"/>'
            f'<g clip-path="url(#{uid})">'
            f'{_stroke(channel_d(p), p["channel"], class_="lat-gv")}</g>')


def tile(p=None, uid="laticent-tile-cut"):
    """The letter reversed out of a fixed tile, with the channel in brass."""
    p = {**FINAL, **(p or {})}
    d = letter_d(p)
    o = [f'<path d="{d}" fill="{TILE_INK}"/>']
    if p["channel"]:
        # Clipped, like the bare mark. The README promised this for BOTH forms
        # and only mark() did it — backwards, because the tile is the form where
        # escape actually hurts: brass on the tile ground is 1.61:1, under the
        # graphical floor, so the groove reads only while cream surrounds it.
        # assert_invariants() catches a bad inset or tail, but a claimed second
        # layer that does not exist is worse than an honest single one.
        o.append(f'<clipPath id="{uid}"><path d="{d}"/></clipPath>'
                 f'<g clip-path="url(#{uid})">'
                 + _stroke(channel_d(p), p["channel"], stroke=TILE_CHANNEL)
                 + '</g>')
    f = (128 - 2 * TILE_PAD) / 128
    return (f'<rect x="0" y="0" width="128" height="128" rx="{TILE_R}" '
            f'fill="{TILE_BG}"/>'
            f'<g transform="translate({TILE_PAD + TILE_DX * f:.2f} {TILE_PAD}) '
            f'scale({f:.4f})">{"".join(o)}</g>')


# An inline <svg><style> in an HTML document is DOCUMENT-scoped, not
# SVG-scoped. Two of these assets inlined on one page — a brand page showing
# the set is exactly that surface — had `laticent-lockup-dark.svg`'s bare
# `.sf{fill:#9DB2BE}` win on source order over `laticent-mark.svg`'s
# media-queried rule, painting the light-mode mark at 1.99:1 on cream. Three
# consequences, all handled here: the class names are prefixed so a host page's
# own `.sf` cannot collide; only the ADAPTIVE assets carry a <style> at all
# (the single-scheme lockups and the fixed tile paint by attribute); and an
# asset with no groove does not ship the groove rule, because a dead rule in a
# document-scoped stylesheet is still a live rule for everything else on the
# page.
def style_for(p):
    rules = [f'.lat-sf{{fill:{STONE}}}']
    dark = [f'.lat-sf{{fill:{STONE_DM}}}']
    if p["channel"]:
        rules.append(f'.lat-gv{{stroke:{GROOVE}}}')
        dark.append(f'.lat-gv{{stroke:{GROOVE_DM}}}')
    return (f'<style>{"".join(rules)}'
            f'@media(prefers-color-scheme:dark){{{"".join(dark)}}}</style>')


def svg(inner, w=128, h=128, style=""):
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
PAD = 4.0
# DERIVED, never hand-copied. These were literals — 19.0 / 103.0 / 98.0 — that
# happened to match _geom(FINAL) at the time. Nothing tied them together, so
# changing H walked the mark off the wordmark's baseline in silence: at H=60 the
# foot landed 9.45 units low, which is the same defect (9.2px) the baseline fix
# was written to cure, returning through the back door.
_MX0, _MBASE, _MTOP, _ = _geom(FINAL)
MARK_INK = (_MTOP, _MBASE)   # the mark's own ink bbox in y (top, foot)
MARK_INK_X = _MX0 + FINAL["A"]

# A tile is not a letter, so it shares no baseline — lockup() centers it on the
# wordmark's CAP BAND, which puts equal tile above the cap line and below the
# baseline. Dropping it toward the word's center of mass (measured at 71.2,
# because "Laticent" is mostly lowercase and the x-height band sits low in the
# cap band) looked plausible in isolation and visibly sagged side by side.
# There is no BASELINE constant any more: lockup() SOLVES for the baseline that
# centers the whole ink box in 128, which is what fixed the bare lockup's
# 27.50-left / 4.75-right padding.


def lockup(scheme, form="tile"):
    """Mark + wordmark, padded by INK on all four sides.

    The first version padded asymmetrically without anyone noticing: PAD went
    to the mark's BOX origin on the left, but to the wordmark's INK on the
    right. The bare mark's ink starts 30 units into its own 128 box, so the
    bare lockup shipped with 27.50 units of space on the left against 4.75 on
    the right — 5.8x — and 39.00 below against 21.75 above. Any consumer
    centering the SVG in a container rendered it shoved right and floating
    high, and it broke this file's own one-stem-width clear-space rule.

    Everything below is therefore computed from the ink box, and the height
    stays at the family's 128 with the content centred in it.
    """
    if form == "tile":
        th = TILE_CAPS * CAP_H
        sc = th / 128
        mark_w, ink_top, ink_bot = th, 0.0, th
        art = tile(uid="laticent-tile-cut-lockup"
                   + ("-dark" if scheme == "dark" else ""))
        box_dx = 0.0
    else:
        sc = (MARK_CAPS * CAP_H) / (MARK_INK[1] - MARK_INK[0])
        mark_w = (MARK_INK_X - _MX0) * sc
        ink_top, ink_bot = 0.0, (MARK_INK[1] - MARK_INK[0]) * sc
        art = mark(uid="laticent-cut-lockup" + ("-dark" if scheme == "dark" else ""))
        box_dx = -_MX0 * sc          # put the mark's INK at PAD, not its box

    tx = PAD + mark_w + GAP_CAPS * CAP_H
    width = round(tx + INK_W + PAD)

    # Vertical: the wordmark's baseline is what the mark aligns to, so solve for
    # the baseline that centres the whole ink box in 128 rather than fixing it.
    word_top, word_bot = -CAP_H, DESCENT
    if form == "tile":
        top, bot = min(ink_top - th / 2, word_top), max(ink_bot - th / 2, word_bot)
    else:
        top, bot = min(ink_top - ink_bot, word_top), max(0.0, word_bot)
    baseline = (128 - (bot - top)) / 2 - top
    # The tile is centred on the baseline; the bare mark's FOOT sits on it, so
    # its offset is the ink's bottom COORDINATE in the 128 box, not the mark's
    # height. Using the height put the foot 14.95 units low — caught by the
    # invariant that reads the emitted SVG, which is what it is for.
    ty = baseline - (th / 2 if form == "tile" else MARK_INK[1] * sc)

    dark = scheme == "dark"
    art = (art.replace('class="lat-sf"', f'fill="{STONE_DM if dark else STONE}"')
              .replace('class="lat-gv"', f'stroke="{GROOVE_DM if dark else GROOVE}"'))
    return svg(
        f'<g transform="translate({PAD + box_dx:.2f} {ty:.2f}) scale({sc:.4f})">'
        f'{art}</g>'
        f'<g transform="translate({tx:.2f} {baseline:.2f})">'
        f'<path d="{PATH}" fill="{WM_DM if dark else WM}"/></g>',
        w=width, style="")


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
    half = p["channel"] / 2
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

    # Every painted vertex of every variant, against the avatar circle.
    worst = max(((x - 64) ** 2 + (y - 64) ** 2) ** 0.5
                for variant in (FINAL, MIN) for x, y in outline_pts(variant))
    if worst > SAFE_R:
        raise SystemExit(f"mark paints {worst:.1f} from center, past SAFE_R {SAFE_R}")

    # 3. The bare lockup's mark sits ON the wordmark's baseline, at a height
    #    inside the 1.2-1.6 cap-height convention.
    #
    #    This reads the EMITTED SVG rather than recomputing from MARK_INK.
    #    Checking the model against itself was the first attempt and it was
    #    tautological — MARK_INK is derived from _geom, so `BASELINE - foot*sc
    #    + foot*sc` is algebraically BASELINE and the assertion could not fail
    #    however badly the lockup was broken. Mutation-testing caught that: six
    #    arms fired and this one was inert. Parsing the artifact catches a wrong
    #    transform, a wrong scale, or a wrong MARK_INK, none of which the
    #    model-side version could see.
    art = lockup("light", form="bare")
    base_re = re.search(r'<g transform="translate\([\d.-]+ ([\d.-]+)\)">\s*<path d="M', art)
    g = re.search(r'<g transform="translate\(([\d.-]+) ([\d.-]+)\) '
                  r'scale\(([\d.]+)\)">', art)
    if not g:
        raise SystemExit("could not find the mark's transform in the bare lockup")
    ty, sc = float(g.group(2)), float(g.group(3))
    # The letter is the first path inside that <g>. Match it by position, not
    # by class: the lockup substitutes a fill attribute for the class, so a
    # class selector silently matches nothing here.
    letter = re.search(r'<g transform="translate[^>]+>.*?<path d="([^"]+)"',
                       art, re.S)
    if not letter:
        raise SystemExit("could not find the mark's letter path in the bare lockup")
    ink_bottom = max(float(m) for m in
                     re.findall(r'[ML][\d.-]+ ([\d.-]+)', letter.group(1)))
    foot = ty + ink_bottom * sc
    baseline = float(base_re.group(1)) if base_re else None
    if baseline is None:
        raise SystemExit("could not find the wordmark's baseline in the bare lockup")
    if abs(foot - baseline) > 0.01:
        raise SystemExit(f"lockup mark's foot lands at {foot:.2f}, "
                         f"the wordmark's baseline is {baseline}")
    caps = (MARK_INK[1] - MARK_INK[0]) * sc / CAP_H
    if not 1.2 <= caps <= 1.6:
        raise SystemExit(f"lockup mark is {caps:.2f} cap heights, "
                         f"convention is 1.2-1.6")

    # 4. The TILE's content clears the Android maskable safe circle. This is the
    #    one measurement the tile's justification rests on, and it was produced
    #    only by audit.py — which is wired to no npm script, no hook and no CI
    #    job. Asserting it here needs no change to the CI contract.
    f = (128 - 2 * TILE_PAD) / 128
    tile_r = max(((TILE_PAD + TILE_DX * f + x * f - 64) ** 2
                  + (TILE_PAD + y * f - 64) ** 2) ** 0.5
                 for variant in (FINAL, MIN) for x, y in outline_pts(variant))
    if tile_r > MASKABLE_R:
        raise SystemExit(f"tile content reaches {tile_r:.1f}, past the "
                         f"maskable circle {MASKABLE_R}")
    return margins, worst, tile_r, caps


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def emit(d=OUT):
    os.makedirs(d, exist_ok=True)
    margins, worst_r, tile_r, caps = assert_invariants()
    assets = {
        "laticent-tile.svg": svg(tile(uid="laticent-tile-cut")),
        "laticent-tile-min.svg": svg(tile(MIN, uid="laticent-tile-min-cut")),
        "laticent-mark.svg": svg(mark(uid="laticent-mark-cut"),
                                 style=style_for(FINAL)),
        "laticent-mark-min.svg": svg(mark(MIN, uid="laticent-mark-min-cut"),
                                     style=style_for(MIN)),
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
    print(f"  tile content reaches {tile_r:.1f} of the maskable circle {MASKABLE_R}; "
          f"lockup mark is {caps:.2f} cap heights, foot on the baseline")


if __name__ == "__main__":
    emit(sys.argv[1] if len(sys.argv) > 1 else OUT)
