---
origin: 3362
priority: P3
recorded: 2026-11-20
area: engine
severity: low
deferred: large — eight components need a re-measured base budget or a per-family schema slot before a claim budget can sit on them; PR 3362 adds the claim budget where the base already holds
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# Claim budgets for list and the seven components whose bare budget is above what they measure

```text
  P3 · [no ticket] give the remaining components a claim budget
       why now   — `tools/calibrate-capacity.js --variant claim-hero` measured more room
                   for list (7 items) but list declares only per-family budgets
                   (`adapt.capacity`), which have no `withClaim` slot. Seven more
                   measured a bare ceiling below their declared `hard`: actors 4 (declares
                   7), authority-chain 5 (6), cycle 5 (6), kanban 4 (6), premise 6 (8),
                   regulatory-update 4 (6), team-profile 6 (12). A claim budget on those
                   would sit beside a wrong base (measured 2026-11-20).
       done when — list's per-family block can carry a claim budget lint reads, and each
                   of the seven has a re-measured base (or a documented reason the
                   declared one stands) plus its `withClaim`.
```
