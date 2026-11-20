---
origin: 3335
priority: P11
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: large — a new register plus a fix to the title component in both modes
source: https://github.com/Laticent/lattice/pull/3335
---

# L2: a cover: light register for the title slide

why now   — seven of the presets that clear 8.5 use a light cover, which today needs a `light` class and doubled-class overrides an author never gets.
where     — lib/components/anchor/title/title.styles.css:27 and :39; mirror divider.light (divider.styles.css:78, :84).
done when — `cover: light` paints the title on `--bg` with `--fin-canvas` repointed and scheme-aware inks, in light and dark; title gallery renders reviewed; contrast measured.
