---
origin: 2862
priority: P4
recorded: 2026-10-22
area: comparison
severity: low
swimlane: engineering/decisions/2026-10-22-venue-conformance.md §6
source: https://github.com/Laticent/lattice/pull/2862
---

# pricing's sample footnote is clipped by its list item at laptop size

why now   — the harness found it; it predates venues ("Checks accumulate up the ladder" is cut by its li).
where     — lib/components/comparison/pricing/ (grep the footnote class).
done when — check:venue-conformance --only=pricing is clean at laptop and the KNOWN rule is deleted.
evidence  — a rendered PDF page.
verify    — self-review with the gates.
