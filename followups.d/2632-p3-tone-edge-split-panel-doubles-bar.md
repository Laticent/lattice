---
origin: 2632
priority: P3
recorded: 2026-10-11
area: theming
severity: low
swimlane: engineering/decisions/2026-08-18-split-frame-edge-ownership.md
source: https://github.com/Laticent/lattice/pull/2632
---

# `split-panel tone-pass tone-edge` draws a section border over the panel ribbon

```text
why now   — found by the checker on the split-frame register fix. Pre-existing, identical in
            rainbow, duo, solid and mono, so that fix neither caused nor worsened it.
where     — lib/base/base.variants.css the semantic `tone-edge` rule (~line 126, (0,2,1)) beats
            `section.split-panel { border-top: none }` (0,1,1): a 4px tone border sits above the
            panel's own ribbon.
done when — a rendered split-panel / split-compare with a semantic tone-edge shows one bar, or the
            doubled bar is recorded as intended.
evidence  — CLI render, light and dark.
verify    — tier 1 checker if the selector changes.
```
