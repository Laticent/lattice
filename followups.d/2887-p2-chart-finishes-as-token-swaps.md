---
origin: 2887
priority: P2
recorded: 2026-10-25
area: chart
severity: medium
swimlane: tools/build-marks-css.js
source: https://github.com/Laticent/lattice/pull/2887
---

# Rebuild the chart finishes as token swaps, the way `dark` works, under one `marks:` key

```text
  P2 · each chart finish repeats ~200 mark rules instead of swapping a few tokens
       why now   — #2887 measured the generated finish CSS: 194KB raw, 9.8KB gzip, of which
                   etch is 67KB / 3.6KB and tone 75KB / 4.0KB (pigment 52KB / 3.2KB), about
                   14% of the 1.04MB CSS bundle. Each finish re-targets every chart mark with
                   its own rule per color slot, paint property and text-bearing variant. The
                   same weight forced the playground snapshot cache to add a finish-mark test.
                   The owner picked token swaps over retiring etch and tone (2026-10-25).
       where     — tools/build-marks-css.js and its output
                   lib/components/chart/_chart-family/marks.generated.css;
                   docs/src/playground/snapshot-cache.js (finishArmAbsent / finishMarksAbsent).
       done when — one shared set of mark rules reads per-slot tokens (fill, text-bearing
                   fill, edge, edge width), and each finish is a small block of token values on
                   the section, like `dark`. tone keeps its two ladders (TONE, TONE_TEXT, and
                   TONE_TEXT_D on a dark slide) and etch its heavier edge, as token values.
                   Status marks stay excluded, and the a11y themes' !important textures still
                   win (keep each rule at (0,1,1)).
       evidence  — pigment's own rules are 52KB raw today, so the rebuilt file is projected
                   near 55KB; measure it, do not quote the projection.
       verify    — node tools/build-marks-css.js --check; the golden diff shows no
                   pixel change under each finish; palette-sweep and composed-contrast stay
                   green; the snapshot-cache tests pass with the finish-mark test simplified
                   or removed.
```

**Tone's edges must keep their category ink (owner's pick, 2026-10-25).** On `main` and on #2887,
every tone edge reads `--chart-cat-1-ink`, so a category's hue survives nowhere under tone on pie,
tower, stacked-bar and quadrant (closest pair of edges 0 OKLab apart, measured). The design note
says the edge is "the only place the categorical hue survives"
(`engineering/decisions/2026-09-07-chart-design-language/tone-is-the-third-finish.md`). The
per-slot edge token above is where this lands: under tone, slot N's edge is `--chart-cat-N-ink`.
Verify with the closest-pair measurement on tower and matrix-grid, where tone's bodies alone sit
0.008-0.016 apart.

Design first (CLAUDE.md, design-before-code): name the per-slot tokens and show the owner
before the generator changes. Its own PR, after #2887 merges (HARD RULE #17).

## The owner's pick for the key (2026-10-25, on #2887)

One front-matter key controls the look of EVERY mark on the deck, so a slide can never show two looks:

- **`marks:`** replaces `chart-finish:`. **Done in #2887**: the key, the `marks-*` slide classes, lint
  (`marks-renamed`, info, for the old spelling, which still renders), the Studio and the docs. Its two words are
  unchanged: the finish (`pigment` · `etch` · `tone`) and the intensity (`muted` · `vivid`). The diagnostic
  tools keep their `chart-finish-*` file names, since the nightly CI calls `check:chart-finish-reach`.
- **Every mark follows it**, not only chart marks: chart bars and pills, checklist and verdict discs, kpi pills,
  roadmap discs. Today `etch` and `tone` restyle chart marks only, so under them a chart's status pill is a pale
  wash while a checklist disc on the same slide stays solid. The token swap fixes this by construction: a finish
  sets the mark tokens (`--pass-mark`, `--cat-N-mark`, …) on the slide, and every component reads them.
- **Not in `finish:`.** That key is the backdrop (layers behind the content); its values would share one list
  with the mark words, and `preset:` already sets it.
- **`preset:` sets `marks:`** so a named look covers marks too.
- No new key net: `marks:` replaced `chart-finish:`. Still for this PR: every mark following the finish (above) and
  `preset:` setting `marks:`.
