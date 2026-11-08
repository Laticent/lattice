---
origin: 3084
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — the failure is in how the spec drives the Stage's `f` key on Firefox; PR #3084 changes only the Stage's CSP, and the same spec fails on main's own build (644f177) in the same sandbox
source: https://github.com/Laticent/lattice/pull/3084
---
# `stage-placement.spec.ts:186` fails on Gecko although `f` fills the screen

why now   — `@gecko the Stage fills the screen from the key and from the button` failed 7 of 7
            runs on the `gecko` project (`--retries=0`) in the cloud sandbox on 2026-11-08: 3 on
            PR #3084's build, 2 with the Stage's nonce removed, 2 on a build of `main` 644f177's
            docs source. It fails at `` `f` did not fill the screen ``. The same test passes on
            `desktop` (Chromium).
            A probe in the same session, against the same `main` build, shows the product works:
            after `openStage`, a click on the Stage body and `keyboard.press('f')`, Firefox sets
            `document.fullscreenElement` (keydown seen, `document.hasFocus()` true, no
            `fullscreenerror`). The `#latt-full` button also fills the screen on Gecko. So the
            difference is between the probe and the spec, not in the Stage: candidates are what
            the probe's `stage.evaluate` before the click changes (focus or user activation in
            the popup), or the spec's 5 s poll seeing an enter-then-exit.
where     — docs/e2e/stage-placement.spec.ts:186; the Stage's key handler in
            docs/src/components/studio/present/stage-window.js (the FIT script's `f` toggle).
done when — the spec passes 20 of 20 on `gecko` with `--retries=0` under load, and a run with the
            `f` toggle removed from the Stage's script fails it.
evidence  — a Playwright trace of one failing run (`--trace on`) that shows whether fullscreen is
            never entered or entered and left.
verify    — tier 0.
