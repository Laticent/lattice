---
origin: 3349
priority: P2
recorded: 2026-11-21
area: theming
severity: medium
swimlane: lib/base/base.registers.docs.md (rule:, eyebrow:) and engineering/chart-styling.md
deferred: large — a new color axis on existing front-matter keys, with Studio settings, autocomplete, contrast tests and a demo deck; it reverses decision D10 for these hooks, so it ships as its own PR
source: https://github.com/Laticent/lattice/pull/3349 — the owner's review of the marks-tone-source demo, 2026-11-21
---

# A curated color axis for the eyebrow, the heading rule and the chart's legend divider

The owner wants the eyebrow text, the heading rule and the chart's legend divider (the "spine",
`buildSpine` in `lib/plugins/chart-family/shared/svg-legend.js`) to be colorable from the front matter,
the Studio's deck settings and autocomplete. Today each is fixed by the theme: the eyebrow is
`--text-label` on a chart slide and `--text-secondary` elsewhere, the rule is `--rule-mark` (a
preset-only hook, decision D10), and the spine is `--accent` at 45%.

The owner's constraints, from the review:
- no new keys: add a color axis to keys that already exist (as `marks: tone ink` added one to `marks:`);
- thoughtful and holistic: one color vocabulary shared by every key that takes it;
- curated, never a free color: theme role words (and possibly the chart colors), each held to contrast
  on every built-in palette in both modes; choosing a color from the theme itself may come later;
- the spine's behavior under `marks: tone ink|accent` is undecided: the design note explains the options
  first, and #3349 leaves the spine as it was.

Start with a design note in `engineering/decisions/` (axes, the vocabulary, which existing key carries the
spine, how it meets D10), confirmed with the owner, before any CSS.

done when — the owner has confirmed the design, and the eyebrow, the heading rule and the spine each take
a curated color from an existing key: lint knows the words, the Studio offers them with autocomplete, a test
holds every word to contrast on every built-in palette in both modes, and a demo deck shows them.
