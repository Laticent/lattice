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
  with the export verified byte-identical on 25 decks and a three-arm budget-0 gate to
  hold it. Adversarial review (HARD RULE #25) then found that the first version anchored
  the wrong tier in two places and certified a clean tree that still leaked; §5a and §7
  record both, and the gate now catches the bug's own shape.
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

- **Anchor.** Every section-own `cq*` becomes `calc(N * var(--_sec-1cqi, 1cqi))` — the
  slide-width stamp `lib/runtime/index.js patchSectionGeometry` already writes for the
  `--fs-*`/`--sp-*` tokens, which had this exact problem years earlier. A new
  `--_sec-1cqh` twin covers the height axis (the imagery/video composition grids).
  The bare fallback preserves the export path, where the ICB is the slide box.
- **Normalize.** The probe computes `K = rect.height ÷ offsetHeight` (cumulative, so an
  ancestor's transform counts) and converts every rect-derived measure back to layout px.
- **Gate.** `checkSectionCqAnchoring` in `tools/check-ownership.js`, via `build:check`:
  budget 0, empty allowlist, stale-sanction detection, reusing `targetsSectionElement`
  so "the section's own box" has one definition. THREE arms, because the first version
  had one and it could not see this bug:
  1. a bare `cq*` written directly in a section-own declaration;
  2. a token routed through `var(--_sec-1cq*)` but declared only where the stamp cannot
     reach it (§5a);
  3. **a bare `cq*` that reaches the section's own box through a var() CHAIN** — seeded
     from every token a section-subject rule uses in a real property, closed over
     token→token references. This is #1243's own shape (`:root{--frame-inset-y:1.875cqi}`
     → `--footer-reserve` → `section.form{padding-bottom}`), where no declaration puts a
     unit next to a section selector. It caught two more live leaks the first version
     certified as clean: `section.compact`'s `--sp-*` overrides and `--tone-rail`.
  The scan also covers all of `lib/` (the compact overrides live in `lib/shared`, outside
  the section-box gate's roots), matches units case-insensitively, ignores `url()` and
  strings, and follows at-rules nested inside a section rule.

### 5a. Two ways to get this wrong — both were written first, both were caught in review

**A `:root`-only declaration cannot be anchored.** `var()` is substituted at
computed-value time on the element the declaration APPLIES to. For a `:root` rule that
is `html`, where `--_sec-1cqi` does not exist — so the fallback is baked into the
inherited value and the token still resolves against the ICB. The frame tokens
therefore live in the **`:root, section`** block beside `--sp-*`, whose comment already
said the duplication was load-bearing. Measured, isolated:

```
:root       { --a: calc(var(--_sec-1cqi, 1cqi) * 10) }   → section padding 128px @vw1280, 40px @vw500
:root,section{ --a: calc(var(--_sec-1cqi, 1cqi) * 10) }  → section padding 128px at BOTH
```

The first version of this change shipped the `:root`-only form and *appeared* to work,
because the docs-site engine PACKS `:root` rules onto `article.lattice > :where(section)`
— the packed copy does match the section, so the stamp applied there. It would not have
held in any unpacked document. The gate now has a second arm (`rootOnlyAnchorOffences`)
that fails exactly this.

**A DESCENDANT's bare `cq*` must be left alone.** It resolves against the section
already — but not to the same number as the stamp: `1cqi` on a descendant is 1% of the
section's **content box** (1152px at HD), while `--_sec-1cqi` is `offsetWidth/100`, the
**border box** (1280px). "Anchoring" a descendant moves it 11%. Seven declarations were
converted that way in the first version (`.chart-body`, `.masthead-rule`, `.piechart-svg`,
`.radar-svg`); measured on the gallery, `.chart-body` went 3072px → 3456px in preview
against an export of 3110.4px, one `roadmap` slide reflowed, and its overflow ring
disappeared — a verdict regression inside a change whose purpose is verdict fidelity.
All seven are reverted. The gate never asked for them: `targetsSectionElement` correctly
does not flag a descendant.

## 6. Verification

- **Export unchanged: 18 decks byte-identical** through `tools/pixel-check.js`
  (HD, portrait, square, 4K, imagery, charts, finishes, adaptive) — re-run after the
  §5a corrections. This is the load-bearing claim: the fix is inert on the path that
  was accidentally correct.
- **Surfaces converge:** in the real Playground the section's `padding-bottom` is 104px
  at every pane width (900 / 767 / 560 / 420 / 355), matching the Studio and the PDF,
  and the deck's `matrix-grid` slide reports `d=2` there — exactly what the Studio
  reports, where it read `d=0` before.
- **The other leaks the review found, also on the real Playground:** `section.compact`'s
  `--sp-*` overrides (`lib/shared/shared.styles.css`) and `--tone-rail`
  (`lib/base/base.variants.css`) reached the section's own box through a token chain and
  were still pane-tracking after the first version of this fix — a compact slide's
  padding read 99.4 / 97.6 / 91.7px at 1440 / 1024 / 390px windows, and a tone rail
  2.15px against the PDF's 7.04px. Now 100px and 7.04px at every pane.
- **Gallery (117 slides), filmstrip at pane 1280 vs 500:** verdict flips 2 → 0.
  Viewport-dependent computed values 631 → 50 **on the property set the scan measures**
  — padding, margin, border-width, radius, box-shadow, background size/position,
  font-size, line-height, gap, width, height, the four insets, filter, stroke-width,
  letter-spacing, on every element and `::before`/`::after` in every slide. That is a
  measurement of that set, not of "every computed value"; a wider set gives a different
  denominator and a much smaller ratio, because most computed values never moved.
- **Unit tests** lock both fixes, and each was mutation-checked — disabling the fix
  fails them. (The first scale-invariance test PASSED against the unfixed probe: its
  crushed child sat flush against its next sibling, so the scaled terms cancelled. A
  test that cannot fail is not a test; it now carries real slack.)
- Gates: `lint`, unit, `build:check`, integration.

## 7. Still open — two gaps, both recorded rather than fixed here

**The same defect one tier down.** `.chart-body`, `.piechart-figure` and
`section.list-criteria`'s cell are themselves `container-type: size`, so a `cq*` in
THEIR own declarations has the identical self-reference. 50 computed values on the
gallery still track the host viewport. **None moves an overflow verdict**, and fixing
it needs a per-container stamp rather than another token rewrite.

**The chrome berths now sit 3px further in, in PREVIEW only.** `--frame-inset-*` is read
from both sides of the section boundary, and anchoring it changes what the DESCENDANT
side means wherever the stamp exists: the footer band's inset measures 30px / 24px in
preview against 27px / 21.6px in the export (2.34375% of 1280 vs of the 1152 content
box). Nothing moves in the PDF. This is deliberate and it is a real widening of a real
gap: it puts the frame insets into the same stamp-anchored family as `--sp-*`/`--fs-*`,
which have had exactly this preview/export offset for as long as they have been
anchored, and which `engineering/gotchas.md` already rules on — "which path is right:
the PREVIEW." Measured, so the next person does not have to rediscover it.

**Browser-vs-export verdict disagreement is untouched.** "0 flips" above is a
within-browser number. Across the boundary, on the same 117-slide gallery: the preview
flags 7 slides that the export flags 0 (pages 15, 21, 48, 66, 106, 109, 115; largest
spill delta 381px), identical before and after this commit. That is the open
engine-wide question — whether the export should stamp `--_sec-1cqi` or the preview
should stop — and it is the number to watch if anyone reads §6 as "the class is closed."
It is not.

**The exported HTML sidecar opened at a window that isn't the slide box.** Nothing
stamps `--_sec-1cqi` there, so every anchored token — the frame insets, and equally
`--sp-*`/`--fs-*`, which have always been written this way — falls back to `1cqi` and
resolves against the window. Measured on the bloom sidecar: the section's
`padding-bottom` reads 104px at a 1280px window and 31.7px at 390px. The **PDF is
unaffected** (the emulator sets the viewport to the slide box) and the `--fluid` viewer
re-derives the box on purpose. This is pre-existing and unchanged by this commit, and it
is the other face of the already-tracked open question in `engineering/gotchas.md`:
whether the export should stamp `--_sec-1cqi` or the preview should stop. Recorded here
because it is the shape most likely to be mistaken for this bug returning.

## 8. What to take from this

The engine had the right answer already (`--_sec-1cqi`, added for the typography
tokens) and simply hadn't applied it everywhere. The tell was available the whole time:
one token computing two different values on the same slide — 24px on the footer berth,
14.4px on the reserve meant to hold it — because one consumer was a descendant and the
other was the section itself.

And a measurement that mixes units survives every test that only ever runs it at scale 1.
The export runs at scale 1. So does every unit fixture. Only the surface a human actually
looks at was scaled, and the disagreement between two surfaces was the only signal.

The review (HARD RULE #25) is why §5a exists rather than shipping. Both mistakes there
produced *correct-looking* evidence: the `:root`-only anchor measured right on the very
surface the bug was reported from, because the engine happens to pack `:root` onto the
section, and the descendant conversions passed 18 pixel-clean export decks because the
export never had the defect. "It measures right on the surface I was looking at" is the
weakest form of correct — and it is exactly what this whole bug was made of.
