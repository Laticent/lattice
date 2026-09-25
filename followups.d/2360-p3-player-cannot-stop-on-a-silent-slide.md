---
origin: 2360
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/issues/2360
---

# While narration plays, the exported player cannot stop on a slide that has no narration

why now   — found by the LTT step-2 red team; it predates step 2, and step 2 made the transport
            rules normative (engineering/ltt.md §The transport), so the rule that decides it
            should be written down before a second player copies today's behavior.
where     — lib/export/player-core.mjs `narrationJs`: `onSlideShown` → `speakSlide(i)` → a
            segment with no cues → `nextCue(0)` → `endSlide()` → `t.next()` at once. Rule 6 says
            manual navigation "speaks it with no hold", and a silent slide has nothing to speak.
done when — the owner rules what manual navigation onto a silent slide does while narration
            plays (hold it for its `holdMs` and then advance, stay until the viewer moves, or
            pause narration), rule 6 in engineering/ltt.md says so, and the player does it.
evidence  — the red team's repro: slides 1 and 3 narrated, slide 2 not; during slide 3 press
            Previous. After ~20 ms the count is back on "3 / 3" and slide 3 restarts after its
            hold. Pressing Next onto a silent slide skips it the same way.
verify    — the real-browser verifier (tools/verify-narrated-player.mjs) gains the case.
