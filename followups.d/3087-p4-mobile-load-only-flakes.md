---
origin: 3087
priority: P4
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: large — about ten load-only failures, each its own investigation; the ones PR #3102 measured against main fail there at a similar rate
source: https://github.com/Laticent/lattice/pull/3087
updated: 2026-11-10, the Studio startup PR (demo-mobile, collage-lightbox and model-spine fixed at their causes; the rest stay)
---

# Mobile specs that fail only under full-project load, on main and on PR 3087 alike

why now   — PR 3087 ran the full `--project=mobile` suite (4 workers, --retries=0) five times: three on its
            final build, two on main d1a4704's. Besides the known reds (ios-zoom:65, visual:37,
            plugin-inline-ui:170, all in or beside followups.d/3043-…), each run lost a different 0-3
            specs that pass alone, on both builds:
            - main: compose-soft-break.spec.ts:22 and :50, logo-wall-first-visit.spec.ts:74.
            - PR build: logo-wall-first-visit.spec.ts:74, playground-tab-switch.spec.ts:211,
              playground-deck-settings.spec.ts:110, plugin-inline-ui.spec.ts:136,
              settings-reopen.spec.ts:81, collage-lightbox.spec.ts:314.
            Counts per run: main 0 and 3; the PR's final build 3, 2 and 3. Every one tried alone passed 3 of 3
            on both builds. (demo-mobile.spec.ts:535 also failed once, on the PR's build BEFORE its quiet
            gate; it passed all three full runs after, so it is not listed.)
            A test that fails only under load still fails in CI's merge train (HARD RULE #32).
update    — PR #3102 ran the full `--project=mobile` suite once (4 workers, --retries=0) on its build:
            314 passed, 6 failed. Two are the known reds (ios-zoom:65, visual:37). The other four, alone,
            three runs each: collage-lightbox.spec.ts:348 and :385 (@smoke) 3/3, model-spine.spec.ts:155
            3/3, demo-mobile.spec.ts:535 2/3. So collage-lightbox:348/:385 and model-spine:155 join the
            list above. demo-mobile:535 was then run 24 times under load (repeat-each, 4 workers) against
            each build: main 3 failed, PR #3102 4 failed; 5/5 alone on both. Its failure: "the tail was
            2018px off screen for 20+ consecutive frames while typing (scrollTop 0 of 2338)", that is,
            Compose never scrolled to follow the tour's typing while the CPU was contended. That points
            at the follow mechanism starving under load, not at the test's thresholds.
            The other three, 8 runs each under the same load: main failed collage-lightbox:348 once and
            :385 once (2 of 24); PR #3102 failed collage-lightbox:348 twice and model-spine:155 once (3 of
            24). collage-lightbox is a load flake on main. model-spine:155, 16 more runs a side: 1 failed on each
            (main a `locator.check` timeout, PR #3102 a `toHaveText`), so 1 of 24 against 2 of 24: a load
            flake on main as well.
desktop   — PR #3102 then ran the full `--project=desktop` suite once (4 workers, --retries=0): 1296 passed,
            30 failed. 15 tests failed again alone, three runs each, and every one fails on main 756c1ff too.
            The other 11 pass alone: they fail only under load. Run 4 times each at 4 workers, the 10 that
            are not this PR's own spec failed 3 of 40 on main and 5 of 40 on the PR's build, on the same
            tests (gallery-preview-metamorphic:370, lenses-landing:33, chart-detail-reveal:269 on main;
            model-spine:155 once on the PR). Load-only on desktop, then:
            compose-soft-break:22, fabricate:311, filo-undo:157, gallery-preview-metamorphic:370,
            model-spine:155, panel-shells:138, stage-window:168, status-pill:24.
fixed     — 2026-11-10, the Studio startup PR, each at its cause, 24 loaded runs per test (--project=mobile,
            --repeat-each=24, --workers=4, --retries=0), main 50f6f4a against the fix:
            - demo-mobile.spec.ts:535 (now :543), 8 failed on main, 0 after. The test's own sampler counted the
              ProseMirror view's ARRIVAL (no editor, then the whole 1,252-character welcome deck) as typing, because it
              keyed a remount on the host and the view mounts inside an existing host, later under load. It measured an
              untouched document about 17 s before the tour typed. It now keys on the view, as the CodeMirror sampler
              does. Compose's follow itself was right in every logged run.
            - collage-lightbox.spec.ts:348 and :385 (now :358 and :395), 3 and 3 failed on main, 0 and 0 after. A resize
              to a phone mounts a fresh preview frame, hidden until it reveals; the test clicked it before the reveal,
              and `tapCollageAt` rightly ignores a hidden frame. It now waits for the reveal.
            - model-spine.spec.ts:155, 1 failed on main (2 of 48 in a second run), 0 after. Two causes. An app defect:
              the chat chip named a picked OpenRouter model from the catalog once, at status read, and a catalog that
              landed later was never read again, so the chip said "Model" until opened (architect.ts
              `useArchitectStatus` now waits for the same prefetched catalog). And a test race: picking a model closes
              the popover, so `check()` could not read the radio back; it clicks and asserts the chip.
also      — 2026-11-10, same PR: collage-lightbox.spec.ts:395 on gecko
            failed once in a 3-worker mixed run and passed 6 of 6 alone at 3 workers.
            Four more from the same PR's full runs on its build (tablet + mobile at 4 workers; webkit-phone, webkit-tablet
            and gecko at 3), recorded nowhere before: back-gesture.spec.ts:183 (webkit-phone), switch-controls.spec.ts:97
            (webkit-tablet) and table-reflow-preview.spec.ts:71 (webkit-tablet; then 8 of 8 at 4 workers). Each failed once in its full run and passed 3 of 3 alone. Not
            compared against main; not investigated.
