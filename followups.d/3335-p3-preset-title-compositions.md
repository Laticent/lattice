---
origin: 3335
priority: P3
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new composition axis for title and section slides
source: https://github.com/Laticent/lattice/pull/3335
---

# N1: cover compositions as title and closing variants

why now   — the cover identity of all eight presets that clear 8.5, currently deck CSS in the prototypes (D6).
where     — the `cover:` register (p11), the title and closing manifests (as variants) and the --fs-* roles.
done when — the compositions are title and closing variants that presets set (D10), built from tokens only and passing `checkTypeSizeModifiers`; each renders in light and dark; the presets that use them clear the judging gate (§8).
