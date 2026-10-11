---
origin: 2592
priority: P3
recorded: 2026-10-11
area: theming
severity: low
swimlane: engineering/decisions/2026-07-03-status-marker-style-variants.md
source: https://github.com/Laticent/lattice/pull/2592
---

# `spectrum: solid|duo|mono` paints a section top border on `split-panel` and `split-compare`

```text
why now   — found by the independent checker on the spectrum-register-yields-to-slide-bar change.
            Computed style in Chrome 131: under a styled register a split frame gets
            `border-top: 2px solid` plus the register gradient; in a rainbow deck the same frame
            computes `border-top: 0px none`. Pre-existing; that change did not cause or worsen it.
where     — lib/base/base.variants.css the register rule (~line 265, (0,3,1)) against
            `section.split-panel { border-top: none }` (split-panel.styles.css:84) and
            `section.split-compare { border-top: none }` (split-compare.styles.css:30), both (0,1,1).
done when — a rendered `spectrum: duo` deck with a split-panel and a split-compare slide shows
            whether the section border doubles the panel ribbon (2026-08-18 note); if it does,
            add `.split-panel, .split-compare` to the register rule's own `:not(...)`.
evidence  — CLI render of that deck, light and dark, via SendUserFile.
verify    — tier 1 checker if the selector changes: the register rule reaches every slide of a
            styled deck.
```
