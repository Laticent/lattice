---
origin: 2547
priority: P3
recorded: 2026-10-06
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-live-collaboration-roadmap.md
source: https://github.com/Laticent/lattice/pull/2547
---

# Let a person lock the slide they are working on

why now   — two people editing one slide at once is legal but confusing; a light "I'm on slide 4" lock would prevent it (roadmap §6).
where     — docs/src/components/studio/live/ (awareness carries the lock, the host arbitrates), the editor's read-only ranges.
done when — a person can lock a slide, others see it locked and cannot type there, and the lock clears when the person leaves.
evidence  — a demo deck and a two-browser check.
verify    — tier 1 checker.
