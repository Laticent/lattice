---
status: shipped
summary: The `journey` stage ribbon painted 92%-white labels on a fill that is only dark on one of the three canvases it renders on — 1.87:1 in indaco, and 31 of 64 palette x scheme pairs below the 3:1 floor, EVERY light-mode pair. Two fixes were legitimate (darken the ink, or push the fill dark); the ink won, because the fill is canvas-derived by construction and `section.print` had already made exactly this fix one layer down by remapping `--on-dark-primary` to print's heading ink. Print output is byte-identical (verified on a real print render); dark mode was never the defect but is NOT unchanged either - 17 palettes now use their own tinted heading ink and 10 of 64 rows lose a little contrast at an altitude where it cannot matter (worst 15.26 -> 14.09, lowest dark row 11.30). Then the follow-through from `2026-08-17-dark-surface-ink.md` - `tools/check-slide-contrast.js` becomes a per-PR gate over three rendered galleries, with a two-entry allowlist that fails both ways. Adjudicating the 8 "prober artifacts" that gate was scoped to absorb found that 4 were a bug IN THE PROBER, not an inherent limit - it approximated paint order by DOM order and discarded a split rail as the backdrop for chrome emitted before it. Fixed instead of allowlisted; the allowlist is 2 entries, not 8. The predecessor record's explanation of those 4 runs (sibling-not-ancestor) was ALSO wrong and is corrected there.
builds-on: 2026-08-17-dark-surface-ink.md, 2026-08-11-on-dark-ink-tiers.md, 2026-07-03-semantic-html-accessibility.md
---

# Canvas-derived ink for a canvas-derived fill, and the contrast gate that follows

`2026-08-17-dark-surface-ink.md` closed with two things outstanding: a genuine
`journey` defect logged as #1702 rather than pulled into that diff, and the
observation that the tool which found everything was still on-demand. This is
both.

## Part 1 — the stage ribbon (#1702)

### What was wrong

`--journey-stage-bg` is `color-mix(in oklab, var(--bg-alt) 70%, var(--surface-inverse))`
— the canvas's own alt surface, deepened 30% toward the inverse. That is a
**canvas-derived** surface, and it lands in a different place on each of the
three canvases this engine renders:

| canvas | fill | is it dark? |
|---|---|---|
| light | pale `--bg-alt`, 30% toward dark navy | **no** — a mid slate, indaco `#a9bbcd` |
| dark | dark `--bg-alt`, 30% toward dark navy | yes |
| print | `#F5F5F5`-ish, 30% toward `#ECECEC` | **no** — near-white |

Its ink was `--on-dark-primary`, white at 92% alpha, and the comment above it
explained why: *"Section bar bg mixes toward `--surface-inverse` on BOTH canvases
→ always a dark surface."* That sentence is false on two of the three.

Measured: **1.87:1** in indaco light against a 3:1 floor, and **31 of 64**
palette × scheme pairs below 3:1 — which is every light-mode pair. Dark mode was
always fine. The rendered gallery showed three failing runs, on one slide, in one
palette; the defect was thirty-one pairs wide. That gap is the reason this change
ships a palette sweep **and** a render gate rather than either alone.

The comment was not baseless, and that is the interesting part. It was fixing a
real **dark-mode** defect — `--on-accent` collapses onto `--surface-inverse` in
dark mode at ~2.5:1 — and it over-corrected past light mode by pinning an
always-light ink. A fix for one canvas, painted on all three, with nothing able to
notice: the same shape as both causes in the predecessor record.

### The design call, and why the other option lost

Two directions were genuinely open, and the handoff deliberately did not pick.

**(1) Darken the ink** — give the label an ink matched to the fill.
**(2) Darken the fill** — push the mix far enough toward `--surface-inverse` that
on-dark ink is correct.

Measured across all 32 palettes × both schemes, both work:

| candidate fill | `--on-dark-primary` | `--text-heading` |
|---|---|---|
| `bg-alt 70%` (**shipped**) | worst 1.88, **31/64 below 3:1** | worst **5.63**, 0/64 below 4.5 |
| `bg-alt 30%` | worst 4.65, 0/64 | worst 1.48, 31/64 below 3:1 |
| `bg-alt 20%` | worst 5.98, 0/64 | worst 1.15, 31/64 |
| `var(--surface-inverse)` flat | worst 9.77, 0/64 | worst 1.00, 31/64 |

So the numbers do not decide it — both columns have a clean answer. Three things
did:

