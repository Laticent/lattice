---
origin: 3351
priority: P1
recorded: 2026-11-21
area: docs
severity: medium
swimlane: engineering/decisions/2026-11-20-four-notes.md §2
deferred: blocked — the owner signs off every change to a public spec's meaning
source: https://github.com/Laticent/lattice/pull/3395
---

# The owner ratifies the LFM 2.0 draft

why now   — #3351 shipped the four notes in the engine, the Studio, the exports and lint, and wrote
            spec/LFM-2.0.md as changes against 1.1, but the spec still reads "Draft, for the owner's
            sign-off". The engine already reads 2.0 notes, so the published spec (1.1) and the shipped
            engine disagree on §3.5 until 2.0 is ratified. 2612-p2 covers only the 1.x drafts.
where     — spec/LFM-2.0.md (status line, change log), spec/README.md, and the docs projection that
            2612-p2 sets up for ratified specs.
done when — the owner signs off; spec/LFM-2.0.md reads Ratified with an owner line, and
            spec/README.md lists 2.0 as current.
evidence  — the owner's word, quoted in the PR.
verify    — tier 0 gates (lint, build:check), because it is docs only.
