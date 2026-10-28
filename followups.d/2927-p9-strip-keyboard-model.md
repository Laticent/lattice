---
origin: 2927
priority: P9
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md §9
source: https://github.com/Laticent/lattice/pull/2927
---

# The strip's keyboard and screen-reader model

why now   — Reproduced: a focused thumbnail that unloads drops keyboard focus to the page; the menu and shortcuts make the strip a keyboard surface.
where     — `docs/src/components/map-rail/MapRail.tsx` (`tabStop` :271), `docs/src/components/studio/SlideRail.tsx`, `docs/src/components/studio/deck-nav.ts` (`ARROW_OWNING_ROLES`).
done when — the strip is a roving-tabindex list with the current slide always rendered; `⋯` and `+` sit outside it; one live region announces results; shortcuts fire only with keyboard-arrived strip focus and are listed in the menu and under "?".
evidence  — Focus drop reproduced in Chromium, 2026-10-27: `2927-p9-strip-keyboard-model/README.md`.
verify    — Keyboard-only and VoiceOver passes on the real Studio.
