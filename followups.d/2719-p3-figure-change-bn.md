---
origin: 2719
priority: P3
recorded: 2026-10-16
area: website
severity: low
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: the tier 1 checker on #2719 (Bn and BN read as billions)
---

# The Architect's figure-change cue reads no `bn` spelling

why now   — `tokenValue` in docs/src/components/studio/ArchitectChat.tsx takes a magnitude only as
            one trailing letter (`k` `m` `b`, any case), so `$5bn`, `$5Bn` and `$5BN` are NaN and
            compare as literal text. A model reply that rewrites `$5B` as `$5bn` flags a figure
            change that is only a reformat. The chart readers settled the spelling in #2719
            (`B` `bn` `Bn` `BN` are billions); this cue never followed. Advisory only: it
            highlights, it never blocks.
where     — `tokenValue` and `figureChange` in ArchitectChat.tsx; the chart readers'
            `MAGNITUDE` in lib/core/chart-values.js is the vocabulary to match.
done when — `$5B` → `$5bn` / `$5Bn` / `$5BN` is not flagged, and `$5bn` → `$6bn` still is.
evidence  — a unit table through `figureChange` before and after.
verify    — self-review with the gates; it moves no rendered value.