1. **The fill is canvas-derived on purpose, and is correct on 2 of 3 canvases.**
   Only the ink is pinned to one canvas. Fixing the half that is wrong on one
   surface beats re-pointing the half that is right on two.
2. **`section.print` had already made this exact fix, one layer down.**
   `base.modifiers.css` remaps `--on-dark-primary: var(--print-text-heading)`
   precisely because print's `--surface-inverse` is a light `#ECECEC`. Option (1)
   generalizes a special case the repo had already reasoned its way to; option (2)
   would put the fill in direct conflict with a print band that deliberately makes
   that surface light.
3. **Option (2) is a much larger visual change.** It turns a calm tinted ribbon
   into a near-black band on every light deck, to fix a text colour.

**Decision: `--journey-stage-fg: var(--text-heading)`.** It is also the honest
ROLE token — the stage bar heads the group of task chips beneath it — and the
resulting hierarchy is more coherent than what shipped: task chips are `--bg-alt`
lightened, the stage ribbon is `--bg-alt` deepened, and both now carry
canvas-derived ink, so the ribbon reads as a table header rather than a stray dark
band.

**Print output is byte-identical.** In the print block the old
`var(--on-dark-primary)` already resolved to `--print-text-heading`; the new
`var(--text-heading)` resolves to the same token. Verified on a rendered print-mode
deck rather than reasoned: `--text-heading`, `--on-dark-primary` and
`--print-text-heading` all compute to `rgb(0,0,0)` there, and the stage label paints
black on the near-white print fill. The fix is invisible on that canvas by
construction, which is the strongest evidence it is the right one.

**Dark mode is NOT unchanged, and the first draft of this record said it was.**
The two tokens are different values on every palette: `--on-dark-primary` is white
at 92% alpha, `--text-heading` on a dark canvas is the theme's own heading ink —
pure white on 15 palettes and a deliberately tinted off-white on 17 (burgundy
`#f0e2ce`, mustard `#f0e5c8`, brina `#e6edf4`, …). So 17 palettes now ink the stage
label with the same colour as every other heading on the slide instead of neutral
white, which is a small improvement in theme coherence rather than a cost.

Ten of the 64 rows lose a little contrast as a result. Measured, worst first:
burgundy 15.26 → 14.09, mustard 14.89 → 13.92, laguna 13.45 → 12.85, concrete
11.54 → 11.30, brina 13.59 → 13.47. The lowest dark-mode row after the change is
**11.30:1**, two and a half times the AA floor, so none of this is a regression in
any sense that matters — but "renders unchanged" was simply false and is the kind
of claim this whole record exists to stop being written unverified.

Preserving dark mode exactly would mean `light-dark(var(--text-heading),
var(--on-dark-primary))`, which was considered and rejected: it re-pins the ink to a
canvas, which is the defect, and `light-dark()` in a `:root` custom property resolves
against the ROOT scheme, so a per-slide register would not reach it anyway.

### Both declaration sites, and why there are two

The block is declared twice — at `:root` and again at `section.print.journey` —
because a custom property resolves its `var()`s at its **declaration scope**, so a
`:root`-declared derived token cannot see print's section-scoped remap. Fixing one
site is half a fix. `journey-stage-contrast.test.js` asserts the two sites stay
byte-identical, which is mutation-tested against exactly that half-fix.

The same rule is why **both** tokens must stay at `:root` together. Move the ink
to section scope and the pair desynchronizes — a section-scoped ink over a
root-scoped fill — and a `color-light` slide would render one against the wrong
canvas.

## Part 2 — the gate

`tools/check-slide-contrast.js` has audited the rendered DOM since #1207 and has
found every contrast defect this repo has shipped, including both causes in the
predecessor record and #1702 itself. It found them in **one run**. It was simply
on-demand, so the only detector that ever fired was a person being bothered by a
slide.

It now runs in `test/integration/invariants/`, which `test:integration:pr` gates
on every PR. Three surfaces: the component catalog on a light canvas, the same
catalog on a dark one (not redundant — #1702 was light-only and the comment that
caused it was fixing a dark-only defect), and an editorial deck, because a
component catalog is explicitly not representative prose. The gate imports `PROBE`
from the tool rather than reimplementing it: `axe-a11y.test.js` disables its own
`color-contrast` rule on the grounds that one gate should own contrast, and a
second copy of the WCAG arithmetic here would be exactly the thing it avoided.

### An allowlist, not a budget — and it got shorter, not longer

