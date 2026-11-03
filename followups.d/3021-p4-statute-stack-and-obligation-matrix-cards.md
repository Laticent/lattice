---
origin: 3021
priority: P4
recorded: 2026-11-03
area: legal
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — both own their tables (deny list); #3021 does not touch them
source: https://github.com/Laticent/lattice/pull/3021
---

# statute-stack lane and obligation-matrix take the card layout when narrow

why now   — statute-stack's lane variant (one row per jurisdiction) and obligation-matrix (one row per regulation, state marks in the cells) are record tables, so cards fit them, but they own their tables and the reflow does not reach them. obligation-matrix's marks must keep their color and shape inside a card.
where     — lib/components/legal/statute-stack/, lib/components/legal/obligation-matrix/.
done when — both become one card per row in a narrow box with marks intact, the fit check applies, and full-width renders are unchanged.
evidence  — the Frame Lab entries at 360px, light and dark.
verify    — npm run lab:build -- --only statute-stack,obligation-matrix; galleries against main.
