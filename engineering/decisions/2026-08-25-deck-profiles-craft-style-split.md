---
status: shipped
summary: A user reported that two shipped teaching decks scored C+ from the Studio Coach and asked whether the rubric leans too hard on presentation best practices. Measured across the committed corpus they were the joint LOWEST scores in the repository, with zero lint findings and zero craft findings against them. Decomposing the grade found the five-category scorecard was one variable wearing five hats — Clarity carried ~85% of the real variance against a 28.6% nominal weight, while Pacing (0.1%) and Contract (0.0%) held 47.6% of the weight and read 100 on every committed deck. That inflation is real, but the inference originally drawn from it — that the weight graded nothing — holds for NEITHER row and was corrected before merge: Contract's zero is a sampling artifact of a corpus `lint:deck:all --strict` gates lint-clean, and it discriminates on the drafts the Coach actually scores (pinned through the real linter at 93 for a half-typed class name and 71 for an unterminated comment against 100 clean), while Pacing's zero is an input-availability artifact — `length-vs-time` fires only on `talkMinutes`, which no caller supplies to the scored review on any surface, so shipping it as `na` is the right answer to missing input rather than a verdict on the category — and the dominant rule deducted 12 UNCAPPED points per dense slide, so nine of them took 108 points off a 100-point category and any long-enough deck could floor it. What shipped is (1) the grade SPLIT into Craft (conformance + craft rules, genre-blind, the same bar for every deck) and Style (prose budgets, ask, agenda, measured against a named profile and always reported with it), and (2) THREE DECLARED-ONLY profiles — `general` (the default, byte-for-byte the pre-profiles universal bar, pinned by test), `teaching` (density relief, and the only profile that stops GRADING a rule — `no-ask` and `agenda-missing` become advice-only for a lesson) and `mission` (heading relief only), each relieved on the one axis its family measurably misses. Penalties are bounded and saturating in the finding COUNT with no deck-length denominator. This record is also the account of a design that had to be partly REVERSED before merge: the first cut inferred a genre from component vocabulary and set the default profile LOOSER than the bar it replaced, which inverted the scorer — a 2,332-word padded deck with no ask scored Style 100 "no issues found" while a tight 395-word argued deck scored 87, an ordering the old single grade got right. The full adversarial trio (HARD RULE #25) found that plus a stale accuracy figure quoted after the rule it measured had changed, a calibration using a different word counter than the rule it calibrated, two documented behaviors that were never implemented, seven review-core rules left with zero test coverage, and a rename verified in docs/src but not docs/e2e — every one of them live while all gates were green. Inference was removed outright after measuring that it fired on 46 decks, made 40 WORSE than abstaining and 0 better. wink-nlp was evaluated for the craft signals and rejected: its POS tagger mis-tags denominal verbs as nouns at ~0% on corporate headings but 33% on nonprofit and 42% on academic ones, so it would have imported a second genre bias pointing the same way as the first, for 1.03 MB gzipped against a 43 KB bundle.
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
**199** non-README decks; **198** carry a `_class` directive and are therefore scorable.
`examples/speech-symbols.md` is the one that does not. This note has now been wrong twice
— it first said "197 committed decks", was corrected to 198/197, and a checker re-counted
it at 199/198 (202 `.md` files, 3 of them READMEs). Every population figure in this record
is **198 scorable**; where an earlier figure read 197 it has been re-derived, not
rescaled.)* Their
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

Pacing read 100 on 197 of the 198 scorable decks; Contract on all 198.

**Neither of those two zeroes means what this record originally said it meant, and
the correction matters enough to lead with.** An earlier cut of this section added
the bottom two rows together and called it "47.6% of the weight graded nothing".
The *observation* is true and is the mechanism that lifted every grade toward A−:
47.6% of the weight was pinned at 100 on this corpus. The *inference* — that the
weight was therefore worthless — does not follow for either row, and this record
had already half-seen it: it noted that Contract "is 100 everywhere partly because
`lint:deck:all --strict` runs in CI" and that "on a mentee's in-progress draft it
would vary", called that a caveat, and kept the headline anyway. The caveat was
the finding. Both rows are now measured rather than inferred.

