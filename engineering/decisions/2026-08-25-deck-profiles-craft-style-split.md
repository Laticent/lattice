---
status: shipped
summary: A user reported that two shipped teaching decks scored C+ from the Studio Coach and asked whether the rubric leans too hard on presentation best practices. Measured across all 197 committed decks they were the joint LOWEST scores in the repository, with zero lint findings and zero craft findings against them. Decomposing the grade found the five-category scorecard was one variable wearing five hats — Clarity carried 85.0% of the real variance against a 28.6% nominal weight, while Pacing (0.1%) and Contract (0.0%) held 47.6% of the weight and graded nothing, and the whole number correlated −0.41 with mean words per slide. The dominant rule, `wall-of-text`, deducted 12 uncapped points per slide, so nine dense slides took 108 points off a 100-point category and any long-enough deck could floor it. Two fixes shipped. (1) The grade SPLITS into Craft (conformance + craft rules, genre-blind, same bar for every deck) and Style (prose budgets, ask, agenda, measured against a named profile) — the single number had been averaging "does it render correctly" with "does it match one genre's terseness". (2) Genre becomes a PROFILE — data, not code — declared as `profile:` front matter, inferred from component vocabulary when absent, falling back to a lenient `general` when inference abstains, and always shown in the Coach with its origin and an override. Every profile number is set from the corpus distribution, which showed the genres fail on OPPOSITE axes: teaching decks are dense (p90 92 words vs a 70 ceiling, 50% over) and tersely headed (0% over 14), mission decks are normally dense (5% over) and long-headed (17% over). wink-nlp was evaluated for the craft signals and REJECTED: its POS tagger mis-tagged denominal verbs as nouns on 33% of nonprofit and 42% of academic headings it flagged versus ~0% of corporate ones, so it would have imported a second genre bias pointing the same way as the first, for 1.03 MB gzipped against a 43 KB bundle.
---

# Deck profiles, and splitting the grade into Craft and Style

**Date:** 2026-08-25
**Status:** decided, implemented
**Rules touched:** none added. Honors HARD RULE #1 (the profile table and both
scorers land in the shared `lib/authoring` kernel that the CLI and the Studio
Coach both run — not in one surface), HARD RULE #15 (reuse — the front-matter
read goes through the existing `topLevelFrontMatterValue`, not a new regex), and
HARD RULE #18 (the two shipped teaching decks were fixed in place rather than
filed and left).

---

## 1 · The report, and why it was not a one-off

A user said the Studio Coach called two of their teaching decks bad and that the
decks were genuinely good, and asked the right follow-up: *is this systematic —
will an NGO deck I write tomorrow score badly too?*

Both decks scored **64, C+**. Across all 197 decks in `examples/` and
`exemplars/` that was the **joint lowest score in the repository**. Their
category read said where it came from:

| | Structure | Clarity | Data | Pacing | Contract |
|---|---|---|---|---|---|
| `bloom-engineering-journey` | 68 | **0** | n/a | 100 | 100 |
| `seven-steps-problem-to-code` | 68 | **0** | n/a | 100 | 100 |

Zero lint errors, zero lint warnings, zero label titles, zero duplicate
headings, zero stub slides. They passed every rule that measures whether the
author knows what they are doing and failed one rule that counts words.

## 2 · The grade was one variable wearing five hats

Decomposing how much each category actually MOVED the final number, against the
weight the config assigns it:

| category | nominal weight | share of real variance |
|---|---|---|
| Clarity | 28.6% | **85.0%** |
| Structure | 23.8% | 14.9% |
| Pacing | 19.0% | 0.1% |
| Contract | 28.6% | 0.0% |

Pacing read 100 on 196 of 197 decks; Contract on all 197. Together they held
**47.6% of the weight and graded nothing** — ballast that lifted every score
toward A− and made the few decks that did lose Clarity points fall off a cliff.
What was left correlated **−0.41** with mean words per slide.

One caveat stated honestly: Contract is 100 everywhere partly because
`lint:deck:all --strict` runs in CI, so every committed deck is gate-clean by
construction. On a mentee's in-progress draft it would vary. Pacing has no such
excuse.

### 2.1 · The saturation bug

`clarity -= walls * 12`, uncapped and blind to deck length. Nine `wall-of-text`
findings took 108 points off a 100-point category; eleven took 132. Both clamp
to 0 — and having clamped, the category **stops discriminating entirely**. A
deck 20% over budget on nine slides and a genuinely unreadable deck scored the
same, and the floor was reachable by any deck long enough, however good.

The measured overage was 10–30%: the two decks ran 61–112 words against a
70-word ceiling. That is not a wall of text. That is a different genre.

