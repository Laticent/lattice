#!/usr/bin/env python3
"""Geometry audit: how far does any painted point sit from the mark's center?

Two crops matter in production:
  r <= 64.0  a round avatar (GitHub org, Slack) — anything beyond is cut off
  r <= 51.2  the Android maskable safe circle (80% of the 128 box)

Also reports the bounding box, so a mark that sits off-center in its own frame
shows up as unequal margins rather than having to be spotted by eye.
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
    for m in re.finditer(r'<path d="([^"]+)"[^>]*?(?:stroke-width="([\d.]+)")?[^>]*?/>', svg):
        sw = float(m.group(2) or 0) / 2
        for a, b in re.findall(r'([-\d.]+)\s+([-\d.]+)', m.group(1)):
            x, y = float(a), float(b)
            out += [(x - sw, y - sw), (x + sw, y + sw)]
    return out


def audit(path):
    with open(path, encoding="utf-8") as fh:
        svg = fh.read()
    p = pts(svg)
    if not p:
        return None
    rmax = max(math.hypot(x - C, y - C) for x, y in p)
    xs = [x for x, _ in p]; ys = [y for _, y in p]
    return dict(r=rmax, x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys),
                kb=os.path.getsize(path) / 1024)


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
        av = "CLIP" if a["r"] > 64.0 else "ok"
        mk = "over" if a["r"] > 51.2 else "ok"
        bad += a["r"] > 64.0
        print(f"{os.path.basename(f):26s} {a['r']:6.1f} {av:>7s} {mk:>6s} "
              f"{a['x0']:6.1f}..{a['x1']:5.1f} {a['y0']:6.1f}..{a['y1']:5.1f} {a['kb']:5.1f}")
    print(f"\n{bad} mark(s) clipped by a round avatar crop.")
