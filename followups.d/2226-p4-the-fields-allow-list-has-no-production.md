---
origin: 2226
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2226#issuecomment-5673609887
backfill: true
---

# The `fields` allow-list has no production caller

Backfilled verbatim from the continuation brief on #2226 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] The `fields` allow-list has no production caller
       why now   — CONFIG_PROFILES is `{author: null}` alone, so the filtering branch in
                   deck-config.js is production-dead and pinned only by tests. Decide:
                   keep it as host-agnostic API, or remove `fields`/`show()` entirely.
       where     — docs/src/playground/deck-config.js, and the two tests that pin it.
       evidence  — if removed, a grep showing no caller and the tests deleted with it;
                   if kept, one line in the docblock saying why.
       verify    — tier 0. One module, no behavior change either way.
```