## 3 · The genres fail on OPPOSITE axes

This is the finding that shaped the design, and it corrected an earlier read of
mine that the 70-word budget was "a boardroom preference". It is not — it fits
every professional family in the corpus:

| family | slide words p90 | over 70 | heading words p90 | over 14 |
|---|---|---|---|---|
| corporate | 59 | 0% | 14 | 2% |
| government-public | 61 | 3% | 13 | 5% |
| academic | 63 | 2% | 14 | 7% |
| nonprofit | 67 | 5% | **16** | **17%** |
| teaching | **92** | **50%** | 11 | 0% |

A **teaching** deck is dense and tersely headed — its median slide (72 words)
sits above every other family's 90th percentile, because a mentee re-reads it
without a narrator and the slide must stand alone. A **mission** deck is
normally dense but long-headed, because a program name plus its outcome does not
compress to eleven words. One universal pair of numbers penalizes each genre on
whichever axis it naturally runs long.

`no-ask` fires on **152 of 197 decks (77%)** and `agenda-missing` on **72
(37%)**. A rule that fires on three-quarters of a corpus is a constant
subtracted from nearly everyone, not a signal — everywhere except the genre it
was written for.

## 4 · What shipped

### 4.1 · The category error, fixed rather than re-tuned

The old grade averaged three incommensurable kinds of judgment: **conformance**
(does it render correctly — objective), **craft** (did the author do the work —
near-objective), and **style** (does it match a house preference —
genre-dependent and contested). Because conformance saturates and craft rules
rarely fire (`label-title` on 3% of decks, `title-incomplete` 2%,
`monotone-openings` 2%, `image-no-alt` 1%), the surviving number was ~85% style
wearing the label of quality.

`scoreDeck()` now returns two grades:

- **Craft** — `structure` · `craftProse` · `contract`. **Profile-blind by
  construction.** A unit test asserts craft is byte-identical across every
  profile for the same deck.
- **Style** — `brevity` · `framing` · `data` · `pacing`, measured against the
  resolved profile and always reported *with* its name, so a style score reads
  as fit against a declared genre rather than a verdict on worth.

Both halves still measure the ABSENCE of detected problems. The bands are named
for what was found (`no issues found`, `a few small things`) rather than for
excellence, because nothing in this file can see excellence.

### 4.2 · The penalty is a curved, capped rate

`ratePenalty(hits, over, max)` = `min(max, √(hits/over) · max)`. Bounded by
construction, so no rule family can consume a category.

The curve is not decoration. A **linear** rate was tried first and measured:
it left **133 of 197 decks at exactly 100 Craft (sd 2.2)** — the mirror image of
the bug it replaced, saturating at the top instead of the bottom. Real decks
cluster at low finding rates, so the curve has to spread the low end: one slide
in twenty costs 22% of the ceiling, one in four costs half.

Also folded in: `density-crowd` (43% of decks), `density-overflow` (17%) and the
verbose-chrome family now COUNT. They were shown to the author and silently
ignored by the scorer, while `wall-of-text` — nearly the same measurement — was
scored uncapped. Either they count or they do not.

### 4.3 · Genre as a profile

`lib/authoring/deck-profiles.js` — five profiles as frozen data, each budget set
at roughly its family's own p90–p95 so a rule flags an outlier WITHIN the genre
rather than the genre itself. Resolution: **declared → override → inferred →
`general`.**

A profile moves only the contested numbers. It cannot relax a stub slide, a
duplicate heading, a placeholder title, a missing alt text, or a lint error.
**A profile is a different bar, never a lower one**, and a test pins that
teaching still fails real craft defects.

## 5 · Inference: what it does, and the version that was wrong

`teaching` and `academic` are **not inferable**, and saying so is the honest
outcome of the measurement rather than a limitation to apologize for.

A first cut inferred `academic` from the ABSENCE of metrics, decision slides and
pull-quotes. Evaluated on the 34 labeled exemplars it looked fine. Run across
all 197 committed decks it claimed **103 of them** — because a feature-demo deck
uses none of those components either — and it still MISSED the real
`exemplars/academic/lecture.md`, which uses `stats`. **An absence rule matches
everything unremarkable.** Nothing in the data positively marks an academic
deck, so nothing claims to detect one. `teaching` has no component tell at all:
its signal is intent, not layout.

What survives commits only on positive evidence — testimony beside impact
numbers without a consulting 2x2 (`mission`), or an explicit decision slide
beside metrics (`boardroom`) — and abstains otherwise. On the labeled set that
is **86.4% correct on 64.7% coverage**, and that number is an **upper bound**:
the rule was written from the discriminative-component table of those same 34
decks, the same train-on-test caveat
`2026-08-09-on-device-intent-routing.md` §3 makes about its synonym lexicon.

