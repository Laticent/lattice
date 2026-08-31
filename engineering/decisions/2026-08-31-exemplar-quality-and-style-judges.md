---
status: shipped
summary: Asked whether `exemplars/` — the library `exemplars/README.md` calls "what good looks like", which the Studio's Drafting picker serves live — is good enough to derive more style judges from. The answer is not yet, and the decisive reason is not that the decks are weak. Two measurements. First a bound on how much of their shortfall is genre mis-fit rather than quality: scoring all 45 under the loosest profile that helps them raises mean Style 83.4 → 92.3, so at most 8.9 of the 16.6-point gap is fit and at least 7.7 points (46%) is genuine. `teaching` wins all 45, which is the tell — it is simply the most permissive profile, so this measures how far pure leniency carries the corpus, not what genre each family is. Under that best fit `agenda-missing` still fires on 37 of 45 decks and `no-ask` on 23. Second, the render, checked against the 45 committed PDFs rather than a proxy: the scorer is BLIND to composition, and the direct test says so — across all 45 decks the correlation between Style score and the share of pages carrying a large vertical void is r = −0.122 (n = 45, not significant), so composition explains 1.5% of Style variance. Joining every page to its slide class (553 slides, 553 pages, zero mismatches), 218 of 444 CONTENT pages — 49% — carry a void over a quarter of the content band; an independent re-derivation got 219. The rest of the void census is instrument-dependent and is not claimed: two implementations disagree 0% vs 83% on sparse-by-design pages, because a row-blankness metric cannot see void inside a full-bleed tint, which is also why neither detects the worst slide found by eye. Two structural facts: zero of the 45 declare a `profile:`, and declaring `mission` would raise 18 of them including 6 of 7 nonprofit decks; and Craft is pinned at 100 on 44 of 45, but NOT because a gate hides its inputs — `structure` and `craftProse` read ungated review findings, and the one exception (`public-hearing`, 96) is an ungated `monotone-openings` that fired. The recommendation: a judge derived from these decks would be a TEXT judge, because that is all review-core reads, while the 10/10 bar is a property of the rendered page — so it would encode the corpus's text habits and certify nothing about the axis that prompted the question. Three follow-on cards, none implemented here: declare profiles on the 45; decide whether composition is something the ENGINE should measure at all; only then revisit judges. This record was corrected before merge after a checker refuted its first cut — the profile override had been passed to the scorer but not to the rule engine that owns three of its four levers, making the headline bound wrong by 17 points.
---

# Are the exemplars good enough to derive style judges from?

**Date:** 2026-08-31
**Status:** decided, investigated
**Issue:** #1966
**Rules touched:** none. Honors HARD RULE #23 (the visual claims are made against the
committed PDFs, the real artifact, and the two measurements that are only bounds say so)
and HARD RULE #18 (what this found is recorded, not quietly fixed — this note changes no
deck, no budget and no rule).

---

## 1 · The question, and why the scorer cannot answer it

`exemplars/README.md` calls the library *"what good looks like"*. The Studio's Drafting
picker serves those decks live, so authors copy them. And §3 of
`engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md` measured these
decks' per-family percentiles to set the profile budgets.

*(That is the honest, narrower version. An earlier cut said the budgets were "derived from"
the exemplars, which overstates it: `general` is the pre-existing universal bar and was not
derived, `teaching` came from two non-exemplar decks by one author, and only `mission`'s
`titleHard: 18` traces directly to an exemplar percentile (nonprofit p95 = 17). What the
exemplars did do is justify leaving corporate, government and academic at 70/14 — a real
circularity, but a thinner one than "the budgets came from here".)*

That makes their quality load-bearing twice, and it makes the obvious check useless:
grading them with the scorer asks the corpus whether it resembles itself. Graded as they
sit today, 40 of 45 fall below 93 on at least one half and mean Style is 83.4 — a B+
library of "good" — but that number is consistent with the decks being mediocre AND with
the decks being fine and mis-judged, and the scorer cannot separate the two.

This is the same failure the 2026-08-30 record documents one level down: *a measurement
made on a corpus is evidence about that corpus, not about the thing you wanted to price.*

