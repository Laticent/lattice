---
status: shipped
summary: >-
  An owner's phone showed the exported HTML player with the slide edge cut off at every corner.
  The cause was not the corners register: every surface that shows a slide drew its own box
  around it (12px three ways in the player, 6px in the Playground, rounded-xl/rounded-lg across
  the Studio, 14px on the docs site), and each one either rounded a square deck or clipped the
  edge it carried. Fixed in two rounds. Round one moved every host onto one kernel
  (lib/core/slide-frame.mjs) with the edge as a drop-shadow outside the slide; the owner's
  iPhone then showed WebKit clipping that edge wherever the host box also clipped. Round two,
  on the owner's call, made the ENGINE own the edge: a 1px keyline in the deck's own --border,
  painted on a `.slide-edge` berth above all content, inside the slide so no host can clip it,
  following the engine's corner, and yielding on whichever side the spectrum sits. Hosts supply
  one number (--slide-edge-k = 100 / on-screen width) and a lift shadow; exports and print carry
  no edge; PDFs stay byte-identical (the .html sidecar and player do change: they carry the berth). The same round fixed the title text shifting after first
  paint: the player's embedded faces are font-display:fallback, and the Studio fades through faces
  that land after its 1.5s font backstop. A gate pins the host contract, the spectrum-side
  co-location and every theme's canvas opacity.
---

# One slide frame

**2026-09-25** · follows #1649 / #1676 (the `corners:` register) and
`2026-08-17-corner-export-capability.md`.

## The report

The exported HTML player, opened in a phone's file preview, showed each content slide with
a hairline edge that stopped short of every corner: four line segments, not a box. The
title slide looked fine. The owner's read was that the rounded-vs-square corner fix "came
back", and that a fix done properly would not keep coming back.

The read was right. The corner register was sound; everything around it was not.

## What was actually wrong

The phone's preview blocks the player's inline script, so it showed the player's no-JS
floor. That view's CSS put `border-radius:12px; overflow:hidden` on the frame AND a
`border:1px` plus `border-radius:12px` on the slide inside it — after scaling the slide to
~0.6, so the slide's border arc was ~7px while the frame clipped at 12px. The frame's larger
arc cut the smaller one off at each corner. Those were the gaps.

The same file got it wrong a different way in each of its other two views:

| Player view | Rule | Effect |
|---|---|---|
| No-JS floor | frame radius 12px + border on the scaled section | edge gapped at every corner, sub-pixel hairline |
| Read·Slides | frame `overflow:hidden; border-radius:12px; border:1px` | every slide of a SQUARE deck rounded |
| Present | frame `border-radius:12px` + shadow, no clip | a rounded shadow under a square slide, with blocky shadow tiles |

And the player was one of seven independent implementations (surveyed by a scout pass,
2026-09-25): the Playground gave every slide `border-radius:6px` and a box-shadow on the
scaled section; the Studio's editor preview and Present card measured the slide's radius
back through `deck-corner.ts`, while its overview, picker, reshape, "Next", Fabricate and
Layout Studio hosts hardcoded `rounded-xl` / `rounded-lg`, and the thumbnail pool copied the
tile card's radius onto every frame; the docs specimens clipped at `--radius-md` and the
landing previews at 14px.

Every one of those is the same mistake: **a host deciding the slide's shape.** A host
radius can only agree with the slide's corner by coincidence, and when it disagrees it
either rounds a deck the export renders square or clips the edge it is carrying.

## The rule

1. **The engine owns the slide**: its shape (square, or `corners-rounded`), its opacity (every
   canvas is a solid color), and its **edge**.
2. **The host supplies one number and a shadow**: `--slide-edge-k`, how many slide-percent one
   screen pixel is (`100 / the slide's on-screen width`), and a lift `box-shadow` on its own box.
3. **The host never shapes the slide**: no `border-radius`, no rounded clip, no border, no
   background under it.

## Round one, and why it was not enough

The first cut kept the edge on the host: four unblurred 1px `drop-shadow` layers on the host
box, which trace the slide's painted outline and so follow any corner. Chromium drew it
everywhere. The owner then opened the preview deploy and an exported player on an iPhone:

| Surface (WebKit) | Result |
|---|---|
| Player · Present (frame has no `overflow:hidden`) | full, crisp edge |
| Player · Read·Slides (frame clips) | one stray line, no sides |
| Studio preview, Present card (box clips) | one stray line along the bottom |

WebKit clips an element's filter output to its own `overflow`, and an edge that sits OUTSIDE
the slide is at the mercy of every box around it. It also could not know where the spectrum
sat. The owner's direction: the engine owns the border, in the deck's own color, mindful of
the spectrum wherever it sits, taking the gantt chart's left edge as inspiration.

