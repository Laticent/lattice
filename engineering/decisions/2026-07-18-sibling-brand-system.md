---
status: shipped
summary: >
  A shared BRAND SYSTEM for the spin-off sibling libraries (Vetrina, Cadenza, Lente, Suono, Anima),
  locked against the LATTICE mark as the quality bar. Each library gets its own SVG mark + Fraunces
  lockup that (1) shares the lattice family DNA — a 128 viewBox, precise geometry, a ringed center
  "hub" node with a pale halo, rounded caps, ONE theme palette, dark-mode-aware via an inline
  `@media(prefers-color-scheme)` swap, and the Fraunces wordmark — and (2) tells that library's OWN
  relevant story through the mark's metaphor. SUONO is the first one built to the bar and is the
  reference: a radial "sound-clock" (a bloom of bars = sound, a warm crown bar = the live onset, a
  centered base-gap = the tuned breath, the ringed hub = the owned clock), on a locked GREEN palette
  that matches the /suono demo. Assets: `docs/public/suono-{mark,mark-min,lockup}.svg`. This doc is
  the template the family follows; the fan-out (2026-07-18) then built marks + lockups for Lente,
  Vetrina, and Cadenza on it — Anima stays staged (WIP). Trama (the weft; terracotta + gold) joined on 2026-09-27.
companion:
  - ./2026-07-12-suono-audio-library.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
---

# The sibling brand system — one family, five voices (2026-07-18)

**Date:** 2026-07-18 · **Status:** shipped; Suono set the bar, then Lente/Vetrina/Cadenza were built
on it in the fan-out. Anima staged (WIP).

