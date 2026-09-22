---
origin: 2289
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2289#issuecomment-5767837535
backfill: true
---

# A `~~~` fence comes back as ``` once its slide is edited

Backfilled verbatim from the continuation brief on #2289 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

~~~~text
  P3 · [no ticket] A `~~~` fence comes back as ``` once its slide is edited
       why now   — lowest impact: one shipped file (examples/mermaid-tilde-fences.md),
                   and the engine renders both identically. Recorded rather than
                   claimed away in the decision doc § "What this does NOT do".
       where     — prosemirror-markdown's serializer emits backticks for every code
                   block and has no per-node marker; the fix is a marker attr on
                   code_block carried through docs/src/lib/compose/deck-doc.ts.
       done when — fence-round-trip.test.ts asserts the tilde file round-trips
                   character-exact, and its tilde arm can be made to fail.
       evidence  — the test failing before / passing after.
       verify    — tier 1 checker, because it touches the doc↔markdown seam that every
                   Compose edit crosses.
~~~~
