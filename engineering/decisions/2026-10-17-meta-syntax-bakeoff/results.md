# Bake-off results (2026-10-17)

Generated from `results.json`, `writers.json` and `scores.json` by `score.mjs`, under the weights and gates fixed in
`../2026-10-17-meta-syntax-bakeoff.md`. Reproduce with `BAKEOFF_MODULES=<dir with commonmark, micromark, marked>
node run.mjs && node grade-writers.mjs <writers dir> && node score.mjs`. Harness audit and fixes: `audit.md`.

## Scores

| Criterion | C0 <!-- _key: value --> (control) | C1 `@meta{…}` | C2 @meta{…} | C3 ```meta fence | C4 [meta]: # "…" | C5 <meta …> |
|---|---|---|---|---|---|---|
| 1 parser pains (20) | 18.4 | 20.0 | 20.0 | 20.0 | 20.0 | 20.0 |
| 2 rendering outside Lattice (15) | 15.0 | 10.0 | 10.0 | 10.4 | 14.0 | 11.5 |
| 3 jank (15) | 15.0 | 15.0 | 15.0 | 13.3 | 15.0 | 15.0 |
| 4 authoring size (10) | 6.7 | 9.6 | 10.0 | 5.3 | 5.1 | 9.6 |
| 5 authoring correctness (15) | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 |
| 6 validation and completion (10) | 6.0 | 9.0 | 9.0 | 10.0 | 8.0 | 9.0 |
| 7 house style and LFM fit (5) | 4.0 | 4.0 | 2.0 | 5.0 | 2.0 | 3.0 |
| 8 Marp bridge (5) | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |
| 9 speed (5) | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |
| **Total (100)** | **90.1** | **92.6** | **91.0** | **89.0** | **89.1** | **93.0** |

| Gate | C0 | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|
| G1 lossless notes | **FAIL** | pass | pass | pass | pass | pass |
| G2 line-preserving | pass | pass | pass | pass | pass | pass |
| G3 no silent loss | **FAIL** | pass | pass | pass | pass | pass |

## Verdict under the pre-registered rule (G4)

A syntax change needs a candidate that beats the control by at least 10 points. The best margin is **+2.9** (C5), then
+2.5 (C1), +0.9 (C2), -1.1 (C3) and -1.0 (C4). **No candidate qualifies, so the pre-registered outcome is: keep
comments, consolidate the reader, and the syntax change is closed.**

## What the numbers do and do not say

- **Everything is within about four points.** The six totals run from 89.0 to 93.0. That is not a ranking; it is a tie
  broken by criteria the rubric judges (6 and 7, which are my judgments, audited but not measured).
- **The control is not clean.** C0 fails two gates. G1: a comment cannot hold `-->`, so a note containing it does not
  round-trip. G3: `<!-- _footer Q3 -->` (a directive missing its colon) silently becomes a speaker note. The G4 rule as
  written does not apply gates to the control, so the verdict above stands; the qualification is real.
- **The control was given typed fields.** C0 reads `_class` words and splits them into layout, variant and registers
  through the catalog. That is the consolidation the parent note proposes, not today's reader. The comparison is
  therefore "a typed, consolidated reader over comments" against new spellings.
- **Writers do not separate the syntaxes.** Three Opus writers, each given a one-page rule sheet per syntax, wrote
  all 12 slides in all six syntaxes exactly right (36 of 36 each). A cold-start test with no sheet was not run.
- **What each candidate costs, measured:**

| | median lines / chars per slide | visible junk in other renderers (chars) | structure intact | values needing no escaping (of 37) |
|---|---|---|---|---|
| C0 comments | 2 / 92 | 0 | 1.00 | 38 |
| C1 `` `@meta{}` `` | 1 / 83 | 111 | 1.00 | 35 |
| C2 `@meta{}` | 1 / 77 | 111 | 1.00 | 35 |
| C3 ```` ```meta ```` | 4 / 95 | 103 | 1.00 | 38 |
| C4 `[meta]: # "…"` | 4 / 99 | 23 | 1.00 | 33 |
| C5 `<meta …>` | 1 / 84 | 37 | **0.69** | 30 |

- **Failures worth knowing:** C5 swallows the lines after it under CommonMark when it sits directly above content
  (structure intact 0.69). C3 loses a later record when its fence is nested inside another fence (the inner closing
  fence ends the outer one). C0 fails G1 and G3 above.
- **Not measured, and decisive for some readers of this table:** whether "never rendered" includes GitHub and the VS
  Code preview. On that axis only C0 and C4 are invisible.

## Where this leaves the parent note

The record's contents, the source door, the internal form, the Marp compile-back and the reader-consolidation-first
order do not depend on the spelling and hold under any outcome. Only the surface spelling is open, and the
pre-registered rule says not to change it.
