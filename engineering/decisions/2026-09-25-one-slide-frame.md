---
status: shipped
summary: >-
  An owner's phone showed the exported HTML player with the slide edge cut off at every corner.
  The root cause was not the corners register: every surface that shows a slide drew its own box
  around it — 12px in three different arrangements inside the player, 6px in the Playground,
  rounded-xl / rounded-lg across the Studio, 14px on the docs site — and each one either rounded
  a square deck or clipped the edge it carried. The Studio's earlier fix measured the slide's
  radius and copied it back (deck-corner.ts) and reached two of about twelve hosts. Replaced by
  ONE kernel, lib/core/slide-frame.mjs: the engine owns the slide's shape and opacity, the host
  box never rounds, borders, shadows or backs a slide, and the edge + lift are a CSS
  drop-shadow filter that traces the slide the engine painted — square or rounded, at any scale,
  with no radius to read. Adopted by the player (all three views), the Playground, the Studio
  (editor preview, Present, the thumbnail pool, pickers, Fabricate, Layout Studio, Finish
  Studio, Craft Lab) and the docs site. deck-corner.ts is removed; a gate pins the host contract
  and every theme's canvas opacity.
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

1. **The engine owns the slide.** Its corner is square, or `corners-rounded`; its canvas is
   100% opaque. Nothing else rounds a slide.
2. **The host never shapes the slide.** The box around a slide sets no `border-radius`, no
   rounded clip, no `border`, no `box-shadow` and no background. A square `overflow:hidden`
   is fine: the slide fills the box, so it clips nothing.
3. **The host decorates the slide's silhouette.** The edge and the lift are
   `filter: drop-shadow()` layers from `lib/core/slide-frame.mjs`, which trace the alpha of
   whatever the box painted.

## Why a filter

A drop-shadow needs no radius at all, so there is nothing for a host to get wrong and
nothing to keep in step. It follows a per-slide `_class: corners-square`, a deck-wide
`class:` opt-in and a theme's own `--slide-radius` — every case `deck-corner.ts` had to
measure to see — without looking at any of them, and without a timing backoff to measure
after the frame parses.

Four UNBLURRED drop-shadows offset 1px right, left, down and up make the edge. Each one
shadows the shape the previous ones built, so together they draw a solid 1px ring in the
edge color that follows the silhouette, rounded corner included. The first cut used two
stacked `0.6px` blurs; on Studio thumbnails that edge all but vanished, and a light slide
blended into the light overlay behind it. The lift is one more layer, at four named levels
(`flat` · `tile` · `card` · `stage`).

**Where the filter has to sit.** Not on the section: a `corners-rounded` section clips
with `clip-path`, and `clip-path` clips the element's own filter and box-shadow with it. So
the filter goes on the box that wraps the slide — the player's `.lp-frame`, the Studio's host
boxes and pooled frames, and in the Playground (which has no per-slide wrapper) the
`.lattice` container, which paints nothing but the slides.

**What must be transparent.** The filter traces alpha, so an opaque layer under the slide
turns every slide into a rectangle. `iframe.live` carried `background: var(--bg)` as a
cold-load white-flash guard; it is now `transparent`. The flash is already handled by
`single-slide-render`, which holds the frame at `opacity:0` until its slide has painted.

## Measured

- **Traces through every host shape.** Verified by render in Chromium: a scaled section in
  the player's no-JS, Read·Slides and Present views, square and `corners: rounded` decks;
  and a `srcdoc` iframe with a transparent body (the Studio's shape), where the edge
  follows a 24px rounded clip exactly.
- **No scroll cost.** An 80-slide filmstrip at DPR 3, filter on the container, scrolled 60px
  per frame for 120 frames: 16.4ms average, 16.8ms worst, identical to the same page with no
  filter (headless Chromium).
- **No cost in the player's Present view either**: 200 frames stepping a slide every 20
  frames, per-frame average 16.75ms with the stage filter and 16.67–16.75ms without, the
  same occasional 33ms frame in both (headless Chromium, 1440px at DPR 2).
- **UNVERIFIED on iOS Safari**, and that includes the exact surface of the report — a
  phone's file preview. Nothing here was run on a real iPhone or in WebKit (only Chromium
  is installed here). WebKit supports `filter: drop-shadow()` on a box containing an
  iframe, but that is documentation, not a measurement.
