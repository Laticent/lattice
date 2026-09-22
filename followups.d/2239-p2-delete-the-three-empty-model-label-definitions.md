---
origin: 2239
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2239#issuecomment-5751812986
backfill: true
---

# Delete the three empty model:* label DEFINITIONS

Backfilled verbatim from the continuation brief on #2239 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Delete the three empty model:* label DEFINITIONS
       why now   — they carry zero cards but stay creatable, so the dimension
                   HARD RULE #27 retired on 2026-07-28 can silently come back
       where     — gh label delete model:opus model:sonnet model:haiku, or the
                   repo's Labels UI
       done when — a fresh npm run audit:hygiene shows no model:* stray AND the
                   three labels are gone from GET /labels
       evidence  — the diff of live GET /labels against .github/labels.json
       verify    — tier 0
       NOTE      — NOT DOABLE FROM THE CLOUD SANDBOX. No MCP label-delete
                   operation and no gh. This needs a human or a machine with gh.
```
