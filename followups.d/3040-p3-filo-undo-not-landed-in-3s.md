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

2026-11-12 (PR #3156): the probe now records a miss (`undo-probe.js`, the doorbell rows): it keeps watching 15 s, then
reads Filo's stored undo and redo tops. Dispatch 43241110666 caught one on the iPhone, row #1: the `historyUndo` was
prevented (Filo took the command), the deck text was UNCHANGED after 15 s, and Filo's store held the typed word's step on
its REDO list (`undone top Typing/markdown (25..25, last 19576 ms ago)`, `done 1`). So it is not the probe's wait: Filo
moved the step to undone and the editor never received the text that undo produced. The iPad's three rows passed.
Leads, read but not reproduced: (a) the editor's value sync skips a `source` that `isStaleEditorEcho` calls one of
its own trailing emissions (Editor.tsx, StudioShell.tsx); `setSourceFromHistory` clears that list, so the undo's text
should pass, unless a typing transition still in flight lands after the history write; (b) `catchUpEditor` writes the
editor's newest emission straight to `source` with no Filo commit, which would put the typed text back while Filo's redo
list keeps the step, exactly as seen. Next: at a miss, log Filo's head text, the shell's `source`, the editor's text and
`editorEchoesRef`, which tells (a) from (b). That log line is in (`window.__latticeFiloProbe`, read by the probe at a
miss, ffce3e5d), and two more dispatches at that commit caught no miss: 43259077319 (iPad and iPhone) and 43259084714
(iPhone), 9 doorbell rows, all landed; 43298963972 (iPad, iPhone and Mac, d73c8685) landed every row too, with 0 live
preview frames removed. The next miss the nightly records names the writer.

done when — the probe names what Filo undid at a miss, and the cause is fixed or shown to be the probe's own wait.
