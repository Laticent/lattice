---
origin: 2242
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2242#issuecomment-5752664431
---

# Get a beacon artifact for the `skipped:` grouping

Backfilled verbatim from the continuation brief on #2242 (merged 2026-09-20).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P1 · [no ticket] Get a beacon artifact for the `skipped:` grouping
       why now   — it is the ONLY unverified claim in #2242, and it costs nothing:
                   the next PR touching neither path filter produces it for free
       where     — ci.yml is in BOTH filters (ci.yml:152 `code`, ci.yml:161 `docs`),
                   so a PR touching ci.yml can never show it. An engineering/**-only
                   or changelog.d/-only PR will.
       done when — a beacon comment reading `(ran: lint; skipped by the path filter:
                   unit · integration · docs-build)` is linked from #2242
       evidence  — the beacon comment itself
       verify    — tier 0; it is an observation, not a change
       NOTE      — do NOT manufacture a PR for this. Take it opportunistically.
```
