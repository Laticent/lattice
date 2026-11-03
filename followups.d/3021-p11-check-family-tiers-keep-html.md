---
origin: 3021
priority: P11
recorded: 2026-11-03
area: infra
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — a tool #3021 found broken while auditing; it does not touch the tool
source: https://github.com/Laticent/lattice/pull/3021
---

# check:family-tiers crashes before testing anything: its render lacks --keep-html

why now   — tools/check-family-tiers.js line ~1107 renders without --keep-html (the conformance path at ~1049 has it), then opens an HTML file that was never written: net::ERR_FILE_NOT_FOUND.
where     — tools/check-family-tiers.js.
done when — npm run check:family-tiers runs to completion and reports.
evidence  — the ERR_FILE_NOT_FOUND crash, reproduced on main at c0cbc52.
verify    — npm run check:family-tiers.
