---
origin: 2753
priority: P3
recorded: 2026-10-29
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-scope-delivery.md
deferred: off-path — pane twins in lib/core/pane-css.js; #2753 changed packSelector only, and no shipped selector uses the shape
---

# Give a pane twin the second arm for a leading `:where(section…)`

why now   — #2753 made `packSelector` (`lib/engine/css.js`) write two arms for a leading
            `:where(section…)`, so `:where(section.list) .x` styles a list SLIDE in the
            preview. `widenForPanes` (`lib/core/pane-css.js`) makes a twin only for an arm
            with a literal leading `section`, so the same rule styles no list PANE. The CLI
            makes no twin either, so the two renderers agree. This is a gap, not a regression.
where     — `widenForPanes` in `lib/core/pane-css.js`; the gap is recorded in
            `engineering/gotchas/lattice-internals.md` (§"A rule works in the CLI export and
            does nothing in the Studio or Playground preview").
done when — a theme rule that leads with `:where(section.list)` styles a list pane in the
            Studio preview and in the CLI export, and `test/unit/engine/css-scope.test.js`
            pins both. Then delete the "One gap" paragraph from the gotcha.
evidence  — a fixture with one such rule, measured in a list pane in both renderers.
verify    — tier 1. It changes the shared kernel (`lib/core/pane-css.js`).
