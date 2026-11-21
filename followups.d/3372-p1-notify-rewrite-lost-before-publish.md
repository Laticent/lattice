---
origin: 3372
priority: P1
recorded: 2026-11-21
area: website
severity: low
swimlane: engineering/gotchas/studio-playground.md
deferred: off-path — lib/notify.ts's action pill; #3372 changes Fix all, and its guards stop Fix all from raising two notices
---

# The action pill can keep its first message when a second is raised a fraction of a second later

why now   — While #3372's Playground second-press test ran with its in-flight guard switched off (a failing arm), two Fix all
            runs ended 60–550 ms apart and each raised a notice through `lattice:notify-action`. On Gecko the pill sometimes
            kept the first message ("Fixed 500 issues. 1 fix was not applied.") for its whole 12 s dwell and never showed the
            second (the stale notice), though the second raise happened (logged): 1 of 6 traced runs, a raise 78 ms after the
            first. The other 5 showed the second message. This is neither of the edges `engineering/gotchas/studio-playground.md`
            pins (a raise on a dying pill, "trap 3"; two raises in one tick). A message raised before Sonner has published the
            previous one (Sonner publishes a macrotask late, and under load that can be tens of ms) may be the case.
            With #3372's guards on, Fix all never raises two notices, so this needs two different notices raised close together.
where     — `docs/src/lib/notify.ts` `raiseSlot` (the action slot rewrites its live id in place); Sonner 2.0.7's late publish.
done when — Two `notifyAction` calls 50–500 ms apart, with the main thread busy between them, always end with the second
            message on screen, pinned in `notify.dom.test.tsx` (fake timers) and `e2e/status-pill.spec.ts` (Gecko).
evidence  — #3372 session: a diagnostic build logged both runs' end and stale flag; a 15 s sample of `[data-sonner-toast]`
            text showed `false:Fixed 500…@303`, then `true:Fixed 500…@11969` (removed), never the stale text. A `setTimeout(0)`
            during Fix all waits 0–38 ms (once 315 ms on Gecko), so timers are not starved.
verify    — Reproduce with two `window.dispatchEvent(new CustomEvent('lattice:notify-action', …))` calls 78 ms apart while a
            long Fix all runs in the Playground on Gecko; repeat 10 times and count runs where the second message never shows.
