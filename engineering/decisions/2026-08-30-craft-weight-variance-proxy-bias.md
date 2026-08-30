---
status: shipped
summary: The 2026-08-25 record closed by naming `craftProse` "the next weight to be suspicious of" on the strength of its 1.5%-8.7% variance share — the thinnest of the three Craft categories on every population measured. That band is an artifact of the instrument that produced it, and this note retires the suspicion rather than acting on it. The draft model behind those numbers is prefix truncation, and truncation is a COMPLETENESS perturbation, not a sloppiness one: measured over all 202 scorable decks it creates 166 `contract` findings and destroys 0, while creating 0 `craftProse` findings by line and 4 by character — and all 4 of those are heading fragments left by a cut landing mid-sentence ("Typed", "Ten-step", "quiet", "Dark"), i.e. defects the instrument manufactured. It destroys 46 real `craftProse` findings in exchange. A share measured that way reports how much a category tracks incompleteness, which is not what any of the three weights is for. The band's endpoints turn out to be set by an unstated parameter too: the cut DEPTHS, which the earlier record never wrote down, move `contract`'s line-truncated share from 10.3% (cutting at 90% only) to 71.2% (at 50% only) — a range that swallows the whole 14.1%-64.2% band the record reports, so that band never measured "draft model", it measured "which depths did I pick". The positive finding is that `craftProse` fails NEITHER of the two diagnoses this repo already has a name for: it is not gated like `contract` (nothing blocks a review finding — every review rule emits `severity: 'suggestion'`, which `--strict` ignores) and not starved like `pacing` (no missing input; all four of its rules fire when driven, pinned by test). It is simply RARE — 10 findings across 202 decks, 5 of them the same word ("Glossary") — and the rarity is substantially a REACH property rather than a corpus-cleanliness one: `isLabelHeading` accepts 8 of the corpus's 1,579 h2 headings, every one through its single-bare-word branch, with the 34-entry `LABEL_WORDS` phrase list contributing zero; three are then suppressed as anchors, leaving the 5. Single-word headings are 1.3% of the corpus, and half of `craftProse`'s whole measured signal is `label-title` firing on a `glossary` slide headed "Glossary", which is arguably the correct heading for that component. Nothing here licenses re-tuning the weight in either direction, and deliberately so: widening a rule the code calls "conservative: only on clear cases" would push a genre opinion back into the profile-BLIND half of the grade, which is the exact failure the Craft/Style split exists to prevent. What ships is the measurement made re-derivable — `npm run score:variance`, which prints the shares, attributes them to rules by ablation, and prints the perturbation ledger that says how far to trust each share — plus the corrected claim in three places that carried the old one.
---

# The Craft weight bands measured the instrument, not the weights

**Date:** 2026-08-30
**Status:** decided, implemented
**Rules touched:** none added. Honors HARD RULE #1 (the tool reads the scorer's
rule-to-category mapping by ablation instead of restating it, and reads the
linter's own glyph exemption rather than repeating the list), HARD RULE #15
(`engineering/capabilities.md` had no variance tool; this adds the row), and
HARD RULE #23 (every number below carries the command that re-derives it).

---

## 1 · The claim this note retires

`engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md` §2 ends its
Craft decomposition like this:

> `craftProse` is the thinnest everywhere (1.5%–8.7%) against a 32.4% nominal
> weight — by the reasoning above that is not evidence it is dead either, and it
> is the next weight to be suspicious of.

The reasoning it defers to is the good part of that record: a category flat on
this corpus may be flat because it is **gated** (`contract` — the corpus is
lint-clean by construction, since `lint:deck:all --strict` fails on a warning and
runs in CI and pre-push) or because it is **starved** (`pacing` — `length-vs-time`
fires only on `opts.talkMinutes` and no caller supplies it). Flatness is not
deadness.

The sentence then does something that reasoning does not support. It ranks the
three Craft weights by variance share and points at the smallest one. That ranking
is only meaningful if the populations can express all three categories. They
cannot, and the direction of the bias is exactly backwards from the conclusion
drawn.

## 2 · What the draft model actually perturbs

Both draft populations are **prefix truncations** of the committed decks. Cutting
a deck short models a deck that is not finished. It does not model a deck that is
finished badly — and the three Craft categories are not measuring the same thing:

