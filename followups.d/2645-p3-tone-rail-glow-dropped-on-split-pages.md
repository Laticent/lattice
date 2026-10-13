---
origin: 2645
priority: P3
recorded: 2026-10-12
area: theming
severity: low
swimlane: engineering/decisions/2026-08-18-split-frame-edge-ownership.md
source: https://github.com/Laticent/lattice/pull/2645
---

# A semantic tone's rail and glow styles are dropped on auto-split pages

```text
why now   — found by the checker on #2645. The same root cause as the tone-edge fix: split pages carry the
            semantic as `data-split-mods`, not a `.tone-*` class.
where     — `size: story` deck, `cards-grid tone-warn`: the cover has no left rail at x=1, the native body
            page has one (`#8A5D00`). `decision` and `split-panel` pages, cover and body, have no rail.
done when — a rail or glow tone style on a split page draws the tone color on every page, or the drop is
            recorded as intended.
evidence  — CLI render of a `size: story` deck, light and dark, `tone-warn` with the default rail style.
verify    — tier 1 checker if a selector changes.
```
