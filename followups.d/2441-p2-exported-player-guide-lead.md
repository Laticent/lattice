---
origin: 2441
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2441
---

# The exported player's Guide has no lead; Present's does

Found by the independent check of the Guide lead (#2441, commits 527bfa0 and 98c7458).

why now   — the owner saw the Guide's focus trail the voice on an iPhone. Present now leads each
            sentence by a self-calibrating amount (read-aloud.ts `guideCueFor`, `guideLeadFor`), but
            a webpage exported from the Studio beats its Guide on the player's own active cue
            (lib/export/player-core.mjs `guideBeat`), so a sent deck gets only the shared ease-out
            fade (base.focus.css) and can still trail on a slow phone. Two surfaces, one Guide, two
            timings: HARD RULE #1.
where     — player-core.mjs `nextCue` beats `guideBeat(k, true)` when cue k's clip is played. The
            lead would beat k+1 `lead` ms before its clip starts, on the same layout the player
            already holds (`layout().onsets`), with the same never-back rule.
done when — the lead logic lives once (a kernel both the reader hook and the player call), the
            player beats ahead of its clip by the calibrated lead, and a phone-width export test
            shows the focus ahead of each sentence.
evidence  — per-sentence focus-to-caption timings from the exported player at iPhone width,
            before and after.
verify    — tier 1 checker: it moves every exported deck's timing.
