# Evidence: the deck-parser pipeline bake-off

The scripts behind the numbers in #2869's decision note
(`engineering/decisions/2026-10-22-segno-deck-pipeline.md`). Each arm must reproduce
markdown-it's block structure on the whole corpus before its speed counts.

Ran against `main` at 74eec5f; the note is on `docs/segno-deck-pipeline` at b5bac26.

| File | What it does |
|---|---|
| `corpus.mjs` | The corpus: every tracked deck, gallery and design or engineering doc (~18.9 MB). |
| `oracle.mjs` | markdown-it's block tokens as one string per block, the parity every arm must match. |
| `lines-arm.mjs` | markdown-it's block rules fed a typed line index built in one pass. |
| `mflat.mjs` | The line-index arm plus lean tokens; also times `marked.lexer` if `marked` is installed. |
| `staged.mjs` | One pass classifies every line, by hand or with a Segno-generated tokenizer; rules run behind predicates that skip only a rule that provably fails. |
| `run-staged.mjs` | Checks both stages give the same arrays, then times both arms with parity. |
| `tape-cost.mjs` | What a second pass over Segno's tape costs next to tokenizing alone. |

```sh
node followups.d/2869-p1-parser-pipeline-bake-off/run-staged.mjs
node followups.d/2869-p1-parser-pipeline-bake-off/tape-cost.mjs
```

Each script times the best of several runs on one machine. That is the gap the item records:
no spread and no second machine.
