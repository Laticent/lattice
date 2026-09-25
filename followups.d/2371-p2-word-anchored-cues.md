---
origin: 2371
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# `_cues:` — an authored target that fires on a named word of the narration

why now   — authors need to say "mark row 4 when I say churn". The LTT `actions` layer already
            stores word-anchored actions with a validated `match`; the owner signed off on decks
            writing it (Fork 4a, 2026-09-25).
where     — lib/core/ltt-deck.mjs (write `actions`), lib/authoring/lint-core.js (a missing word is a
            lint error), the Guide plan (authored cues score as authored focus); engineering/decisions/2026-09-25-vetrina-delivery-presets.md §7.1, §8 step 7.
done when — `<!-- _cues: row 4 @ "churn" -->` marks row 4 as "churn" is spoken, in the Studio and,
            after the player step, in the export; a narration edit that moves the word fails lint.
evidence  — e2e on the built Studio plus validateLtt tests.
verify    — maker-checker.
