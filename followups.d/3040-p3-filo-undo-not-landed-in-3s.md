---
origin: 3040
priority: P3
recorded: 2026-11-05
area: website
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §3
deferred: off-path — seen before PR #3040's undo doorbell existed; needs a trace of Filo's history at the miss
---

# A WebKit undo reaches Filo, and the word is not gone 3 s later (2 recorded rows in about 500)

`ios-safari-undo`'s recorded rows (not its checked steps) caught this twice on the iPad: dispatch 42031892694 cycle #9,
before the undo doorbell existed, and dispatch 42118283820's doorbell row #2 at `f9a777d`. Both times the `historyUndo`
beforeinput arrived and StudioShell cancelled it (`prevented true`), so the gesture reached Filo, but the probe's 3 s wait
for the typed word to disappear ran out. Every checked step in both runs passed.

Leads, not verified: the word joined the step before it (the probe restores the deck between rows), Filo undid a
different step than the word, or the undo landed after 3 s on a loaded simulator. Next: have the probe log Filo's top
history entry and the deck text at the miss, and how long after the command the text changed, if it did.

done when — the probe names what Filo undid at a miss, and the cause is fixed or shown to be the probe's own wait.