- **A known, unmeasured risk: a white flash on iOS during a FULL frame rewrite.**
  `playground.css` records that iOS Safari paints an iframe element's own white backing
  for a frame or two before a new `srcdoc` composites, and `iframe.live` is now
  transparent. A first load is covered (the frame is at `opacity:0` until it paints), and
  an edit or a theme change patches the live document in place, so only the rare full
  rewrite (a size or diagram-engine change) can show it. An opaque backing would make every
  rounded slide trace as a rectangle, so it stays transparent; if the flash is seen on a
  device, hold the frame at `opacity:0` across that rewrite rather than re-adding a fill.

## What moved

- `lib/core/slide-frame.mjs` (new): `slideFrameFilter(lift, { edge })`, `slideFrameRule`.
- `lib/export/player-core.mjs`: the three frame rules take the kernel's filter; the no-JS
  section loses its own radius, border and shadow. The frozen-artifact golden is re-blessed.
- `docs/src/playground/deck-preview.js`: the section loses its 6px and box-shadow; `.lattice`
  carries the frame. `lib/core/print-sheet.mjs` turns the filter off for print and drops the
  `border-radius:0` reset that only ever stripped that 6px. Its `box-shadow:none` reset
  STAYS: it also keeps a `finish:` keyline frame, a tone rail and the overflow ring off paper,
  which the independent checker caught an earlier cut of this change removing.
- Studio: `DeckPreview` gains `frame="tile|card|stage"`; the editor preview box, Present card
  and "Next", the preview pool, and the Fabricate, Layout Studio, Finish Studio and Craft Lab
  specimens use the kernel, and so does the Studio's pre-hydration loading box
  (`pages/studio.astro`), so a cold load no longer snaps from a rounded 8px card to the
  deck's corner. Thumbnails in the overview are the slide itself, with an offset outline for
  current/hover; picker and Reshape tiles inset the slide in their card rather than clipping
  it to the card's corner. The pool draws the `flat` frame (edge only): its layer paints
  above the grid, and a lift shadow would fall across each card's border and label.
  `deck-corner.ts` and `DeckPreview`'s `onCorner` are removed.
- Docs site: component specimens inset the slide on the card's `--bg-alt`; the landing hero,
  restyle showcase, field cards and Studio preview use the kernel.

## The gate

`test/unit/tools/slide-frame-hosts.test.js`:

- every slide host — a `<DeckPreview>`, any element marked `data-slide-frame`, and any
  landing `live-host` — carries no `rounded-*`, `border*`, `shadow-*`, `bg-*` or `ring-*`
  class; a marked host must actually apply the frame, and a `live-host` must be marked;
- the hosts that frame their own box name the kernel AND mark the box, the Studio loading
  box wears the kernel's filter, and nothing measures the corner back;
- no player or Playground rule targeting the slide or its frame sets a radius, border or
  box-shadow;
- every theme's `--bg`, `--scheme-dark-bg`, `--brand-canvas` and `--surface-inverse` is a
  solid color.

Each check was run against a deliberate violation and failed on it: a `rounded-xl` on a
Layout Studio host, an 8-digit hex `--bg` in indaco, and — the case an earlier cut of this
gate MISSED, found by the independent checker — `rounded-2xl border bg-card` on Present's
card and `rounded-xl bg-background` on the editor preview box. The first cut read classes
only off `<DeckPreview>`, so every wrapper-box host was invisible to it; the
`data-slide-frame` marker is what lets the gate see them.

What the gate still cannot see: a slide host that is neither a `DeckPreview`, marked, nor a
`live-host`; and a see-through canvas that arrives through a `var()` chain it does not
follow, or through a user theme made in the Studio (`extraTheme`), which is not in the tree.

## Out of scope, deliberately

- The Studio's second-screen stage window paints the slide full-bleed on a letterbox with no
  frame at all. A rounded deck shows its corner against that letterbox, which is correct.
- Library tiles show theme swatches, not slides.
