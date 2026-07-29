---
status: proposed
summary: >
  The engine now EMITS the slide's own 1% (`--_sec-1cqi` / `--_sec-1cqh`) as CSS from
  the resolved `@size`, on every render path, instead of leaving the export to fall back
  to a bare `cq*`. This closes the last two faces of the ICB leak: the exported HTML
  sidecar's geometry no longer tracks the window it is opened in, and the export stops
  disagreeing with the preview about which slides overflow (7 of 117 gallery slides,
  before). It also settles the engine-wide call the previous note deferred — the export
  was the flattering path, not the correct one, and it is now corrected UP to the design
  size the token coefficients are defined against. That changes exported PDF bytes:
  stage content renders ~11% larger, and 14 genuinely over-subscribed slides across four
  shipped decks stop being hidden (all fixed here). A third leak, in JS rather than CSS,
  is fixed alongside: state-chart derived its geometry scale from a transform-scaled
  rect, so a diagram drew differently per preview pane.
---

# The slide's geometry is emitted, not measured

**Date:** 2026-07-30
**Status:** proposed — carries an export-bytes change, so it needs sign-off
**Follows:** `2026-07-29-section-cq-icb-leak.md` (§7 "Still open" — this closes both items)

---

## 1. What was still broken after #1243

#1243 anchored the section's own `cq*` units to a stamp the RUNTIME writes
(`patchSectionGeometry`). That fixed every surface a script runs on. It left two
gaps, both recorded at the time:

- **The exported HTML sidecar stamps nothing at all.** Opened at a window that is not
  the slide box, every anchored token fell back to `1cq*` and resolved against the
  window: the bloom deck's section padding read 104px at 1280 and **31.7px at 390**.
  The PDF was fine (the emulator sets the viewport to the slide); the HTML a human
  opens was not.
- **The export and the preview still disagreed about overflow.** On the 117-slide
  gallery the preview flagged **7 slides the export flagged 0**. "0 verdict flips"
  in #1243 was a within-browser number, and the doc said so.

Both have the same root: the export never had the stamp, so it never resolved a token
at design size.

## 2. The call

The previous note deferred it: "whether the export should stamp `--_sec-1cqi` or the
preview should stop is an engine-wide call." It is not actually a free choice.

**Stopping the stamp is not available.** The stamp is what keeps a section-own `cq*`
from falling back to the ICB. Remove it and the host viewport leaks back into the
slide's own padding — the exact bug #1243 fixed, reintroduced. So the only coherent
direction is to make every path carry the value.

**And it should not be measured at all.** The runtime stamp measures a box that the
engine already knows: `@size` resolves to a pixel geometry before a byte of HTML
exists (`geometryFor` / `resolveSize`). Emitting it as CSS makes every path agree by
construction rather than by whether a script ran, and it removes the JS dependency
for something as basic as a slide's padding.

So: `lib/engine/css.js geometryVarsCss(geometry)` emits

```css
article.lattice > section, section { --_sec-1cqi: 12.800px; --_sec-1cqh: 7.200px; }
```

