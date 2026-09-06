#!/usr/bin/env python3
"""Geometry audit: how far does any painted point sit from the mark's center?

Two crops matter in production:
  r <= 64.0  a round avatar (GitHub org, Slack) — anything beyond is cut off
  r <= 51.2  the Android maskable safe circle (80% of the 128 box)

Also reports the bounding box, so a mark that sits off-center in its own frame
shows up as unequal margins rather than having to be spotted by eye.

A TILE is judged differently, and the distinction is the whole point of this
file being a script rather than an opinion. A free-standing mark must stay
inside the crop. A tile is a full-bleed container that is MEANT to be cropped
by the mask — flagging its corners is a false failure — so what gets measured
is the content sitting inside it, against the maskable safe circle. A tile is
detected by the full-bleed rounded rect it opens with.
"""
import glob, math, os, re, sys

C = 64.0


def pts(svg):
    """Every painted extreme point, stroke width included."""
    out = []
    for m in re.finditer(r'<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"'
                         r'[^>]*?(?:stroke-width="([\d.]+)")?[^>]*?/>', svg):
        x, y, w, h = (float(m.group(i)) for i in (1, 2, 3, 4))
        sw = float(m.group(5) or 0) / 2
        out += [(x - sw, y - sw), (x + w + sw, y - sw),
                (x - sw, y + h + sw), (x + w + sw, y + h + sw)]
    for m in re.finditer(r'<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"'
                         r'[^>]*?stroke-width="([\d.]+)"', svg):
        x1, y1, x2, y2, sw = (float(m.group(i)) for i in range(1, 6))
        r = sw / 2
        out += [(x1 - r, y1 - r), (x1 + r, y1 + r), (x2 - r, y2 - r), (x2 + r, y2 + r)]
    for m in re.finditer(r'<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"', svg):
        cx, cy, r = (float(m.group(i)) for i in (1, 2, 3))
        out += [(cx - r, cy - r), (cx + r, cy + r)]
    # The stroke-width group must be searched INSIDE the matched tag. Making it
    # optional inline let the lazy [^>]*? satisfy the pattern without ever
    # reaching it, so every path reported stroke-width None and the recess's
    # 2.4 was silently dropped — a gate that under-reports, which this file's
    # own docstring calls worse than no gate.
    for m in re.finditer(r'<path\b([^>]*)/>', svg):
        tag = m.group(1)
        dm = re.search(r'\sd="([^"]+)"', tag)
        if not dm:
            continue
        swm = re.search(r'stroke-width="([\d.]+)"', tag)
        sw = float(swm.group(1)) / 2 if swm else 0.0
        for a, b in re.findall(r'([-\d.]+)\s+([-\d.]+)', dm.group(1)):
            x, y = float(a), float(b)
            out += [(x - sw, y - sw), (x + sw, y + sw)]
    return out


TILE_RE = re.compile(r'<rect x="0(?:\.0+)?" y="0(?:\.0+)?" width="128" height="128"[^>]*/>')


GROUP_RE = re.compile(
    r'<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">(.*?)</g>',
    re.S)


def pts_with_transforms(svg):
    """Points in user space. The tile nests the letter under a
    translate+scale, and ignoring it reported the letter's PRE-scaled
    coordinates — a wrong number from a gate is worse than no gate."""
    out = []
    rest = svg
    for m in GROUP_RE.finditer(svg):
        tx, ty, sc = float(m.group(1)), float(m.group(2)), float(m.group(3))
        out += [(tx + x * sc, ty + y * sc) for x, y in pts(m.group(4))]
        rest = rest.replace(m.group(0), '')
    return out + pts(rest)


def audit(path):
    with open(path, encoding="utf-8") as fh:
        svg = fh.read()
    is_tile = bool(TILE_RE.search(svg))
    if is_tile:
        # measure the CONTENT, not the container it is meant to be cropped from
        svg = TILE_RE.sub('', svg, count=1)   # drop it, do not zero it
    p = pts_with_transforms(svg)
    if not p:
        return None
    rmax = max(math.hypot(x - C, y - C) for x, y in p)
    xs = [x for x, _ in p]; ys = [y for _, y in p]
    return dict(r=rmax, x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys),
                kb=os.path.getsize(path) / 1024, tile=is_tile)


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else "final"
    print(f"{'file':26s} {'maxR':>6s} {'avatar':>7s} {'mask':>6s} "
          f"{'bbox x':>13s} {'bbox y':>13s} {'KB':>5s}")
    bad = 0
    for f in sorted(glob.glob(os.path.join(d, "*.svg"))):
        if "lockup" in f:
            continue
        a = audit(f)
        if not a:
            continue
        if a["tile"]:
            av = "tile"                       # full-bleed by design
            mk = "ok" if a["r"] <= 51.2 else "OVER"
            bad += a["r"] > 51.2              # the CONTENT must clear the mask
        else:
            av = "CLIP" if a["r"] > 64.0 else "ok"
            mk = "over" if a["r"] > 51.2 else "ok"
            bad += a["r"] > 64.0
        print(f"{os.path.basename(f):26s} {a['r']:6.1f} {av:>7s} {mk:>6s} "
              f"{a['x0']:6.1f}..{a['x1']:5.1f} {a['y0']:6.1f}..{a['y1']:5.1f} {a['kb']:5.1f}")
    print(f"\n{bad} asset(s) failing their crop rule "
          f"(marks: round avatar r<=64 · tiles: content inside the maskable r<=51.2).")
