- **Added: a judging gate for deck presets.** `node tools/preset-gate.js` renders the new
  30-slide preset corpus deck (`test/fixtures/preset-corpus.md`) under a preset or a candidate
  recipe, in its own palette and mode, the opposite mode and indaco light, as PNG and as the
  exported PDF. It runs the machine gates first (overflow, text contrast at 4.5:1, chart-mark fill
  contrast at 3:1, `check-jank`, and `pixel-check` against an earlier run), stops a preset at
  its first failure, and writes one contact sheet per row plus `summary.json`. The judge
  protocol that follows it is in `engineering/decisions/2026-11-20-deck-preset-study.md` §8.
- **Fixed: `check-jank` no longer reads a deck finish as content.** A `finish:` adds a
  full-bleed backdrop layer to every slide, and the sweep counted it as ink, so under any
  preset with a finish (Editorial, Brand-forward) every step measured the same and the verdict
  was meaningless. The sweep now skips the slide's backdrop layer.
