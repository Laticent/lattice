---
origin: 2226
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2226#issuecomment-5673609887
backfill: true
---

# Take the retention decision, then implement it

Backfilled verbatim from the continuation brief on #2226 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Take the retention decision, then implement it
       why now   — every deploy re-opens the window; #2226 only documented it.
       the ask   — the human picks A, B or C from the note. Recommendation: B.
                   Do NOT pick for them (shared state outside the branch).
       where     — A: sync-playground-assets.mjs's rmSync, AND asset-version.mjs
                   FIRST — assetVersion() takes readdirSync's dirs[0], measured to be
                   reliably the LOWEST hash, so retention without a pointer file bakes
                   a stale hash into every page. B: sync writes v/current.json, and
                   theme-fetch.ts re-resolves themeBase on a 404 for a palette in the
                   page's own catalog — KEEP the negative 404 cache for the
                   -dark-companion case. C: stage the themes subtree unversioned.
       done when — the chosen option ships with a test pinning its behavior, and a page
                   that straddles a deploy recovers or is proven bounded.
       evidence  — per-asset curl status across a simulated deploy, before and after,
                   the way #2226 did it. Costs already measured: one hash dir =
                   12 MB / 437 files; themes/ = 1.6 MB / 51.
       verify    — tier 1 checker: it changes what the deploy PUBLISHES and the failure
                   mode is invisible until a deploy has happened.
```
