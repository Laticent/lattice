#!/usr/bin/env python3
"""Laticent org mark — five candidate concepts. Run: python3 generate.py

Laticent is the parent of Lattice, Cadenza, Lente, Suono and Vetrina, so the
mark answers to the name before it answers to taste:

  latus  (broad, expansive)  -> the surface is the widest thing in the frame
  latere (the hidden bedrock) -> the load-bearing part recedes; it never shouts

Palette. The parent is the ACHROMATIC one among chromatic children: slate
structure plus the family's shared warm gold, and no product hue. That buys
differentiation from the five siblings without leaving the system.

Two constraints are enforced rather than eyeballed, because both were caught
failing during review and neither is visible at 128px:

  SAFE_R   nothing is painted more than 54 units from the center, so a round
           avatar crop (GitHub org, Slack) cannot amputate the mark. The
           existing family marks measure 41-61; `audit` keeps these under 61.

  grect()  gold and slate sit at 1.23:1 on dark — the same value, separated
           only by hue. Every gold element is therefore fenced from slate by a
           ground-color hairline, or placed so it only ever meets the ground.
           Without it the focal element dies in grayscale, in mono print and
           for a viewer with a color vision deficiency.

Each concept emits four assets: the adaptive mark, a minimal variant for
favicon sizes, and a light and a dark lockup.
"""
import math, os, sys

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette ────────────────────────────────────────────────────────────
STONE     = "#2C3A43"   # structure, light mode
STONE_DM  = "#9DB2BE"   # structure, dark mode
GOLD      = "#C67A12"   # family warm accent (libraries: .warm)
GOLD_DM   = "#F6B64A"
GOLD_DEEP = "#7A5A10"
HALO      = "#F6F3EC"   # family halo, light
HALO_DM   = "#101314"
WM        = "#241F1B"
WM_DM     = "#E6E2DD"

STYLE = (
    f'<style>.s{{stroke:{STONE}}}.sf{{fill:{STONE}}}.g{{stroke:{GOLD}}}'
    f'.gf{{fill:{GOLD}}}.g1{{fill:{GOLD}}}.g2{{fill:{GOLD_DEEP}}}.j{{stroke:#A6AFB4}}.h{{fill:{HALO}}}.hs{{stroke:{HALO}}}.wm{{fill:{WM}}}'
    f'@media(prefers-color-scheme:dark){{.s{{stroke:{STONE_DM}}}.sf{{fill:{STONE_DM}}}'
    f'.g{{stroke:{GOLD_DM}}}.gf{{fill:{GOLD_DM}}}.g1{{fill:{GOLD_DM}}}.g2{{fill:{GOLD}}}.j{{stroke:#4C585F}}.h{{fill:{HALO_DM}}}.hs{{stroke:{HALO_DM}}}'
    f'.wm{{fill:{WM_DM}}}}}</style>'
)


def svg(inner, vb="0 0 128 128"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" fill="none">'
            f'{STYLE}{inner}</svg>\n')


def line(x1, y1, x2, y2, w, cls="s", op=1.0, cap="round"):
    o = f' opacity="{op:.3f}"' if op < 1 else ""
    return (f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
            f'class="{cls}" stroke-width="{w:.2f}" stroke-linecap="{cap}"{o}/>')


def rect(x, y, w, h, cls="sf", op=1.0, r=0):
    o = f' opacity="{op:.3f}"' if op < 1 else ""
    rr = f' rx="{r}"' if r else ""
    return f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}"{rr} class="{cls}"{o}/>'


SAFE_R = 54.0   # every mark stays inside this radius of (64,64) so a round
                # avatar crop (GitHub org, Slack) cannot amputate it. The
                # existing family marks measure 41-61; nothing here exceeds 61.


def half(y, pad=0.0):
    """Widest half-extent allowed at height y by the safe circle."""
    dy = abs(y - 64) + pad
    return math.sqrt(max(0.0, SAFE_R ** 2 - dy ** 2))


def band(y, h, want):
    """Half-width for a bar spanning y..y+h, clamped to the safe circle."""
    return min(want, half(y), half(y + h))


