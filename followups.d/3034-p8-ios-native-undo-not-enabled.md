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

**After the fixes (PR #3040).** Ten dispatches: five at `31123288` (the editor fix) and five at `c3d60088` (the probe fix).

- **Mode 1 is gone.** The iPad editor stayed `div#1` in all 10 runs; before the fix it rebuilt in 3 of 5. No
  "enabled but no `historyUndo`" miss in 240 recorded iOS cycles.
- **The probe fix.** The command no longer re-selects the editor first. One iPad checked step at `31123288` had lost undo
  in that gap (42026963629): enabled through the whole 800 ms watch, disabled at the command.
- **Mode 2: WebKit empties its own undo stack.** Recorded iOS cycles with the 25 ms watcher (13 dispatches since
  `8c6d33a`, 312 cycles) lost undo 7 times, 0.4 to 0.9 s after the word:

  | Run | Device, cycle | Flip | What the page did in the 300 ms before |
  |---|---|---|---|
  | 42020460970 | iPad #9 | 884 ms | nothing |
  | 42020465251 | iPad #10 | 444 ms | nothing |
  | 42026968243 | iPhone #1 | 448 ms | a CodeMirror transaction that changed nothing, 278 ms earlier |
  | 42026959032 | iPad #12 | 756 ms | nothing |
  | 42031880242 | iPad #5 | 654 ms | nothing |
  | 42031886663 | iPhone #1 | 482 ms | nothing |
  | 42031898658 | iPad #9 | 891 ms | nothing |

  One checked step had the same loss (42031903887, iPad): 35 ms into the watch, 21 ms after a `selectionchange` the
  probe did not cause, most likely CodeMirror re-applying its caret after the word. So 6 of the 8 caught losses had no
  page event at all, and the other two had one the page does after every keystroke. That points at WebKit, not our
  code, but it is not proven.
- **One recorded cycle where the undo did not land** (42031892694, iPad #9). `historyUndo` arrived and was handled, but
  the word was not back within 3 s. That is a Filo-side miss, seen once in 312 cycles, in a recorded cycle only.
- **Checked steps at `c3d60088`.** iPhone 5 of 5. iPad 4 of 5, the failure being the loss above. Mac 4 passed; the fifth
  run's job hit its 30-minute limit after the iPad's simulator took 892 s to give a session (audit §2, cause A).

**Verdict.** Mode 1 is named and fixed. Mode 2 is WebKit emptying its own undo stack, in about 2.2% of recorded cycles
(7 of 312), with no page trigger in 6 of 8 caught cases. With two iOS devices that puts a red nightly at roughly 1 in 20
from this alone. **Not met:** 10 checked passes in a row on both devices. The iPad failed once at each fixed head, so the
longest clean streak since the fixes is 3. Whether to reclassify the checked step is the owner's decision (PR #3040's
decision card). Until then it stays asserted.

done when — the cause is named with evidence, and `ios-safari-undo` passes 10 dispatched runs in a row on both devices, or the
probe step is reclassified with the reason recorded.
