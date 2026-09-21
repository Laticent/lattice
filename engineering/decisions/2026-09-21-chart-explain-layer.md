---
status: shipped
summary: >
  Narration read three charts aloud and never said what they meant — bullet spoke two bare
  numbers with nothing naming the plan, word-cloud recited twenty counts for a component whose
  own docs say the rank matters more than the count, and state-chart read every edge in
  authored order while the topology went unsaid. Four rungs named (frame, shape, relation,
  enumeration) with interpretation deliberately left to the author's heading; explanation made
  unconditional and enumeration gated, which is the inversion of what shipped. The derivations
  moved to lib/core so the picture's <desc> and the caption voice compute once, proved
  behavior-preserving over 8973 row shapes; the per-chart frame is declared in each manifest's
  projection block rather than tabulated in the narrator. Mean coverage 0.839 to 0.902 across
  71 components, 57 mutations all killed, five test arms added only because a mutation survived
  first and three of those had been passing for the wrong reason.
---

# The explain layer — narration that says what a chart MEANS, not just what is in it

**2026-09-21.** Follows `2026-09-21-generic-data-series-narration.md`, which got a
chart's numbers to the voice at all. This note is about the rung above it.

## The complaint

> "word cloud has specific semantic meaning and how it should be read needs
> refinement. and we are just reading it instead of explaining it and touching on
> key highlight (we need to think about how a pros would present it, maybe there
> are few ways and all could be in play). state chart is not being explained either
> and we are just reading it. bullet chart is just read without semantic
> understanding and explanation of what the first and second number represents."

Measured on the three shipped galleries, all three were exact:

```
bullet       New ARR, four point two million, five million. Expansion ARR, three
             point six million, three million. Gross renewal, two point eight
             million, two point six million. …

word-cloud   time-to-value, five. security, four. onboarding, four. pricing,
             three. integrations, three. support, two. …          (×20 on the
                                                                   stress slide)

state-chart  From Draft, submit goes to Submitted. From Submitted, review goes to
             In Review. From In Review, approve goes to Approved, reject goes to
             Draft, and revise stays here. From Approved, publish goes to
             Published.
```

Every number is there. Nothing says what any of them measures.

## The model — four rungs, and we were on the first

| rung | what it says | before | after |
|---|---|---|---|
| **Frame** | what the encoding means | never | every picture-bound chart |
| **Shape** | the gestalt the picture gives at a glance | never | the three pilots |
| **Relation** | the computed fact neither the words nor the Markdown state | never | the three pilots |
| **Enumeration** | the values, read in order | **always** | gated |
| **Interpretation** | the evaluative "so what" | never | **still never** |

**The inversion is the finding.** Explanation should be unconditional and
enumeration should be gated; it was exactly backwards. A twenty-term cloud read
twenty numbers aloud and explained nothing.

### Why Interpretation stays off the ladder

The slide's heading is already the author's interpretation, and the components say
so themselves. `bullet.docs.md`'s `title` slot instructs the author to *"name the
verdict ('Three of five are behind plan'), not the chart type"* — and the shipped
gallery heading duly reads *"Two of five KPIs cleared the plan line."* A narrator
that adds "the quarter turns on ARR alone" is talking over the author, and
`2026-07-14-mermaid-multitype-narration.md` §5 bars a causal reading outright.

It also drove a guard: `headingStatesTally` suppresses the computed tally when the
heading already carries both numbers. Narrow on purpose, and it fails safe — a miss
costs a clause the listener already heard, a false positive costs a clause nobody
hears.

## Where the facts live (HARD RULE #1)

The three transforms **already** derived most of what was missing, for the SVG
`<desc>`, and narration could not reach it: narration runs off Markdown and never
sees a rendered `<desc>`. Re-deriving the arithmetic inside the narrator would have
put `(measure - floor) / (target - floor)` in two files free to drift.

So the derivations moved down to `lib/core` and both surfaces read them:

| kernel | shared with | new facts it adds |
|---|---|---|
| `bullet-facts.js` | `bullet.transform.js` | `zoneOf` — which band the measure landed in |
| `state-graph-facts.js` | `state-chart.transform.js` (`inferRoles`) | branch points, back edges, traps, unreachable, dead ends |
| `word-cloud-facts.js` | — (the `<desc>` is the second caller when it is improved) | rank, tiers, lead margin, tail |
| `chart-values.js` | `_chart-family/cartesian.js` | none — a MOVE, so `lib/core` can parse a pill |

`chart-values.js` is the one that was not optional. `lib/core` reaches into
`lib/components` **nowhere** (measured: not one module), and `parseValue` carries
four sign spellings, a magnitude table and a separator rule written against real
decks pasted out of French and German spreadsheets. A second copy in the narrator
would have been a defect waiting to come back, so the parser moved down a layer and
`cartesian.js` re-exports it unchanged.

**The extraction is behavior-preserving, and that is proved rather than asserted.**
A differential test ran main's inlined arithmetic against the kernel over **8973 row
shapes** — every shipped gallery row plus the edge cases none has (NaN, negatives,
at-plan exactly, target under floor, bands below floor, five-band scales) — with
zero divergence. The pixel-based `golden-diff` job cannot see a `<desc>`, so it
could not have proved this.

## The frame is DECLARED, not tabulated