def grect(x, y, w, h, ring=1.7):
    """A gold shape fenced off from the slate by a ground-colored hairline.
    Gold vs slate is 1.23:1 on dark, so without this the focal element is
    carried by hue alone and dies in grayscale, in mono print and for CVD."""
    return (f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
            f'class="hs" fill="none" stroke-width="{ring + 2.2:.2f}"/>'
            f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" class="gf"/>')


def circ(cx, cy, r, cls="gf", op=1.0, sw=None):
    o = f' opacity="{op:.3f}"' if op < 1 else ""
    s = f' stroke-width="{sw}"' if sw else ""
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" class="{cls}"{s}{o}/>'


# ══ A · DATUM ══════════════════════════════════════════════════════════
# A broad grade line (the visible surface, full width = latus) with the
# load path rooting DOWN and converging, fading with depth (= latere).
# One gold datum point: what everything is measured from.
def core(p=None):
    """A broad datum at the surface; beneath it the load concentrates into the
    ground, and one gold pile is driven through — off the center axis, because
    a centered staff crossing symmetric bars draws a papal cross.

    The pile sits BEHIND the strata: it shows above grade and in the gaps
    between courses, so the gold always meets the ground color and never the
    slate it only clears by 1.23:1 on dark.
    """
    p = p or {}
    gy    = p.get("gy", 44)
    gw    = p.get("gw", 7.5)
    rows  = p.get("rows", 3)
    ch    = p.get("ch", 15)
    gap   = p.get("gap", 6)
    w0    = p.get("w0", 46)          # half-width just under the surface
    w1    = p.get("w1", 28)          # half-width at depth
    fade  = p.get("fade", (0.90, 0.44))
    px    = p.get("px", 40)          # pile center — deliberately NOT 64
    pw    = p.get("pw", 11)
    head  = p.get("head", 18)
    lo, hi = fade
    o = []
    top = gy + gap + 2
    bot = top + (rows - 1) * (ch + gap) + ch
    cuts = [(gy - head, top)]
    for r in range(rows - 1):
        y = top + r * (ch + gap)
        cuts.append((y + ch, y + ch + gap))
    cuts.append((bot, bot + p.get("toe", 4)))
    for (y0, y1) in cuts:
        o.append(rect(px - pw / 2, y0, pw, y1 - y0, "gf"))
    for r in range(rows):
        f = r / max(1, rows - 1)
        y = top + r * (ch + gap)
        hw = band(y, ch, w0 + (w1 - w0) * f)
        o.append(rect(64 - hw, y, 2 * hw, ch, "sf", op=lo - (lo - hi) * f))
    o.append(line(64 - half(gy), gy, 64 + half(gy), gy, gw, cap="butt"))
    return "".join(o)


# ══ B · KEYSTONE ═══════════════════════════════════════════════════════
# The arch: the oldest load-bearing span. Gold keystone at the crown,
# piers rooting below the springing line into a fading footing.
def keystone(p=None):
    """An arch on piers, and the gold BELOW the grade line.

    The accent sits in the footing, not on the crown: the brand's claim is
    that the strength is beneath the surface, so putting the one saturated
    element on the celebrated apex said the opposite. It also moves the gold
    off a 25-degree wedge that dies at 32px onto a wide course that does not,
    and away from a slate neighbor it only cleared by 1.23:1 on dark.
    """
    p = p or {}
    cx = 64
    cy    = p.get("cy", 54)          # springing line
    R     = p.get("R", 42)
    t     = p.get("t", 12)           # voussoir depth
    n     = p.get("n", 7)            # odd, so one voussoir crowns the arch
    gap   = p.get("gap", 2.8)        # true joint, cut as geometry
    pier  = p.get("pier", 30)        # longer pier -> a taller opening
    imp   = p.get("imp", 2.0)        # impost projection at the springing
    gw    = p.get("gw", 6.5)
    raft  = p.get("raft", [(0.46, 9, "sf", 44), (1.0, 10, "gf", 34)])
    r = R - t
    o = []
    gy = cy + pier
    # footing courses, strictly widening with depth, clamped to the safe circle
    dy = 0
    for (op, h, cls, want) in raft:
        hw = band(gy + dy, h, want)
        if cls == "gf":
            o.append(grect(cx - hw, gy + dy, 2 * hw, h))
        else:
            o.append(rect(cx - hw, gy + dy, 2 * hw, h, "sf", op=op))
        dy += h
    o.append(line(cx - half(gy), gy, cx + half(gy), gy, gw, cap="butt"))
    for sx in (-1, 1):
        o.append(rect(cx - R if sx < 0 else cx + r, cy, t, pier, "sf"))
        o.append(rect((cx - R if sx < 0 else cx + r) - imp, cy - imp,
                      t + imp, imp * 2, "sf"))          # impost
    # voussoirs as real sectors: radial edges inset by gap/2, arcs at full
    # radius, so the silhouette stays smooth and no background-colored
    # overpaint is needed (that coupled the mark to its backdrop)
    step = 180.0 / n
    ga = math.degrees(gap / 2 / R)
    for i in range(n):
        o.append(voussoir(cx, cy, r, R, 180 - i * step - (ga if i else 0),
                          180 - (i + 1) * step + (ga if i < n - 1 else 0), "sf"))
    return "".join(o)


def voussoir(cx, cy, r, R, a0, a1, cls):
    """Annular sector from a0 to a1 (degrees, 0=east, CCW, y flipped).

    Built as a polygon rather than an SVG arc: the A command's large-arc /
    sweep flags pick between four candidate arcs and silently produced a
    mirrored band for a 180-degree span.
    """
    def pt(rad, ang):
        t = math.radians(ang)
        return (cx + rad * math.cos(t), cy - rad * math.sin(t))
    steps = max(6, int(abs(a0 - a1) / 2) + 2)
    outer = [pt(R, a0 + (a1 - a0) * i / steps) for i in range(steps + 1)]
    inner = [pt(r, a1 + (a0 - a1) * i / steps) for i in range(steps + 1)]
    d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in outer + inner) + " Z"
    return f'<path d="{d}" class="{cls}"/>'


