---
origin: 3335
priority: P12
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: large — three token families across accent-finish, tokens and the corners register
source: https://github.com/Laticent/lattice/pull/3335
---

# L4, L5, L10: rail weight, heading-rule weight and card radius as tokens

why now   — Strategy's rail, Editorial's and Annual's rules and square cards only work through doubled-class overrides.
where     — lib/base/base.accent-finish.css:22, :37-56, :197-198; lib/base/base.tokens.css:224; lib/base/base.modifiers.css:4214.
done when — `--rail-w`, `--rule-w` / `--rule-style` / `--rule-color` and a separate `--card-radius` hook (excluding `--radius-full`), each defaulting to today's value so no existing deck moves (golden-diff unchanged); presets set them internally (D10), with no new public words.