## The engine's edge

**The gantt lesson.** A gantt bar's leading accent used to carry its own corner and poked out
of the bar's rounded outline as a seam; the fix clipped the accent to the bar's own shape so it
can never leave it (`gantt.transform.js`, `barClip`). The slide edge takes the same stance: it
lives INSIDE the slide, so the only thing that bounds it is the slide's own shape.

**Where it is painted — an engine berth, and why not the section itself.** Three layers were
tried against a split panel, whose left half is a positioned child that reaches the slide's edge:

| Layer | Result |
|---|---|
| inset `box-shadow` on the section | under ALL content — covered by the panel, an image slide's `.lattice-bg`, a finish `.backdrop` |
| `outline` on the section, inset | painted before positioned descendants — measured, the panel covered it completely (made red to be sure) |
| **a child element** above content | **visible on every layout** |

So the edge is `.slide-edge`, a berth appended to every slide by `lib/core/fit-berth.js` — the
kernel both render paths already run for the marker berths, and one the fit probes already
exclude by name. It is absolutely positioned over the slide on the chrome plane
(`--z-chrome`), takes the slide's corner (`border-radius: var(--slide-radius)`), and paints a
`border` in `var(--border)` whose width on each side is that side's flag times the keyline
width. It paints nothing until a host sets `--slide-edge-k`, and `@media print` forces that to 0.

