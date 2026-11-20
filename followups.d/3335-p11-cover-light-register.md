---
origin: 3335
priority: P11
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new register plus a fix to the title component in both modes
source: https://github.com/Laticent/lattice/pull/3335
---

# F2: fix the light mood on title slides, and a bookends register

why now   — seven of the eight presets that clear 8.5 use a light cover; the engine's `light` token is a silent no-op on `title` while `divider light` works (D6).
where     — lib/components/anchor/title/title.styles.css:27 and :39; closing; mirror divider.light (divider.styles.css:78, :84); a new lib/core/resolve-bookends.js.
done when — `title light` and `closing light` repaint in light and dark with scheme-aware inks; `bookends: inverse|light` stamps it on every bookend, defaulting to today's look (golden renders unchanged); contrast measured.