## 2 · Bounding the profile-fit explanation

**Zero of the 45 decks declare a `profile:`.** Every one resolves to `general`, the
strictest bar. The `mission` profile — built and calibrated specifically on the nonprofit
family's measured heading lengths — governs none of the nonprofit exemplars, which are
the lowest-scoring family. So a large part of the shortfall could be a fit failure rather
than a quality failure.

To bound it, score every deck under the **best** of the three profiles — passing the
override into `reviewText` AND `scoreDeck`, since between them they own all four levers.
That is a deliberate over-estimate: nobody assigns a genre by picking whichever profile
scores highest, so what survives is a floor on the genuine shortfall, subject to the
caveat below.

| family | n | Style (`general`) | Style (best-fit) | gap closed |
|---|---|---|---|---|
| corporate | 9 | 89.1 | 94.1 | 46% |
| general-team | 11 | 82.6 | 93.4 | 62% |
| academic | 10 | 82.5 | 92.7 | 58% |
| government-public | 8 | 82.5 | 91.4 | 51% |
| nonprofit | 7 | 79.7 | 88.9 | 45% |
| **all** | **45** | **83.4** | **92.3** | **54%** |

**At most 8.9 of the 16.6-point gap is profile fit. At least 7.7 points — 46% — is
genuine**, surviving the loosest profile in the system.

> **CORRECTED.** The first cut of this section reported 89.6 / 37% / **63% genuine**, and
> a checker refuted it. The override was passed to `scoreDeck` but **not** to `reviewText`,
> and `reviewText` is where three of the four profile levers live — `slideWords`,
> `slideBullets` and `titleHard` are read there (`review-core.js:206,226`), while
> `scoreDeck` reads only `framingScale`. So the measurement exercised one lever of four and
> called the result an upper bound. `docs/src/components/studio/coach/coach-core.ts:77-82`
> carries a comment written for exactly this mistake: *"Passing it to only one would grade
> a deck against a profile whose findings were generated under a different one."* The
> corrected figures are above; the stated lower bound was wrong by 17 points, in the
> direction that makes the corpus **less** bad than first reported.

Read the "best profile" column with suspicion, because it is the tell: `teaching` wins for
**all 45** decks, and `teaching` is simply the loosest profile — 95 words against 70, 8
bullets against 6, and the only `framingScale` below 1. The exercise is not discovering
each family's true genre; it is measuring how far pure leniency can carry the corpus. Just
over half way.

**"Genuine by construction" is too strong, and the first cut said it.** `max` over three
profiles bounds what *today's three profiles* can relieve — not what genre-appropriateness
would explain in principle. `density-crowd`, `metric-no-referent`, `verbose-*` and
`monotone-openings` are unreachable by any profile lever, and they are most of the residue.
The honest claim is the narrower one: **no profile we ship closes more than 54% of the gap.**

What still deducts under the corrected best fit, counted in decks:

| decks | finding |
|---|---|
| 37 | `agenda-missing` — no agenda on a long deck |
| 23 | `no-ask` — no clear ask |
| 33 | `density-crowd` — crowded elements |
| 16 | `metric-no-referent` — a hero number with nothing to compare it to |
| 18 | `long-heading` |
| 24 | `verbose-*` — over-long labels |
| 1 | `wall-of-text` — a slide over the prose budget |
| 1 | `monotone-openings` |

82% of the library has no agenda and 51% has no ask, under the profile most forgiving of
exactly those two rules. Note `wall-of-text`: it collapses from 23 decks to **1** once the
prose budget actually moves, which is the clearest single sign that the first cut's
plumbing bug mattered.

**And it flips a conclusion about card (1).** Under the broken instrument `mission` beat
`general` on **zero** decks, which would have made "declare profiles" worthless. Corrected,
`mission` raises **18 of 45**, including **6 of the 7 nonprofit** decks it was calibrated
on. Declaring profiles is worth doing, and this note nearly argued the opposite from its
own bug.

## 3 · The render, which is where the real finding is

