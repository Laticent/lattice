---
origin: 3335
priority: P1
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-slide-and-share-presets.md §7
deferred: large — an engine class family, Studio panel and docs; PR 3335 is design-only
source: https://github.com/Laticent/lattice/pull/3335
---

# Build slide looks (Standard, Spotlight, Contrast)

why now   — the owner settled the slide-looks design in PR 3335 and chose to build it first.
where     — the class reader every render path shares (HARD RULE #1), lint vocabulary, slide-directives/slide-provenance, SlideContext.tsx Basic tier.
done when — `look-spotlight` and `look-contrast` expand in the shared kernel; the slide panel shows three live tiles with a change count; 6 of the 16 tokens are universal, so each layout is checked against the other 10 (§3.2); demo deck examples/slide-looks.md.
