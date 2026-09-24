---
origin: 2311
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-5781317701
---

# retire the five dead --status-* tokens

Backfilled verbatim from the continuation brief on #2311 (merged 2026-09-22).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P4 · [no ticket] retire the five dead --status-* tokens
       why now   — lowest impact; pure cleanup, but they actively mislead (they
                    look like the status pill's tokens and are not)
       where     — lib/base/base.tokens.css:496-500. Zero consumers outside dist/
                    as of e84c132 — RE-DERIVE before deleting. The pill reads
                    --state-*, defined at chart-family.css:549-579. Note
                    kanban.styles.css:202-204's var(--status-fill) is a
                    kanban-local property, NOT these.
       done when — removed, or kept with a comment saying why they survive
       evidence  — grep proving zero consumers + npm run build:check green
       verify    — tier 1 checker, because a token removal is exactly where a
                    missed consumer hides
```