Abstention is the design, not a shortfall. A null lands on `general` — the
lenient end of every contested number, because silence is not evidence of a deck
that owes the room an ask — and the Coach always names the profile, names where
it came from, and offers the override. **An inferred profile is a visible guess,
never a silent one.** The override is session-only and deliberately does not
rewrite the author's front matter: it is a "what would this look like as…" lens.

## 6 · wink-nlp was evaluated for this, and rejected

The craft signals fire rarely, and a POS tagger looked like the way to make
`label-title` — a hardcoded 40-word list plus "is it one word", firing on 0.5%
of the corpus's 1,544 headings — actually work. An assertion has a finite verb; a
label does not.

Measured, it does not. The tagger finds morphologically unambiguous verbs
(`grew`, `is`, `led`) and fails on **denominal verbs** — words that are also
common nouns:

```
✗ MISSED   Tables/PROPN scale/NOUN too/ADV
✗ MISSED   The/DET roadmap/NOUN grids/NOUN workstreams/NOUN against/ADP phases/NOUN
✗ MISSED   What/DET ships/NOUN in/ADP each/DET phase/NOUN
✓ found    Revenue/PROPN grew/VERB 18/NUM %/SYM ,/PUNCT led/VERB by/ADP APAC/PROPN
```

Adjudicating every heading it flagged, by family: **corporate 3/89 flagged with
~0 mis-tags; nonprofit 9/89 with 3 clear mis-tags (33%); academic 12/107 with 5
(42%)**. The mis-tags were the best headings in the corpus — *"Public dollars
stretch further than a year of incarceration"* (`stretch/NOUN`), *"Mass curves
spacetime, and curved spacetime bends the light passing through it"*
(`curves/NOUN`, `bends/NOUN`), *"Demand outran our 150 beds"* (`outran/NOUN`).

Corporate writing uses a narrow conventional verb set the newswire-trained model
knows cold; mission, science and teaching writing lean on concrete denominal
verbs, which is *why they are vivid*. **wink would have imported a second genre
bias pointing the same direction as the one being fixed**, and punished exactly
the headings that make those decks good — for **1.03 MB gzipped** against the
Coach's 43 KB `authoring-core` bundle (a 24× increase), and it could not live in
`review-core` without either paying that in the browser or forking the shared
kernel against HARD RULE #1.

The deeper reason it would not have helped: nothing diagnosed here was a
precision problem. Two categories held half the weight and did not vary, a
penalty saturated, and style was scored as quality. A sharper ruler does not fix
a measurement of the wrong dimension.

One correction this note records against its own earlier analysis: the craft
rules firing rarely is probably CORRECT — the committed decks genuinely do not
use label headings. Making craft detection more aggressive would have
manufactured penalties, which is the opposite of what the report asked for.

## 7 · What this does to the corpus

| | before | after |
|---|---|---|
| `bloom-engineering-journey` | 64 C+ | Craft **100**, Style **92** (teaching, declared) |
| `seven-steps-problem-to-code` | 64 C+ | Craft **100**, Style **92** (teaching, declared) |
| `exemplars/corporate/investor-pitch` | 96 A | Craft 100, Style 91 (boardroom, inferred) |
| `exemplars/nonprofit/program-overview` | 85 A− | Craft 100, Style 88 (mission, inferred) |

Across 197 decks: Craft mean 98.6 (sd 2.4, min 88), Style mean 94.0 (sd 5.5,
min 79). Craft clustering high is the expected shape for a gate-clean corpus of
finished decks — the discrimination that matters is that a deck with real
defects drops, and a synthetic deck of label titles, stubs and duplicate
headings scores **Craft 72** while its Style stays 100.

Both teaching decks now declare `profile: teaching`, because teaching is
declaration-only by design.

## 8 · What is deliberately still open

- **The grade still cannot say "good."** Both halves only subtract, so a clean
  teaching deck cannot outscore a clean sales deck. Awarding credit for positive
  signals was considered and deferred: it would mean inventing a positive rubric
  with no ground truth to validate against, and detecting an "assertive heading"
  needs exactly the verb detection §6 measured as unreliable. Revisit once the
  split has real usage behind it.
- **The `teaching` numbers are the least grounded in the table.** They come from
  two decks. Widen the sample before tuning them further.
- **`general` covers 149 of 197 committed decks**, which is honest but blunt:
  most of those are feature demos that are not really a genre at all.
