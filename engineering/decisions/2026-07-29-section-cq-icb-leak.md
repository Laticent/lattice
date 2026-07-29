---
status: shipped
summary: >
  A `container-type: size` section cannot query itself, so a bare `cqi`/`cqh` in the
  section's OWN declarations fell back to the ICB — the host viewport in a browser. The
  export was right by luck (its ICB is the slide box), but the docs-site filmstrip sizes
  its iframe to the preview pane, so the slide's own padding tracked the pane and the
  Playground and Studio disagreed about which slides overflow: 2 of 117 gallery slides
  changed verdict on pane width alone. Second, independent cause: the overflow probe adds
  transform-scaled rects to transform-blind scroll dims, so the same slide measured 30px
  over at scale 1 and 17px at 0.543, across the 12px tolerance. Both fixed — anchor every
  section-own `cq*` to `--_sec-1cqi`/`--_sec-1cqh`, normalize the probe to layout px —
  with the export verified byte-identical on 18 decks and a budget-0 gate to hold it.
---

# The section's own `cq` units leak the host viewport (and a scaled section corrupts the overflow probe)

**Date:** 2026-07-29
**Status:** fixed; one tier still open (see §7)
**Found by:** a user report — the same deck flagged ONE overflowing slide in the
Studio and TWO in the Playground, on a phone.

---

## 1. The report

Three screenshots of `examples/bloom-engineering-journey.md` (cuoio, light) on an
iPhone: the Studio's preview ringed slide 10 (`compare-prose axis`) and left slide 11
(`matrix-grid`) clean; the Playground's filmstrip ringed both. Same deck, same
palette, same engine build, same browser.

"Which surface is right" is the wrong first question. Both were measuring honestly —
they were measuring **different slides**.

## 2. The two surfaces are built differently, and that is legitimate

| | Studio (`docs/src/lib/single-slide-render.ts`) | Playground (`docs/src/playground/deck-preview.js`) |
|---|---|---|
| what the iframe holds | ONE slide | the whole filmstrip |
| iframe viewport | pinned to the slide box (`singleSlideFrame` sets `html,body{width:1280px;height:720px}`) | the preview PANE's size (767px on a 1440px window; ~355px on a phone) |
| how it fits | scales the **iframe element** | scales each **`<section>`** with `transform` |

Neither is wrong. A filmstrip cannot pin its viewport to one slide, and scaling the
element is the right move for a single slide. The bug is that the engine's CSS and the
overflow probe both turned out to *depend* on which one you were looking at.

## 3. Cause A — a `container-type: size` element cannot query itself

`:root { --frame-inset-y: 1.875cqi }` (and 17 other declarations that land on the
`<section>`). There is no container at `:root`, and a section is a size container that
cannot be its own query target, so the unit falls back to the **initial containing
block** — the host viewport.

In the export the ICB happens to BE the slide: `lattice-emulator.js` sets
`page.setViewport({width: slideW, height: slideH})`. So these values were right by
luck on the one path nobody could see them fail on.

Measured on the real filmstrip, same deck, only the pane width changing:

```
pane 900px → section padding-bottom 96.9px → stage 413.0px
pane 767px →                        94.4px →       415.5px
pane 355px →                        86.7px →       423.2px   (phone)
Studio     →                         104px →       405.9px   (all window widths)
```

`--footer-reserve` is `--frame-inset-y + --footer-h + --sp-sm`, and it IS the section's
`padding-bottom`. So the content stage — the box the overflow probe measures against —
grew 17px as the pane narrowed. Verified empirically, not assumed: a descendant's and a
pseudo-element's `cqi` both resolve against the section (128px at every viewport); only
the section's own property falls back (128px → 50px at a 500px viewport).

Blast radius, measured by rendering the 117-slide gallery in the filmstrip at two
iframe widths and diffing every computed value:

- **631** computed values moved with the host viewport
- **2 slides** changed their overflow verdict on pane width alone

## 4. Cause B — the probe mixes visual px with layout px

`lib/core/overflow-probe.js` measures spill from `getBoundingClientRect()` (VISUAL:
a transform scales it) and folds in a child's hidden content from
`scrollHeight − clientHeight` (LAYOUT: transform-blind). Adding them is only correct at
scale 1. On the filmstrip's scaled sections the SAME over-stuffed matrix-grid measured:

```
scale 1 → 30px over    scale 0.543 → 17px over    scale 0.28 → 15px over
```

`TOL` is 12. The figure-legibility probe had the same defect in the other direction:
its floor comes from `clientHeight` (layout) while the figure's box comes from a rect
(visual), so every glyph measured at the pane's scale.

## 5. The fix

- **Anchor.** Every section-own `cq*` becomes `calc(var(--_sec-1cqi, 1cqi) * N)` — the
  slide-width stamp `lib/runtime/index.js patchSectionGeometry` already writes for the
  `--fs-*`/`--sp-*` tokens, which had this exact problem years earlier. A new
  `--_sec-1cqh` twin covers the height axis (the imagery/video composition grids).
  The bare fallback preserves the export path, where the ICB is the slide box.
- **Normalize.** The probe computes `K = rect.height ÷ offsetHeight` (cumulative, so an
  ancestor's transform counts) and converts every rect-derived measure back to layout px.
- **Gate.** `checkSectionCqAnchoring` in `tools/check-ownership.js`, via `build:check`:
  budget 0, empty allowlist, stale-sanction detection. It reuses `targetsSectionElement`
  from the section-box gate, so "the section's own box" has one definition.

## 6. Verification

- **Export unchanged: 18 decks byte-identical** through `tools/pixel-check.js`
  (HD, portrait, square, 4K, imagery, charts, finishes, adaptive). This is the load-
  bearing claim — the fix is inert on the path that was accidentally correct.
- **Surfaces converge:** the Playground now reports `d=2` on the bloom deck's slide 11,
  exactly what the Studio reports (it read `d=0` before), and its section padding is
  104px at every pane width, matching the Studio and the PDF.
- **Gallery:** verdict flips 2 → 0; viewport-dependent computed values 631 → 50.
- **Unit tests** lock both fixes, and each was mutation-checked — disabling the fix
  fails them. (The first scale-invariance test PASSED against the unfixed probe: its
  crushed child sat flush against its next sibling, so the scaled terms cancelled. A
  test that cannot fail is not a test; it now carries real slack.)
- Gates: `lint`, 4471 unit, `build:check`, 602 integration.

## 7. Still open — the same defect one tier down

`.chart-body`, `.piechart-figure` and `section.list-criteria`'s cell are themselves
`container-type: size`, so a `cq*` in THEIR own declarations has the identical
self-reference. 50 computed values on the gallery still track the host viewport
(`.chart-body` width/height, some `ul` heights). **None of them moves an overflow
verdict**, and fixing them needs a per-container stamp rather than another token
rewrite — a different change, deliberately not bundled here.

## 8. What to take from this

The engine had the right answer already (`--_sec-1cqi`, added for the typography
tokens) and simply hadn't applied it everywhere. The tell was available the whole time:
one token computing two different values on the same slide — 24px on the footer berth,
14.4px on the reserve meant to hold it — because one consumer was a descendant and the
other was the section itself.

And a measurement that mixes units survives every test that only ever runs it at scale 1.
The export runs at scale 1. So does every unit fixture. Only the surface a human actually
looks at was scaled, and the disagreement between two surfaces was the only signal.
