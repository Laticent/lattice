---
origin: 2762
priority: P3
recorded: 2026-10-17
area: infra
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2762
---

# Run a cold-start writer test before the directive-comment cut.

The bake-off's writer test gave every writer a one-page rule sheet and all six syntaxes scored 36 of 36. It did not
test what models write with no sheet, and the inversion review (PR #2762) argues most will write the old
`<!-- _class: … -->` form. The result sizes the cost of a hard cut against a soft cut (note §13.4).

```text
  P3 · [no ticket] Run a cold-start writer test before the directive-comment cut.
       why now   — it decides D3 (hard or soft cut) with data instead of a guess.
       where     — a new arm in engineering/decisions/2026-10-17-meta-syntax-bakeoff/ (harness, prompts, grader).
       done when — three models write 12 slides each from "make a Lattice deck" with no rule sheet; the grader counts
                   how many emit `_class` comments against the record form; the result is in results.md.
       evidence  — the grader output and the raw writer files.
       verify    — tier 0; docs and harness only.
```