into the engine's composed sheet AND the emulator's page template — one helper, both
paths (HARD RULE #1). The runtime stamp stays, as an INLINE override, which is exactly
the right precedence: it now differs from the emitted value only when the box genuinely
is not the authored one — the `--fluid` viewer, which unpins the slide on purpose.

## 3. What this changes in the export, and why it is a correction

The token coefficients are defined against the slide: "px / 1280 * 100 = coefficient"
(`base.tokens.css`). With no stamp, a `cq*` on stage content resolved against the
section's CONTENT box — 1152px at HD — so the export rendered stage type and spacing
**~11% smaller than the design**. The preview never did, because the runtime stamped.

Measured on the bloom deck, same slide, export path:

| | before | after |
|---|---|---|
| body type | 19.24px | **21.38px** |
| section padding-bottom, window 1280 | 104px | 104px |
| section padding-bottom, window 390 | **31.7px** | **104px** |

The PDF now renders what the author saw. `engineering/gotchas.md` already ruled on
which path was right — "Do not trim to the preview and assume the export is the truth
— it is the flattering one" — and this is that ruling, applied.

## 4. The fallout, in full

Correcting the size UP means content that only fit because it was rendered small no
longer fits. Measured across the deck corpus by counting the emulator's own
"⚠ OVERFLOW" report before and after:

| deck | before | after (pre-fix) | now |
|---|---|---|---|
| `test/integration/baseline-decks/gallery.md` | 0 | 7 (pp. 15, 21, 48, 66, 106, 109, 115) | **0** |
| `examples/gallery-jargon.md` | 0 | 3 (pp. 15, 33, 52) | **0** |
| `examples/inventory.md` | 0 | 2 (pp. 2, 5) | **0** |
| `examples/q-and-a.md` | 0 | 2 (pp. 2, 6) | **0** |

Those 14 slides were **already failing in the preview** — they are the "others above
remain" from the gotchas entry, hidden in the export by the 11% shrink. Under HARD
RULE #18 a pre-existing fragility that my change tips into visible failure is mine to
fix, so all 14 are trimmed here rather than filed.

Two things learned while trimming, worth writing down because they cost time:

- **Most of these boxes are padding-dominated, not text-dominated.** Shortening a
  sentence that does not cross a line boundary changes nothing. The levers that move a
  padding-dominated box are structural: drop a garnish (a caption, a pull-quote, an
  eyebrow band), or drop a row.
- **A caption or blockquote cannot shrink below its own padding.** `.chart-caption` is
  218px at 4K with a single line of text — 96px of that is padding. Rewriting the
  sentence is wasted effort; removing the element is the only lever.

## 5. The third leak: a JS measurement, not a CSS unit

With the CSS tier closed, a viewport sweep of the gallery still showed 26 computed
values moving with the host window — all inside `section.state-chart`. The cause was
not a `cq*` at all: `state-chart.transform.js` derived its geometry scale from
`section.getBoundingClientRect().width`, the VISUAL box. On the docs filmstrip, which
transform-scales every section to the preview pane, that read 695px instead of 1280 and
every px constant in the diagram shrank with the pane — so the same figure routed its
edges differently in the Playground, the Studio and the PDF.

Fixed the same way the overflow probe was: read the slide's 1% from the stamp
(authoritative, unit-safe), and normalize every rect the drawing pass consumes back to
layout px through a single `VIS` factor (`rectL`). After it, the sweep reports **0**
viewport-dependent values on all 117 gallery slides — down from 631 before #1243 and 50
after it.

**The pattern is now three-for-three**: the overflow probe, the figure-legibility probe,
and state-chart all had the same defect — a `getBoundingClientRect()` mixed with a
transform-blind number. Anything that measures a slide should read the stamp or
`offsetWidth`, never a rect, unless it normalizes.

## 6. Verification

- **`tools/check-geometry-parity.js`** (new, committed): renders each deck through the
  real emulator, loads the real exported HTML in real Chromium at 1280×720, 900×700,
  500×700 and 390×844, and asserts the section padding, stage height, overflow verdict
  and overshoot are identical on every one — optionally with the sections
  transform-scaled the way the filmstrip scales them (`--scaled`). 50 slides across five
  decks (HD prose, 4K gallery, charts, portrait) pass on both modes. Run against `main`
  it **fails**, which is the check that it checks something.
- **Viewport sweep of the 117-slide gallery through the real Playground:** 0 computed
  values move with the host window.
- **Overflow parity:** the export's flagged set now equals the preview's, deck for deck.
- Gates: `lint`, unit, `build:check`, integration, and the ownership gate.

## 7. What this does NOT close

- **The PPTX/PNG raster paths** go through the same emulator page, so they inherit the
  fix, but their bytes change with it and they are not separately asserted here.
- **`--fluid`** deliberately re-derives the box; the runtime override is what makes that
  work, and this note does not change it.
- **Component density at the corrected size.** Four of the fourteen slides needed a
  structural trim rather than a prose one, and one (`contact`) needed two rows dropped
  because the identity name now wraps at hero size. That is a hint that a few components
  are tuned close to their limit at design size; it is not evidence that any of them is
  wrong, and re-tuning is a visual-review project, not a bug fix.
