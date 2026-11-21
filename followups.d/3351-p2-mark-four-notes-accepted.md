---
origin: 3351
priority: P2
recorded: 2026-11-21
area: docs
severity: low
swimlane: engineering/decisions/2026-11-20-four-notes.md
deferred: blocked — the note's status follows the LFM 2.0 sign-off (3351-p1), which is the owner's
source: https://github.com/Laticent/lattice/pull/3395
---

# Mark the four-notes decision note accepted

why now   — #3351 merged, but engineering/decisions/2026-11-20-four-notes.md still reads
            `status: in-progress`, so the decision index shows a shipped decision as open.
where     — the note's front matter (`status:`) and its **Status:** line.
done when — the note reads `status: accepted`, in a small docs PR, once 3351-p1 is settled (or
            sooner, if the owner says the note need not wait for the spec).
evidence  — build:check green (the decision index regenerates).
verify    — tier 0 gates, because it is docs only.
