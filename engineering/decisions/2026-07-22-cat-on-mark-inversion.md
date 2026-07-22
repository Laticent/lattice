---
status: shipped
summary: Fixed the categorical corner-tag contrast failure (decision/roadmap/compare-prose deep tags) in 11 of 14 hue themes, where --cat-on-mark was set to var(--text-heading) — inverted (near-black on the saturated light-mode mark, white on the pale dark-mode mark), rendering ~1.3–2.5:1 against a 4.5 AA bar. Chose the theme-source re-curation over a component-level tag-background deepen: --cat-on-mark is now light-dark(#FFFFFF, near-black) everywhere, and the 8 chromatic themes' too-light light-mode marks were darkened minimally (hue+chroma-locked OKLCH, max ΔL ~6.5%, ≤0.7° drift) so white clears AA; carbone keeps its vivid marks with a near-black tag ink; onyx/concrete/a11y fixed by the flip alone. Locked by a new --cat-on-mark arm of checkCatContrast. Trade-off: ~33 more categorical-mark CVD collapses on an already-texture-backed set (semantic signals untouched, cvd-audit non-gating).
---

# `--cat-on-mark` inversion: fix categorical corner-tag contrast at the theme source

**Status:** shipped (#1172). **Area:** theming / accessibility.

## Symptom

The categorical corner tag — `decision` / `roadmap` / `compare-prose` deep tags (the
"THE PICK" pill, the roadmap quarter pills) — renders `--fs-meta`-bold text
(`--cat-on-mark`) on a `--cat-N-mark` background (via `--decision-accent-deep` /
`--phase-accent`, both `= var(--cat-N-mark)`). This is normal-size text → WCAG AA
**4.5:1**. Sampled on the rendered surface, 11 of 14 hue themes were at **~1.3–2.5:1**.

## Root cause

`--cat-on-mark` was `var(--text-heading)` in the 11 broken themes. `--text-heading` is
`light-dark(near-black, near-white)` — so on the **light** canvas it puts near-black on the
**saturated** mark, and on the **dark** canvas white on the **pale** mark: both **inverted**.
The three correct themes (indaco, cuoio, carta) hardcode `light-dark(#FFFFFF, <near-black>)`.

## Why it wasn't a one-line flip

Even *corrected* to `light-dark(#FFFFFF, …)`, white on the **light-mode** mark only reached
**~3.5:1** for 8 chromatic themes — their marks are curated as *borders* (WCAG 1.4.11 graphical,
3:1 vs canvas), not text backgrounds, so several hues are too light for white at 4.5. carbone
(flat-dark, vivid marks) fared worse (1.6:1). onyx/concrete cleared white/black once flipped.

## Options weighed

1. **Component fix — deepen only the tag background** (a `--cN-deep` = mark→black). Lowest blast
   radius (3 components, marks untouched, zero CVD impact). Restores the latent `--cN-dark` intent.
2. **Re-curate the marks at the theme source** so white clears 4.5 directly. Higher blast radius
   (marks drive kanban stripes, gantt borders, roadmap accents), but keeps "themes are the source
   of truth."
3. **Enlarge the tag text** to the large-text 3:1 bar. Weaker bar, typography/layout churn.

**Chosen: option 2** (owner call — themes as source of truth), executed with discipline to protect
identity:

- `--cat-on-mark` → `light-dark(#FFFFFF, <theme text-heading near-black>)` in all 11 broken themes
  (white clears the saturated/dark light-mode mark; the near-black clears the pale dark-mode mark
  at 8–14:1). This alone fixes onyx/concrete (grayscale/low-chroma marks) — and, via `@import onyx`,
  the a11y palettes too.
- 8 chromatic themes: **darken only the too-light light-mode marks**, minimally, hue+chroma-locked
  in OKLCH (**max ΔL ~6.5%, ≤0.7° hue drift**) until white clears 4.55. This also *raises*
  mark-vs-canvas edge and fill≠mark collapse — both improve. ~5 of 12 marks per theme change.
- carbone: keep the vivid marks; set `--cat-on-mark` to a near-black (`#0A0A0A`), clearing them at
  5.0–10:1. Darkening carbone's marks would need ~28% ΔL and destroy the theme's vivid identity.

## Trade-off (accepted, documented)

Darkening the 8 chromatic themes' marks adds **~33 categorical-mark CVD collapses** (`cvd-audit`
1470→1503). The categorical mark set was *already* CVD-heavy (25–31 collapses/theme) because 12 hues
exceed the ~6–8 distinguishable under dichromacy — which is exactly why categorical CVD distinction
is carried by the **`--cat-N-texture`** channel, not mark hue. The **semantic** signals
(pass/warn/fail) are untouched, and `cvd-audit` is non-gating (`--strict` opt-in). Net: an
already-texture-backed set gets marginally denser under CVD; no new accessibility regression.

## Gate

`checkCatContrast` (`tools/check-ownership.js`, run in `build:check`) gained a `--cat-on-mark`
vs `--cat-N-mark` ≥ 4.5:1 arm (n=1..12, both modes, fails-closed) — proven to catch a reverted
inversion. a11y palettes stay outside `checkCatContrast`'s sanctioned scope (grayscale/texture),
but were verified to clear via the onyx inheritance.

## Verified

Numerically (all 14 hue themes clear AA both modes), on the rendered surface (decision tags sampled
4.55–12.63:1 across every fix category incl. a11y), and visually (decision / roadmap / gantt / kanban
in ardesia + carbone — tags legible, marks stay rich, carbone's vivid identity intact).
