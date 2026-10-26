---
origin: 2887
priority: P2
recorded: 2026-10-26
area: chart
severity: medium
swimlane: tools/build-marks-css.js
source: https://github.com/Laticent/lattice/pull/2908
---

# Tone still draws line, slope and ep-curve in several colors

```text
  P2 · tone's rule is "one color in shades; only status adds color", and four charts still break it
       why now   — the owner's goal (2026-10-26) is a consistent, clear, clean look across the charts of a finish.
                   After the one-ladder change (#2908) every body-painted tone chart follows the rule, and the word
                   cloud steps by weight tier. The three whose identity is a STROKE (line, slope, ep-curve) keep a
                   category hue per series, because no finish reaches a mark with `paint: "none"`. The waterfall's up and down bars
                   keep status hues on purpose.
       where     — the mark contract (`kernel.marks[].paint`, slot-contract.md) and tools/build-marks-css.js
                   (STROKE_MEMBERS); line, slope, ep-curve, word-cloud transforms and styles.
       done when — under tone those three draw their series in steps of the one hue, told apart by depth and a dash from
                   the fifth series (as tone's layered polygons already do).
                   Under pigment and etch nothing changes.
       evidence  — the three charts under tone, light and dark, beside pigment; text and line contrast per series.
       verify    — chart-finish-reach --all-themes --check; the contrast probe; the adversarial trio (it changes the
                   mark contract, which every chart reads).
```

Design first (CLAUDE.md): this adds a `paint: "stroke"` value to the manifest schema, a breaking change to the mark
contract. Put the schema change to the owner before building. Decided on 2026-10-26: etch's category-colored labels
(the old "letter" half) are dropped: on a one-series bar chart every label wore the same blue, which is decoration.
