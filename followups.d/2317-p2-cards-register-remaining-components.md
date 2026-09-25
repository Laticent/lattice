---
origin: 2317
priority: P2
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/issues/2317
---

# Opt the remaining card-centric components into the `cards:` register

The first slice of #2317 wired `list-steps` (row), `compare-prose` and `cards-stack horizontal`.
Still open from the issue's scope:

- `split-panel` `proof` / `capstone` / `mirror` — its evidence column is a flex COLUMN of stacked
  regions, so `align-content` does not apply there. A column can use the answer `list` shipped:
  lay the column out as a one-column grid that reads `align-content: var(--cards-align)`, with
  rows capped by a ceiling that `--cards-grow` lifts under `stretch`
  (decision note §12). Still a per-component call on the default.
- `cards-stack numbered` — a column stack; the same one-column-grid answer applies.
- `decision`, `split-compare`, `pricing`, `inventory`, `team-profile`, `contact`, `citation-card`,
  `regulatory-update`, `statute-stack`, `agenda cards`, `q-and-a grid` — per-component call.
- `matrix-2x2`, `kanban` — declare `stretch` explicitly so `cards:` is uniform deck-wide.
- Issue acceptance items not done in the first slice: gallery rebuild + light/dark before/after
  rasters per component, and a `check:jank` pass.

The recipe per row: a `"cards": { "default": … }` manifest field, then on the row
`flex-wrap: wrap; align-content: var(--cards-align)` scoped to the row form only
(`resolve-cards.test.js` fails a declared composition the CSS never reads).

done when — every component listed above carries a `cards` manifest field read by its row, and
#2317's acceptance checklist reads true.
