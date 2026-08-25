---
status: shipped
summary: A user reported that two shipped teaching decks scored C+ from the Studio Coach and asked whether the rubric leans too hard on presentation best practices. Measured across the committed corpus they were the joint LOWEST scores in the repository, with zero lint findings and zero craft findings against them. Decomposing the grade found the five-category scorecard was one variable wearing five hats — Clarity carried ~85% of the real variance against a 28.6% nominal weight, while Pacing (0.1%) held 19.0% of the weight and graded nothing — Contract's own 0.0% turned out to be a sampling artifact of a corpus `lint:deck:all --strict` gates clean, and it discriminates on the drafts the Coach actually scores (measured live: 93 and 72 against 100), so §2's original "47.6%" headline was corrected before merge — and the dominant rule deducted 12 UNCAPPED points per dense slide, so nine of them took 108 points off a 100-point category and any long-enough deck could floor it. What shipped is (1) the grade SPLIT into Craft (conformance + craft rules, genre-blind, the same bar for every deck) and Style (prose budgets, ask, agenda, measured against a named profile and always reported with it), and (2) THREE DECLARED-ONLY profiles — `general` (the default, byte-for-byte the pre-profiles universal bar, pinned by test), `teaching` (density relief only) and `mission` (heading relief only), each relieved on the one axis its family measurably misses. Penalties are bounded and saturating in the finding COUNT with no deck-length denominator. This record is also the account of a design that had to be partly REVERSED before merge: the first cut inferred a genre from component vocabulary and set the default profile LOOSER than the bar it replaced, which inverted the scorer — a 2,332-word padded deck with no ask scored Style 100 "no issues found" while a tight 395-word argued deck scored 87, an ordering the old single grade got right. The full adversarial trio (HARD RULE #25) found that plus a stale accuracy figure quoted after the rule it measured had changed, a calibration using a different word counter than the rule it calibrated, two documented behaviors that were never implemented, seven review-core rules left with zero test coverage, and a rename verified in docs/src but not docs/e2e — every one of them live while all gates were green. Inference was removed outright after measuring that it fired on 46 decks, made 40 WORSE than abstaining and 0 better. wink-nlp was evaluated for the craft signals and rejected: its POS tagger mis-tags denominal verbs as nouns at ~0% on corporate headings but 33% on nonprofit and 42% on academic ones, so it would have imported a second genre bias pointing the same way as the first, for 1.03 MB gzipped against a 43 KB bundle.
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

Both decks scored **64, C+**. Across the corpus that was the **joint lowest score in the repository**.

*(Corpus note, since every number below rests on it: `examples/` + `exemplars/` holds
**198** committed decks; **197** carry a `_class` directive and are therefore scorable.
`examples/speech-symbols.md` is the one that does not. Earlier drafts of this record said
"197 committed decks", which understated the corpus by one — the scored population is 197,
the corpus is 198.)* Their
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

Pacing read 100 on 196 of the 197 scorable decks; Contract on all 197.

**The Contract row does not mean what this record originally said it meant, and the
correction matters enough to lead with.** An earlier cut of this section added the
bottom two rows together and called it "47.6% of the weight graded nothing". That
is right about Pacing and wrong about Contract, and the reason is a sampling
artifact this record itself flagged and then failed to act on — it noted that
Contract "is 100 everywhere partly because `lint:deck:all --strict` runs in CI"
and that "on a mentee's in-progress draft it would vary", called it a caveat, and
kept the 47.6% headline anyway. The caveat was the finding. It is now measured:

- **Contract's input is gated to zero.** `lint:deck:all` is `--all --strict`, and
  `--strict` fails on a WARNING as well as an error (`tools/lint-deck.js` — the
  exit is `errors > 0 || (strict && warnings > 0)`). It gates CI
  (`.github/workflows/ci.yml`) and pre-push (`lefthook.yml`). A deck carrying any
  lint finding therefore cannot be committed. Measured: **0 lint findings across
  all 198 committed decks, and 0 across all 164 historical revisions of them** in
  git history. Contract is pinned to 100 on this corpus BY CONSTRUCTION.
- **Style's input is not gated.** `doReview` is off under `--all`, so review
  findings never face the gate. That asymmetry is the entire reason Style varies
  on the very corpus that pins Contract flat — the two halves are not being
  measured on comparable populations.
- **On the population the scorer actually serves, Contract discriminates.** The
  Coach re-scores a draft in the editor on every keystroke. Driven on the REAL
  Studio Coach (not a harness): a half-typed class name reads Contract **93**, an
  unterminated comment **72**, against **100** for the finished deck. The OLD
  scorer's `errs * 22 + warns * 8` moves on the same drafts (**92** / **78**), so
  Contract was never dead weight in either grade.

So the ballast was **Pacing alone — 19.0%, not 47.6%** — and it is now `na` unless
a talk length is known. The rest of the diagnosis is untouched and stands on its
own: what was left correlated **−0.41** with mean words per slide, which is what
makes the grade a prose-density meter with a letter on it.

Two things follow that are worth stating plainly. First, this **removes the
`contract`-weight caveat** that this PR carried to the merge gate: a weight of
38.2% is not sitting on a dead category, and re-tuning it downward against the
corpus would have been cutting a category that carries real signal on drafts —
the corpus simply cannot see it. Second, it **strengthens the case for capping
Contract** rather than making it tidiness: the one category left uncapped was the
one that genuinely varies where the scorer is actually used, so thirteen warnings
flooring it destroyed discrimination exactly where the variance lives.

A test pins this so the wrong reading cannot come back: `contract discriminates
across draft states — it is not a corpus constant` asserts at least three distinct
values across a realistic ladder of draft findings, strict monotonicity, a
lint-clean ceiling of 100, and a floor that is never actually reached.

### 2.1 · The saturation bug

`clarity -= walls * 12`, uncapped and blind to deck length. Nine `wall-of-text`
findings took 108 points off a 100-point category; eleven took 132. Both clamp
to 0 — and having clamped, the category **stops discriminating entirely**. A
deck 20% over budget on nine slides and a genuinely unreadable deck scored the
same, and the floor was reachable by any deck long enough, however good.

The measured overage was 10–30%: the two decks ran 61–112 words against a
70-word ceiling. That is not a wall of text. That is a different genre.

## 3 · The genres fail on OPPOSITE axes

This is the finding that shaped the design, and it corrected an earlier read of mine that
the 70-word budget was "a boardroom preference". It is not — three families sit
comfortably inside it.

**Measured with `review-core`'s own `proseWordCount`**, which strips the `_class`
directive but NOT speaker-note comments. An earlier version of this table stripped all
comments, which is a different population — 53.2% of 1,890 content slides carry one, mean +9.1
words — and left every budget about three words tight against its own stated basis. The
rule and the calibration must use the same counter; they now do.

| family | slide p50/p90/p95 | over 70 | heading p90/p95 | over 14 |
|---|---|---|---|---|
| corporate | 35 / 62 / 65 | 0% | 14 / 14 | 2% |
| government-public | 43 / 64 / 68 | 4% | 13 / 15 | 5% |
| academic | 52 / 66 / 69 | 3% | 14 / 16 | 7% |
| **nonprofit** | 41 / 70 / 74 | 7% | **16 / 17** | **17%** |
| **teaching** | **78 / 94 / 110** | **67%** | 11 / 11 | 0% |

A **teaching** deck is dense and tersely headed — two thirds of its slides clear 70 words
and its median sits above every other family's 90th percentile, because a mentee re-reads
it with no narrator. A **mission** deck is normally dense (p90 = 70, *inside* the budget)
but long-headed, because a program name plus its outcome does not compress. Each gets
relief on **that axis only**: teaching's headings are the tersest measured, so it gets no
heading relief; mission's prose fits, so it gets no density relief.

`no-ask` fires on 153 of the 198 scorable decks (77.3%) and `agenda-missing` on 72 (37%). Both
remain GRADED under the default profile — a rule firing often is an argument about the
corpus, not a licence to stop scoring it, and switching them off by default is what
inverted the scorer (§6).

**A rule that fires on 77% invites the same suspicion this record levels at Contract in
§2 — weight without discrimination — so it was measured the same way, by counterfactual.**
Scoring every deck twice, once with `no-ask` findings filtered out:

| | Style variance |
|---|---|
| with `no-ask` | **58.61** |
| without `no-ask` | 40.40 |

Removing it **reduces** Style's variance by 31%, which is the opposite of a flat tax:
it deducts 9–14 points (mean 11.62) and separates the 45 decks that do make an ask from
the 153 that do not. It is a discriminator, not ballast, and it is not the shape §2
rejects. Whether a deck without an explicit ask *should* lose ~12 Style points remains a
design judgment — but it is a judgment about **Style**, which is reported against a named
profile and never reads as a verdict on the deck, so it cannot reach the Craft grade.

The teaching row is **n = 2 decks by one author** — and the blast radius of that thinness
is exactly the same two decks. Because profiles are DECLARED-ONLY, `teaching` governs the
decks that ask for it and no others: measured across the corpus, **2 of 198 decks resolve
to a non-`general` profile, both by declaration, and 196 sit on `general`**, which a test
pins byte-for-byte to the pre-profiles universal bar. So the sample the budget was
measured from and the population it governs are the same set. That does not make the
number better evidence of what teaching decks look like in general — it is still the one
most likely to want revisiting on a wider sample, and it is pinned by test so it cannot
drift silently — but it does mean a thin number cannot mis-grade a deck whose author
never opted in.

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

### 4.2 · The penalty is bounded, saturating, and has no denominator

`saturate(hits, max, k)` = `max · hits / (hits + k)`. Monotonic, bounded by `max`, never
reaching it.

Two shapes were tried and rejected first, both measured:

- **Uncapped count** (`walls * 12`, the original bug): nine dense slides took 108 points
  off a 100-point category, and having clamped at 0 the category stopped discriminating.
- **A rate over slide count** (`√(hits/slides) · max`): fixed the floor and bought two
  worse bugs, because a denominator is a lever. **Padding raised scores** — six bloated
  slides scored Style 83, the same six plus thirty empty ones scored 92, so a category
  named Brevity rewarded adding slides. And **a denominator of 1**: `splitTopLevel` cannot
  see through `split: headings`, so the shipped `examples/split-headings.md` — 7 rendered
  pages — counted as ONE content slide and its first finding cost the entire ceiling
  (Style 97 → 81, a self-inflicted regression on committed content).

A correction to what this section previously argued. It justified the √ curve with:
*"linear left 133 of 197 decks at exactly 100 Craft — the mirror image of the bug it
replaced, saturating at the top."* **That measurement was real and the inference from it
was false.** Curved and linear leave the *identical* 133 decks at 100, and must: every one
of them has zero findings, and any rate function with f(0) = 0 leaves them untouched. The
statistic cited could not distinguish the two options it was used to choose between. Three
reviews caught it independently.

There is no denominator now, so neither denominator bug is reachable — and it is the right
shape on the merits: two stub slides are two stub slides whether the deck is four slides
or forty, which is the part the old count-based scorer had right.

**A limit carried forward, stated rather than papered over.** `wall-of-text` is boolean per
slide, so 24 slides at 85 words and 24 at 110 produce the same finding count and the same
deduction. The grade discriminates in how MANY slides overrun, never in how far. The
pre-change scorer had the identical blind spot; fixing it needs the finding to carry its
overage, which is a change to review-core's contract and is not in this change.

Also folded in: `density-crowd` (43% of decks), `density-overflow` (17%) and the
verbose-chrome family now COUNT. A previous draft of this record, the changelog, and the
scorer's own docblock all *claimed* they already did — while `scoreBrevity` read four
rules and no `verbose-*` at all. The sentence announcing the fix was itself the defect.

**And `scoreContract` was rate-capped**, which it was not through three review passes:
`errs * 22 + warns * 8`, uncapped, in the category carrying the largest weight in Craft
(1.3 of 3.4). Thirteen warnings floored it; 20 and 60 were indistinguishable. That is the
exact saturation bug this change exists to end, preserved in the one Craft category that
varies on a real, un-linted draft.

### 4.3 · Genre as a profile

`lib/authoring/deck-profiles.js` — five profiles as frozen data, each budget set
at roughly its family's own p90–p95 so a rule flags an outlier WITHIN the genre
rather than the genre itself. Resolution: **declared → override → inferred →
`general`.**

A profile moves only the contested numbers. It cannot relax a stub slide, a
duplicate heading, a placeholder title, a missing alt text, or a lint error.
**A profile is a different bar, never a lower one**, and a test pins that
teaching still fails real craft defects.

## 5 · Inference was built, measured, and REMOVED

An earlier cut of this change inferred a genre from component vocabulary when none was
declared, on a rule reporting "86.4% correct when it commits, on 64.7% coverage".

**That figure was wrong, and re-measuring it is what unravelled the design.** It belongs
to a *superseded* version of the rule that also inferred `academic` from the ABSENCE of
metrics — the arm that was removed for claiming 103 of 197 decks, feature demos included.
The narrowed rule that actually shipped scores **52.9% coverage at 88.9% accuracy**. The
number was never re-measured after the rule changed, and it was quoted in the docblock and
here as measured evidence for the design.

Three independent review passes then broke inference on the merits, not the arithmetic:

- **It never helped.** Across the corpus it fired on 46 decks, made **40 of them worse**
  than abstaining, and 0 better. Every inferable profile was tighter than the fallback, so
  committing was a pure penalty — an accuracy figure with no cost model behind it.
- **Half its firings were on things that are not a genre.** 22 of 46 were `examples/`
  feature demos — thirteen `token-contrast/*` palette tests, four `social-*` decks and five
  others — which use a quote beside a metric because that is what exercises the layout. All
  22 were labeled `mission` except `gallery-jargon.md`, labeled `boardroom`.
- **It made a rule unreachable.** Inference reached `boardroom` only when a `decision`
  slide was present, which is exactly what suppresses `no-ask`. Measured on the old design:
  `no-ask` **fired on 152 decks and deducted on none of them**.

So inference is gone, and profiles are **declared only**. Nothing in the component
vocabulary positively marks a genre; a wrong guess is never neutral; and the honest
version of "we cannot tell" is to not guess. `boardroom` and `academic` went with it,
both measured to fit the default bar already.

## 6 · The default profile must never be looser than the bar it replaced

This is the mistake that made everything else dangerous, and it is worth stating plainly
because it reads as a small number.

The first cut set `general` — the fallback for **76% of decks** — to 80 words, a 16-word
heading, and *neither* structural rule graded, against a previous universal bar of 70 / 14
with both graded. The intent was leniency for a genre we had failed to detect. The effect
was that the change silently relaxed the grade for three-quarters of the corpus, and it
inverted the scorer:

| deck | words | Craft | Style |
|---|---|---|---|
| tight, argued, real takeaways, an ask, a close | 395 | 100 | **87** |
| 26 slides of padding, no ask, no agenda | 2,332 | 96 | **100 — "no issues found"** |

The old single grade ordered that pair **correctly** (93 vs 64). A scorer that ranks a
2,332-word filler deck above a tight argued one, and calls it clean while its own findings
list says "no clear ask", is worse than the bug it replaced.

`general` is now byte-for-byte the pre-profiles bar, pinned by a test against
`SLIDE_PROSE_BUDGET` and `UNIVERSAL_PROSE_BUDGETS.title.hard`, and a second test asserts no
profile is tighter than it on any axis. **A profile may only ever loosen, and only for a
deck that asked by name.**

## 7 · What this does to the corpus

| | before | after |
|---|---|---|
| `bloom-engineering-journey` | 64 C+ | Craft **100** · Style **90** (teaching, declared) |
| `seven-steps-problem-to-code` | 64 C+ | Craft **100** · Style **89** (teaching, declared) |
| `examples/split-headings.md` | 97 A | Craft 100 · Style 93 (the broken cut scored it 81) |

Across the 197 scorable decks: Craft mean 98.7 (sd 2.3, min 88), Style mean 82.5 (sd 7.5, min 57, only
6 decks at the ceiling). Profiles in use: `general` on 195 by default, `teaching` on 2 by
declaration. Nothing is inferred.

Craft clustering high is the expected shape for a corpus CI keeps lint-clean; the
discrimination that matters is that a deck with real defects drops. Style now spreads
properly (the broken cut had 51 decks at 100 and sd 5.5).

The ordering test the design failed before, re-run: the tight argued deck scores Style 89,
the 2,332-word padded deck scores **59 C — "a lot to fix"**. Padding no longer buys points;
the shipped `split: headings` deck is no longer penalised for a splitter limitation; and
`Contract` discriminates from 1 lint error to 20 without flooring.

## 8 · What is deliberately still open

- **The grade still cannot say "good."** Both halves only subtract, so a clean teaching
  deck cannot outscore a clean sales deck. Awarding credit for positive signals was
  considered and deferred: it means inventing a positive rubric with no ground truth, and
  detecting an "assertive heading" needs exactly the verb detection measured as unreliable
  in §6 of the wink evaluation.
- **`wall-of-text` is boolean.** The grade cannot tell 20% over budget from 60% over. See
  §4.2 — the fix is a review-core contract change.
- **The `teaching` numbers rest on two decks by one author.** Pinned, but thin. Bounded
  by construction: declared-only, so it governs exactly those two decks (measured — 2 of
  198 resolve non-`general`, both declared) and cannot reach a deck that said nothing.
- **`general` covers 196 of the 198 scorable decks**, which is honest — most of those are
  feature demos that are not a genre — but it means the profile system engages rarely, and
  that is the right default rather than a shortfall to fix by guessing.
- **The Coach panel is unreachable between ~1024px and ~1180px.** Pre-existing, off-path,
  recorded in the previous section.

## 8.5 · What a SECOND red team found on the reworked design

The rework in §5–§6 was itself red-teamed before merge, because the trio had reviewed the
design that was replaced. It broke it again. Three findings were mine and are fixed; two
are not, and are recorded here rather than left implied-fixed.

**Fixed — the inversion came back through a different door.** The soft brevity families'
ceilings summed to 24+16+10+8 = **58**, above `wall-of-text`'s **40**, and three of them can
co-fire on ONE slide while `wall-of-text` fires at most once. Measured: a deck of twelve
220-word walls scored brevity **68**; a deck INSIDE the 70-word budget carrying only
cosmetic nits scored **62**. The category named Brevity ranked the 2.5×-longer deck higher.
The denominator fix closed one door onto that failure; the family ceilings, new in this
change, opened another. Soft families are now capped **as a group** (`SOFT_BREVITY_CAP`,
26) strictly below the severe ceiling (`SEVERE_BREVITY_MAX`, 44), and a test pins the
inequality itself rather than a fixture that happens to depend on it.

**Fixed — the numbers were unpinned.** Mutation testing found **24 of 31** mutations
survived the whole suite: the `verbose` term could be deleted, `no-ask` and
`agenda-missing` zeroed, half the craft terms zeroed, all with CI green. The `verbose`
case is the sharp one — its own docblock says the previous claim that those findings
counted "was itself the defect", and the fix then landed **with no test**, so the identical
silent regression could recur. Every penalty term now has a DIFFERENTIAL test (score the
deck twice, once with that rule's findings filtered out) because a bare `< 100` assertion
passes for unrelated reasons — the first version of these tests let `duplicate-heading`
survive for exactly that reason.

**Fixed — "no issues found" was rendered on 9 committed decks carrying live scored
findings**, five pixels above the findings list contradicting it. The summary now reads
the categories it summarizes.

**NOT fixed, pre-existing — the default split mode is invisible to the scorer.**
`DEFAULT_SPLIT = 'headings'` (`lib/core/resolve-split.js`), but `splitTopLevel` splits only
on `hr`. A document-style deck with no `---` scores Craft 100 / Style 95 as authored and
Craft 96 / Style 61 once its boundaries are baked — the same rendered deck. It reproduces
on `origin/main` at comparable magnitude (97 → 60), so it is not this change's doing, and
exactly **one** committed deck is affected. Evidence added to **#1570**. §4.2 says the
denominator made this unreachable; that is true of the denominator only — the
`contentSlides` thresholds still misread such a deck, and this change RAISED the weight of
the rules those thresholds gate.

**RESOLVED before merge — `contract` holds 38.2% of Craft's weight and 0.0% of its
variance ON THIS CORPUS, and that is a property of the corpus, not of the category.**
Re-running this record's own methodology against the new grades: `structure` 90.5% of
Craft's variance, `craftProse` 9.5%, `contract` **0.0%** (100 on 198/198, sd 0.0). Its
nominal weight went UP, 24% → 38%, and this looks exactly like the shape §2 condemns.

It carried to the merge gate as an open design critique, on the reasoning that the
corpus is lint-gated and `contract` "would vary on a real un-linted draft — which is
true, and was equally true of the old Contract category this record rejects". Both
halves of that sentence were asserted, neither was measured, and the second half is
what made it feel like a live critique: if the defence also acquits the category §2
rejects, the two cannot both stand.

They do not — and measuring settled it in the direction that dissolves the critique
rather than the change. §2 now carries the full account; the short version is that
Contract's 0.0% is a **sampling artifact** of a corpus `--all --strict` gates
lint-clean (0 findings across 198 committed decks and 164 historical revisions), while
on the population the Coach actually scores — a draft — Contract discriminates:
**93** for a half-typed class name and **72** for an unterminated comment against
**100** clean, driven on the real Studio. The old scorer moved on the same drafts
(**92** / **78**). So the honest correction is to §2's headline, not to this weight:
the ballast was Pacing alone (19.0%), and `contract` at 38.2% is carrying real signal
that this corpus structurally cannot show.

**The weight is therefore left as-is on evidence rather than on caution.** Cutting it
to match a 0.0% that the gate manufactures would have removed weight from a category
that discriminates where the scorer is used — the precise inverse of the fix. Craft's
measured variance on this corpus is sd 2.3, and that number is still worth knowing:
it means Craft's job on a COMMITTED deck is mostly to confirm nothing is broken, which
is what a conformance half should do once the gates upstream have done their work.

## 9 · What the review process caught, and what that says

This change was reviewed by the full adversarial trio (HARD RULE #25) after the author had
declared it green on every gate — lint, 7,204 unit tests, `build:check`, the integration
tier, the full docs suite, plus a real-surface check of the Studio panel.

**Every defect in §5, §6 and §4.2 was live at that point.** The gates were all passing and
all beside the point: they verified that the code did what it did, not that what it did was
right. The specific failures worth remembering:

1. **An ordering inversion no gate can see.** A scorer that ranks a padded deck above a
   tight one is not a test failure; it is a design failure, and only an adversary
   constructing the pair finds it.
2. **A number quoted after the thing it measured had changed** (§5). The rule was narrowed;
   the accuracy figure was not re-run; it was then cited as evidence in two documents.
3. **A calibration and a rule using different definitions** of the same quantity (§3).
4. **Claims of behaviour that was never implemented** — "the verbose-chrome findings now
   count", "a pinned test asserts the two lists stay in step". Both written in good faith,
   neither true.
5. **Deleted coverage.** Nine tests were removed and seven review-core rules were left with
   zero coverage across the entire suite — five of them the rules the Craft half is built
   on. Mutation testing found it; a green suite could not.
6. **A rename verified in `docs/src` but not `docs/e2e`**, which would have gone red in CI.

The durable lesson is narrow and worth keeping: **"all gates green" is a statement about
the gates.** On a change that redefines what a number MEANS, the gates cannot be the
evidence — an adversary constructing the case the design gets wrong is.