| category | what its rules detect | what truncation does to it |
|---|---|---|
| `contract` | lint footguns — unterminated comments, bodyless split items | **manufactures them** |
| `structure` | stubs, duplicate headings, placeholder titles | manufactures some, destroys some |
| `craftProse` | label headings, monotone cadence, stacked possessives, missing alt text | **destroys them** |

`npm run score:variance` prints this as a ledger, summed over all 202 scorable
decks at cut depths 25/50/75/90%:

| model | `structure` created / destroyed | `craftProse` created / destroyed | `contract` created / destroyed |
|---|---|---|---|
| line-truncated | +25 / −25 | **+0 / −23** | **+54 / −0** |
| char-truncated | +11 / −39 | **+4 / −23** | **+112 / −0** |

Line truncation creates **zero** `craftProse` findings at every depth. The four
that character truncation creates are all the same artifact — a cut landing inside
a heading leaves a fragment, and a one-word fragment is what `isLabelHeading`
fires on:

```
@25% examples/drawn-not-typed.md      label-title  "Typed" is a label, not a takeaway
@25% examples/state-chart-stress.md   label-title  "Ten-step" is a label, not a takeaway
@50% examples/claim.md                label-title  "quiet" is a label, not a takeaway
@75% examples/spectrum-ramp-floor.md  label-title  "Dark" is a label, not a takeaway
```

None of those is a craft defect an author committed. They are the instrument
cutting a heading in half and then detecting a half heading.

So the 1.5%–8.7% band is not a low reading of `craftProse`. It is a reading of a
population from which `craftProse`'s signal has been deleted and into which
`contract`'s has been injected. Ranking the weights on it ranks the perturbation.

## 3 · The band's endpoints are an unstated parameter

The earlier record reports `contract` at **14.1%–64.2%**, the two ends being the
line- and char-truncated models. It does not say what depths it cut at, and the
scratch script that produced it is gone.

Depth alone spans more than that band, within the line model:

| cut depths | `structure` | `craftProse` | `contract` |
|---|---|---|---|
| 90% only | 78.0% | 11.6% | **10.3%** |
| 25 / 50 / 75 / 90% | 64.4% | 3.0% | 32.6% |
| 25 / 50 / 75% | 61.7% | 1.5% | 36.8% |
| 50% only | 27.3% | 1.4% | **71.2%** |

Re-derive with `npm run score:variance -- --depths=0.5`.

That is the honest reason this note does not simply publish a corrected band. The
14.1%–64.2% figure is not wrong so much as **underdetermined**: it is one draw from
a knob nobody wrote down. The tool's default depths give 32.6% where the record gives
14.1%, on the same corpus through the same code. Rather than relay a third number,
the tool now prints the depths it used on every run and takes `--depths` so the
parameter is an input instead of a default buried in a script.

**This is the brief's own durable lesson landing on the record that taught it.**
That record already carries a margin note retiring a reviewer's un-reproduced
27.8%–74.4% in favor of its own 14.1%–64.2%. The replacement was the right move and
the number it installed has the same defect as the one it replaced — not
un-reproduced this time, but unreproducible, because the parameter that determines
it was never recorded.

## 4 · What `craftProse` actually is

Neither gated nor starved. Measured:

- **Not gated.** Every review rule emits `severity: 'suggestion'`, and
  `tools/lint-deck.js` routes those to a channel that never affects the exit code.
  Nothing stops a deck with a label heading from merging. `contract`'s explanation
  does not transfer.
- **Not starved.** All four rules fire when driven with input that should trigger
  them — `label-title`, `monotone-openings`, `possessive-stacking` (body line, list
  item, curly apostrophe, and `h3`) and `image-no-alt`. `pacing`'s explanation does
  not transfer either. Pinned in `test/unit/authoring/craft-variance-proxy.test.js`
  so a rule cannot go silently unreachable.
- **Rare.** 10 findings across 202 decks: 5 × `label-title`, 4 ×
  `monotone-openings`, 1 × `image-no-alt`, 0 × `possessive-stacking`. Five of the
  ten are the same heading word, "Glossary", on five different decks.

And the rarity is not mostly a compliment to the corpus. Of the corpus's **1,579**
h2 headings, `isLabelHeading` accepts **8**, and every one of the 8 arrives through
its last line — `text.split(/\s+/).length === 1`, a single bare word. The 34-entry
`LABEL_WORDS` phrase list above it (`overview`, `next steps`, `the ask`, …)
contributes **zero**; the corpus simply has no slide headed "Overview". Single-word
headings are 21 of 1,579 (1.3%), and 13 of those 21 are `114%`, excluded by the
digit guard as a metric. Three of the 8 are then suppressed by
`ANCHORS_NO_TITLE_CHECK` (two `divider`, one `closing`), which is what turns 8
accepted headings into the 5 findings counted above.

