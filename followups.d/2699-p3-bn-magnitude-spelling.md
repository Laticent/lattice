---
origin: 2699
priority: P3
recorded: 2026-10-14
area: chart
severity: low
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
source: the tier 1 checker on #2699 (the malformed-number reader)
---

# `5Bn` reads as 5 with the unit `Bn`, not 5 billion

why now   — the shared number reader (docs/src/lib/segno/types.ts, mirrored by
            lib/core/chart-values.js) takes a magnitude only as `k` `K` `m` `M` `b` `B` `bn` `T`,
            so `5Bn` and `5BN`, common in finance decks, plot at 5 and print the unit `Bn`. A
            chart mixing `$5bn` and `$5Bn` draws them a billion apart. It is a spelling decision,
            not a malformed number, so #2699 left it alone.
where     — `MAGNITUDE` and the magnitude regex in types.ts `readNumberFull` / `readNumberFast`,
            `MAGNITUDE` and `MAGNITUDE_ONLY` in lib/core/chart-values.js, `SPOKEN_MAGNITUDES`.
done when — `Bn` and `BN` read as billions on every chart and in the narration, or lint names
            them with the `bn` fix; both readers change together and the parity test passes.
evidence  — a before/after unit table through both readers; the corpus render hash unchanged.
verify    — tier 1 checker, because it moves rendered chart values.
