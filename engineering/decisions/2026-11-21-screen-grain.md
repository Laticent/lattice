---
status: in-progress
summary: Safari (WebKit) does not dither CSS gradients, so a finish's dark glow draws as visible concentric bands in the HTML player and the Studio. A faint noise tile on the finish's mask layer (`--backdrop-grain`, a 32 px PNG, 0.7 KB of player CSS) removes them on screen, and every export switches it off, so PDFs, pictures, PowerPoint, ODP and video are byte-identical. Building it found and fixed a latent bug in the player's CSS masker that dropped 234 KB of dark-mode rules for any quoted url() holding a ")".
---

# Screen grain: no banding in Safari (2026-11-21)

**Asked.** After the PDF backdrop work (`2026-11-20-backdrop-gradient-fidelity.md`), the owner asked
for the HTML player to be checked, and chose a screen dither for every browser over a Safari-only
one or none (2026-11-21).

## 1. What is wrong

Chrome dithers a CSS gradient when it paints it; WebKit does not. A dark glow spans a few color
levels across hundreds of pixels, so WebKit draws it as flat concentric bands. Measured in the
exported player, `finish-nimbus dark`, 2x, the right half of the slide: one color runs a median
**6 px (p90 30)** in WebKit against **1 px** in Chromium. Visible at normal contrast on a dark slide.

## 2. What was built

- `lib/base/base.finish.css` § SCREEN GRAIN: `--backdrop-grain`, a 32 px indexed PNG noise tile
  (four grays, each at 6/255 opacity, from a seeded generator), as the top layer of `.backdrop-mask`,
  under the clear panel. WebKit's runs fall to **1 px (p90 2)**; the mean color moves under one level
  (0.86). It is a PNG, not an SVG filter, for memory: see §3.
- **Off in every capture**, so no export carries it (noise is the worst case for a photographed
  slide's size):
  - the export face (`.lattice-exporting`) and print;
  - every clone the slide camera photographs, on either face (`lattice-capturing`, added in
    `lib/core/slide-camera.mjs`): a PNG set and a picture `.pptx` take the SCREEN face;
  - a native screenshot fallback (`captureScreenshot`, `lib/export/slide-picture.js`, marks the slide
    `lattice-capturing` around the shot: the same class, so the rule needs no root selector, which the
    engine's CSS scoper cannot pack);
  - the video, which records the exported player: the player's prune drops rules keyed to a capture
    class (they match nothing when it is exported), so `lib/export/video.mjs` switches the grain off in
    the style it already adds.
- **Found on the way:** the player's CSS masker (`minifyCss`, `maskCss` in `lib/export/player-core.mjs`)
  matched `url\([^)]*\)`, which stops at the first `)`. A quoted url holding its own `)` (the first,
  SVG grain's `url(#g)` filter reference) left an unmatched quote, and the masker read the stylesheet to
  the next quote as one string: 234 KB of dark-mode rules dropped from the player. A quoted url is now
  taken whole. The shipped PNG tile has no `)`, but any deck CSS with such a url was exposed, so the
  fix stays.

## 3. Measured

**Exports**, `main` against this branch, `finish-backdrops` and `backdrop-register`:

| Export | Change |
|---|---|
| PDF, PNG set, `.odp`, picture `.pptx` | byte-identical |
| editable `.pptx` | its pictures identical (`docProps/core.xml` timestamp only) |
| HTML player | **+0.7 KB** (the grain's CSS: 611 B rule, 75 B print rule, 27 B layer entry) |

Before the camera marked its clones, a picture `.pptx` of `finish-backdrops` grew 3.25 to 3.76 MB
(+16%): the reason every capture path is covered.

**Memory**, the number that chose the PNG. WebKit (WPE under Playwright), the exported player of a
`size: 4K` finish deck (three dark finish slides), 1280x720 at 3x, every slide visited; peak resident
memory of the web and UI processes, five fresh browsers per arm, median. The no-grain arm is a separate
player file with the grain removed, not switched off after load.

| Tile | CSS | Peak | WebKit run (median/p90) | Mean shift |
|---|---|---|---|---|
| none | 0 | 791 MB | 6/30 px | 0 |
| SVG `feTurbulence`, 128 px, 2% (first version) | 765 B | **889 MB (+97)** | 1/4 px | 2.14 |
| PNG, 64 px, four grays at 6/255 | 1.6 KB | 793 MB | 1/2 px | 0.86 |
| **PNG, 32 px, four grays at 6/255 (shipped)** | 557 B | **792 MB (+1)** | 1/2 px | 0.86 |

Three slides at 3840x2160x4 bytes is about 100 MB: WebKit appears to keep one full-size filter
buffer per slide for the SVG. A plain bitmap tile is repeated without one.

**Rendering** (measured on the SVG tile; the PNG is cheaper to paint, not re-measured), 20 dark finish slides on screen at once at 2x, software rendering (the sandbox has no
GPU), median of five:

| | Grain off | Grain on |
|---|---|---|
| Chromium, first frame | 78 ms | 86 ms (+10%) |
| Chromium, a frame where every slide repaints | 58.7 ms | 78.9 ms (+34%) |
| WebKit, first frame | 1,377 ms | 1,585 ms (+15%) |
| WebKit, a frame where every slide repaints | 549 ms | 672 ms (+22%) |
| Scrolling 20 slides (Chromium / WebKit) | 60.3 / 41.6 fps | 60.8 / 39.5 fps |

That is the worst case; one slide on screen adds about 1 ms a repaint in Chromium. An earlier
measurement read "first paint doubles": it timed a full-page PNG screenshot, whose ENCODER is what the
noise slows. A viewer never encodes a PNG.

## 4. Not checked

- A real iPhone or iPad (WebKit 26 under Playwright on Linux was the surface) and a GPU-rendered
  browser: the rendering and memory costs above are software rendering. Present's opening frame on
  its own was not split out: the memory figure is the peak across opening and stepping.
- The video was not recorded end to end (it needs the narration model); its switch-off is the style
  rule above, pinned by reading.
