---
origin: 3034
priority: P8
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §2
deferred: large — needs repeated real iOS Simulator runs (about 20 min each) to find why WebKit's undo stack is sometimes empty; not reproducible on Linux WebKit
---

# Sometimes Mobile Safari's own undo does not see a typed edit in the Studio

`ios-safari-undo` fails intermittently at its third step, "WebKit undo command raised historyUndo": the probe types " ONE",
waits up to 3 s for `document.queryCommandEnabled('undo')`, and WebKit reports it false throughout, so no `historyUndo`
beforeinput reaches Filo. Seen 3 times in about 17 runs: iPad at `089fd23` (nightlies 41193239222 and 41301950082) and iPhone at
`6ebacaa` (dispatch 41964538891, job 127039339630; the iPad and the Mac passed in that same run). The failure screenshot shows the
typed word in the editor and the Studio's own Undo arrow enabled: Filo's history has the step, and WebKit's native stack does not.
On a device that would mean Safari's Edit → Undo, shake-to-undo and the three-finger swipe offer nothing, while the Studio's own
Undo button still works.

Leads, unverified: something rebuilds or refocuses the CodeMirror element between the typed word and the command (a phone
remounts the editor when its pane opens), or CodeMirror applies that input itself, so WebKit records no native step. Next: log
`queryCommandEnabled('undo')` right after the typed word, and the editor element's identity before and after, in a dispatch that
repeats the step 10 times per device.

done when — the cause is named with evidence, and `ios-safari-undo` passes 10 dispatched runs in a row on both devices, or the
probe step is reclassified with the reason recorded.
