---
origin: 3241
priority: P1
recorded: 2026-11-16
area: website
severity: medium
swimlane: engineering/decisions/2026-11-10-compose-first.md
deferred: blocked — the iOS Simulator cannot answer it: its WebDriver long press moves the selection on release on a bare page with no Studio code too, so only a real iPad and iPhone can show what a finger does, and none is reachable from CI or the cloud sandbox
source: https://github.com/Laticent/lattice/pull/3241
---

# A long press on Compose text ended with the selection on a hidden legend: check it on a real device

why now   — PR 3241's iOS Simulator runs, and nightly 44744978068 (ios-safari-studio-ipad), saw a long press on Compose text
            end with the selection in the screen-reader-only legend of the Read/Write/Craft fieldset ("Workspace stop") on
            the iPad and in the hidden "Lattice Studio" heading on the iPhone, instead of the word under the finger.
            Not reproduced as a Studio defect on the iOS Simulator; real iPad/iPhone UNVERIFIED.
what we know — the simulator's long press selects the word, then on release moves the selection to the text above and left
            of the finger, on any page: on a bare page with no Studio code, a long press in an editable paragraph ended on
            the whole plain paragraph above it, with or without hidden text on the page (dispatch 44856765533). In the
            Studio that text is the hidden legend or heading. Ruled out: the undo doorbell (silenced, the jump stayed,
            44829638843) and the lift point (a move back onto the point before the lift did not stop it, 44850293408). Every
            logged pointerup reaches the page at 0,0, which may be the mechanism; nothing here proves it.
three shapes the simulator gives a Compose tap, and what the probe does with each (docs/scripts/ios-safari/tap-guard.mjs):
            1. a long press that selects a word: re-delivered once (the 2026-11-16 rule);
            2. a long press whose release moves the selection, even a caret, out of every editor (the nightly red,
               44744978068, held 2642 ms): re-delivered once (#3368);
            3. a simulator stall: held 9313 ms with the page's listeners 3.8 s late and no click or selection change after
               the lift (lab run 44856765533, iPhone): still a failure, never re-delivered, because a real defect that eats
               taps leaves no click either. It fails as `fail-sim-stall`, whose message names the hold, the lag and the
               missing click, so triage reads it as infrastructure (#3368).
where     — if a real device does it: the hidden text is docs/src/components/studio/chrome-parts.tsx (the legend) and
            StudioShell.tsx (the sr-only h1), and the selection should not be able to land there.
done when — on a real iPad and a real iPhone in Mobile Safari, ten long presses on Compose words each leave the word selected
            after the lift; then delete this note. If a real device moves the selection, fix it in the product and add a
            probe step for it.
evidence  — dispatches 44829638843, 44850293408 and 44856765533, and the earlier logged sweep in 43798678775. The probe side
            is fixed in #3368: tap-guard.mjs now re-delivers a tap the simulator stretched into a long press when its release
            moved the selection out of the editor, the exact shape of the nightly red.
verify    — a person with a real iPad and iPhone, ten long presses each on Compose words in the Studio.
