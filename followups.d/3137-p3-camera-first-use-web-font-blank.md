---
origin: 3137
priority: P3
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — logged from a session archive sweep; the slide camera is not touched by the PR that records it, and the case is unreproduced
source: https://github.com/Laticent/lattice/pull/3137
---

# A web font used for the first time inside the slide camera's photo can come out blank

why now   — #3137 saw it in a bare test page, never in the CLI: a web font whose first use on the page is inside the
            slide camera's photo can draw as blank, presumably because the photo is taken before the font loads. If
            it can happen on a real surface, it is a flake shape (HARD RULE #32: wait for a signal, here the font's
            load, not a duration).
where     — lib/core/slide-camera.mjs (what the photo layer inlines and when it shoots); the bare test page that
            showed it.
done when — either the camera waits for every font the photo uses (`document.fonts` for those faces) and a test
            with a first-use font passes 10 runs alone and under load, or a reproduction attempt in the Studio and
            the CLI is written down with its result and the item is closed.
evidence  — #3137's report; not reproduced in this sweep.
verify    — a first-use font case in the camera's tests, `--repeat-each=10` and `--workers=4 --repeat-each=5`.
