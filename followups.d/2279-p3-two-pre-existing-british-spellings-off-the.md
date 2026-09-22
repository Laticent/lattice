---
origin: 2279
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2279#issuecomment-5764143460
backfill: true
---

# Two pre-existing British spellings, off the path of #2279

Backfilled verbatim from the continuation brief on #2279 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Two pre-existing British spellings, off the path of #2279
       why now   — trivial, and HARD RULE #21 says a swept tree makes a regression one visible
                   word in a diff. These two survived the 2026-08-30 sweep.
       where     — test/unit/css/selector-validity.test.js:14 and
                   changelog.d/1864-categorical-adjacency-gate.added.md:1 ("neighbouring").
       done when — both read `neighboring`; no EXTERNAL string is touched (#21's carve-out).
       evidence  — the diff itself.
       verify    — tier 0, the gates. Two words.
```
