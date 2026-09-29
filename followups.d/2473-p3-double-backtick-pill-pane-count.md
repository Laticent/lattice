---
origin: 2473
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# The linter counts three panes where a double-backtick pill sits above a `###`

why now   — found by PR 2473's independent review, and present before that PR's last round
            (reproduces at 06a4c94): a pane whose eyebrow pill uses double backticks
            (`` ``a`b`` ``) above its `### title` makes the linter's `scanPanes` count three
            panes, so `lint:deck` reports a `pane-layout` finding while the engine renders two.
where     — lib/core/pane-spec.js `scanPanes` / `paneStartsOf` (the text twin of the carve).
done when — the linter and the engine agree on the pane count for a double-backtick pill, and a
            test pins it.
verify    — `node --test test/unit/core/pane-layouts.test.js` with the new case.
