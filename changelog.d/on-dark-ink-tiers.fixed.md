- Dark panels (`title`, `divider`, `closing`, every `split-*` rail) had three elements
  inked from the wrong tier of the on-dark ramps: the `closing` eyebrow drew from
  `--on-dark-ghost`, documented decorative chrome (2.49:1 on indaco, 2.67–2.91:1
  elsewhere) while its sibling bookends already used `--on-dark-secondary`;
  `split-panel metric`'s row rule and heading hairline drew from
  `--on-dark-watermark`, the near-invisible backdrop tier (1.40:1, and 1.27–1.46:1
  elsewhere, against WCAG 1.4.11's 3:1); and `split-panel watermark`'s eyebrow and
  `h5` drew from `--on-accent-secondary`, a 70% derivation that spends the AA margin
  each palette curates into `--on-accent` (measured on all 14, sub-AA on **seven** —
  mustard 3.34:1 through carta 4.40:1; the seven that pass do so on their own accent's
  headroom, not because the accent is dark — carbone clears 5.85:1 on a bright lime).
  The first two were sub-threshold in **all 14 palettes**. All three now name the rung
  that matches their job.
- **`--on-dark-secondary` 68% → 76% white.** This is the whole fix for the reported
  defect: at 68% the eyebrow/subtitle/dek tier measured 6.08:1 on indaco — the only
  palette below AAA on that tier, because indaco's `--surface-inverse` (`#003D66`) is
  the lightest panel in the repo and the ramp is palette-blind. At 76% the worst case
  across all 19 palettes is **7.17:1**.
- **`--on-dark-ghost` 32% → 42% white**, so the rule/divider rung clears 3:1 on every
  palette's panel — at 32% it cleared it on **none** (2.49–2.90:1). `cuoio`, the one
  palette that overrides this ramp, tracks the lift (30% → 40%, 3.82:1) so its own
  value clears the same floor on the engine render path.
- `tools/check-slide-contrast.js` was blind to most of the above, and to more besides.
  It parsed only `rgb()`/`rgba()` while Chromium serializes `color-mix(in srgb, …)` as
  `color(srgb …)`, silently dropping **18 of 69 text runs (26%)** on a bookend probe.
  It also **never read SVG `fill`** — chart text is painted by `fill`, not `color`, so
  every chart label in the repo was scored against an inherited value that is not what
  renders (one word-cloud word: reported 11.96:1, actual 1.20:1). Both fixed, plus a
  1×1-canvas fallback for any color space (`oklab()` was dropping live `kanban` runs),
  a pseudo-element's own background, and sibling underlays resolved by geometry.
  Non-rendering SVG `<desc>`/`<title>`/`<metadata>` are excluded, and the
  **WCAG-exempt decorative tier** (`--text-muted`, `--border`) is now reported in its
  own bucket rather than padding the failure count — on one gallery that separated 89
  reported failures into 4 real and 84 exempt.
- `tools/contrast-audit.js` now **reads** the on-dark alphas from `base.tokens.css`
  instead of keeping a copy that could go stale, and honors the long-documented but
  never-read `minRatio` — which admits the first non-text pair, `--on-dark-ghost` vs
  `--surface-inverse` at 3:1.
