---
origin: 2887
priority: P2
recorded: 2026-10-25
area: chart
severity: medium
swimlane: tools/build-chart-finish-css.js
source: https://github.com/Laticent/lattice/pull/2887
---

# Rebuild the chart finishes as token swaps, the way `dark` works

```text
  P2 · each chart finish repeats ~200 mark rules instead of swapping a few tokens
       why now   — #2887 measured the generated finish CSS: 194KB raw, 9.8KB gzip, of which
                   etch is 67KB / 3.6KB and tone 75KB / 4.0KB (pigment 52KB / 3.2KB), about
                   14% of the 1.04MB CSS bundle. Each finish re-targets every chart mark with
                   its own rule per color slot, paint property and text-bearing variant. The
                   same weight forced the playground snapshot cache to add a finish-mark test.
                   The owner picked token swaps over retiring etch and tone (2026-10-25).
       where     — tools/build-chart-finish-css.js and its output
                   lib/components/chart/_chart-family/chart-finish.generated.css;
                   docs/src/playground/snapshot-cache.js (finishArmAbsent / finishMarksAbsent).
       done when — one shared set of mark rules reads per-slot tokens (fill, text-bearing
                   fill, edge, edge width), and each finish is a small block of token values on
                   the section, like `dark`. tone keeps its two ladders (TONE, TONE_TEXT, and
                   TONE_TEXT_D on a dark slide) and etch its heavier edge, as token values.
                   Status marks stay excluded, and the a11y themes' !important textures still
                   win (keep each rule at (0,1,1)).
       evidence  — pigment's own rules are 52KB raw today, so the rebuilt file is projected
                   near 55KB; measure it, do not quote the projection.
       verify    — node tools/build-chart-finish-css.js --check; the golden diff shows no
                   pixel change under each finish; palette-sweep and composed-contrast stay
                   green; the snapshot-cache tests pass with the finish-mark test simplified
                   or removed.
```

Design first (CLAUDE.md, design-before-code): name the per-slot tokens and show the owner
before the generator changes. Its own PR, after #2887 merges (HARD RULE #17).
