---
origin: 2424
priority: P3
recorded: 2026-10-05
---

# The playground's reload first-paint smoke test timed out once waiting for the stored slide

```text
  P3 · [no ticket] Name why the reload first-paint smoke test sometimes waits 40 s for a
       stored slide that never comes.
       why now   — studio-smoke's playground-first-paint.spec.ts:198 ("a reload paints one
                   geometry per element") timed out once at 40 s in `seedRealSession`,
                   polling for `lattice-docs-pg-last-slide`, on code that passed it before
                   and after (5 of 5 locally). An intermittent failure in studio-smoke costs
                   every PR a re-run.
       where     — docs/e2e/playground-first-paint.spec.ts:171 (`seedRealSession`), and
                   whatever writes the `lattice-docs-pg-last-slide` key.
       done when — the cause is named, and the test passes 30 of 30 with --repeat-each in
                   CI shape.
       evidence  — the repeat run, and the cause in the PR body.
       verify    — tier 0, because it is a test or a timing fix.
```
