---
origin: 2243
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
backfill: true
---

# Decide the nine remaining token passthroughs

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Decide the nine remaining token passthroughs
       why now   — they are deliberate, not forgotten, and the decision is worth recording
                   before someone "fixes" them into being wrong.
       where     — docs/src/lib/cadenza/normalize.ts. The nine are the slash and identifier
                   shapes: A/B, P/E, 24/7, ID-4471 and kin. A slash means four unrelated
                   things (ratio, per, date, alternative) and guessing reads worse than the
                   glyph. Likely answer is an author-facing `lexicon:` recipe plus a lint
                   coach, not a rule.
       done when — either a rule with its disambiguation stated, or a decision note saying
                   why there is none, plus the coaching path.
       evidence  — the boardroom corpus pass rate before/after (#2243 took it 19 raw of 52
                   to 9 of 59).
       verify    — tier 0 gates.
```
