---
status: shipped
summary: >
  `npm run equiv:check` compared its corpus counts for EXACT equality, so adding an example deck
  failed the gate with a message indistinguishable from a real regression — and nothing invoked it,
  so it sat red and unread from 154 decks to 158. The comparison is now DIRECTIONAL: counts may grow
  and may not shrink, the equivalence rate keeps its band, and the refusal / prelude / skip rates
  become ratchets, with `positions + refusals === slides` as an exact accounting identity. A
  committed unit test runs the sweep (~2.1s), so `npm test` is the reader; promoting it to its own
  CI job stays with the owner. Chasing the 27 `unclassified` residuals found 25 of them were ONE
  real preview defect — `logo-on: title` painting the deck logo onto every slice, because a sliced
  slide is its own document's first section — and the other 2 were the fail-closed position guard
  correctly declining. Both now have names, the rate rose 96.6% -> 98.4%, and the `whitespace`
  neutralizer was retired on the measurement that it hid 0 divergences.
---

# The slice-equivalence baseline compares direction, not shape

**2026-08-31 · issue #1442, item 1**

## What was wrong

`npm run equiv:check` had been failing for weeks, and the failure said nothing useful:

```
baseline 96.6%  ->  now 96.7%  (+0.1)
FAIL — decks: baseline 154, now 158. The measurement changed shape, so the rate is not comparable.
FAIL — slides: baseline 1461, now 1492. ...
FAIL — positions: baseline 1453, now 1484. ...
```

The rate it exists to guard had not moved. What moved was the corpus: four decks
arrived. `decks`, `slides`, `preludes` and `positions` were compared for **exact
equality**, so writing an example deck failed the gate.

The reasoning behind the exact check was sound and is worth keeping. The
denominator really is part of the claim — a deck dropping out of the measurement
makes the rate go **up**, because the decks that drop out are the badly-matching
ones, and comparing the rate alone had already let three things through
silently. What it got wrong is the **direction**. It treated a corpus that grew
and a corpus that shrank as the same event, and only one of them is a hazard.

The second half of the failure is the more expensive one: **nothing ran it.**
`grep -rn "equiv" .github/workflows/ lefthook.yml` returned nothing. It was an
on-demand CLI sweep, so the red state above was true for weeks and unread. An
unread gate is not a gate.

## The contract now

- **Counts may grow, may not shrink.** `decks` and `slides` rising is a corpus
  edit and says nothing about the engine. Falling is the flattering direction and
  fails.
- **Ratios are what get pinned**, because they survive a corpus that changes
  size. The equivalence `rate` keeps its 1.5-point band (it genuinely drifts).
  `refusalRate`, `preludeRate` and `skipRate` are **ratchets** — each may fall,
  none may rise past a 1-point tolerance. That is the same alarm the exact counts
  were reaching for (the prelude synthesizer over-firing, a deck becoming
  unrepairable, decks leaving the sweep), stated in a unit that does not move when
  somebody writes an example.
- **`positions + refusals === slides` is exact, with no band.** It is the
  accounting identity: every measured slide either got a supplied deck position or
  was counted as a refusal. Nothing falls out of the denominator unnamed.

`refusals` is a new baseline field, and it is the one Amendment 5 of #1442 asks
for. `positions` alone cannot separate "the supply path broke" from "these decks
were never eligible" — the refusals are the decks `positionIsTrustworthy`
declines, which is exactly where a confidently-wrong page number would hide. They
are now counted, rated, ratcheted, and listed by deck in the report.

## What runs it

`test/unit/diagnostics/slice-equivalence-baseline.test.js` imports the harness and
calls `measure()` and `compareToBaseline()` — the harness's own reading of the
contract, not a second copy of the thresholds (HARD RULE #1). The whole sweep is
~2.1s, which the unit tier can carry.

It is a **test** rather than a new CI job or lefthook hook on purpose: the
pipeline already runs the unit tier, so this needs no change to what CI executes.
Promoting the sweep to its own job — with its own timing budget and its own
failure surface — is a CI-contract change and stays with the owner.

## What the unattributed bucket was hiding

Issue #1442 asks that "every residual reports a class attributed to a named
cause — no unexplained bucket". 27 of 49 residuals were `unclassified`. They split
two ways, and the larger half was not a measurement artifact at all:

**25 of 27 were one real preview defect.** `logo-on: title` selects the deck's
first slide, and `applyDeckLogoToHtml` decided firstness from the document in
front of it. That is right for a whole-deck render and wrong for every slice: a
sliced slide *is* its own document's first section, so the Studio preview painted
the deck logo on every non-title slide of `examples/finish-backdrops.md` — a mark
the export does not carry. The fix follows the pattern the same function's
neighbour already used: the engine passes `page.offset` down, exactly as it does
to `svgA11yNames.applyToHtml`, and a supplied offset greater than zero says the
first section below is not the deck's first slide. Whole-deck renders supply no
offset and are unchanged.

**2 of 27 were the fail-closed guard declining**, on `slide-class-forms.md`. That
is correct behavior, not a missing repair — but "unclassified" does not say so.
It now reports as `deck position refused (fail-closed guard)`, tested before the
progress-rail bucket, because a refusal withholds the section position too and so
produces "progress rail absent" as a *symptom*; naming the symptom over the cause
sends the reader at the wrong fix.

The lesson is the one the acceptance criterion was written for. An unnamed bucket
is where a real defect sits looking like noise — for as long as nobody counts it.

## The whitespace neutralizer, retired on a measurement

`RESIDUAL_NEUTRALIZERS` carried `whitespace` on an attribution nobody had checked:
that the sweep's own prelude injection shifts markdown block adjacency, so the
body re-parses tight-vs-loose. #1442 asks for that to be confirmed, or for the
real number if it does perturb.

It is neither confirmed nor refuted so much as **moot**. Across the whole corpus
the neutralizer hides exactly **0** divergences — every slide it could flatter
differs in something else as well, and 0 of them had a non-empty prelude. So it
bought nothing and cost a blind spot for a whitespace-only regression that could
appear later. It is gone; the set is down to `ids`, which is the direction its own
docblock says it should only ever go.

## Result

| | before | after |
|---|---|---|
| `equiv:check` | red on corpus growth, unread | green, and read by `npm test` |
| equivalence rate | 96.6% | **98.4%** (the logo repair) |
| unattributed residuals | 27 of 49 | **0 of 24** |
| refusals | untracked | 8, rated and listed by deck |
| neutralizers | `ids`, `whitespace` | `ids` |

## Not done here

Item 2 of #1442 — structural gating to close the `paginate: true` typing
regression #1265 shipped — is untouched. Item 1 is its stated prerequisite ("do
this before any of item 2's transform work"), and item 2 is a Studio perf project
with its own e2e acceptance (`docs/e2e/studio-preview-perf.spec.ts`) rather than a
continuation of this diff. #1442 stays open on it.
