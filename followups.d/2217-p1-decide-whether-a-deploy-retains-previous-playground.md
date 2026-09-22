---
origin: 2217
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2217#issuecomment-5672786328
backfill: true
---

# Decide whether a deploy retains previous playground/v/<hash> dirs

Backfilled verbatim from the continuation brief on #2217 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Decide whether a deploy retains previous playground/v/<hash> dirs
       why now   — this is the unexplained `theme crepuscolo (404)` from the original
                   report, and every deploy re-opens the window. A page that outlives
                   a deploy keeps rendering from what it already fetched and 404s on
                   the first asset it asks for afterwards (theme CSS is fetched lazily
                   per palette, so switching palette is exactly that first ask).
       where     — docs/scripts/sync-playground-assets.mjs:281 rmSync's the WHOLE v/
                   tree each build, so a deploy ships exactly one hash dir and deletes
                   every predecessor. docs/src/playground/asset-version.mjs bakes the
                   hash into each page at build time. docs/public/sw.js:139 asserts an
                   evicted hash is "a miss → re-fetched" — that is WRONG under
                   delete-everything, and the comment should be corrected either way.
       done when — either the sync script keeps the current hash plus the previous N
                   (pruned by mtime) with a test pinning the retention, or the fetcher
                   treats a 404 on a KNOWN-valid palette as a stale base and recovers.
       evidence  — per-asset curl status against a real previous hash dir across a
                   deploy, before and after. Measured cost for the retention option:
                   one hash dir is 12 MB / 437 files, so N=3 is ≈36 MB and ~1,300 files
                   added to the deploy artifact.
       verify    — tier 1 checker, because it changes what the deploy PUBLISHES and the
                   failure mode is invisible until a deploy has already happened.
       NOTE      — THIS IS THE HUMAN'S CALL, not yours (CLAUDE.md second filter: it is
                   shared state outside the branch). Put the two options with the
                   measured costs; do not change retention on your own judgment.
```
