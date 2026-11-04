---
origin: 3021
priority: P14
recorded: 2026-11-04
area: infra
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — the same months-long drift p11 found in check:family-tiers, in the tool's separate `--conformance` record; this PR neither causes nor worsens it, and each drifted cell needs its own look before a bless
source: https://github.com/Laticent/lattice/pull/3021
---

# check:family-conformance reports drift, and its record is stale

why now   — with check:family-tiers green again (this PR re-blessed its overflow oracle), `npm run check:family-conformance` still fails: 84 drifted cells plus state-chart leaving the record. Most cells moved from "fires" to "N/M unexercised" because the roster now renders more gallery slides. timeline-list portrait/story/mobile moved the other way ("9/11 unexercised:2" to "fires") with this PR's chip fix.
where     — tools/check-family-tiers.js `--conformance` and its recorded baseline; the components it names.
done when — each drifted cell is explained (a gallery that grew, a real lost reflow) and `npm run check:family-conformance:bless` records the result with a reason per component; `npm run check:family-conformance` exits 0.
evidence  — the tool's output before and after, per component.
verify    — npm run check:family-conformance exits 0.
