---
origin: 2711
priority: P4
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §12.6
---

# Give the Studio its own test harness, separate from the conformance contracts

why now   — 18 of 112 recent defect fixes were Studio app behavior (undo crossing decks, a chat reply shown twice), and the conformance harness deliberately does not reach them. The owner wants the Studio to have its own harness, kept separate from this one.
where     — docs/src/components/studio/; docs/e2e/; the 19 Studio-app rows in engineering/decisions/2026-10-15-conformance-harness/implicit.md
done when — a design note proposes the Studio harness (which panels and behaviors it enumerates, how it enrolls them) and the owner has ruled on it
evidence  — implicit.md §1: Studio-app 19 commits, 15 out of reach of an enumerating clause
verify    — the note exists and links back to the conformance harness note
