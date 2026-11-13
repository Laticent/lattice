---
origin: 3194
priority: P3
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-10-26-squadra-lint-library.md §6
deferred: off-path — older than PR #3194 (it reproduces on main at a80ba80f) and not in a rule it moved
source: https://github.com/Laticent/lattice/pull/3194
---

# Fix all stalls on `unknown-inline-kind` in a source holding a data-URI image

why now   — `npm run squadra:fix-diff` reports 20 stalls, all this one: the driver reverts the fix as
            `did-not-resolve` and the old one-fix loop applied it, so the finding is left on a live line.
where     — `lib/authoring/lint-core.js` `unknown-inline-kind` with payload elision (`lib/core/payload-elision.js`,
            `restoreFindings`); the fix diff's corpus 1 has the input.
done when — `npm run squadra:fix-diff` reports no stall.
evidence  — the fix-diff report.
verify    — maker-checker: it touches the payload-elision path every lint takes.