# ══ C · SUBSTRATE ══════════════════════════════════════════════════════
# The engine you see is one cell. Beneath the grade line, the same
# structure continues, wider and quieter — the mass that carries it.
def substrate(p=None):
    """The grade line CUTS one cell: its apex shows, the rest is below.
    Under it, countable partial cells at a true 45 degrees, thinning and
    fading as they go down. The cell is mostly hidden — that is the point."""
    p = p or {}
    gy   = p.get("gy", 52)
    cell = p.get("cell", 18)         # half-diagonal, shared by apex and field
    aw   = p.get("aw", 7.0)          # apex stroke
    fw   = p.get("fw", 3.6)          # field stroke — thinner, so it recedes
    rows = p.get("rows", [3, 2])     # whole cells, countable
    fade = p.get("fade", (0.58, 0.30))
    cr   = p.get("cr", 6.5)
    lo, hi = fade
    o = []
    for r, count in enumerate(rows):
        cy = gy + cell + r * cell
        op = lo - (lo - hi) * (r / max(1, len(rows) - 1))
        span = (count - 1) * cell
        for k in range(count):
            x = 64 - span + 2 * k * cell
            o.append(diamond(x, cy, cell, fw, op))
    o.append(line(64 - half(gy), gy, 64 + half(gy), gy, p.get("gw", 7.0),
                  cap="butt"))
    # the apex: the visible sliver of a cell the grade line cuts through
    o.append(f'<path d="M{64 - cell:.2f} {gy:.2f} L64 {gy - cell:.2f} '
             f'L{64 + cell:.2f} {gy:.2f}" class="s" stroke-width="{aw:.2f}" '
             f'stroke-linecap="round" stroke-linejoin="round"/>')
    # the node sits ON the cut plane, haloed so it reads without relying on hue
    o.append(circ(64, gy, cr + p.get("halo", 3.0), "h"))
    o.append(circ(64, gy, cr, "gf"))
    return "".join(o)


def fdiamond(cx, cy, r, op):
    o = f' opacity="{op:.3f}"' if op < 1 else ""
    return (f'<path d="M{cx:.2f} {cy - r:.2f} L{cx + r:.2f} {cy:.2f} '
            f'L{cx:.2f} {cy + r:.2f} L{cx - r:.2f} {cy:.2f} Z" class="sf"{o}/>')


def diamond(cx, cy, r, w, op):
    o = f' opacity="{op:.3f}"' if op < 1 else ""
    return (f'<path d="M{cx:.2f} {cy - r:.2f} L{cx + r:.2f} {cy:.2f} '
            f'L{cx:.2f} {cy + r:.2f} L{cx - r:.2f} {cy:.2f} Z" class="s" '
            f'stroke-width="{w:.2f}" stroke-linejoin="round"{o}/>')


