---
origin: 3025
priority: P2
recorded: 2026-11-04
area: engine
severity: medium
swimlane: engineering/pipeline.md
deferred: off-path — red on main at a1b278c before this PR; the player's canvas sizing is not a surface #3025 touches
source: https://github.com/Laticent/lattice/pull/3025
---

# `verify-player-input`: the 4K deck shows a 1280×720 canvas in the player

what      — `node tools/verify-player-input.mjs` fails one check, the same on `main` (a1b278c) and on #3025's
            branch: `4K: the deck keeps its OWN canvas in the player — 1280px x 720px`, where the table at
            tools/verify-player-input.mjs:318 expects `3840px x 2160px` for `examples/gallery-jargon.md`
            (`size: 4K`). The story, portrait and mobile decks keep their canvas, so the 4K path alone falls back to
            the player's old hardcoded 1280×720 (the regression the file's header, line 36, says it guards).
            `npm run evidence` lists this tool for any change under lib/export/, and nothing runs it per PR, so it
            went red without a signal.
first     — bisect `tools/verify-player-input.mjs` between the last green run and a1b278c; check whether
            `size: 4K` still resolves to 3840×2160 in the engine (`lib/engine`) or only the player reads it wrong.
done when — the check passes, and the cause is named in the fix's commit.
evidence  — the tool's full run green; the 4K line showing `3840px x 2160px`.
verify    — tier 1 unless the cause is in the engine's size resolution (then maker-checker).