**Contract — pinned by a gate, not by worthlessness.** `lint:deck:all` is
`--all --strict`, and `--strict` fails on a WARNING as well as an error
(`tools/lint-deck.js` — the exit is `errors > 0 || (strict && warnings > 0)`). It
gates CI (`.github/workflows/ci.yml`) and pre-push (`lefthook.yml`), and its own
sweep (277 files) is a superset of the 198 scorable decks. So a deck carrying any
lint finding **cannot be pushed or merged**, and Contract is pinned to 100 on this
corpus BY CONSTRUCTION — measured, **0 error- and 0 warning-severity findings across all
198**. (Precisely that, not "0 findings": there are 7 `info`-severity ones, which the CLI
reports as suggestions and which neither `--strict` nor `scoreContract` counts. The
distinction is the same one the paragraph below draws, so getting it loose here was
careless in a sentence about exactly that asymmetry.)

*Two precision notes, because the first draft of this correction overstated both.*
"Cannot be **committed**" would be wrong: the pre-commit glob is non-recursive and
misses `exemplars` and the `examples` subdirectories, 59 of the 198; pre-push and
CI close that, so nothing linty reaches a merge. And an appeal to "0 findings
across 164 historical revisions" was dropped rather than kept — this repository is
a **shallow clone with a seven-day window**, every visible revision postdates the
lint pass, and 149 of 157 files have exactly one revision. That evidence is the
current corpus counted twice. Claim 1 stands on the gate alone, which is enough.

**Style — not gated at all.** Every review rule emits `severity: 'suggestion'`,
which `tools/lint-deck.js` routes to a channel that never affects the exit code.
(`doReview` is also off under `--all`, but that is incidental — the findings would
not block even if it ran.) That asymmetry is the entire reason Style varies on the
very corpus that pins Contract flat: the two halves are not being read off
comparable populations.

**On the population the scorer actually serves, Contract discriminates.** The
Coach re-scores a draft in the editor on every keystroke. Driven on the REAL
Studio Coach: a half-typed class name reads Contract **93**, an unterminated
comment **71**, against **100** for the finished deck. The OLD scorer's
`errs * 22 + warns * 8` moves on the same drafts (**92** / **78**), so Contract
was never dead weight in either grade. Those readings are pinned end-to-end
through the real linter in `test/unit/authoring/coach-draft-contract.test.js`,
including the severities they depend on (`unknown-class` = warning,
`unterminated-comment` = error) — the live-session evidence originally quoted here
had no artifact, which under HARD RULE #23 is a surface without proof.

**What that licenses, and what it does not.** It refutes "0.0% variance, therefore
dead weight", which is what the reviewer critique against this change's own 38.2%
`contract` weight rested on. It does **not** by itself calibrate 38.2% — three
hand-built drafts show non-zero, not a share, and this record's own methodology is
a variance-share comparison. Decomposed over prefix-truncations of all 198 decks
as a draft proxy, Contract carries **14.1%–64.2%** of Craft's variance depending on
whether the cut is by line or by character. 38.2% sits inside that band, so the weight
is defensible and cutting it would have been the wrong move — but the honest statement
is *"not zero, and this corpus cannot price it"*, not *"38.2% is correct on evidence"*.

**And running that sweep over all three Craft categories at once says more than the
per-category framing does:**

*Method, stated so these are re-derivable — an earlier draft gave two different
decompositions in two sections with no way to reconcile them: each figure is the
category's share of the SUM of the three raw per-category variances (population
variance, unweighted), over the 198 scorable decks. Weighting by the aggregate's own
`craftWeights` squared instead moves it to 89.7 / 10.3 / 0.0, which changes nothing about
the conclusion but is a different number, so the choice has to be stated rather than
implied.*

| population | `structure` | `craftProse` | `contract` | Craft sd |
|---|---|---|---|---|
| committed corpus (n = 198) | 91.3% | 8.7% | **0.0%** | 2.32 |
| drafts, line-truncated (n = 792) | 84.0% | 1.9% | **14.1%** | 2.40 |
| drafts, char-truncated (n = 792) | 34.4% | 1.5% | **64.2%** | 4.29 |

Every category carries real variance somewhere, and **no share is stable across draft
models** — `structure` swings 34% → 91%, `contract` 0% → 64%. So the conclusion is not
"`contract`'s weight is right"; it is the stronger and more useful one: **this corpus
cannot price ANY of the three Craft weights**, and a decomposition run on it is evidence
about the population, not about the weights. That is the same error §2 corrects, stated
once for all three rather than caught one category at a time.