All 45 PDFs are committed, so this was checked against the artifact a human actually sees
rather than a proxy (HARD RULE #23).

**The scorer is blind to composition.** The direct test is a correlation across all 45
decks between the Style score and the share of a deck's pages carrying a large vertical
void:

> **r = −0.122** (n = 45; |r| ≈ 0.29 needed for p < 0.05). Composition explains **1.5%**
> of Style variance. The sign is the intuitive one — more void, slightly lower score — and
> the magnitude is indistinguishable from noise.

That is the claim, and it is a corpus-wide measurement rather than an impression.

*(An earlier cut led with two decks instead — `impact-annual-report`, Style 67, worst, whose
hero-metric slide is strong; and `quarterly-business-review`, Style 94, best, whose KPI
slide "has the same large empty lower band". A checker measured both pages: 16% and 12%
void, **both under this section's own 25% bar**, at every threshold and resolution tried.
The pair still illustrates the point — a 27-point score spread with no visible quality
gap — but "it is measurable" was false of those two slides specifically, and the anecdote
has been demoted to make room for the test that actually settles it.)*

**How much void there is, stated only as far as two instruments agree.** Over every
committed page, excluding the top 4% and bottom 7% so the hairline rule and the page-number
footer do not count as content, and joining each page to its slide's class (the join is
exact — 553 classed slides, 553 pages, zero mismatches across all 45 decks):

| population | pages | with >25% void |
|---|---|---|
| content slides | 444 | **218 (49%)** |
| sparse by design (title/divider/quote/agenda/closing/section) | 109 | instrument-dependent — see below |

**Half of the corpus's content pages carry a void over a quarter of the band.** An
independent re-derivation by the checker landed on 219 of 444 — one page apart — so that
number is solid.

Everything else about the census is **instrument-dependent and is not claimed here.** The
two implementations disagree violently on the sparse-by-design pages (0% against 83%) and
on the per-deck median (36% against 50%), because they treat a full-bleed tinted background
differently: a divider with a colored ground has ink in every row, so a "blank row" metric
scores it 0% void while a modal-background metric sees straight through it. That same
blindness is why neither instrument detects the QBR slide above — its waste is *inside* a
tinted panel. **A row-blankness metric cannot see void inside a filled shape**, which is a
real limit on anything built from this and the reason the follow-on card asks whether the
engine should measure composition properly rather than whether this script should be kept.

## 4 · Two structural facts worth keeping

**Craft is pinned at 100 on 44 of 45**, the exception being
`government-public/public-hearing.md` at 96. It cannot discriminate on this corpus.

The reason is **not** the one an earlier cut of this note gave. It said Craft is flat "for
the same reason `contract` and `pacing` are — the lint gate filters its inputs out", and
that is true of exactly one of Craft's three categories. `contract` reads lint findings and
is genuinely gated. But `structure` and `craftProse` read **review** findings
(`scorecard.js:267-313`), every one of which is `severity: 'suggestion'`, and nothing gates
those at all. The single exception proves it: `public-hearing`'s 96 comes from `craftProse`
88, deducted by `monotone-openings` — an ungated review finding that fired and cost the
deck four points. Craft is flat here because those rules genuinely almost never fire on
this corpus, which is a different and more interesting fact than "a gate hid them". And
`pacing` is a third thing again — starved, never supplied `talkMinutes` by any caller. One
gated, one starved, one simply quiet; the earlier text collapsed all three into the gate.

**Nothing declares a profile.** Three profiles exist, two of them (`teaching`, `mission`)
were built by measuring these very families, and the decks they were measured from say
nothing about what they are. That is a gap with an unusually good cost/benefit: it is
front-matter only, it changes no render and no export, and it would make the corpus's own
Style numbers mean something for the first time.

## 5 · Recommendation

**Do not derive style judges from this corpus yet — and the reason is not mainly that the
decks are mediocre.**

The decisive objection is §3. A judge derived from these decks would be a *text* judge,
because that is all `review-core` reads, and the "10/10 killer boardroom" bar is a claim
about the rendered page. The corpus's most visible weakness is invisible to the very
instrument we would be fitting to it, so a judge fitted this way would encode the corpus's
text habits while certifying nothing about the axis that prompted the question. Fitting
harder on the wrong axis is worse than not fitting: it produces a confident number about
the thing we can already see and silence about the thing we cannot.

