---
origin: 3124
priority: P2
recorded: 2026-11-10
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: blocked — no reproduction: 20 runs of the test at 4-way load and full-suite runs here passed; the one cause tested (the strip not yet on slide 2 when the menu opens) was measured false
---

# `studio.controls` "the strip's Undo is the editor's own undo" failed once under the full suite's load

why now   — docs-build on PR #3124 at 7e5c0b6 (run 42865203855, job 130001739646) failed this test with `Unable to find
            role="menuitem" and name /^Delete/` after `stripAction`'s 5000 ms wait. #3124 changes CI files only; the
            same test passed on #3117 and on main the same day. The suite ran at about 2x CPU oversubscription (649 s of
            test time in 337 s). It is the third load-dependent failure found on 2026-11-10, after the WebKit apt step
            and the iOS undo job's deadline, which #3124 fixes.
where     — `docs/src/components/studio/studio.controls.test.tsx`, the case at the first `user.click(rail()[1] …)`, and its
            `stripAction` helper; the menu's open and close logic in `StudioShell.tsx` (`stripMenuLanded`, the effect on
            `hereAt`), where an opened menu closes when its slide stops being `hereAt`.
how       — reproduce first. What is known: right after the click on slide 2, the strip already marks slide 2 current
            (3 of 3 probes), so the menu is not opened on the wrong slide. Still open: whether `hereAt` moves after the
            menu opens (a delayed caret move from `goToSlide`, or the typed insert), which would close the menu and empty
            it; and whether the menu's on-demand chunk (`strip-actions/menu.tsx`) is the wait. Record `hereAt`,
            `stripMenu` and the menu's `data-state` at the failure (Testing Library truncates its DOM dump, which hid
            them this time), and run the full docs suite with a CPU limit until it fails.
done when — the cause is shown on a failing run and the test waits on that signal, or the code stops closing the menu,
            and the case passes in a loop of full-suite runs under the same load.
