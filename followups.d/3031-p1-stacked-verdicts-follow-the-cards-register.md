---
origin: 3031
priority: P1
recorded: 2026-11-04
area: comparison
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — the stacked verdict-grid predates this PR, and fixing it changes existing portrait exports, a taste call for the owner (decision card on #3031)
source: https://github.com/Laticent/lattice/pull/3031
---

# Stacked verdict cards follow the `cards:` register

why now   — verdict-grid's manifest asks for `cards: center`, and its wide grid honors center, stretch and top. Its stacked form (tall and strip decks, and the narrow form that reuses it) gives every card `flex: 1`, so the cards always fill the stage. Measured on #3031's export with the content area at 22em: center, stretch and top all fill 98% of the stage, where matrix-2x2, cards-grid and decision place a centered band, a fill and a top band. kpi and list-steps also ignore the register when stacked, but on purpose (their comments say why); verdict-grid's tall rule gives no reason.
where     — lib/components/comparison/verdict-grid/verdict-grid.styles.css: the tall/strip family rule and the width reflow rule (keep them identical, so a narrow pane and a phone read the same).
done when — both stacked forms use `justify-content: var(--cards-align)` and `flex: var(--cards-grow) 0 var(--cards-basis)` with `min-height: min-content`, as matrix-2x2's do, and the portrait verdict-grid gallery is checked against main and signed off.
evidence  — the register sweep (center / stretch / top) at 22em and on a portrait deck, before and after; the portrait gallery sweep.
verify    — render a verdict-grid slide with each `cards-*` class on a portrait deck and in a narrow box, and look.
