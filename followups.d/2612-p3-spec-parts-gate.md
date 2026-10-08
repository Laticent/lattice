---
origin: 2612
priority: P3
recorded: 2026-10-08
area: infra
severity: low
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: https://github.com/Laticent/lattice/pull/2612
---

# A gate that every public spec declares its four parts, and that the paths resolve

why now   — spec audit §6 step 5. Keeps the spec category honest once the six public specs
            (owner ruling 2026-10-08: LFM, Diagnostic Protocol, LPM, LTT, the theme contract and the
            .lattice file) are in spec/.
where     — a header block in each spec/*.md naming document, schema, reference implementation and
            test cases; a check in tools/check-ownership.js (inside build:check — not a new CI job).
done when — the check fails on a missing part or a rotted path, with a failing arm.
evidence  — the check's output on a fixture with a missing part.
verify    — tier 0 gates; it adds a check inside an existing gate, not a CI job or step.