```json
"projection": { "frame": "each bar's length is its value, measured from zero",
                "figure": "svg", "data": true }
```

A table in `chart-narration.js` would have been the tenth hand-kept roster over this
exact set of components. `2026-09-13-projected-rosters.md` records nine, four of them
holding the same twelve names, and **not one went red on omission**. Riding the
projection block means a chart declares how it should be EXPLAINED in the same file
where it declares how it PROJECTS, and the generator copies the whole block, so it
needed no change.

The contract is a **lowercase clause, unterminated**, because callers compose it:
the floor speaks it as its own sentence, `word-cloud` builds *"Nine terms, sized by
how often each came up"* around it. The manifest validator rejects a leading capital
and a trailing period — both land mid-track as *"Nine terms, Sized by how often each
came up. ."* — and rejects a frame on a component with no `data`, which would have
nothing to frame.

## Three refusals, each load-bearing

**No share of a total on a word cloud.** *"The top three carry half of everything
said"* is the line a presenter reaches for, and it is only true when the weights are
COUNTS. `word-cloud.docs.md` allows *"a frequency count, a 1-5 rating, a
percentage"* in the same slot, and summing ratings is meaningless. Narration cannot
tell the two decks apart, so it states no proportion at all. The kernel still
computes `headShare` for a caller that knows its weights.

**Topology, never layout.** `branchPoints` says a state has more than one way out;
nothing says the diagram fans out there. The two come apart: `dagrePositions`'s own
comment records that a SKIP edge (`1 => 2` beside `1 => 5`) gives a state two
successors while the machine still lays out as a single column, and that test runs
in the browser after text measurement, where narration cannot follow. *"In Review has
two ways out"* is true of both.

**A band name is never spoken where it could contradict the tick.** The top derived
band runs from 85% of target UPWARD with no ceiling, so it holds a row that just
missed the tick and a row that doubled it alike. Naming it on a short row produced a
sentence arguing with itself: *"ninety-six percent of plan, at or past plan."* Only
zone indices 0 and 1 sit wholly below the tick and are safe on any row; index 2 is
deliberately unnamed and the percentage carries that case alone.

## What it reads now

```
bullet       Each row shows where we landed against where we planned. New ARR, four
             point two million against a five million target — eighty-four percent
             of plan, closing on plan. Expansion ARR, three point six million
             against a three million target — one hundred twenty percent of plan. …

word-cloud   Nine terms, sized by how often each came up. Time-to-value is the
             biggest at five, one clear of security and onboarding at four each.
             Six more follow, down to contracts and residency at one each.

state-chart  A five-state machine from Draft to Published; In Review is where it
             decides, with two ways out; one transition steps back and In Review
             loops on itself. From Draft, submit goes to Submitted. …
```

## Six defects in the first output, all found by READING it

Not one was found by reasoning about the code:

1. `84%` reached the voice as a glyph — the exact defect class the audit is about.
2. *"against a eighty percent target"*.
3. *"A five states machine"* — the count is attributive, so the noun stays singular.
4. *"ninety-six percent of plan, at or past plan"* — the contradicting band name.
5. The runner-up tier spoken twice on every cloud.
6. A frame sentence echoing the heading's own count (*"Stress test — seven rows …
   Seven rows, each showing …"*).

A seventh came out of the same pass: a row on a 100% target read its own number back
(*"one hundred twenty-eight percent against a one hundred percent target — one
hundred twenty-eight percent of plan"*), which is every OKR deck. The verdict
replaces the echo.

## Evidence

**Coverage — `node tools/measure-narration-coverage.mjs`, real CLI, real Chrome, real
`--captions`:** mean **0.839 → 0.902** across 71 components. `bullet` 1.47 → 2.86,
`state-chart` → 1.37, `word-cloud` 0.88 → **1.08 while saying LESS** on a large
cloud, because explaining the rank costs fewer words than reciting twenty counts.

**Mutation testing — 57 mutations, 57 killed** (25 kernels · 29 narrators · 3 the
frame gate). **Five arms exist only because a mutation survived first**, and three of
those exposed a test passing for the wrong reason:

- A four-zone authored range refuses its band names on the zone COUNT alone, so it
  proved nothing about the three-zone case the provenance guard is actually for.
- The `list … bullet` hijack fixture bailed on having no target rather than on the
  first-token gate — twice: one pill was not enough either.
- Nothing covered `deadEnds` at all; deleting the clause left every test green.

## Known limits

- **Nobody has listened.** Every number here is emitted `.vtt` bytes or a value
  computed in process (HARD RULE #23). Whether it SOUNDS right needs an ear.
- **The spoken numbers are the author's RAW pills.** The picture normalizes to one
  magnitude per chart, so a row typed `900k` beside a `1.2M` row prints `0.9M` and is
  spoken "nine hundred thousand". Never wrong, differently scaled. Matching the print
  means reproducing `fmtFor`'s precision escalation and its whole-chart affix
  negotiation, which is entangled with the axis.
- **The `<desc>` strings are unchanged.** Improving `word-cloud`'s flat `<desc>` is
  the obvious next use of its kernel and would move rendered bytes, so it is a
  separate, visible decision.
- **Only the CLI export path was driven.** Present and the browser read-along run the
  same kernel; both narrators were added to `tools/build-read-along-core.js`'s
  re-export list, which is still hand-kept and still has no gate.
