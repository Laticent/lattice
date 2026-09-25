---
origin: 2356
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2356
---

# Cadenza gives an em dash the same pause as a comma

Raised while listening to #2356's narration. The owner deferred it to its own session and PR.

why now   — an em dash marks a deeper break than a comma, but it is not in `PAUSE_MS`, so it
            falls through to the default. Kokoro (af_heart) measured the dash at about 205 ms,
            the same as a comma (200), while a period gets 550.
where     — docs/src/lib/cadenza/cadence.ts `PAUSE_MS`; the cursor timing that reads it; any
            narrator text that uses `—` as a clause break.
done when — `PAUSE_MS` has an em-dash entry (proposal: ~450 ms, between clause and sentence), a
            unit test pins it, and a rendered clip confirms the longer pause.
evidence  — measured in the #2356 session with kokoro-js, voice af_heart, q8, CPU.
verify    — render one sentence with a comma and one with an em dash, and compare the silences.
