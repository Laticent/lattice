- **Fixed: `word-cloud spectrum`'s quietest ramp tier fell below WCAG AA.** The
  `>=1.5` weight tier renders below the 18.66px large-text threshold for any
  normalized weight in `[1.5, 1.588)` — ordinary body text owing the full 4.5:1 —
  and `--seq-400`, a 22% mix toward the canvas, could not pay it: **3.17:1 at
  18.2px/500** on `concrete`, reachable with six words of documented markup. The
  ramp now reads `--seq-900/700/600/500`, putting its floor on the palette's own
  contrast-gated anchor; worst case **5.35:1** across all 32 palettes in both
  modes. Surfaced by #1527, which is what let the palette's real ramp paint on the
  export path — before that, this tier took the base's collapsed ramp.
- **Fixed: the rendered-contrast gate could not see the sequential ramp.** All
  three of its surfaces carry the DEFAULT `word-cloud`, so the 4.5:1 floor had
  never scored a single `--seq-*` run on any palette. A fourth surface renders the
  spectrum deck, and `composed-contrast`'s `word-cloud/seq-*` bar moves `3` ->
  `4.5` so the static gate stops certifying what the renderer rejects.