fixed     — 2026-11-21, branch claude/orphan-flake-ports (ported from orphaned PR #3278), each at its cause:
            - playground-deck-settings.spec.ts:110 (test-only): the Theme list is an item-aligned Radix Select that grows
              on each scroll event. click() checked the option held still, scrolled it into view, then pressed where it
              had measured, so the growth moved the list under the press (trace: press at y 55, Auto at y 31 after).
              The test now scrolls first, so click()'s frame-based stability check waits for the growth. main: 1 of 30
              red at four workers over three projects. Arm (300 ms press, the two projects its tag reaches x5): old 6 of 10
              red, new 10 of 10.
            - back-gesture.spec.ts:183 (now :172, webkit-phone): a product defect. Radix arms a sheet's outside-tap
              listener a moment after mount, and a lazy panel's real sheet replaces its loading sheet in place, so a
              scrim tap in that gap did nothing. components/ui/sheet.tsx reads the tap from the pointer. main: 3 of
              100 red at four workers; with the fix 100 of 100.
where     — the specs named above that the "fixed" entry does not name.
done when — each failure is reproduced under full-project load and fixed at its cause, or 10 full
            mobile-project runs on main pass and this file is deleted with that evidence.
evidence  — per spec, runs and outcomes under load, before and after.
verify    — npx playwright test --project=mobile --retries=0, repeated.

2026-11-09 — the docs-perf PR's final build lost `collage-lightbox.spec.ts:483` (`@mobile`, the trackpad-pinch zoom) once in a 220-pass,
15-file, 3-project, 4-worker run; it passed 3 of 3 alone. The lightbox lives in the slide runtime and shares no code
with what that PR changed (Studio mount timing, `ui/sheet.tsx` focus return).
PR #3140 (2026-11-11) saw `model-spine.spec.ts:155` (`@crosswidth … picking in the chip is the global selection`) fail on
`mobile` again, after the 2026-11-10 fix: a 15 s click timeout in an 8-file, 3-project (desktop, tablet, mobile) run while
a commit hook ran the full unit suite beside it (44 passed, 1 failed). It passed 2 of 2 alone on the same build, and 1 of 1
on main. That PR changes narration export and the voice request path, not the chip.

2026-11-12 — compose-soft-break.spec.ts:22 and :50 fixed at their cause on `claude/compose-e2e-flakes`: the caret was set
            through the DOM and keys sent before ProseMirror heard the `selectionchange`; each now waits for
            `caretSettled`. Desktop and mobile, 12 runs each: 15 of 48 failed before, 0 of 48 after.
2026-11-12 — chart-detail-reveal:269 and lenses-landing:33 fixed at their causes on branch claude/flaky-e2e-render
(a Playground walk race that showed a gallery over the draft; Present's keyboard attached after paint); removed above.

2026-11-12 — fixed at their causes in the flaky-e2e touch PR (claude/flaky-e2e-touch): demo-mobile.spec.ts:437 (its
guard counted animation frames, which a loaded WebKit paints about a third as often; it now counts edits) and
library-images-render.spec.ts:152 (one read of four tiles before they had loaded and packed; now one read of the
revealed frame, polled). The evidence is in that PR.

2026-11-16 — PR #3228 (the front-matter island) lost two more desktop specs only under load, each passing alone:
            present-beat.spec.ts:49 (failed in a 4-worker full Chromium run and in a 3-worker 47-file run; 1 of 1 alone)
            and library-voice-spine.spec.ts:140 (failed in the 4-worker full run; 1 of 1 alone). Then 8 runs each at 4
            workers (--repeat-each=8, --retries=0): PR build 16 of 16; main 72bd2d9 15 of 16, the failure
            library-voice-spine:140. gallery-preview-metamorphic:370 also failed under load on the PR build; with nothing
            else running it went 12 of 12 on main and 12 of 12 on the PR. Not investigated past that.
2026-11-16 — the same PR's clean full Chromium run (desktop, tablet, mobile; 4 workers, --retries=0; 1,903 passed, 4
            failed, 63 skipped) lost compose-note-motion.spec.ts:260 and journeys/chart-export.spec.ts:124 besides
            filo-undo:157 and present-beat:49 (both listed above). All four then passed alone, 2 of 2 each. The two new
            ones were not compared against main under load.
2026-11-16 — the same PR's full Chromium run on 635ba64 (4 workers, --retries=0; 1,912 passed, 5 failed) lost
            compose-stress.spec.ts:538, studio-export-offline.spec.ts:114 (desktop), library-voice-spine.spec.ts:140
            and :151 (mobile) and present-beat.spec.ts:49; all passed alone (8 of 8 across desktop and mobile). Then
            compose-note-motion:260, journeys/chart-export:124, compose-stress:538 and studio-export-offline:114, 6 runs
            each at 4 workers on desktop: PR build 24 of 24; main af00ca3 23 of 24, the failure journeys/chart-export:124.
2026-11-17 — the iOS Simulator Studio probe's Menu tap (docs/scripts/ios-safari/run.mjs `deckTapLeavesLibrary`, iPhone)
            opened no menu in about 1 rep in 10 during PR #3278's counts (runs 44052932291, 44052943412, 44052948172),
            with the sheet fix in and without it, so the sheet change does not cause it. The run ended "timed out waiting
            for the Library row". PR #3278 made the probe tap only a Menu React has wired, and log the Menu tap's own
            events on that timeout. Since then it has not come back: 15 of 15 Menu taps opened the menu across runs
            44059959611 and 44135586134. Not fixed, because there is no failing run to read a cause from; the next red
            prints the Menu tap's events in its job log.
