---
status: shipped
summary: >
  The nine token passthroughs the 2026-09-20 audit left open get a COACH, not a rule, and
  the reason is that a slash means at least four unrelated things — a ratio, a rate, a date,
  an alternative — with nothing in the token to say which. Guessing is wrong roughly as often
  as it is right, and being wrong means the voice states a fact the slide does not show, which
  is the defect class that audit is about. Reading the glyph is the honest failure; the AUTHOR
  knows which reading they meant, and `lexicon:` already delivers it. What was missing was
  anyone telling them the token would read as glyphs. `unspokenTokens` + a `lint:deck` hint
  close that, reporting 56 tokens across 35 of the 186 shipped decks — down from 467 in a
  first cut that was almost entirely inline SVG. Also commits the token corpus the audit's
  own "19 raw of 52 → 9 of 59" number came from, which was a scratch script and not
  reproducible.
companion:
  - ./2026-09-20-narration-audit.md
  - ./2026-07-09-cadenza-narration-quality.md
---

# A slash means four things, so we coach instead of guessing (2026-09-21)

**The decision.** `A/B`, `P/E`, `24/7`, `9/20`, `3.5/5`, `16:9`, `4.5:1`, `ID-4471` and their
kin keep reaching the voice as written. There is no rule, there will not be one, and the
author gets told.

**Why there is no rule.** A slash carries at least four unrelated readings and the token
does not say which:

| written | could be | reads as |
|---|---|---|
| `P/E` | a ratio | "P to E" |
| `K/s` | a rate | "kilobytes per second" |
| `9/20` | a date | "September twentieth" |
| `win/loss` | an alternative | "win or loss" |
| `24/7` | an idiom | "twenty-four seven" |

A colon is the same shape of problem: `16:9` is a ratio, `12:30` is a clock time, and they
are indistinguishable from the glyphs alone. The clock parser already claims the ones it can
prove — `12:30`, `9:05`, `14:00` — and the remainder is exactly the residue it cannot.

A normalizer that guesses here is wrong often enough that the error is not a nuisance: it
makes the voice **state a fact the slide does not show**, which is the whole defect class
`2026-09-20-narration-audit.md` exists to name. That audit's own maker-checker pass caught two
instances of it shipping (`§22-1201` renumbered as a range, `#000000` read as a rank), which
is the strongest available evidence that a speculative rule in this layer costs more than it
buys. Reading the glyph is a visible failure an author can hear and fix; a confident wrong
reading is one nobody catches.

## What ships instead

**`unspokenTokens(text, opts)`** in `normalize.ts`, the sibling of `unmatchedAcronyms`: the
value-shaped tokens a text will speak as glyphs. **`lint:deck` turns them into a hint** that
names each token and shows the `lexicon:` line that fixes it, beside the acronym hint that
already worked this way. Advisory, never blocking — HARD RULE #29's policy for authored decks
is *"we warn, we coach"*, and this is the same posture for the same reason.

The hint goes quiet the moment the author answers it, because `unspokenTokens` is passed the
deck's own `lexicon:` and re-asks `toSpoken`. Verified end to end on `examples/pricing.md`,
which authors `24/7`: the hint names it, and adding `lexicon: {24/7: twenty-four seven}` to
that deck's front matter silences it.

## The narrowing is the work, and it is measured

A coach is only worth having if an author leaves it switched on. The first cut reported
"every value-shaped token that passes through unchanged" and found **467 distinct tokens
across the 186 shipped decks** — inline SVG attributes (`stroke-width="9"/><polygon`),
markdown image targets, LaTeX fragments. None of it actionable, all of it teaching the reader
to skip the hint. That is the same failure HARD RULE #29 records for the typed-glyph gate: *a
gate that cries wolf is one somebody switches off.*

So the shapes are an **anchored allowlist** of three patterns, each naming something a deck
really writes and each with an answer the author can give. That takes it to **56 distinct
tokens in 35 of 186 decks**, and every one is a real slash, ratio or identifier. One pattern
was tightened twice against the corpus: the identifier prefix is `[A-Z]{2,6}` rather than
`[A-Za-z]{2,6}`, because the lowercase form also matched `under-13`, `over-16` and `45-day`
— compound adjectives that any TTS front end reads correctly.

## The corpus is committed, because the audit's number was not reproducible

`2026-09-20-narration-audit.md` reports the token corpus going from "19 raw of 52" to "9 of
59". That corpus was a scratch script and was never committed, so neither number could be
re-derived — the same gap that record closed for `measure-narration-coverage.mjs`, and closed
here for the same reason. `tools/measure-token-narration.mjs` holds 66 tokens grouped by the
class the audit's own Finding 3 table names, and separates DELIBERATE passthroughs from gaps
so the headline number means "unhandled" rather than "unchanged".

Re-run on this branch: **11 of 66 raw — 8 deliberate (the slash and identifier shapes), 3
unhandled.**

## Three gaps the corpus surfaced, recorded rather than fixed

Building the tool found three raw tokens that are NOT slash shapes, so they are not what this
note decides — they are genuine gaps with unambiguous answers, logged here with a
recommendation rather than pulled into this change (#18's off-path rule):

- **`>50%`, `<10%`, `>5`.** `≥` and `≤` both expand ("greater than or equal to five"); `>`
  and `<` do not. That is an inconsistency, not a judgment call, and the audit separately
  measured `>50%` as **under-timed by 67%** because the raw token is priced from the wrong
  string. The fix wants care: `>` is also a markdown blockquote marker, so the rule should
  fire only on a digit or currency glyph directly after it, not on a bare `>`.
- **`240ms`.** The magnitude table gained `bn`, `MM`, `pp` and `k` in #2243; `ms` was missed.
- **`p95`, `p99`.** Deliberately left: "p ninety-five" is how engineers say it and "ninety-fifth
  percentile" is a claim about what the author meant. This is the poster child for the coaching
  path rather than a rule — except that `p95` does not match a coachable shape either, so today
  it is silent in both directions. Worth a fourth pattern if it recurs.

The audit's Finding 3 magnitude row is stale in the other direction and worth saying plainly:
`bn`, `MM`, `pp` and `k` are all handled now, measured by the committed tool.

## What is NOT verified

**Whether the TTS engine's own front end rescues any of this.** Kokoro's `misaki` front end
and OpenRouter's models each normalize before synthesis, so `24/7` may already read correctly
in the voice even though our normalizer passes it through. Nobody has listened, here or in the
audit (HARD RULE #23). If it turns out the engines handle the slash shapes well, the coach is
still right — it makes the reading the author's choice instead of the model's guess — but the
urgency drops.
