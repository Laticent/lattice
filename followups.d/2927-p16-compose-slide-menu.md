---
origin: 2927
priority: P16
recorded: 2026-10-27
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §11
source: https://github.com/Laticent/lattice/pull/2927
---

# Compose: the same verbs as the strip

why now   — Principle 4: one verb set on every surface.
where     — `docs/src/components/studio/ComposeView.tsx` (slide bar :797, `askDelete` :1015).
done when — the bar's + reads "New slide after"; a ⋯ menu has the strip's actions, names and order; its delete goes through the slide history.
evidence  — Design §11.
verify    — Drive Compose on the real Studio at three widths.
