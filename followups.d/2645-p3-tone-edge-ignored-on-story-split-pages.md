---
origin: 2645
priority: P3
recorded: 2026-10-12
area: theming
severity: low
swimlane: engineering/decisions/2026-08-18-split-frame-edge-ownership.md
source: https://github.com/Laticent/lattice/pull/2645
---

# `split-panel tone-fail tone-edge` shows the deck's rainbow bar on `size: story` pages

```text
why now   — found while checking #2645 for regressions on portrait. Pre-existing: the pages are
            pixel-identical with and without that fix.
where     — a `size: story` deck (2160x3840) auto-splits `split-panel` into a cover page plus a
            body page. At x=300 and x=1800, rows 2 and 10, the bar reads the spectrum
            (`#005586` then `#44AB62`), not the tone color, on every page.
done when — a semantic `tone-edge` on a portrait split page draws the tone color, or the rainbow
            bar is recorded as intended for auto-split pages.
evidence  — CLI render of a `size: story` deck, light and dark, `tone-fail tone-edge`.
verify    — tier 1 checker if the selector changes.
```
