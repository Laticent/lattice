---
origin: 2887
priority: P3
recorded: 2026-10-26
area: infra
severity: low
swimlane: lib/export/player-core.mjs
source: https://github.com/Laticent/lattice/pull/2887
---

# `--hs-icon-ink` and other picked inks keep their light value in the HTML player's dark mode

```text
  P3 · a light-dark() in a custom property declared below :root is hoisted to :root by themeDualMode
       why now   — the red-team on the token-swap PR found it while fixing the same defect for the finish
                   body (etch dark 30% instead of 40%). The finish body is fixed there; the hub-spoke icon
                   ink (`--hs-icon-ink: light-dark(color(from …), color(from …))`, 10 rules before that PR,
                   the same after) has it still, and so may any custom property a member sets this way.
       where     — lib/export/player-core.mjs (`themeDualMode`, `hoistRuleLightDark`);
                   tools/build-marks-css.js (the icon-ink rules).
       done when — the icon ink is right in `--player` dark mode: either the rule paints the icon's fill with a
                   light-dark() in a real property, or the dual-mode pass scopes a custom property to its rule.
       evidence  — `node dist/lattice.js deck.md out.html --player`, set data-lp-scheme=dark, read the icon's
                   computed fill under etch.
       verify    — that probe, before and after.
```