# ══ D · MONOGRAM ═══════════════════════════════════════════════════════
# L as a structure: a riser meeting a broad footing. The corner — where
# load transfers — is gold. Below the base, the strata that carry it.
def monogram(p=None):
    """L as structure: a riser landing on a plinth, gold at the load joint.

    The arm is barely longer than the riser is tall — at 1.44x it read as a
    carpenter's square, not a letter. Footing courses taper monotonically and
    are centered on the plinth, not on the frame.
    """
    p = p or {}
    t     = p.get("t", 19)
    x0    = p.get("x0", 34)
    top   = p.get("top", 14)
    base  = p.get("base", 74)
    over  = p.get("over", 0)
    arm   = p.get("arm", 1.06)       # arm length as a multiple of riser height
    strata = p.get("strata", [(0.52, 0.86, 8, 2), (0.28, 0.62, 6, 13)])
    riser = base - top
    right = x0 + arm * riser
    px0, pw = x0 - over, (right - x0) + over
    pc = px0 + pw / 2                 # the plinth's center — strata key off this
    o = []
    for (op, frac, h, dy) in strata:
        w = min(pw * frac, 2 * band(base + t + dy, h, 64))
        o.append(rect(pc - w / 2, base + t + dy, w, h, "sf", op=op))
    o.append(rect(x0, top, t, riser, "sf"))
    o.append(rect(px0, base, pw, t, "sf"))
    o.append(grect(x0, base, t, t))
    return "".join(o)


# ══ E · CORNERSTONE ════════════════════════════════════════════════════
# An isometric block of coursed stone. The visible joints are the
# structure; one cornerstone at the base carries the gold.
def cornerstone(p=None):
    """A broad coursed plinth with a finished top and one gold cornerstone.

    3 x 3 x 2, not a cube: an n-cubed grid with a single off-color cell is
    the definition of an unsolved twisty puzzle, and a cube states compactness
    where the brief wants breadth. Vertical edges are true isometric, and the
    top is a filled plane so "finished surface" reads as drawn rather than as
    a hole where the grid stopped.
    """
    p = p or {}
    sz  = p.get("s", 20)
    nx, ny, nz = p.get("nx", 3), p.get("ny", 3), p.get("nz", 2)
    ow  = p.get("ow", 5.0)
    iw  = p.get("iw", 2.8)
    cx, cy = 64, p.get("cy", 64)
    W = sz * math.cos(math.radians(30))
    H = sz * math.sin(math.radians(30))
    V = sz * p.get("vs", 1.0)

    def P(i, j, k):
        return (cx + (i - j) * W, cy + (i + j) * H - k * V)
    lo = P(0, 0, nz)[1]; hi = P(nx, ny, 0)[1]
    dy = cy - (lo + hi) / 2

    def Q(i, j, k):
        x, y = P(i, j, k); return (x, y + dy)

    o = []
    # the finished working surface, drawn as a positive plane
    tf = [Q(0, 0, nz), Q(nx, 0, nz), Q(nx, ny, nz), Q(0, ny, nz)]
    o.append('<path d="M' + " L".join(f"{x:.2f} {y:.2f}" for x, y in tf)
             + ' Z" class="h"/>')
    # the cornerstone, seated BEFORE the joints so its mortar reads full weight
    o.append(block(Q, nx - 1, ny - 1, 0, nz))
    for a in range(1, nz):                                   # bed joints
        o.append(seg(Q(nx, 0, a), Q(nx, ny, a), iw))
        o.append(seg(Q(0, ny, a), Q(nx, ny, a), iw))
    for a in range(1, ny):                                   # perpends, right
        o.append(seg(Q(nx, a, nz), Q(nx, a, 0), iw))
    for a in range(1, nx):                                   # perpends, left
        o.append(seg(Q(a, ny, nz), Q(a, ny, 0), iw))
    hexpts = [Q(0, 0, nz), Q(nx, 0, nz), Q(nx, 0, 0), Q(nx, ny, 0),
              Q(0, ny, 0), Q(0, ny, nz)]
    o.append('<path d="M' + " L".join(f"{x:.2f} {y:.2f}" for x, y in hexpts)
             + f' Z" class="s" stroke-width="{ow}" stroke-linejoin="round"/>')
    for a, b in ((Q(nx, 0, nz), Q(nx, ny, nz)), (Q(0, ny, nz), Q(nx, ny, nz)),
                 (Q(nx, ny, nz), Q(nx, ny, 0))):
        o.append(seg(a, b, ow))
    return "".join(o)


def seg(a, b, w, cls="j"):
    return (f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" '
            f'class="{"s" if w > 4 else cls}" stroke-width="{w:.2f}" '
            f'stroke-linecap="round"/>')


