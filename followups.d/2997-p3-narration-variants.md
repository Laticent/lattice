---
origin: 2997
priority: P3
recorded: 2026-11-02
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-02-declared-figure-semantics.md §4a, §4c
deferred: blocked — step 4 of the gated order (regia-narrator §8) waits on Regia (2997-p2)
source: https://github.com/Laticent/lattice/pull/2997
---

# Turn on phrase variants, `verbosity:` and frame-skipping

why now   — authors control how much is said per deck and slide; narration stops repeating itself
where     — Regia's policy; the `verbosity:` / `_verbosity:` registers; `_delivery:` per slide in the player
done when — variants are seeded by the slide's own tree (never position); the accessible description stays phrasing 0;
            frame-skipping happens only when a timeline is built
evidence  — the reviewed golden change, on its own
verify    — tier 1 checker, because it changes shipped narration text