**Why a border and not inset shadows.** The first version of the berth painted four one-side
inset shadows. On the owner's iPhone only their corner arcs showed, plus the bottom run, while the
spectrum bar and the left rail painted whole. Those two are plain borders of the same thickness
(about 4 slide px against the keyline's 3.7 at phone width) on the same scaled slide. Desktop WebKit
(Playwright's build) drew the shadows correctly, and so did Chromium, so neither reproduces what the
phone did, and the cause inside iOS is not pinned. A border is the primitive the phone was seen
drawing correctly on this slide, so the keyline uses it. Where a flag is 0 the border tapers into
that side around the corner.

**The spectrum stays the edge on its side.** Each of the four sides has a flag
(`--_edge-t/r/b/l`, default 1), and the side carrying the brand bar turns its keyline off, so the
bar IS that side's edge and nothing doubles it. The flags are set in the same rules that place
the bar: the default top bar (`section { --_edge-t: 0 }`), `spectrum-edge-left/right/bottom`,
`spectrum: off`, the explicit bar styles, and every frame that drops the top bar (title, closing,
divider — whose left rail turns `--_edge-l` off — topic, split-panel, split-compare, the chart
frame, the print band, image and scene, and the `accent` / `tone-edge` bars that re-add a top
bar in a `spectrum: off` deck). Hand-set flags drift, so two gates hold them: a static one
over the rules (css-tree) and a RENDERED census over the gallery and a register deck
(`test/integration/invariants/slide-edge-census.test.js`), which asks the browser, per slide
and side, "is there a bar?" and "is the keyline off?" and requires the two to agree. Between
them, with the red-team and checker passes, they found eleven rules this change had missed:
`section.print`, `section.chart-frame`, the bleed chart, image, scene, `accent`, `accent.dark`,
`tone-edge`, `claim: bleed` (in `lib/forms`, which the first static gate did not read), a dark
accent slide whose stripe `spectrum: off` clears, and `spectrum: solid` re-adding a real top
border to a dark slide — the last two visible only to the census.

**The corner, exactly.** The red-team pass drew a rounded deck's top-left corner and found the
keyline's arc about 6px (at 1280px) inside the slide's real corner, a wedge of slide background
between them. Two causes, both fixed:

- The edge box sat in the PADDING box, below the top bar, so its arc was the corner's shifted
  down by the bar. It now covers the BORDER box: each side's bar room is `--_bar-t/r/b/l`,
  declared in the same rule as that side's border (so the cascade can never split the two), and
  the box reaches under it. The part under a bar is clipped away with the bar; the rest takes
  `--slide-radius`, the length the `clip-path` rounds by.
- A `border-radius` on the slide also curves its OVERFLOW clip, at the padding edge, which cut
  the keyline short of the true corner. The rounded slide's `border-radius` is now
  `max(0px, r − edge-width × 1000)`: the full radius in every export (the width is 0 there, and
  the rounded deck's PNGs are byte-identical to `main`'s), zero wherever a host draws the edge,
  where the `clip-path` alone rounds everything.

**Marks that hug an edge yield too.** A tone rail is the left edge (`--_edge-l: 0`) and a
`tone-glow` ring every edge; the keyline no longer paints over their outer pixel. The overflow
and illegible alarm rings do not yield: they are diagnostics, and a 1px line over a 4px alarm
leaves the alarm legible.

**Why the host supplies a number.** A 1px keyline drawn inside a slide that a host scales to
0.3 becomes a 0.3px hairline — the reason the player once moved its border off the section.
Only the host knows its scale, so it states it once: the player in CSS
(`calc(100 / (1280 * var(--lp-fit)))`), `single-slide-render` on every fit, the Playground's
fit agent when a caller asks for an edge.

**The lift** is a negative-spread `box-shadow` on the host box: it paints outside that box,
which the box's own `overflow` never clips, and the negative spread pulls it in past a rounded
corner so a square shadow never shows a corner the slide does not have. The Playground, whose
container holds every slide, keeps a lift `drop-shadow` filter on `.lattice` — and that
container clips (its fit agent clamps the filmstrip), so on WebKit the side shadows there are
cut. Only the lift is affected; the edge is inside the slide.

## The text that shifted

Also from the iPhone: a title's text visibly moved a beat after the slide appeared. Every engine
`@font-face` is `font-display: swap`, so a document lays out in the fallback face and re-lays
out when the real one lands (`engineering/gotchas/fonts.md`).

- **The exported player had no gate at all.** Its faces are data URIs inside the file, so
  they decode in milliseconds: the player now rewrites its embedded faces to
  `font-display: fallback`, whose ~100ms block period covers the decode, so the first layout
  is the real one. It also covers the no-JS view, where no script can hold a reveal. Not
  `block`: its ~3s invisible period is what a reader would get if a browser ever failed to
  decode a face (raised by the inversion pass), which is worse than the shift.
- **The Studio's gate has a 1.5s backstop** (`PREVIEW_FONT_GATE_MS`), which a slow phone link
  can pass. `preview-font-gate.mjs` now reports faces that land after the backstop as a
  `lattice:fonts-late` event, and `single-slide-render` answers it by dropping the frame to
  transparent for the relayout and fading it back in over the usual 180ms. A fade, not a jump.

## Measured

- **PDFs are untouched.** `examples/slide-corners.md` (rounded) and
  `examples/ltt-timing-track.md` (square) render byte-identical PDFs on this branch and on
  `origin/main` built from its own source (md5 `990a2b85…` and `0d7e871d…` on both). The
  `.slide-edge` berth is in every document and paints nothing without a host scale. HTML
  artifacts DO change: every `.html` sidecar carries one empty berth per slide, and the player
  carries the berth, the frame CSS and the font-display rewrite — which is why this change
  needs the owner's dark/light sign-off.
- **The edge survives full-bleed content** (Chromium, the player's no-JS view, keyline
  repainted red to be unmistakable): a split panel's positioned half, a divider's rail, a dark
  slide's 1px spectrum line and a `spectrum-edge: left` rail. On the split panel the keyline
  runs over the panel; on the other three the bar is that side's edge and the keyline stops.
- **Real surfaces, Chromium:** the player in light and dark, square and rounded, in all three
  views; the Studio production build (editor, Present, overview) with a per-slide rounded
  title, where the keyline follows the corner and computes to `1px` in cuoio's `--border`.
- **No frame-rate cost** (headless Chromium): an 80-slide Playground filmstrip scrolled at
  DPR 3 held 16.4ms/frame with the lift filter and without it; the player's Present view held
  16.7ms/frame stepping slides.
- **UNVERIFIED on iOS Safari after round two.** The round-one failure was seen on the owner's
  iPhone; the round-two fix has not been. It avoids the mechanism that failed (nothing outside
  the slide, no filter on a clipping box), but that is reasoning, not a measurement.
- **A full frame rewrite drops the keyline for up to one poll** (~100ms): the new document
  paints before `scaleFrame` stamps its `--slide-edge-k`. Edits and theme changes patch in
  place, so only a size or diagram-engine change shows it.
- **A known, unmeasured risk: a white flash on iOS during a FULL frame rewrite.**
  `playground.css` records that iOS Safari paints an iframe element's own white backing for a
  frame or two before a new `srcdoc` composites, and `iframe.live` is now transparent. A first
  load is covered (the frame is at `opacity:0` until it paints), and edits and theme changes
  patch the live document in place, so only a rare full rewrite (a size or diagram-engine
  change) can show it. If it is seen, hold the frame at `opacity:0` across that rewrite rather
  than re-adding a fill.

## What moved

- **Engine:** `.slide-edge` berth (`lib/core/fit-berth.js`) and its rule
  (`base.modifiers.css`, "The slide's EDGE"); side flags in `base.variants.css` and the
  title, closing, divider, topic, split-panel, split-compare and chart-frame styles. The two
  split frames rebuild their bar as a two-segment element, so their flag is `--_edge-t: 0` —
  an earlier cut set 1 and the keyline covered their spectrum (the inversion pass measured it
  at thumbnail scale). A dark slide's 1px spectrum line grows to one screen pixel where it is
  the edge (`max(1px, --_edge-w)`), since 1 slide px on a thumbnail is a quarter pixel.
- **Kernel** `lib/core/slide-frame.mjs`: `slideFrameShadow(lift)`, `slideFrameFilter(lift)`
  (lift only), `slideEdgeK(width)`, `slideEdgeKCss(expr)`.
- **Player** (`lib/export/player-core.mjs`): the three frame rules carry the lift shadow and
  `--slide-edge-k`; the no-JS section loses its own radius and border; embedded faces are
  `font-display: fallback`. The frozen-artifact golden is re-blessed.
- **Playground** (`docs/src/playground/deck-preview.js`): the section loses its 6px and
  box-shadow; `.lattice` carries the lift filter; the fit agent stamps `--slide-edge-k` when a
  caller asks for an edge. `lib/core/print-sheet.mjs` turns the filter off for print; its
  `box-shadow:none` reset stays, because it also keeps a `finish:` keyline frame, a tone rail
  and the overflow ring off paper (caught by the independent checker).
- **Studio:** `single-slide-render` stamps `--slide-edge-k` on every fit and fades through
  late fonts; `deck-export.js` zeroes the edge on a captured section; `DeckPreview` gains
  `frame="tile|card|stage"`. The editor preview box, Present card and Next, the thumbnail
  pool, Fabricate, Layout Studio, Finish Studio, Craft Lab and the pre-hydration loading box
  use the kernel. Overview thumbnails are the slide itself with an offset outline for
  current/hover; picker and Reshape tiles inset the slide in their card. `deck-corner.ts` and
  `DeckPreview`'s `onCorner` are removed.
- **Docs site:** component specimens inset the slide on the card's `--bg-alt`; the landing
  hero, restyle showcase, field cards and Studio preview use the kernel; `iframe.live` is
  transparent.

## The demo deck

`examples/slide-edge.md` (+ `.pdf`): the default bar, a left rail, a split panel, an image
slide, a dark slide and a rounded slide. The PDF shows no keyline, by design — exports never
carry one — so the deck is meant to be opened with `--player` (and on a phone).

## The gates

`test/integration/invariants/slide-edge-census.test.js` renders the layout gallery and a
register deck under seven spectrum settings and checks, per slide and side, that a bar (or a
tone mark) and an "off" keyline agree, that each slide has exactly one edge berth as a direct
child, and that the edge box reaches the slide's border box on every side it draws and under
every border bar — the geometry the corner depends on.
Removing the image slide's flag fails it on all four image layouts.

`test/unit/tools/slide-frame-hosts.test.js`:

- every slide host — a `<DeckPreview>`, any element marked `data-slide-frame`, and any
  landing `live-host` — carries no `rounded-*`, `border*`, `shadow-*`, `bg-*` or `ring-*`
  class; a marked host must apply the kernel, and a `live-host` must be marked;
- the hosts that frame their own box name the kernel, the hosts that scale a slide hand the
  engine `--slide-edge-k`, the exporter zeroes it, and nothing measures the corner back;
- the engine edge is a berth, above content, in `--border`, per-side, zeroed in print;
- every section rule that sets a side's border also sets that side's bar room (`--_bar-*`);
- every section rule that drops or moves the spectrum bar says which edge it now owns —
  parsed with css-tree, so `:is()` selectors, `@media` blocks, `border-top: 0` and a bar
  painted as a background are all seen (a regex version missed each of those; the inversion
  pass showed it with mutations);
- every theme's `--bg`, `--scheme-dark-bg`, `--brand-canvas` and `--surface-inverse` is a
  solid color.

Each check was run against a deliberate violation and failed on it, including the case the
first cut of the host check MISSED (found by the independent checker): `rounded-2xl border
bg-card` on Present's card. The co-location check found `section.print` and
`section.chart-frame` on its first run.

The host scan reads class strings in quotes and backticks, Tailwind arbitrary classes
(`[border-radius:…]`), `drop-shadow`/`outline` utilities, and inline `style={{…}}` keys.

What the gate still cannot see: a slide host that is neither a `DeckPreview`, marked, nor a
`live-host`; a bar drawn by a child element (the split frames' segments — they declare their
flag by hand); a berth re-parented away from the section by a future transform; and a
see-through canvas arriving through a `var()` chain or a Studio user theme (`extraTheme`),
which is not in the tree. A rendered census over the gallery (computed border per side
against the flag per side) would close the first three and is the natural next guard.

## Out of scope, deliberately

- The Studio's second-screen stage window paints the slide full-bleed on a letterbox with no
  frame at all. A rounded deck shows its corner against that letterbox, which is correct.
- Library tiles show theme swatches, not slides.
