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

**It is not this PR's (control run).** PR 3034's branch failed it on the iPhone twice (dispatch 41964538891, attempts 1 and 2),
so a control ran the same suite on unchanged `main` (dispatch 41972682339, 2026-11-05): there the iPhone and the Mac passed and the
iPad failed the same step, as "no beforeinput; undo: enabled true after 7 ms". So it fails on `main` too, on either device, in two
forms: WebKit's undo never enabled (the iPhone runs), or enabled but no `historyUndo` sent (the iPad runs).

Leads, unverified: something rebuilds or refocuses the CodeMirror element between the typed word and the command (a phone
remounts the editor when its pane opens), or CodeMirror applies that input itself, so WebKit records no native step. Next: log
`queryCommandEnabled('undo')` right after the typed word, and the editor element's identity before and after, in a dispatch that
repeats the step 10 times per device.

**2026-11-05, continuation PR: the window is under a second, and the editor does not remount.** The probe now
records, at every step, whether WebKit's undo and redo are enabled, which editor element has focus (numbered, so a
remount shows), whether the page has focus, and whether the typed input's `beforeinput` was cancelled. It also runs
recorded type → undo cycles before the asserted one. Two dispatches (42013673985, 42013679163) ran 8 cycles per device;
one iPhone cycle reproduced the fault (job 127199955289, cycle #3):

- right after the typed word landed: `undo true … editor div#1 active div#1 hasFocus true`;
- 800 ms later, at the command: `undo false redo false editor div#1 active div#1 hasFocus true`, and it stayed false for 3 s.

So WebKit's undo stack is emptied within about 0.8 s of the typed word, with the same editor element and focus held:
**not a remount and not a focus loss**, the lead above. The iPad in the same run did remount its editor (`div#1` →
`div#2`) and undo kept working. All other cycles (35 of 36 on the two iOS devices, 16 of 16 on the Mac) and every
asserted step passed. The probe now also watches that 800 ms window at 25 ms resolution and, when undo flips, names
what the page did in the 300 ms before it: editor DOM mutations, CodeMirror transactions (and whether one replaced the
whole document), `history` calls, selection changes and focus moves. The next miss names its trigger.

**Three more dispatches with the 25 ms watcher** (42020460970, 42020465251, 42020469835): every asserted step passed on all
three devices, and 3 of 72 recorded iOS cycles missed, all on the iPad. They show **two different faults**:

- **Undo stays enabled, but no `historyUndo` arrives** (run 42020469835, cycle #2). The editor element changed between the
  typed word and the command (`div#1` → `div#2`). On the iPad the editor is rebuilt once, a few seconds in, in 3 of 5
  runs (never on the iPhone or the Mac). `Editor.tsx` rebuilt its CodeMirror view whenever `known` changed, and the
  Studio hands it the component list a moment after it paints. **Fixed in PR #3040**: `known` reaches the linter through its
  existing reconfigure effect, and the view is no longer rebuilt for it (`editor-known-rebuild.test.tsx` fails without
  the fix).
- **Undo turns off with nothing on the page** (42013673985 iPhone #3; 42020460970 iPad #9 at 884 ms; 42020465251 iPad #10
  at 444 ms). In the 300 ms before each flip the page did nothing the probe can see: no editor DOM mutation, no
  CodeMirror transaction, no `history` call, no selection or focus change. Same element, focus held. So WebKit empties
  its own undo stack, and nothing in the page asks it to. **Cause not named; it looks to be on WebKit's side.** If it
  keeps failing the asserted step, the honest reclassification is "WebKit drops the step without a page trigger, about 1
  cycle in 35"; the recorded cycles will show whether the editor fix changed that rate.

done when — the cause is named with evidence, and `ios-safari-undo` passes 10 dispatched runs in a row on both devices, or the
probe step is reclassified with the reason recorded.
