---
origin: 2742
priority: P3
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md
---

# the player-contrast sweep no longer opens examples/: composed decks and the per-theme token-contrast decks are out of it

why now   — the owner moved the sweep to the galleries (2026-10-16). Every gallery is on indaco, so a change to another theme selects nothing in this sweep. The palette sweeps cover the themes; nothing covers composed finish and register mixes by real pixels.
where     — (governing note: engineering/decisions/2026-10-16-player-contrast-galleries.md, on main) engineering/decisions/2026-10-16-player-contrast-galleries.md section 4; examples/ (280 decks, about 2 h serial, about 40 min at 3 workers by the measured 2.7x)
done when — the owner decides whether a weekly example sweep, a sampled one, or none; if one, it has its own baseline and a CI step with a measured time
evidence  — a timed run of the chosen set in CI
verify    — tier 1, because it adds a CI job (the CI contract is the owner's call)
