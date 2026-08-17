- **Fixed: seven palettes' status trios now clear AA on the tints their own
  components paint them on.** `ardesia`, `brina`, `carta`, `cuoio`, `indaco`,
  `laguna` and `onyx` (and `a11y-base`, which inherits onyx's trio) painted
  `--warn` on a 10–12% tint OF `--warn` in the KPI status pill and the
  policy-recommendation stance badge, where the background moves with the ink and
  a canvas-based reading overstates contrast. Each trio is re-solved along the
  OKLab lightness axis, hue kept — **all three arms together**, because moving
  `--warn` alone erodes its deficiency separation from `--pass` and `--fail`,
  which lightness is the only channel to carry.
- **Fixed: `kpi.attention`'s hero pill was never contrast-audited.** `.attention`
  repoints the hero tile's pill at `--warn` while the tile keeps its
  `--accent-soft` fill — a third stack that `tools/composed-contrast.js` did not
  model, so 29 palette-modes were below AA there with every gate green. The
  surface is now in the catalog, and the two cascade regressions it exposed
  (`a11y-achromatopsia` and `a11y-tritanopia`, dark) are fixed with it.
- **Added: `npm run palette:bless`** — rewrites the two frozen palette baselines
  from a live measurement. Ratchet-only from here on: an entry may move up, a key
  the audit no longer produces is dropped, and a real loss is reported and refused
  rather than written down. This change itself re-represents 268 entries one unit
  lower, a one-time round-to-floor pass that tightens every claim it touches.
