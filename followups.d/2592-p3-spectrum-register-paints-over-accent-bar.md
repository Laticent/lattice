---
origin: 2592
priority: P3
recorded: 2026-10-07
area: theming
severity: low
swimlane: engineering/decisions/2026-07-03-status-marker-style-variants.md
source: https://github.com/Laticent/lattice/pull/2592
---

# Decide whether `spectrum: solid|duo|mono` should paint over an `accent` or `tone-edge` bar

```text
why now   — found by the checker on #2592 while it traced every border-image rule; reasoned from
            specificity, not rendered. In a `spectrum: duo` (or solid, mono) deck, an `accent`
            or `tone-edge` slide's top border keeps its color but the register's gradient paints
            over it, because the register rule sets `border-image-source` at (0,3,1) and the two
            slide rules reset it at (0,2,1). Pre-existing; #2592 did not change it.
where     — lib/base/base.variants.css: the register rule
            `section:is(.spectrum-solid, .spectrum-duo, .spectrum-mono):not(.divider):not([class*="spectrum-edge-"])`
            (around line 261) against `section.accent:not(.split-panel, .split-compare)` in
            lib/shared/shared.styles.css and the `tone-edge` rule (around line 127).
done when — a rendered `spectrum: duo` deck with an `accent` slide and a `tone-edge` slide shows
            which bar wins, and the owner of the spectrum registers decides: either the slide's
            own bar wins (exclude `.accent` and `.tone-edge` from the register rule), or the
            register wins by design (say so in the status-marker note's §spectrum).
evidence  — the CLI render of that deck in a light and a dark palette, sent via SendUserFile.
verify    — tier 0 gates if it is documented as intended; tier 1 checker if a selector changes,
            because the register rule reaches every slide of a deck that sets it.
```
