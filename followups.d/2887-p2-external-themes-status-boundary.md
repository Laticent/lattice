---
origin: 2887
priority: P2
recorded: 2026-10-25
area: theming
severity: medium
swimlane: lib/base/base.tokens.css
source: https://github.com/Laticent/lattice/pull/2887
---

# A theme from outside this repository can wear two status systems, silently

```text
  P2 · uncurated themes get the engine's fixed status fills beside their own inks
       why now   — #2887 moved the status fills to the base and retired the chart-only hooks. The
                   inversion review found two silent paths for a theme this repository did not curate
                   (hand-written, or an older theme package):
                   1. the fallback solids in lib/base/base.tokens.css (`--pass-mark` … and the
                      `-vivid` and `-signal` sets) are fixed indaco-like literals, not derived from
                      the theme's own `--pass` / `--warn` / `--fail`, so its discs, pills and bars
                      wear the engine's green and crimson beside its own status inks;
                   2. the retired names (`--chart-state-*`, `--on-status`, `--chart-on-solid`,
                      `--on-warn`, `--on-warn-vivid`, `--X-solid-edge`) are not in the crosswalk, so
                      checkRetiredTokenNames never warns a theme that still sets them.
                   Shipped palettes are covered (test/unit/palette/color-ownership.test.js); a theme
                   built in the Studio is too (lib/theme/derive.js solveStatusSet).
       where     — lib/base/base.tokens.css (fallback solids), lib/tokens/crosswalk.js (retired
                   names), the theme validator or lint:deck for the warning.
       done when — an uncurated theme's status fills follow its own inks (for example relative
                   color from var(--pass) at the curated lightness), and a theme that sets a retired
                   status name gets a warning that names the replacement.
       evidence  — the inversion report on #2887 (2026-10-25); the fallbacks at
                   lib/base/base.tokens.css, the `semantic` list in lib/theme/derive.js.
       verify    — a fixture theme that sets only `--pass` / `--warn` / `--fail` renders a checklist
                   whose discs match its rails; a fixture that sets `--chart-state-pass` warns.
```

Off the path of #2887's merge: every theme this repository ships is curated and gated, and the
changelog's Breaking line names the Studio as the migration path.