> **CORRECTED 2026-08-30 — the last two sentences of this section used to read:**
> *"`craftProse` is the thinnest everywhere (1.5%–8.7%) against a 32.4% nominal weight —
> by the reasoning above that is not evidence it is dead either, and it is the next weight
> to be suspicious of."* That ranking is the instrument, not the category. Prefix
> truncation models an unfinished deck, not a badly-written one: it creates 166 `contract`
> findings and destroys none, while creating **zero** `craftProse` findings by line and
> four by character — all four being one-word fragments left where the cut landed inside a
> heading — against 46 real ones destroyed. And this band's own endpoints are set by a
> parameter this record never wrote down: cut DEPTH alone moves `contract`'s line-truncated
> share from 10.3% to 71.2%, a range that swallows 14.1%–64.2% whole. `craftProse` is not
> the next weight to be suspicious of; it is the one nothing here has measured.
> `npm run score:variance` now re-derives all of it.
> See `2026-08-30-craft-weight-variance-proxy-bias.md`.

*(This band replaces a `27.8%–74.4%` figure that an earlier draft carried. That number
came from a reviewer's decomposition and was relayed without being reproduced; re-running
it here gives 14.1%–64.2%. Same conclusion, different number — and relaying an
unreproduced figure is the exact failure mode §8.6 and §8.7 are about, so the reproducible
one wins. **The replacement inherited the defect** — see the correction above: 14.1%–64.2%
is not un-reproduced but *underdetermined*, one draw from cut depths nobody recorded.)*

