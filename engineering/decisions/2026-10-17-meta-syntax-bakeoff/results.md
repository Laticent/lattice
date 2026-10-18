# Bake-off results (2026-10-17)

Generated from `results.json`, `writers.json` and `scores.json` by `score.mjs`, under the weights and gates fixed in
`../2026-10-17-meta-syntax-bakeoff.md`, including its §10 amendment (C6). Reproduce with
`BAKEOFF_MODULES=<dir with commonmark, micromark, marked, @marp-team/marp-core> node run.mjs && node grade-writers.mjs
<writers dir> && node score.mjs`. Harness audit and fixes: `audit.md`.

## Correction: rule G4 could not be met

The pre-registration set G4 as "a candidate must beat the control by at least 10 points to recommend a syntax change."
The control scores **90.1** of 100, so the highest possible margin is 9.9. **G4 was unreachable by construction.**
An earlier report of this bake-off said "no candidate clears the bar, so keep comments." That sentence read an
arithmetic fact as a finding and is withdrawn. The margin was set before the control's score was known; the mistake is
mine, and the weights were not changed afterwards to hide it. What the bake-off can support is below.

## Scores

| Criterion | C0 <!-- _key: value --> (control) | C1 `@meta{…}` | C2 @meta{…} | C3 ```meta fence | C4 [meta]: # "…" | C5 <meta …> | C6 <!-- @meta{…} --> |
|---|---|---|---|---|---|---|---|
| 1 parser pains (20) | 18.4 | 20.0 | 20.0 | 20.0 | 20.0 | 20.0 | 18.8 |
| 2 rendering outside Lattice (15) | 15.0 | 10.0 | 10.0 | 10.4 | 14.0 | 11.5 | 15.0 |
| 3 jank (15) | 15.0 | 15.0 | 15.0 | 13.3 | 15.0 | 15.0 | 11.7 |
| 4 authoring size (10) | 6.7 | 9.6 | 10.0 | 5.3 | 5.1 | 9.6 | 5.5 |
| 5 authoring correctness (15) | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 |
| 6 validation and completion (10) | 6.0 | 9.0 | 9.0 | 10.0 | 8.0 | 9.0 | 9.0 |
| 7 house style and LFM fit (5) | 4.0 | 4.0 | 2.0 | 5.0 | 2.0 | 3.0 | 3.0 |
| 8 Marp bridge (5) | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |
| 9 speed (5) | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |
| **Total (100)** | **90.1** | **92.6** | **91.0** | **89.0** | **89.1** | **93.0** | **88.0** |

| Gate | C0 | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|---|
| G1 lossless notes | **FAIL** | pass | pass | pass | pass | pass | **FAIL** |
| G2 line-preserving | pass | pass | pass | pass | pass | pass | pass |
| G3 no silent loss | **FAIL** | pass | pass | pass | pass | pass | pass |

## What the bake-off supports

- **The gates remove both comment carriers.** C0 and C6 fail G1 (a comment cannot contain `-->`, so a note that does
  does not round-trip). C0 also fails G3: `<!-- _footer Q3 -->`, a directive missing its colon, silently becomes a
  speaker note. C1 to C5 pass every gate. A cheap escape for `-->` (for example `--\>`) would fix G1 for the comment
  carriers; it was not tested.
- **Among C1 to C5 the totals are within four points** (89.0 to 93.0), and criteria 6 and 7 (my rubric judgments, audited
  but not measured) decide most of that spread. Treat it as a tie, not a ranking.
- **Writers do not separate the syntaxes.** Every writer wrote every syntax exactly right (C0 to C5: three writers, 36 of
  36 each; C6: one writer, 12 of 12). A cold-start test with no rule sheet was not run.
- **The control was given typed fields.** C0 splits `_class` words into layout, variant and registers through the
  catalog. That is the consolidation the parent note proposes, not today's reader.

## What each costs, measured

| | median lines / chars | junk visible in other renderers (chars) | structure intact | in real Marp, uncompiled: visible on slide / leaked into notes (chars) |
|---|---|---|---|---|
| C0 comments | 2 / 92 | 0 | 1.00 | 14 / 53 (header and footer render; notes are real notes) |
| C1 `` `@meta{}` `` | 1 / 83 | 111 | 1.00 | 111 / 0 |
| C2 `@meta{}` | 1 / 77 | 111 | 1.00 | 111 / 0 |
| C3 ```` ```meta ```` | 4 / 95 | 103 | 1.00 | 103 / 0 |
| C4 `[meta]: # "…"` | 4 / 99 | 23 | 1.00 | **0 / 0** |
| C5 `<meta …>` | 1 / 84 | 37 | **0.69** | 38 / 0 |
| C6 `<!-- @meta{} -->` (three lines) | 3 / 100 | 0 | 1.00 | 0 / **111** |

- **C6 as written is held back by its three-line shape.** The opener line is a bare `<!--`, so a record inside a list or
  blockquote cannot be flagged by a line scan (placements 7 of 9, against 9 of 9 for most). A **one-line** form,
  `<!-- @meta{layout=content, footer=Q3} -->`, was checked separately (unscored): placements 9 of 9, round trip 12 of 12,
  median one line. By arithmetic on the scored criteria it would land near 95, which is an estimate, not a result.
- **C6 shows nothing on the slide anywhere, but real Marp turns it into a speaker note** unless the bridge compiles it.
  Only C4 is clean in real Marp when shipped uncompiled.
- **Other failures worth knowing:** C5 swallows the lines after it under CommonMark when it sits directly above content;
  C3 loses a later record when its fence is nested inside another fence; C1 and C2 show as code on the slide in every
  renderer that does not know them.

## What decides it

The measured criteria do not settle the spelling. These requirements do, and they belong to the owner:

1. **Is a comment acceptable as a carrier?** If yes, the one-line C6 is the strongest candidate on size and totals, with
   one cost (`-->` needs an escape) and one dependency (the Marp bridge must compile it, or it leaks into notes).
2. **If no comment, must the record be invisible in every Markdown renderer?** If yes, only C4 qualifies, at four lines
   and an escaping burden. If "never rendered" means Lattice's own output, C3 is the cleanest and best on rubric items.

## Where this leaves the parent note

The record's contents, the source door, the internal form, the Marp compile-back and the reader-consolidation-first
order do not depend on the spelling and hold under any choice.