The quality objection is real but secondary, and now bounded: 46% of the shortfall
survives the loosest profile, so this is not a clean "good" reference class either way.

**Note what that means for §2.** The decisive objection above is corpus-INDEPENDENT — it
would hold verbatim against a flawless library, because it is about which instrument a
text judge is, not about these decks. So §2, the bulk of the measurement effort, is not
load-bearing for the recommendation; it answers the narrower question of how bad the
corpus is, and card (1) depends on it. That is also why correcting §2's headline from 63%
to 46% does not flip anything: it weakens an objection the recommendation already treats
as secondary.

**The sequencing the question proposed — make them 10/10 first, then derive judges — is
right, with one amendment.** "10/10" has to be defined on the rendered page against
`engineering/decisions/2026-06-06-layout-audit/`, not as "scores well", or the remediation
optimizes the wrong axis and the scorer certifies its own budgets back to itself.

Three follow-on cards, in dependency order. Each is independently useful, and this note
deliberately implements none of them:

1. **Declare a `profile:` on all 45** (front matter only; no render change). Cheapest of
   the three, makes every future Style number about these decks interpretable, and
   retires the `mission`-unused-by-nonprofit anomaly. Blocks nothing.
2. **Decide whether vertical void is a defect the engine should see.** Today nothing
   measures composition — not the scorer, not the linter, not a gate. If it should, it
   belongs in the engine next to the Fit Spine, not in a style judge. If it should not,
   say so and stop treating the rendered page as in scope for grading. This is the
   architectural fork and it should be settled before (3).
3. **Only then**: revisit deriving style judges, with (2)'s answer deciding whether such a
   judge is text-only by design or has a composition arm at all.

## 6 · What this note did not establish

- **Whether any individual exemplar is actually bad.** §3 bounds the void corpus-wide; it
  names no slide a defect. A per-slide verdict needs the layout-audit rubric applied deck
  by deck, which is card (1)'s and (2)'s business, not this spike's.
- **How much of the 10.4 genuine points is house preference rather than a real flaw.**
  `agenda-missing` fires on 82% of the library. Either the corpus is systematically
  missing agendas, or the rule's idea of "a long deck" is wrong for an 11-page worked
  example. Both are plausible; nothing here separates them, and it is the same
  gated-vs-starved-vs-real question one category over.
- **Anything about `general-team`.** It is the largest family (11 decks) and the only one
  with no matching profile concept at all; whether it is a genre or a residue is unasked.
- **Whether the void metric can see the void that matters.** It counts blank page ROWS, so
  a tinted panel holding one number reads as fully inked. Neither slide §3 originally named
  crosses its own 25% bar for exactly this reason. Any composition measure built from this
  needs a different primitive.
- **The sparse-by-design half of the census.** Two independent instruments differ 0% vs
  83% on those 109 pages. Only the content-page figure (49%) is claimed.
- **Whether declaring a profile would change any deck's grade** was measured for `mission`
  (18 of 45) but not for `teaching`, and no deck was assessed for which profile it should
  actually declare — that is card (1)'s work, and "best-scoring" is explicitly not the
  right criterion for it.

## 7 · How to re-derive everything above

```
npm run score:variance                       # the corpus-level decomposition this builds on
npm run test:integration:exemplars           # the committed deck/PDF page-count invariants
```

*(That second line read `node --test test/unit/exemplars` in the first cut. It does not
execute — Node needs the glob form — and even fixed it runs the Drafting tier filter, not
the page-count invariants, which live in `test/integration/exemplars/`. A checker ran it.
In a note about relayed numbers, shipping a re-derivation command that was never run is
the same defect one level up.)*

The two measurements specific to this note — the best-fit profile bound (§2) and the
content-band void census (§3) — were run as throwaway scripts against `scoreDeck` with
`profileOverride`, and against the committed PDFs via `pdftoppm -gray`. They are NOT
committed: neither is a gate, and the second is a bound whose interpretation depends
entirely on the anchor-slide caveat above, which a number alone would lose. If card (2)
decides composition is in scope, the void census earns a home in the engine at that point
and should be written there rather than resurrected from here.