**Pacing gets the same treatment, and it changes the verdict.** The argument above
— *a category flat on the corpus may be flat because its input is unavailable* —
applies to Pacing more strongly than to Contract, and an earlier cut of this
correction hardened the verdict against Pacing anyway ("the ballast was Pacing
alone"). It is not. `length-vs-time` fires only on `opts.talkMinutes`
(`lib/authoring/review-core.js:385`), and **no caller supplies it to the scored
review on any surface**: `coach-core.ts` calls `reviewText` without it, and so do
the CLI and every script. `StudioShell`'s separate `pacing()` quick-read card is
the only consumer, and it does not feed `scoreDeck`. So Pacing's 0.1% is *also* an
input-availability artifact — the difference is that Contract's input exists and is
filtered out of this corpus, while Pacing's is never supplied at all. Shipping
Pacing as `na` unless a talk length is known is the correct response to **missing
input**, which is what it always was; it is not a verdict that the category is
worthless.

So the corrected headline is neither the original nor its first correction:
**47.6% of the weight read 100 on every committed deck — that inflation is real —
but neither zero was evidence that the category grades nothing.** One was gated,
one was starved. The rest of the diagnosis is untouched and stands on its own:
what was left correlated **−0.41** with mean words per slide, which is what makes
the grade a prose-density meter with a letter on it.

Two things follow. First, this **removes the `contract`-weight caveat** this PR
carried to the merge gate: 38.2% is not sitting on a dead category, and re-tuning
it downward against the corpus would have cut a category carrying real signal the
corpus cannot see. Second, it **makes capping Contract load-bearing** rather than
tidy: the one category left uncapped was the one that genuinely varies where the
scorer is actually used, so flooring it destroyed discrimination exactly where the
variance lives. That cap had to be fixed twice — see §4.2.

A test pins this so the wrong reading cannot come back — and the FIRST version of
that test did not, which is worth recording because it is the same failure mode as
§9's mutation finding. It asserted only "≥3 distinct values plus monotonicity",
which pins *ordinal non-degeneracy* and nothing else: a checker kept it green while
cutting every ceiling 4× (the Coach then reads 98/93 instead of 93/71, falsifying
the demonstration above) and again while replacing the curve with `errs * 3 +
warns * 1` — the uncapped linear shape §2.1 exists to condemn. Ordinal assertions
cannot see magnitude and cannot see saturation. `contract discriminates across
draft states — it is not a corpus constant` now pins five things: the ordinal
ladder, the **magnitudes** 93 and 71, **saturation** (each further tranche of
findings must cost strictly less than the one before), **boundedness** at 20/20,
40/40, 100/100 and 500/500 findings, and the declared asymptote. Re-mutated: the
4× cut, the linear shape, a severity swap, and the two-term version it replaced are
all now caught.

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
but long-headed, because a program name plus its outcome does not compress. Each gets its
BUDGET relief on **that axis only**: teaching's headings are the tersest measured, so it
gets no heading relief; mission's prose fits, so it gets no density relief.

**`teaching` also does one thing no budget number describes, and three documents used to
say it did not.** It sets `scoresAsk: false` and `scoresAgenda: false`
(`lib/authoring/deck-profiles.js`), so `no-ask` and `agenda-missing` stop DEDUCTING for a
teaching deck — they are still surfaced as advice. The reasoning is genre, not leniency: a
lesson asks the learner to practice rather than the room to approve, and its progression
is its agenda. But this record's own summary, §3, and the changelog all read "density
relief only", which was false, and a checker caught it as the same class of defect this
record boasts the trio caught in §6 — a documented behavior that does not match the code.

`no-ask` fires on 153 of the 198 scorable decks (77.3%) and `agenda-missing` on 72 (36%). Both
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
it deducts 9–14 points (mean 11.62). It fires on 153 decks but **deducts on 151** — the
two exceptions are `bloom-engineering-journey.md` and `seven-steps-problem-to-code.md`,
the two `teaching` decks, where it is stamped `scored: false` — so the separation it
actually draws is **47 decks against 151**, not 45 against 153. (An earlier cut of this
paragraph reported the firing counts as if they were the deduction counts, which quietly
depended on exactly the `teaching` behavior the paragraph above had failed to disclose.) It is a discriminator, not ballast, and it is not the shape §2
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

**Bounded per family is not bounded per category, and Contract had to be fixed twice.**
The first fix gave Contract the saturating curve in TWO terms —
`saturate(errs, 85, 2) + saturate(warns, 40, 5)` — whose ceilings sum to **125**. Each
term is bounded; their sum is not bounded below 100, so at roughly twenty errors plus
twenty warnings the category clamped to 0 and 20-vs-60 became indistinguishable again.
That is the *exact* defect this section exists to remove, surviving inside its own fix,
in the category §2 had just finished arguing carries the most real signal. Four places
asserted the opposite, including the user-visible changelog's "bounded and monotonic all
the way up".

Capping the sum would not have fixed it either: `Math.min` is what `scoreBrevity` uses,
and it FLATTENS past the cap — the same loss of discrimination one floor higher. Contract
is now **one** saturating curve over a severity-weighted count,
`saturate(errs · 6 + warns, 88, 12)`, which is strictly increasing in every finding
forever and approaches 12 without reaching it. The constants are chosen to preserve the
shipped low end: one warning still reads 93, one error 71.

The general lesson, since it will recur: whenever two bounded penalties are summed, the
bound that matters is the bound on the SUM, and it must sit strictly inside the category's
range. `scoreBrevity` gets this right by construction (`SOFT_BREVITY_CAP` 26 <
`SEVERE_BREVITY_MAX` 44, and 44 + 26 = 70 < 100); Contract did not.

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

`lib/authoring/deck-profiles.js` — **three** profiles as frozen data, each budget
set at roughly its family's own p90–p95 so a rule flags an outlier WITHIN the genre
rather than the genre itself. Resolution: **override → declared → `general`.**

*(This paragraph said "five profiles… declared → override → inferred → `general`"
until a fourth review pass caught it: wrong on the count, wrong on the order, and
citing a mechanism §5 — ten lines below — records as deleted. `boardroom` and
`academic` were cut, inference was removed outright, and the override was moved
AHEAD of the declaration deliberately, a reversal `resolveProfile`'s docblock
explains and a test pins. Three facts, one paragraph, all stale.)*

A profile moves only the contested numbers. It cannot relax a stub slide, a
duplicate heading, a placeholder title, a missing alt text, or a lint error.
**A profile is a different bar, never a lower one**, and a test pins that
teaching still fails real craft defects.

**And "a name that is not one of ours" has to mean it.** `getProfile` looked its
argument up with a bare `PROFILES[name]`, and `PROFILES` is an object literal — so
`Object.prototype` sits on its chain and `profile: __proto__` resolved TRUTHILY, to
an object whose every budget is `undefined`. Since every budget test is
`count > profile.slideWords` and `n > undefined` is false, `wall-of-text` and
`long-heading` stopped firing entirely: a deck of twelve 220-word slides scored
Brevity **100** and Style **78** where `general` gives 49 and 50, and the Coach
rendered "Style — vs undefined". `constructor` did the same. Both were silent —
`declaredInvalid` stayed null because the lookup reported success, so the guard
written to stop `profile: teachng` being swallowed reported nothing. Two extra
profiles, looser than all three real ones, undeclared, undocumented, and reachable
from any deck's front matter. The lookup is `Object.hasOwn`-guarded now, and the
property is pinned by behavior rather than by asserting which function is called.
The test that was supposed to cover this — *no profile is TIGHTER than general on
any axis* — iterates `Object.values(PROFILES)` and therefore could never have seen
either one.

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
| `bloom-engineering-journey` | 64 C+ | Craft **100** · Style **80** (teaching, declared) |
| `seven-steps-problem-to-code` | 64 C+ | Craft **100** · Style **79** (teaching, declared) |
| `examples/split-headings.md` | 97 A | Craft 100 · Style 93 (the broken cut scored it 81) |

Across the 198 scorable decks: Craft mean 98.7 (sd 2.32, min 88), Style mean 82.2 (sd 7.64,
min 57, only 6 decks at the ceiling). Profiles in use: `general` on 196 by default,
`teaching` on 2 by declaration. Nothing is inferred.

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
Re-running this record's own methodology against the new grades: `structure` **91.3%** of
Craft's variance, `craftProse` **8.7%**, `contract` **0.0%** (100 on 198/198, sd 0.0). Its
nominal weight went UP, 24% → 38%, and this looks exactly like the shape §2 condemns.

It carried to the merge gate as an open design critique, on the reasoning that the
corpus is lint-gated and `contract` "would vary on a real un-linted draft — which is
true, and was equally true of the old Contract category this record rejects". Both
halves of that sentence were asserted, neither was measured, and the second half is
what made it feel like a live critique: if the defence also acquits the category §2
rejects, the two cannot both stand.

They do not — and measuring settled it in the direction that dissolves the critique
rather than the change. §2 carries the full account; the short version is that
Contract's 0.0% is a **sampling artifact** of a corpus `--all --strict` gates
lint-clean (0 error/warning findings across all 198 scorable decks), while on the population the
Coach actually scores — a draft — Contract discriminates: **93** for a half-typed
class name and **71** for an unterminated comment against **100** clean, pinned
end-to-end through the real linter in
`test/unit/authoring/coach-draft-contract.test.js`. The old scorer moved on the same
drafts (**92** / **78**). So the correction lands on §2's headline, not on this
weight.

**The weight is left as-is on evidence rather than on caution — but "on evidence" is
a narrower claim than an earlier cut of this passage made, and the difference is worth
being exact about.** Three hand-built drafts reading non-zero REFUTE "0.0% variance,
therefore dead weight", which is the whole of the critique. They do not CALIBRATE
38.2%: this record's methodology is a variance-share comparison, and three points are
not a share. Decomposed over prefix-truncations of all 198 decks as a draft proxy,
Contract carries **14.1%–64.2%** of Craft's variance depending on the cut — a band
wide enough that it prices nothing precisely, but one that 38.2% sits inside. So: cutting the weight to match a 0.0% the gate manufactures would have been
the precise inverse of the fix, and leaving it is right; claiming the number is
*calibrated* would be a second overclaim replacing the first. The honest form is
**"not zero, and this corpus cannot price it."**

Craft's measured variance on this corpus is sd 2.32, and that number is still worth
knowing: it means Craft's job on a COMMITTED deck is mostly to confirm nothing is
broken, which is what a conformance half should do once the gates upstream have done
their work.

## 8.6 · The third review pass, and what a correction costs

§8.5 records a second red team on the reworked design. A **third** pass — one independent
checker — was run on the *correction in §2 itself*, because that correction rewrote the
central justification of the change while it sat at the merge gate, and a wrong
justification shipped as a fix is worse than the caveat it replaced. It found fourteen
things. Three mattered:

1. **The Contract cap was still broken** — two summed saturating terms, ceilings 85 + 40,
   floors at 0 (§4.2). The correction had just argued Contract carries the most real
   signal in Craft, and the category was clamping. Four documents, including the
   user-visible changelog, stated it could not.
2. **The test written to pin the correction did not pin it.** It asserted ordinal
   non-degeneracy only, and stayed green under a 4× ceiling cut and under a plain linear
   penalty — the shape §2.1 condemns. Magnitude and saturation are now asserted, and the
   four surviving mutants are dead (§2).
3. **The correction failed to apply its own argument to Pacing.** *A category flat on the
   corpus may be flat because its input is unavailable* is exactly Pacing's situation —
   `talkMinutes` is never supplied to the scored review on any surface — and the first
   cut of the correction hardened the verdict against Pacing anyway (§2).

Plus: an off-by-one in a corpus note that was itself an off-by-one correction (199/198,
not 198/197); "cannot be committed" where only push and merge are gated; a "0 findings
across 164 historical revisions" claim resting on a **shallow clone with a seven-day
window**, where every visible revision postdates the lint pass; a live-Studio measurement
with no retained artifact; "38.2% is correct on evidence" where the evidence refutes zero
without calibrating a share; and `teaching` switching off two rules while three documents
said "density relief only".

The pattern across all three passes is one thing: **every defect was a claim that read as
already-verified.** Not one was a compile error or a failing test — the gates were green
at every pass. §9 draws the conclusion; this section only adds the sharpest instance of
it, which is that the *correction* of an unverified claim is itself an unverified claim
until someone re-derives it, and the author is the worst-placed person to notice.

## 8.7 · The fourth pass — and why "is it dry yet?" was the right question

§8.6 records a third pass, on the §2 correction. A **fourth** was run for a different
reason: three passes in a row had each found live defects behind fully green gates, so the
open question was no longer "what else is wrong" but **"does a pass come back dry?"** The
brief said so explicitly — a clean report is a valid result, do not manufacture findings.

It did not come back dry, and the headline finding was the worst single defect in the whole
change:

**`profile: __proto__` was a fourth, unbounded, undeclared profile.** `getProfile` used a
bare `PROFILES[name]` lookup, and `PROFILES` is an object literal, so `__proto__` resolved
to `Object.prototype` and `constructor` to `Object` — both truthy, both already lowercase,
both passing `BARE_NAME`. Every budget on the resulting "profile" is `undefined`, and every
budget test is `count > profile.slideWords`, so `wall-of-text` and `long-heading` stopped
firing **entirely**. Measured on the real running Studio, a deck of twelve 220-word slides:

| declared | Brevity | Style |
|---|---|---|
| `general` | 49 | **D 50** |
| `teaching` | 49 | B 72 |
| `__proto__` | **100** | **B+ 78** |

The Coach reported Brevity 100 on a deck its own preview stamps `OVERFLOWS`, and printed
"Style — vs **undefined**" in three places. On the CLI the same deck went from 27 review
suggestions to 3. And it was **silent**: `declaredInvalid` stayed `null` because the lookup
reported success, so the guard written precisely so `profile: teachng` could not be
swallowed reported nothing at all.

This is a direct contradiction of §6's "a profile may only ever loosen, and only for a deck
that asked by name", and the test meant to enforce it — *no profile is TIGHTER than general
on any axis* — **could never have caught it**, because it iterates `Object.values(PROFILES)`
and the two pseudo-profiles are not values. A test that enumerates the legitimate set cannot
see an illegitimate member; the new test asserts the BEHAVIOR of arbitrary prototype names
instead.

Two more of the same family as §4.2's:

- **`scoreStructure` summed its ceilings to 122 and genuinely clamped to 0** — the identical
  bug found in `scoreContract` one pass earlier, in the category carrying the largest share
  of Craft's real variance, and §4.2's "general lesson" paragraph had been written as though
  the other categories were checked. They had not been. Now one curve, floor 6.
- **`monotone-openings` was a flat `craft -= 12`**, count-blind, while the front-matter
  summary and the changelog both claim every rule family saturates in the finding COUNT. Now
  it scales with the number of distinct droning cadences.

And **four penalty terms still survived deletion against the full suite** — `stub-slide`,
`monotone-openings`, `density-crowd` and the fixed no-closing penalty — against §8.5's claim
that "every penalty term now has a differential test". `density-crowd` is the sharpest: it
fires on 43% of the corpus and the changelog announces it as newly counting, the same shape
as the `verbose` family a previous pass caught being announced without being read. All four
are covered now, and re-mutation kills them plus both reverts to the versions just replaced.

Also corrected: §4.3 described **five** profiles, **inference**, and the resolution order
**backwards** — three superseded facts in one paragraph, ten lines above the section
recording inference's removal; a test fixture still declaring `profile: boardroom`, a
profile this change deleted, so two tests exercised the invalid-declaration path while their
comment claimed they exercised the tightest budget (they passed because the fallback happens
to carry the same numbers); `'inferred'` still listed as a legal origin in a JS test while
the TS type deliberately excludes it; "0 lint findings across all 198" where the true figure
is 0 error/warning and 7 `info`; the last four live `197`s; `seven-steps` Style as 89 where
it is 88; and `design/skills/deck.md` — the author-facing doc — omitting that `teaching`
stops grading two rules.

One finding was logged rather than fixed: catastrophic regex backtracking in
`CLASS_COMMENT_G` (3,000 trailing spaces after an unterminated class directive → 8.5s on the
Studio's main thread). It is on `origin/main` and off this change's path, so HARD RULE #18
routes it to a ticket — **#1890**.

**What the four passes together say.** Every defect, across all four, was a claim that read
as already-verified — not one was a compile error or a failing test, and the gates were green
at every pass. The fourth pass also demonstrates the corollary that matters most here: the
two worst findings (the prototype lookup, and Structure clamping) were both in code written
*by the previous pass's fix*. Correcting an unverified claim produces a new unverified
claim, and the author is the worst-placed person to notice. That is the argument for the
ladder in HARD RULE #25 being a floor rather than a ceiling.

## 8.8 · The inversion pass — the two findings that changed what shipped

Inversion ran once, on **design v1**, and that design was deleted. It had never seen what
actually ships, so it was run again with one question: *assume this is judged a mistake in
six months — what is the most likely reason?* It returned two findings that changed the
code, and one that acquitted it.

### `teaching` was an exemption, not a bar

`scoreFraming`'s ONLY two deduction paths are `no-ask` and `agenda-missing`. `teaching` set
`scoresAsk: false` and `scoresAgenda: false`, so the category could not return anything but
100. Measured across all 198 committed decks under each profile:

| override | `framing` distinct values | Style range | Style mean |
|---|---|---|---|
| `general` | 52 / 70 / 82 / 100 | 54–100 | 81.9 |
| `mission` | 52 / 70 / 82 / 100 | 54–100 | 82.2 |
| **`teaching`** | **`[100]` — one value, every deck** | **77–100** | **96.1** |

Style then collapsed to a rescaled `brevity` (r = 0.965), and **no deck in this repository
could score below 77 under `teaching`** — including the 2,332-word padded deck §6 uses as
its counter-example. Stack the properties of the thing that buys it: two words of front
matter, **unverifiable** (there is no signal to check — §5 removed inference precisely
because none exists), **inert everywhere else** (no lint rule reads `profile:`, no render,
no export, no gate), and worth ~14 Style points.

This module's stated contract is "**a profile is a different bar, never a lower one**". That
is true of the thresholds and true of Craft. It was not true of the consequence, and the
test meant to enforce it (*no profile is TIGHTER than general on any axis*) pins only the
one-sided property — **nothing bounded how far a profile could loosen.**

Invert it: *to make this a mistake, make the escape hatch cheaper than the fix.* It was. An
author facing "Style C — a lot to fix" could restructure the deck, or type
`profile: teaching`. The second is free, never contradicted, and reliably works.

**Fixed by scaling rather than switching.** `framingScale` replaces the two booleans;
`teaching` carries 0.4. Framing takes four distinct values again (81 / 88 / 93 / 100), the
corpus floor under `teaching` drops from a pinned 77 to 74, and a lesson that DOES make an
ask still beats one that does not — which is the property that makes it a bar. The two
originating decks read Style 80 and 79 rather than 89 and 88; still a clear recovery from
the undeclared 55 and 54, without the exemption. A new test pins the general rule: **no
profile may render a Style category constant.**

### Declared-only had no adoption path, so the fix was two hand-edited lines

The sharper finding. Strip the `profile:` line from the two decks that reported the original
bug and score them as any *other* author would have them:

| deck | declared | front matter stripped |
|---|---|---|
| `bloom-engineering-journey` | Craft 100 / Style 80 | Craft 100 / Style **55** — rank **1 of 198** |
| `seven-steps-problem-to-code` | Craft 100 / Style 79 | Craft 100 / Style **54** — rank **1 of 198** |

Corpus Style minimum is 57. **Undeclared, both decks are the joint worst in the repository —
the same position they occupied before this change, and worse on the varying number than the
64 they complained about.** The entire recovery was the two lines added to those two files.

The user's actual question in §1 was whether this was systematic: *"whether an NGO deck I
write tomorrow is going to be scored poorly"*. As shipped it was not systematic. The next
mentee writing a lesson does not know the register exists; they get `general`, Style ~55, and
they file the same bug. The Coach's dropdown was a discovery path, but the override was
**session-only and explicitly never rewrote front matter** — so an author could watch 55
become 89 and lose it on reload, while the CLI and any shared link kept showing 55.

**Fixed by closing the loop.** `withProfile(source, name)` lands in the shared kernel (pure,
fs-free, preserves CRLF and a BOM, refuses a non-profile name), `applyProfileToSource`
reaches it from the Coach, and the panel gains **"Keep in front matter"** beside the
dropdown — checkpointed, so History and ⌘Z undo it. Driven on the real Studio: undeclared
Brevity 65 / General → override → 100 / Teaching → Keep → **survives a full page reload**.

*Note what this does and does not change.* An undeclared deck still scores exactly what it
scored before — `general` is pinned to the old bar deliberately, and that is the whole point
of declared-only. What changed is that the author can now act on the discovery. A register
nobody can keep is a register nobody has.

### What inversion tried to break and could not

It set out to show the change was over-engineered relative to its trigger — that simply
capping the uncapped `walls * 12` would have been enough — and **measured that it would
not.** Against `origin/main`'s scorer with one term changed to `Math.min(36, walls * 12)`:

| | bloom | seven-steps | bloom's rank (1 = worst) |
|---|---|---|---|
| `origin/main` as-is | 64 C+ | 64 C+ | **1 / 198** |
| one-line cap at 36 | 82 B+ | 82 B+ | **10 / 198** |
| shipped design (declared) | Craft 100 / Style 80 | Craft 100 / Style 79 | 162 / 198 |

The cap recovers 18 of the 25 points and lifts the decks off the floor — but they stay in
the bottom 8%, because the residual damage is Framing, which a density cap does not touch.
**The cap was necessary and not sufficient.** That is the strongest thing that can be said
for this design, and it was found by an agent trying to break it.

## 8.9 · The sixth pass — the one that found a deck-corrupting bug

The fifth pass (inversion) changed the design; a sixth was run on the result, as a checker
over the four unreviewed commits. It found the worst-consequence defect in the whole change,
and it was in the newest code: `withProfile`, the one function here that WRITES TO A FILE
THE AUTHOR OWNS.

**It ate a character of every BOM'd deck.** The front matter was matched against `src` (BOM
included) and the remainder sliced from `body` (BOM stripped), so the slice started one
character late:

```
IN   "<BOM>---\ntheme: cuoio\n---\n# Title\n\nBody\n"
OUT  "<BOM>---\ntheme: cuoio\nprofile: teaching\n---\n Title\n\nBody\n"
```

The `#` is gone — an H1 silently demoted to a paragraph. With a class directive on that line
the `<` goes and the directive renders as literal text; on BOM+CRLF the `\r` goes, leaving a
bare `\n` inside a CRLF document, which is exactly what the line-endings decision record
exists to prevent. The offset error hid behind a **dead ternary whose two branches were
identical** — `m[0].length - bom.length ? m[0].length : m[0].length` — which is what a
condition looks like when it was meant to be the value.

**And degenerate front matter mangled the document.** The inner text was located with
`m[0].indexOf(m[1])`, which finds the OPENING FENCE when the inner text is `''`, `'-'`,
`'--'` or `'---'`. Empty front matter produced `profile: teaching---` — a string `BARE_NAME`
accepts, so the Coach then reported *its own write* as an invalid profile, two seconds after
its own toast said the deck now declared it. A `---` inner body duplicated a rule line into
the deck: **a spurious extra slide in the author's file.**

**The test that should have caught the first one did not.** It was titled *"preserves CRLF
and a leading BOM — this writes back into the author's file"* and asserted only that the BOM
survived and the declaration read back. It never looked at the body. Mutation-proved: with
the bug restored verbatim, the whole suite stayed green.

Both are fixed by reconstructing the document explicitly rather than splicing by computed
offsets — match against the BOM-stripped body, take the remainder as `body.slice(m[0].length)`,
rebuild the block from its parts. The tests now compare the body **byte-for-byte** across
BOM × CRLF, cover the degenerate inner bodies, and pin that line endings come from the FRONT
MATTER rather than the whole document (a stray CRLF in the prose used to flip the front
matter and hand back a mixed-ending file). Re-mutated: all three defects are now caught.
Fuzzed over 292 shapes — BOM × line ending × ten front-matter bodies × seven bodies, plus
no-front-matter and five degenerate inputs — all pass.

Smaller things from the same pass: the Coach reported *"Couldn't write that profile"* when
the deck already declared the chosen one — `withProfile` is idempotent, so that is a correct
no-op and the most likely way to reach the branch (press Keep twice); §7's results table
still carried the pre-`framingScale` Style figures (89/88 where the shipped code gives
80/79) and a stale corpus mean; §8.5's variance decomposition was stale and the method was
never stated, so two sections gave different numbers with no way to reconcile them; a
docblock claimed the new Structure weights "keep the shipped single-hit costs" and then
listed the new ones (a duplicate heading moved 6.5 → 6.0, a title gap 5.5 → 6.0); and the
changelog said in one bullet that the Coach writes front matter and in another that it never
does.

**One reported finding was REFUTED by re-measuring.** The pass reported §8.8's per-profile
Style means as measured over 199 files rather than the 198 the record declares — `mission`
82.2 where it computed 82.1, `teaching` 96.1 where it computed 96.0. Re-derived here on
n = 198: **81.924 / 96.071 / 82.167**, which round to exactly the record's 81.9 / 96.1 /
82.2. The record was right. Recorded because the temptation was to "fix" the numbers to
match the reviewer — which is the same error as relaying a figure without reproducing it,
in the opposite direction.

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