> **Goal (the architect's words).** Craft a logo for each spin-off library on par in quality, craft,
> and relevance with the Lattice mark, and *lock in* the first one — Suono — as the reference for
> "what great looks like" before we pivot to the rest.

## The bar — what the Lattice mark establishes

`docs/public/lattice-mark.svg` is a **crystal lattice**: a 45°-rotated bond grid with jewel-tone
"atom" nodes, each ringed by a pale halo, a larger **ringed center node**, on the theme's categorical
palette, dark-mode-aware via an inline `<style>` `@media` swap. It is a *literal name → precise
geometry* mark: calm, exact, and meaningful. That is the bar. The system also ships a **min** variant
(fewer, chunkier elements for favicon scale — `lattice-mark-min.svg`) and a **lockup** (mark + a
Fraunces serif wordmark — `lattice-lockup.svg`).

## The system — shared DNA + a per-library metaphor

Every sibling mark MUST share the family DNA, so the five read as one house:

- **Canvas:** `viewBox="0 0 128 128"`, `fill="none"`.
- **The hub:** a filled center **node** with a **pale halo** (the paper color) behind it and a faint
  concentric **inner ring** — the direct echo of lattice's ringed center atom. This is the single
  strongest family tie; every sibling keeps it.
- **Geometry:** precise, computed coordinates; `stroke-linecap="round"`; restraint over decoration.
- **One palette, dark-mode-aware:** an inline `<style>` with an `@media(prefers-color-scheme:dark)`
  swap of the mark's few color classes (never a second file for dark). Each library owns ONE accent
  family + one warm "live" accent, drawn from its theme.
- **Lockup:** mark + the wordmark in **Fraunces** (`font-family:Fraunces,'Cormorant Garamond',
  Georgia,serif`, size 70, weight 600, letter-spacing −1), mark scaled `0.9375` at `translate(4 4)`,
  text baseline-centered — identical construction to `lattice-lockup.svg`.
- **Three assets per library:** `<name>-mark.svg` (full), `<name>-mark-min.svg` (favicon scale),
  `<name>-lockup.svg`.

And every mark MUST earn its own **relevance** — the metaphor has to *be* the library, the way the
lattice is a crystal lattice. Uniform DNA, five distinct stories.

## Suono — the reference (built)

**Metaphor: a radial sound-clock.** Suono's thesis is *"a clip is bytes; the clock is the
library's"* — an owned clock emitting a timed sequence of sound with tuned breath-gaps. The mark
encodes exactly that:

- **the bloom of rounded bars** radiating from the hub = sound / amplitude (a circular waveform);
- **the warm crown bar** at 12 o'clock = the **live onset** — the clip playing *now*;
- **the centered gap at the base** = the **tuned breath** between phrases;
- **the opacity falloff** from crown into the gap = amplitude fading to silence (the family's
  "halo depth", expressed as tonal gradient);
- **the ringed hub** = the **owned WebAudio clock**, and the family tie to lattice's center atom.

**Locked palette** (one system with the `/suono` demo page):

| Token | Light | Dark | Role |
|---|---|---|---|
| bar | `#2f6d5b` | `#63c9a6` | the sound (deep green / mint) |
| onset | `#c67a12` | `#f6b64a` | the live clip (warm) |
| hub | `#2f6d5b` | `#63c9a6` | the owned clock |
| ring | `#123528` | `#0c1512` | the hub's inner ring |
| halo | `#f6f3ec` | `#101613` | paper (separation) |
| ink (wordmark) | `#1b2b25` | `#e6ede9` | Fraunces "Suono" |

**Assets:** `docs/public/suono-mark.svg` (27 bars, full), `suono-mark-min.svg` (15 chunky bars,
favicon — legible to 16px), `suono-lockup.svg`. Worn by the `/suono` demo header + favicon.

## The fan-out — three more built, one staged

The fan-out (2026-07-18) built marks + Fraunces lockups for the three remaining SHIPPED libraries,
each on the DNA above with its own metaphor + accent. Assets: `docs/public/<name>-mark.svg` +
`-lockup.svg` (cadenza also `-mark-min.svg`, its caption being dense small; lente/vetrina hold at
16px on the full mark).

- **Lente** ("lens", reader lenses) — **built**. A camera **iris/aperture** (blue `#2f5fa6` /
  `#6fa3e6`): tangent blades frame the aperture around the hub, one blade warm (the focal lens). Worn
  by the `/lente` demo (built to the storyboard standard) + favicon.
- **Vetrina** ("shop window", the walkthrough engine) — **built**. A framed **vitrine** (rose
  `#a8446a` / `#e08aa8`): a rounded-rect window around the hub with a self-driving **cursor** aimed at
  it — theater over real state. Worn by `/vetrina-tour` + favicon.
- **Cadenza** (the caption timeline) — **built**. A **caption with the current word lit** (indigo
  `#3f3d8f` / `#9491f2`, matching its demo): the hub is the lit word (warm ring), spoken word-bars
  behind, upcoming dimmed ahead. Worn by `/cadenza` + favicon.
- **Anima** (animation) — **staged** (WIP library). Direction: *motion made legible* — a rotation /
  arc-sweep around the hub; "information a still frame cannot carry." Its mark lands with its build.

All four demos are surfaced in the site's **Libraries** nav group (`nav.mjs` `librariesNav`).

## Trama — the weft (built 2026-09-27)

Trama (the graph-chart library, `docs/src/lib/trama`) joined the family after the fan-out. *Trama*
is Italian for the **weft**, the thread a loom carries across the warp, and its job is to route
lines as right-angled elbows that never run through a box or along another line. The mark says
both:

- **two right-angled terracotta threads**, each an elbow, interlock around the hub: each passes
  OVER the other once and UNDER it once, the gap in the under-thread doing the weaving (no casing
  stroke, so the mark reads on any background);
- **the gold thread** runs straight through the hub and over both: the **main path**, which Trama
  weights 4 in dagre to keep straight, and the one color the reader's eye follows;
- **the ringed hub** sits on the main path, the family tie.

The min mark keeps the same four elbows, thickened (11 units, gaps 6.5) and pushed wider, so the
frame, the gold bar and the hub still read at 16px. Assets: `docs/public/trama-mark.svg`,
`trama-mark-min.svg` (favicon), `trama-lockup.svg`; the `/trama` header draws the same geometry
inline so it follows the page's own theme toggle. The generator was kept out of tree
(`.scratch/trama-brand/gen-trama-mark.py`), as Suono's was.

**Locked palette** (the owner's pick, 2026-09-27; one system with the `/trama` demo page):

| Token | Light | Dark | Role |
|---|---|---|---|
| thread (`pri`) | `#a0522d` | `#e0916a` | the woven threads (terracotta) |
| main path (`warm`) | `#b5860f` | `#e8bd4f` | the gold weft |
| hub | `#a0522d` | `#e0916a` | the hub node |
| ring | `#4a1f0c` | `#1c0f08` | the hub's inner ring |
| halo | `#f6f3ec` | `#121012` | paper (separation) |
| ink (wordmark) | `#241f1b` | `#e6e2dd` | Fraunces "Trama" |

## How the marks are produced

The Suono mark is generated from a small parametric script (radial math + envelope + the DNA hub),
kept out of tree (`.scratch/`); the committed SVGs are the source of truth. Promoting that to a
committed `tools/` generator parameterized per library (palette + metaphor primitives), so all marks
stay byte-consistent in construction, remains a follow-up (not a blocker).

## Non-goals

Not a full brand book (typography scales, spacing tokens, usage rules beyond the mark). Not touching
the Lattice mark. Not building **Anima's** mark yet (WIP — it lands with its build). This doc locks
the *system* + the *Suono reference*; the Lente/Vetrina/Cadenza marks were then built on it.

## Calco — the cast (built 2026-10-06)

Calco (the office-export library, `docs/src/lib/calco`) joined the family with its build.
*Calco* is Italian for a **cast or a tracing** taken from an original, and its job is to
take a finished slide and hand back a copy you can rework. The mark says that:

- **the original, traced**: a DOTTED slide outline, top-left, the tracing;
- **the copy**: a solid slide outline, bottom-right, carrying two lines of text, the last in
  the warm accent with a text caret beside it, the editable line;
- **the ringed hub** sits where the two frames cross, the registration pin that aligns a
  tracing to its copy, and the family tie.

Palette: ink blue `#1f5f8b` / `#7db8e2` with a vermilion live accent `#d4553a` / `#f08a6e`,
chosen apart from Trama's sienna and gold, Suono's green and Cadenza's indigo. The min mark
drops the dotted tracing to one faint corner and keeps the copy, its warm line and the hub,
so it reads at 16px. Assets: `docs/public/calco-mark.svg`, `calco-mark-min.svg` (favicon),
`calco-lockup.svg`; the `/calco` header draws the same geometry inline so it follows the
page's theme toggle. The generator was kept out of tree (`.scratch/calco-brand/gen.py`).

## Fuoco — the focus (built 2026-10-15)

Fuoco (the focus hub, `docs/src/lib/fuoco`) joined the family with its package. *Fuoco* is
Italian for **fire**, and for **focus**: *mettere a fuoco* is to bring into focus. Its job is
to hold the one place every view of a document is looking at. The mark is a viewfinder:

- **the focus brackets**: four corner brackets, the frame a camera draws around the point it
  has focused on — every view framing the same place;
- **the warm ticks**: two short strokes either side of the hub, the focused line, the caret
  every view follows;
- **the ringed hub** is the focal point itself, the family tie.

A first draft drew rays through a lens converging on the hub; it read as an eye, and at 16px
as noise. A second, three views per side joined to the hub, read as a generic network icon.
The brackets read as focus at any size. The min mark thickens the brackets (11 units), keeps
the ticks and enlarges the hub so the favicon is the brackets and a dot. Assets:
`docs/public/fuoco-mark.svg`, `fuoco-mark-min.svg` (favicon), `fuoco-lockup.svg`; the
`/fuoco` header draws the same geometry inline so it follows the page's theme toggle. The
generator was kept out of tree (`.scratch/fuoco-brand/gen.py`), as the siblings' were.

**Palette**, teal with an ember live accent, chosen apart from every sibling (Suono's green,
Lente's blue, Vetrina's rose, Cadenza's indigo, Trama's sienna and gold, Calco's ink blue and
vermilion, Segno's charcoal and red):

| Token | Light | Dark | Role |
|---|---|---|---|
| brackets (`pri`) | `#0e6b67` | `#5cc6bc` | the viewfinder (teal) |
| ticks (`warm`) | `#e2661c` | `#ff9d57` | the focused line (ember) |
| hub | `#0e6b67` | `#5cc6bc` | the focal point |
| ring | `#06302e` | `#0a201f` | the hub's inner ring |
| halo | `#f6f3ec` | `#121012` | paper (separation) |
| ink (wordmark) | `#1b2423` | `#e3ebea` | Fraunces "Fuoco" |

## Mosaico — the mosaic (built 2026-10-16)

Mosaico (the box-packing library, `docs/src/lib/mosaico`) joined the family with its site page.
*Mosaico* is Italian for **mosaic**, which is what it makes: tiles of different shapes, cut
straight across, fitted into one box with even gutters. The mark is one of its own layouts:

- **the tiles**: a tall tile on the left, a square over two slim tiles on the right, each a
  different shape, cut the guillotine way the `tree` strategy cuts;
- **the warm square** is the tile the eye lands on, the "live" accent;
- **the ringed hub** sits exactly on the T where the cuts meet, the family tie.

A first draft put the hub on a tile's edge, where it read as a stray dot; moving the cuts so they
meet at the center put it on the junction. The min mark drops the two slim tiles for one, keeps
the strokes at 11 units and enlarges the hub. Assets: `docs/public/mosaico-mark.svg`,
`mosaico-mark-min.svg` (favicon), `mosaico-lockup.svg`. The generator was kept out of tree
(`.scratch/mosaico-brand/gen.py`), as the siblings' were.

**Palette**, olive with a sea-glass live accent: the green stone and blue glass of a Roman floor
mosaic. A first palette, plum with amber, failed the family's own rule: its amber sat 0.015 from
Cadenza's (a difference in OKLab under the eye's threshold), the amber Suono, Cadenza, Vetrina and
Lente already share, and the owner judged the plum too close to Vetrina's rose. A garnet replacement
was rejected for the same rose. So the hues were chosen by measurement: on the OKLCH hue wheel the
siblings fill 32–87° (reds, oranges, ambers, golds), 149–190° (greens, teals), 236–310° (blues,
indigo, purple, Lattice's own blue among them) and 358° (rose), which leaves two gaps, yellow-green and cerulean. Olive takes one, sea
glass the other. The nearest sibling color is now 0.086 away (Tavola's dark-mode green), and Mosaico is
the only library whose live accent is cool.

| Class | Light | Dark |
|---|---|---|
| `pri` / `hub` | `#4f5f00` | `#a9bf4a` |
| `warm` (the live tile, sea glass) | `#0994b9` | `#8ddefd` |
| `ring` | `#1f2600` | `#0f1300` |
| `wm` (wordmark) | `#1d2112` | `#e7ebdf` |

The `/libraries/mosaico/` header draws the mark inline from the page's tokens, so it follows the
page's theme toggle, as Calco's and Fuoco's do.

## Veduta — the view (built 2026-10-18)

Veduta (the windowed-preview core, `docs/src/lib/veduta`) joined the family with its package.
*Veduta* is Italian for **a view**: a vista, or the view through a window. Its job is to decide
which few units of a long list a reader's views should hold. The mark is a window onto a list:

- **the frame**: a rounded rectangle, the window every view looks through;
- **the rail**: a thin vertical line inside the frame's right edge with three small squares on
  it, the map beside the stage (the middle square filled and warm, the one the reader is on);
- **the ringed hub** sits in the stage half, the family tie;
- **the two ticks** above and below the rail run past the frame, the list continuing out of view.

Assets: `docs/public/veduta-mark.svg`, `veduta-mark-min.svg` (favicon), `veduta-lockup.svg`.
The `/libraries/veduta/` demo loads the mark as an image; it does not follow that page's theme
toggle, only the OS color scheme, because the SVG carries its own `prefers-color-scheme` swap.

**Palette**, violet with a chartreuse live accent, chosen apart from every sibling (Suono's
green, Lente's blue, Vetrina's rose, Cadenza's indigo, Trama's sienna and gold, Calco's ink blue
and vermilion, Segno's charcoal and red, Fuoco's teal and ember):

| Token | Light | Dark | Role |
|---|---|---|---|
| frame and rail (`pri`) | `#6b3a8c` | `#c9a2e8` | the window (violet) |
| current tile (`warm`) | `#8a9a00` | `#d9e75a` | the unit the reader is on (chartreuse) |
| hub | `#6b3a8c` | `#c9a2e8` | the focal point |
| ring | `#2e1740` | `#1d1226` | the hub's inner ring |
| halo | `#f6f3ec` | `#121012` | paper (separation) |
| ink (wordmark) | `#241a2b` | `#ece4f3` | Fraunces "Veduta" |

## Fluido — the vessel (mark 2026-10-27; package lands with Fluid P1)

Fluido (`@laticent/fluido`, the core of Fluid,
[`2026-10-27-fluid-layout-library.md`](2026-10-27-fluid-layout-library.md)) decides how a slide's
content fits the box it is shown in: it reflows, or it breaks onto the next page. *Fluido* is
Italian for **fluid**, and a liquid is the one thing that takes the shape of any vessel. The mark
is one liquid in three vessels:

- **the vessels**: a wide, a square and a tall rounded box, nested on one center. The tall one is
  drawn at full weight; the wide and square ones are faint, the shapes the same content could be
  shown in;
- **the waterline**: one jade wave runs across all three at the same height, the same content in
  every box, with a pale tint below it inside the tall vessel;
- **the ringed hub** floats above the waterline, the family tie.

The concept was picked from three by the owner. A "seam" (a page that fills, then spills past a
seam onto the next) and a "spill" (wavy content lines running from one page into another) both
drew two offset, overlapping frames, which read as Calco's mark, and both went muddy at 16 px.
The vessel's boxes differ in shape like Mosaico's, but Mosaico packs boxes side by side and these
are nested on one center with liquid in them.

Assets: `docs/public/fluido-mark.svg`, `fluido-mark-min.svg` (favicon: the tall vessel, the
waterline and the hub only), `fluido-lockup.svg`. The mark's clip path is namespaced
(`fluido-vessel`), so two inlined copies on one page cannot paint each other's.

**Palette**, honey and jade, chosen by MEASUREMENT rather than by eye. A first pick, plum, sat only
8.8 (CIEDE2000) from Veduta's violet. Against every sibling's primary and live accent, ochre's
nearest is Mosaico at 16.7, the farthest of twelve candidate hues, and jade's nearest is 19.1,
the best of nine accents; the pair is at least 44.7 from every sibling's pair (the summed
distance of both colors). Blue-green "water" hues were ruled out: each landed within 10 of Fuoco,
Calco or Tavola.

| Token | Light | Dark | Role |
|---|---|---|---|
| vessels (`pri`) | `#7a5a12` | `#e3b860` | the boxes (honey) |
| waterline and tint (`warm`, `tint`) | `#13a17a` | `#5fe0b8` | the content (jade) |
| hub | `#7a5a12` | `#e3b860` | the focal point |
| ring | `#33250a` | `#2a1f08` | the hub's inner ring |
| halo | `#f6f3ec` | `#121012` | paper (separation) |
| ink (wordmark) | `#2a2110` | `#f3ead6` | Fraunces "Fluido" |

## Filo — the thread (built 2026-10-28)

Filo (the undo history, `docs/src/lib/filo`) joined the family with its catalog entry. *Filo* is
Italian for **thread**, after Ariadne's: the line you lay as you go, so you can follow it back.
The owner picked this mark from three concepts (the clew, a round labyrinth, a loop of stitches).
The mark is a clew, a ball of thread wound out from the hub:

- **the spiral**: an even spiral from radius 25 to 53, 1.85 turns, round caps; following it
  inward is walking back through the history;
- **the live end**: the last tenth of the thread, after a small gap, in the warm accent and a
  touch heavier, where the author is now (the step ⌘Z takes back first);
- **the ringed hub** at the center, the family tie.

The favicon (`-min`) winds 1.5 turns at stroke 9 with the hub at 1.15× so it survives 16 px.

Assets: `docs/public/filo-mark.svg`, `filo-mark-min.svg` (favicon), `filo-lockup.svg`. Unlike
Veduta's page, `/libraries/filo/` draws the mark inline with the page's own tokens, so it follows
that page's theme toggle as well as the OS color scheme.

**Palette**, crimson with a jade live end. The owner asked for a crimson thread in place of the
first draft's magenta. Measured in OKLab (ΔE × 100) against every sibling's mark colors, light and
dark: the crimson's nearest sibling is Segno's dark coral at 8.9 (Vetrina's light rose is 10.7),
and the jade's is Mosaico at 12.2. Mosaico shipped with 8.6 as its nearest distance, so both clear
the family's existing floor.

| Token | Light | Dark | Role |
|---|---|---|---|
| thread (`pri`) | `#91123f` | `#fb6188` | the history (crimson) |
| live end (`warm`) | `#15ab83` | `#62fecb` | where the author is now (jade) |
| hub | `#91123f` | `#fb6188` | the focal point |
| ring | `#3a0619` | `#2a0d15` | the hub's inner ring |
| halo | `#f6f3ec` | `#121012` | paper (separation) |
| ink (wordmark) | `#2a1418` | `#f3e5e8` | Fraunces "Filo" |
