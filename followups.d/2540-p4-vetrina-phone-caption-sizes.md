---
origin: 2540
priority: P4
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2540
---

# Vetrina's caption on a phone: a 44 px Exit and a larger caption font

why now   — measured 2026-10-06 (decision record §Caption): every caption style has its Exit at 27–32 px
            on a 390px phone, under the 44 px touch target, and caption text at 13.5 px.
where     — docs/src/lib/vetrina/stage.ts (exitCircle sizes, the dock's font size) and its `--vt-*`
            tokens; docs/src/lib/vetrina/README.md §Theming.
done when — at ≤699px the Exit hit area is ≥44 px and the caption is ≥15 px, with no change at desktop.
evidence  — the caption measurement re-run (Exit px, font px, occlusion) at 1440/820/390; screenshots.
verify    — tier 1 checker, because stage.ts is the shared engine every tour and lesson uses.