def block(Q, i, j, k, nz):
    """The visible faces of one sub-block. Faces are OPAQUE, two-tone gold:
    an alpha over ink let the mortar show through, and it inverted the
    implied light direction between the two color schemes."""
    top = [Q(i, j, k + 1), Q(i + 1, j, k + 1), Q(i + 1, j + 1, k + 1), Q(i, j + 1, k + 1)]
    rgt = [Q(i + 1, j, k + 1), Q(i + 1, j, k), Q(i + 1, j + 1, k), Q(i + 1, j + 1, k + 1)]
    lft = [Q(i, j + 1, k + 1), Q(i + 1, j + 1, k + 1), Q(i + 1, j + 1, k), Q(i, j + 1, k)]
    faces = [(lft, "g1"), (rgt, "g2")]
    if k + 1 >= nz:                      # top face only when nothing sits on it
        faces.insert(0, (top, "g1"))
    return "".join('<path d="M' + " L".join(f"{x:.2f} {y:.2f}" for x, y in f)
                   + f' Z" class="{c}"/>' for f, c in faces)


CONCEPTS = {"a-core": core, "b-keystone": keystone, "c-substrate": substrate,
            "d-monogram": monogram, "e-cornerstone": cornerstone}




# ── Minimal variants (favicon / app icon, <=24px) ──────────────────────
# Each drops its finest detail and thickens what carries the identity.
MIN = {
    "a-core":        (core,        {"rows": 2, "ch": 22, "gap": 9, "gy": 42,
                                    "w0": 46, "w1": 32, "pw": 14, "head": 18,
                                    "gw": 9, "px": 40, "fade": (0.90, 0.54)}),
    "b-keystone":    (keystone,    {"n": 1, "R": 43, "t": 14, "cy": 54,
                                    "pier": 30, "gw": 9, "imp": 3,
                                    "raft": [(1.0, 13, "gf", 40)]}),
    "c-substrate":   (substrate,   {"cell": 25, "aw": 9.5, "fw": 7.0, "gy": 54,
                                    "rows": [2], "fade": (0.50, 0.50),
                                    "cr": 8.5, "gw": 9.5, "halo": 3.4}),
    "d-monogram":    (monogram,    {"t": 24, "x0": 32, "top": 20, "base": 76,
                                    "over": 0, "strata": []}),
    "e-cornerstone": (cornerstone, {"s": 20, "nx": 2, "ny": 2, "nz": 1, "ow": 6.0, "iw": 0}),
}


def lockup(fn, params, style, wordmark="Laticent", width=470):
    """Mark + wordmark, matching the family lockup geometry exactly."""
    inner = fn(params or {})
    txt = WM if style == "light" else WM_DM
    stone = STONE if style == "light" else STONE_DM
    gold = GOLD if style == "light" else GOLD_DM
    halo = HALO if style == "light" else HALO_DM
    # lockups are fixed-scheme (the family ships a file per surface)
    st = (f'<style>.s{{stroke:{stone}}}.sf{{fill:{stone}}}.g{{stroke:{gold}}}'
          f'.gf{{fill:{gold}}}.h{{fill:{halo}}}.hs{{stroke:{halo}}}</style>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 128" '
            f'fill="none">{st}<g transform="translate(4 4) scale(0.9375)">{inner}</g>'
            f'<text x="150" y="67" dominant-baseline="central" font-family="{WMFONT}" '
            f'font-size="70" font-weight="600" letter-spacing="-1" '
            f'fill="{txt}">{wordmark}</text></svg>\n')


WMFONT = "Fraunces,'Cormorant Garamond',Georgia,serif"


def emit_all(tag):
    d = os.path.join(OUT, tag)
    os.makedirs(d, exist_ok=True)
    for name, fn in CONCEPTS.items():
        open(os.path.join(d, f"{name}.svg"), "w").write(svg(fn()))
        mfn, mp = MIN[name]
        open(os.path.join(d, f"{name}-min.svg"), "w").write(svg(mfn(mp)))
        for style in ("light", "dark"):
            sfx = "" if style == "light" else "-dark"
            open(os.path.join(d, f"{name}-lockup{sfx}.svg"), "w").write(
                lockup(fn, None, style))
    print("wrote full asset set →", d)


if __name__ == "__main__":
    emit_all(sys.argv[1] if len(sys.argv) > 1 else "candidates")
