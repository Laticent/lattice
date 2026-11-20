---
status: shipped
summary: A screen grain to stop a finish's dark glow banding in Safari was built, measured and NOT shipped. Linux WebKit bands (p90 run 11.5 to 13.5 CSS px), but real Apple Safari (iPad and iPhone iOS Simulators, macOS Safari 27.2) does not (1.3 to 4.0 CSS px without the grain), so the grain would cost texture, color, paint and bytes for no visible gain on the devices decks are read on. Building it found a real bug, kept and fixed: the player's CSS masker dropped 234 KB of dark-mode rules after any quoted url() holding a ")".
---

# Screen grain: measured, not shipped (2026-11-21)

**Asked.** After the PDF backdrop work (`2026-11-20-backdrop-gradient-fidelity.md`), the owner asked
for the HTML player to be checked, and chose a screen dither for every browser over a Safari-only
one or none (2026-11-21). The first measurements were made in Linux WebKit; the owner then asked
for real Apple Safari to be measured before merging, and, once it had been, left the call to the
maker ("use your best judgment").

## 1. What was seen

Chrome dithers a CSS gradient when it paints it. Playwright's WebKit on Linux does not: in the
exported player, `finish-nimbus dark` at 2x, one color runs a median **6 px (p90 30)** against
**1 px** in Chromium, and the glow shows concentric rings once the contrast is raised.

## 2. What was built and measured

A faint noise tile (`--backdrop-grain`) on the finish's mask layer, switched off in every capture
(export face, print, the slide camera's clones, the native screenshot fallbacks, the video), so no
export carried it.

- **The first tile, an SVG `feTurbulence` filter, was dropped for memory:** WebKit kept a full-size
  filter buffer per slide, +97 MB peak for a 4K deck at 3x (791 to 889 MB). A 32 px indexed PNG
  (four grays at 6/255 opacity) did the same job for +1 MB.
- **Linux WebKit**, the dark nimbus title slide, p90 run of one color in two strips of the glow,
  in CSS px: without the grain 4.3 (iPhone size, 3x), 11.5 (iPad size, 2x), 13.5 (Mac size, 2x);
  with it 0.7, 1.0, 1.5.
- **Real Apple Safari**, the same measure, platform-suite run 44815692040 (a suite written for the
  question, `ios-safari-grain-banding`, on a macOS runner):

  | Safari | Without the grain (median/p90, CSS px) | With the grain |
  |---|---|---|
  | iPad iOS Simulator, Safari 26.5, 2x | 1.0 / 2.0 | 0.5 / 1.0 |
  | iPhone iOS Simulator, Safari 26.5, 3x | 0.7 / 1.3 | 0.3 / 0.7 |
  | macOS Safari 27.2, 1x | 2.0 / 4.0 | 1.0 / 2.0 |

  Apple's Safari dithers the gradient itself, or draws it finely enough that no ring forms: a 1 to
  2 CSS px run is not a visible band.

## 3. Decision: not shipped

On the devices decks are read on, the grain halves runs that are already invisible, and it costs:
a faint texture on every finish slide, a mean color shift of 0.6 to 1.4 levels, 22 to 34% more
paint time when twenty slides repaint at once (about 1 ms a repaint with one slide on screen), and
0.7 KB in every exported player. The banding it fixes belongs to WebKit builds outside Apple's
(Linux WebKitGTK and WPE browsers), which are rare for this audience.

The measuring suite was not kept either. Its purpose was this decision. As a standing guard on
the shipped player it would sit at its own edge: macOS Safari's p90 without the grain is 4.0 CSS
px, exactly the 4 px gate, so it would fail at random.

**Revisit when** a real device shows rings (a photo of a phone or a Mac screen), or the audience
moves to a non-Apple WebKit. The tile, its capture switch-offs and the suite are in the history of
PR #3344 (commits 5d57639, 3e4d3d5, 032c8eb, 44e1f31).

## 4. What shipped: the player's CSS masker

The player's CSS masker (`minifyCss`, `maskCss` in `lib/export/player-core.mjs`) matched
`url\([^)]*\)`, which stops at the first `)`. A quoted url holding its own `)` (an SVG data URI
with a filter reference, `url(%23g)`) left an unmatched quote, and the masker read the stylesheet
to the next quote as one string: 234 KB of dark-mode rules dropped from the player. A quoted url
is now taken whole. Any deck CSS with such a url was exposed. Pinned by
`test/unit/export/html-player.test.js` ("a quoted url() holding its own ")" is taken whole"),
which goes red on the old pattern.

**Cost against `main`, measured.** Five decks exported to players with `main`'s `player-core.mjs` and
with this one (`finish-backdrops`, `chart-detail-reveal`, the baseline gallery, the chart and
statement galleries): every player byte-identical. On Lattice's whole built stylesheet
(`dist/lattice.css`, 2.9 MB) both patterns find the same 8,582 strings and urls in 3.5 to 4 ms a pass.
On hostile input the new pattern stays linear: `url(` followed by a million spaces and no `)` takes
6.7 ms (`main`: 2.9 ms), an unclosed `url("` 16.5 ms (`main`: 18.1 ms). The first version of the fix
put `\s*` on both sides of the alternation, which overlapped the unquoted branch and went cubic: 2.7 s
for 2,000 spaces. The spaces now belong to each quoted branch.
