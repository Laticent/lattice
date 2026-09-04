---
marp: true
theme: indaco
paginate: true
header: "Lattice · list-tabular responsive"
---

<!-- _class: title silent -->

# The ledger fits its own content.

`Lattice · list-tabular`

Columns size to what is in them, and the deck says which column should absorb the slack.

---

<!-- _class: list takeaway -->

## What changed.

- One set of tracks, shared by every row.
- Each track sizes to its widest content.
- A rule falls between rows, never above the first or below the last.
- The ledger centers in the space it is given.
- `fit-*` and `flex-*` name the column that absorbs.

---

<!-- _class: list-tabular fixed -->

## Before: every label paid for the longest one.

1. ID
   - Two letters, a track sized for twenty.
2. Extraordinarily long row label that will not fit
   - Wraps three lines.
3. Mid
   - The same waste again.
4. Governance and control framework alignment
   - And again.

<!-- _footer: "`fixed` is the pre-responsive behavior, kept as an opt-out." -->

---

<!-- _class: list-tabular -->

## After: the track is the widest label, once.

1. ID
   - Two letters take two letters.
2. Extraordinarily long row label that will not fit
   - One line.
3. Mid
   - Nothing is padded out.
4. Governance and control framework alignment
   - The column is content, not a guess.

<!-- _footer: "The default. No modifier was added to this slide." -->

---

<!-- _class: list-tabular flex-name -->

## `flex-name` hands the leftover to the label.

1. Board approval of the revised treasury policy
   - Q3
2. Migration of the settlement ledger to the new engine
   - Q4
3. Retirement of the legacy reconciliation batch
   - Q1

<!-- _footer: "When the label is the point and the clause is a short qualifier." -->

---

<!-- _class: list-tabular fit-body -->

## `fit-body` hugs the clause and holds the right edge.

1. Settlement window `T+1`
   - Same day cutoff
2. Reconciliation cadence `Nightly`
   - Automated
3. Exception review `Weekly`
   - Risk committee

<!-- _footer: "The trailing column takes the slack, so it never strands itself mid-slide." -->

---

<!-- _class: list-tabular register -->

## Every variant inherits the same tracks.

1. api `stable`
2. cli `stable`
3. sdk `beta`
4. web `preview`

<!-- _footer: "`register` — the pills sit at the right edge instead of a fixed 0.9fr column." -->

---

<!-- _class: closing silent -->

## The columns are the content.

`One set of tracks, shared by every row`

- The default fits — most ledgers need no modifier at all.
- `fit-name` `fit-body` `fit-meta` hug one column.
- `flex-name` `flex-meta` name the column that absorbs.
- `fixed` keeps a deck that was tuned around the old widths.
