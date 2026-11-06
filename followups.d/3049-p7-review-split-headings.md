---
origin: 3049
priority: P7
recorded: 2026-11-06
area: engine
severity: medium
swimlane: design/skills/fix-findings.md
deferred: off-path — lib/authoring review numbering; found while writing the fix-findings skill
source: https://github.com/Laticent/lattice/pull/3049
---

# The review and lint number slides by --- only, while the engine also splits at every ## by default

why now   — a writer agent saw review-core merge a heading-less big-number slide with its neighbors in a deck without ---
            between slides, and report a false wall-of-text. The new skills avoid it by always writing ---.
where     — lib/authoring/review-core.js and lint slide numbering vs lib/core/heading-split-core.js (split: headings).
done when — review and lint count the slides the engine renders, or the mismatch is ruled out with a test.
evidence  — a failing test deck reproducing the false finding, then passing.
verify    — tier 1, plus the unit suite.