`isLabelHeading` says of itself: *"Conservative: a heading is a 'label' (not a
takeaway) only on clear cases."* It is doing what it says. The consequence is that
`craftProse`'s thin variance is a joint property of a clean corpus and a
deliberately narrow rule, and **this measurement cannot separate those two either**
— which is the same limit §2 of the earlier record ran into, one category over.

## 5 · What is deliberately NOT changed

**No weight moves.** The 32.4% nominal weight is not defended by this note; it is
left un-priced, and now honestly labeled as such. Everything measured here says the
prior evidence was void, not that the number is right.

**`label-title` is not widened**, though §4 is exactly the measurement someone
would widen it on. Two reasons. The rule sits in **Craft**, which is
profile-blind — the same bar for every genre, forever — and a broader label rule is
a judgment about what a good heading sounds like, which is a *genre* opinion. Pushing
one into the profile-blind half is the failure the Craft/Style split was built to
prevent: the whole 2026-08-25 investigation started from two teaching decks graded
C+ by a rubric quietly encoding one genre's taste. Widening also trades precision
for recall in a rule whose findings a user reads as authoritative. That is a
product decision with a real downside, not a defect fix, so it stays a proposal.

**No grade moves.** No weight, threshold, or rule changed. The scorer is touched in
exactly one behavior-identical way: its two weight objects are hoisted from inside
`scoreDeck` to module scope and exported, so the tool reads them instead of keeping a
second copy that would drift (HARD RULE #1). Verified by re-running the decomposition
across the refactor — identical to the digit. What this note ships is a measurement, a
tool, tests, and three corrected claims.

## 6 · Two latent issues found and left, per HARD RULE #18

`monotone-openings` is emitted **once per repeated-opening group**, and
`scoreCraftProse` counts findings:

```js
craft -= saturate(labels * 3 + monotone * 4 + noAlt * 1.3 + poss * 1.1, …);
```

So a single drone of 20 identical headings costs 4 points, and four separate drones
of 3 cost 16. The group's *size* is invisible to the score even though the finding's
own message reports it ("4 headings open 'what the…'"). That is the same
count-blindness the comment directly above that line says it fixed — moved one level
inward rather than removed.

It is **off the path** of this change: this note deliberately moves no scores, and
fixing it would. Corpus impact today is nil — all four groups are size 3 or 4, at
the rule's own threshold of 3 — so nothing is currently mis-scored. Recorded here
rather than filed, fixed, or ignored.

**And a second one, which bears directly on §4.** All five shipped `label-title`
findings are the heading `Glossary` on a slide whose class is `glossary`. A glossary
slide headed "Glossary" is not an author failing to write a takeaway; it is the
correct heading for that component, and `ANCHORS_NO_TITLE_CHECK` already exempts the
five anchor components where exactly this is true (`title`, `closing`, `divider`,
`agenda`, `quote`) — `glossary` looks like a sixth that was never added. So **half of
`craftProse`'s entire measured signal on this corpus is arguably a false positive**,
which sharpens §4 rather than sitting beside it: the category is thinner than 10
findings makes it sound. Left unchanged for the same reason `label-title` is not
widened — it moves grades, and this note moves none — but it is the first thing to
check if anyone does price this weight.

## 7 · How to re-derive everything above

```
npm run score:variance                    # the three tables, default depths
npm run score:variance -- --depths=0.5    # the 71.2% row in §3
npm run score:variance -- --committed     # committed corpus only, fast
npm run score:variance -- --json          # machine-readable
node --test test/unit/authoring/craft-variance-proxy.test.js
```

The tool derives its rule-to-category mapping by **ablation** — drop one rule's
findings, re-score, see which category moves — rather than restating the scorer's
mapping, so it cannot drift when a rule changes category. That mapping is computed
over every population the run scores, and the reason is worth keeping: the first
cut computed it over the committed corpus alone, where **no lint rule fires at
all**, so nothing mapped to `contract` and the ledger printed `+0 / −0` for the one
category truncation perturbs hardest — a table contradicting the share table five
lines above it, in a tool built to stop exactly that.
