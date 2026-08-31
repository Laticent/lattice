---
status: shipped
summary: Asked whether `exemplars/` — the library `exemplars/README.md` calls "what good looks like", which the Studio's Drafting picker serves live and from whose percentiles the Style budgets were derived — is good enough to derive more style judges from. The scorer cannot answer that question about a corpus it was calibrated on, so this note breaks the circularity two ways. First, a bound: scoring every exemplar under the BEST of the three profiles is an explicit upper bound on how much of the shortfall is profile-fit rather than quality, because nobody would assign profiles by picking the highest score. Mean Style rises 83.4 → 89.6, so profile fit explains at most 6.2 of the 16.6-point gap (37%) and at least 10.4 points (63%) is genuine deduction surviving the most generous profile available. What survives is concentrated: `agenda-missing` on 37 of 45 decks and `no-ask` on 23, plus density and heading-length findings. Second, the render: all 45 PDFs are committed, so the real artifact was inspected rather than a proxy. That is where the more useful finding is — the scorer is BLIND to composition. The worst-scoring deck (`impact-annual-report`, Style 67) has a strong hero-metric slide, and the best-scoring one (`quarterly-business-review`, Style 94) has the same large vertical void as the worst; the grade does not move with the thing the boardroom rubric actually judges. Measured over every committed page: all 45 decks carry at least one page where more than a quarter of the content band is empty, and the median deck has 36% of its pages in that state, against only 20% of slides being sparse by design (title/divider/quote/agenda/closing/section) — so roughly 16 points of that void sits on content slides. Two other structural facts: ZERO of the 45 decks declare a `profile:`, so all are judged against `general` and the `mission` profile calibrated on the nonprofit family is used by none of it; and Craft is pinned at 100 on 44 of 45, the same flatness artifact `contract` and `pacing` have, because the corpus is lint-clean by the gate. The recommendation is therefore NOT to derive style judges from this corpus yet, and the reason is not mainly that the decks are mediocre — it is that a text-only judge derived from them would inherit a blind spot on the one axis the 10/10 bar is about. Two cheap, independently useful cards fall out: declare profiles on the 45, and decide whether vertical void is a defect the engine should see at all.
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
`engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md` derived the
per-family word and heading budgets from these decks' own percentiles.

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

To bound it, score every deck under the **best** of the three profiles. That is a
deliberate over-estimate: nobody would assign a genre by picking whichever profile scores
highest, so whatever gap survives it is genuine by construction.

| family | n | Style (`general`) | Style (best-fit) | gap closed |
|---|---|---|---|---|
| corporate | 9 | 89.1 | 94.1 | 46% |
| academic | 10 | 82.5 | 90.6 | 46% |
| government-public | 8 | 82.5 | 89.5 | 40% |
| general-team | 11 | 82.6 | 88.3 | 32% |
| nonprofit | 7 | 79.7 | 84.7 | 25% |
| **all** | **45** | **83.4** | **89.6** | **37%** |

**At most 6.2 of the 16.6-point gap is profile fit. At least 10.4 points — 63% — is
genuine**, surviving the most generous profile in the system.

Read the "best profile" column with suspicion, because it is the tell: `teaching` wins for
nearly every family, and `teaching` is simply the loosest profile (95 words vs 70, and the
only one with `framingScale` below 1). The exercise is not discovering each family's true
genre; it is measuring how far pure leniency can carry the corpus. Not far enough.

What still deducts at best-fit, counted over the 45:

| count | finding |
|---|---|
| 37 | `agenda-missing` — no agenda on a long deck |
| 23 | `no-ask` — no clear ask |
| 19 + 14 | `density-crowd` — crowded elements |
| 16 + 7 | `wall-of-text` — slides over the prose budget |
| 13 + 5 | `long-heading` |
| 12 + 12 | `verbose-*` — over-long labels |
| 14 + 2 | `metric-no-referent` — a hero number with nothing to compare it to |
| 1 | `monotone-openings` |

82% of the library has no agenda and 51% has no ask, under the profile most forgiving of
exactly those two rules.

## 3 · The render, which is where the real finding is

All 45 PDFs are committed, so this was checked against the artifact a human actually sees
rather than a proxy (HARD RULE #23).

**The scorer is blind to composition, and the two ends of the range prove it.**
`nonprofit/impact-annual-report.md` scores Style **67 — the worst in the corpus** — and
its hero-metric slide is genuinely good: a takeaway headline, a hero number carrying its
baseline (`412,000`, up from 318,000, +30%), supporting metrics with targets and
provenance chips. Meanwhile `corporate/quarterly-business-review.md` scores **94, the
best** — and its KPI slide has the same large empty lower band as the worst deck's
journey-map slide. The grade does not move with the thing the boardroom rubric judges.

That is not an anecdote about two slides; it is measurable. Over every committed page,
excluding the top 4% and bottom 7% so the eyebrow rule and the page-number footer do not
count as content:

- **All 45 decks** carry at least one page where more than a quarter of the content band
  is empty.
- The **median deck has 36% of its pages** in that state.
- The worst trailing void reaches **61% of the content band** on many decks.

*(The first cut of this measurement was wrong and is worth recording: it looked for the
lowest row containing ink and found 96% on every page of all 45 decks, which reads as "no
dead space anywhere". It was measuring the page number. The footer is ink on every page,
so the metric had to become the largest blank run INSIDE a content band with the chrome
excluded. An instrument that answers confidently on the first run is not thereby right.)*

**This is a bound, not a verdict.** A divider, quote, agenda, title, closing or section
slide is *supposed* to be sparse, and 109 of the corpus's 553 classed slides (20%) are one
of those. Against a median 36% of pages carrying >25% void, roughly 16 points sits on
content slides that are not sparse by design. That is enough to say the void is real and
not merely the anchors; it is not enough to call any individual slide a defect, and this
note does not.

## 4 · Two structural facts worth keeping

**Craft is pinned at 100 on 44 of 45.** It cannot discriminate on this corpus at all —
the same flatness artifact `contract` and `pacing` turned out to have, and for the same
reason: `lint:deck:all --strict` gates the corpus clean, so Craft's inputs are filtered
out before it sees them. Any future work that tries to rank exemplars by Craft is
measuring the gate.

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

The quality objection is real but secondary, and now bounded: 63% of the shortfall is
genuine, so this is not a clean "good" reference class either way.

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

## 7 · How to re-derive everything above

```
npm run score:variance                    # the corpus-level decomposition this builds on
node --test test/unit/exemplars           # the committed deck/PDF page-count invariants
```

The two measurements specific to this note — the best-fit profile bound (§2) and the
content-band void census (§3) — were run as throwaway scripts against `scoreDeck` with
`profileOverride`, and against the committed PDFs via `pdftoppm -gray`. They are NOT
committed: neither is a gate, and the second is a bound whose interpretation depends
entirely on the anchor-slide caveat above, which a number alone would lose. If card (2)
decides composition is in scope, the void census earns a home in the engine at that point
and should be written there rather than resurrected from here.