The handoff scoped this to absorb 8 "prober artifacts" behind an explicit
allowlist. Adjudicating them on the rendered pixel — which the semantic-HTML ADR's
**G16** had flagged as owed and unpaid — found that **four were not artifacts of an
inherent limitation. They were a bug in the prober.**

`underlays()` approximated paint order by DOM order: a sibling counted as a
backdrop only if it *preceded* the run. The running header is out-of-flow chrome
emitted first in the section; a split layout's `.panel-left` rail is a later,
**in-flow** sibling. CSS paints in-flow block backgrounds (Appendix E step 4)
before positioned descendants (step 8), so the rail genuinely is underneath —
but "later in the DOM" said the opposite, the rail was discarded, and the climb
fell through to the white section canvas. Measured in the real DOM: the rail *is*
found, it *does* contain the header's text rect, and it was rejected on DOM order
alone. Four headers scored 1.00:1 white-on-white while rendering in white on a
dark rail at ~5.4:1.

Fixed rather than excused: paint order is now ranked by **layer first, DOM order
within a layer**, and the change is strictly additive (every sibling the old rule
accepted is still accepted). Isolated against the same HTML, it removes exactly
those four rows and introduces none.

So the allowlist is **two entries**, both keyed on structure rather than a page
number (the galleries are long-running and their slides move, HARD RULE #8):

- **`decorative-watermark`** — the 440px section letter, painted with
  `--on-dark-watermark`, white at 12% alpha by contract. WCAG 1.4.3 exempts
  incidental decorative text, and no alpha satisfies both "is a watermark" and
  "clears 3:1".
- **`raster-backdrop`** — text over the `image` layouts' photograph. Every backdrop
  here is read off `backgroundColor`, and the picture (`div.lattice-bg`) plus its
  gradient scrim are transparent to that read. The reported number is not a
  pessimistic measurement, it is a measurement of the wrong surface. The prober now
  flags this structurally as `imgBackdrop`, so the entry matches the *mechanism*.

Both fail both ways: an un-exempt failure errors, **and** an entry matching nothing
errors as stale. A fourth test caps the share of runs the exemptions may absorb, so
broadening a matcher cannot quietly restore the budget behaviour the allowlist
exists to avoid.

**Genuine failures on the gated galleries today: zero.**

### The correction that matters more than the fix

The prober's own header claimed the header runs were "fully occluded by the left
rail … ink that never reaches the page", and offered a measurement for it. That
was false — the header is painted and legible. The predecessor record already
caught that the claim was wrong, but replaced it with a **second** wrong
explanation: that the rail is "a sibling, not an ancestor", so the prober "climbs
to `section`". The rail is a sibling, the prober does look at siblings, and it
*did* find this one. The rejection was on DOM order.

Two consecutive records explained the same four rows with two different mechanisms,
both plausible, both wrong, neither verified against the DOM. That is the failure
mode worth naming: a tool's confident self-description reads exactly like a
measurement, and so does a decision record's. Both have now been corrected in
place, and the prober's header says outright that it should not be trusted over a
render — including that paragraph.

## What this does not cover

- **Three surfaces, not the 32-palette matrix.** A palette-wide ink defect is the
  unit tier's job (`test/unit/palette/journey-stage-contrast.test.js`, all 32 ×
  both schemes, analytic). Neither tier subsumes the other, and #1702 needed both
  to be described honestly.
- **One viewport (1280×720), export shell only** — never the player, the
  Playground, or a real device.
- **The `--text-muted` / `--border` decorative tier** stays WCAG-exempt by palette
  contract, so chrome-ink regressions are still not caught (ADR gaps G13/G15/G16).
- **Occluded runs.** Genuinely-hidden text is still scored as if visible; detecting
  it needs per-glyph hit-testing the prober deliberately does not do.
- **Raster backdrops remain unmeasured**, not merely exempted. Measuring them needs
  per-pixel sampling of the decoded image behind each glyph.
- **Not re-verified on the PDF rasterizer.** Everything here is measured on the
  rendered DOM in Chromium. The `journey` stage ribbon is plain CSS `background` +
  `color`, so no rasterizer-specific behaviour is expected, but the claim is DOM-
  scoped (HARD RULE #23).

## Observed, not fixed (found-not-caused, off-path)

- `div.watermark` carries no `aria-hidden`, so a decorative 440px letter is exposed
  to assistive technology. `axe` is green on it, and it is outside this change's
  path — logged here rather than swept in (HARD RULE #18).
