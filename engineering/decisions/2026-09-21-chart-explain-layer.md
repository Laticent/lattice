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

## The checker round — eight confirmed defects, and what they had in common

An independent checker pass **blocked** this diff. All eight reproduced first time.

| # | defect | why the tests missed it |
|---|---|---|
| 1 | **`narrateBullet` deleted authored nested lines** on any slide where one row used the documented nested form | the fixture gave both rows their own pills, so the path never opened |
| 2 | **`isChain` called converging, disconnected and edgeless graphs "a straight chain"** | the test pinned the WORDING, not the claim |
| 3 | same deletion in `narrateWordCloud` | the cloud fuzz always gave every row a pill |
| 4 | a **two-pill** nested line absorbed as a band the chart never drew | no fixture had two pills on one nested line |
| 5 | `headingStatesTally` suppressed the tally on an **all-clear** slide whose heading merely counted rows | `cleared === scored` makes both probes read one token |
| 6 | **"two terms" over a picture drawing three** — the count excluded a word the packer still draws | the branch's own fixture asserted the wrong number |
| 7 | *"short of plan, well short of plan"* on a shipped gallery row | nothing asserted the echo branch's wording |
| 8 | an unguarded frame interpolation speaks the literal word **"null"** | today's roster gate covers it only inside `PICTURE_DATA_LAYOUTS` |

**Finding 1 was the worst and is worth stating precisely**, because the mechanism is
not where anyone would look. `parseDataRows` sets `nestedIsData` when SOME row has
no pills but does have pill-carrying children, and then copies EVERY row's children
into `items` and marks them consumed. That is right for the floor, which speaks
`items` — and wrong for a pilot, which never reads `items` at all. The bare-label row
is the *documented* nested form, so one row written that way silently deleted every
authored nested line on the slide. The checker measured it over 400 generated decks:
**299 lost at least one line the base flattener had spoken.** This is the regression
`speakLeftover` exists to prevent, arriving through the SEED SET rather than through
the filter. The pilots now consume only their own row lines plus the nested lines
they actually absorbed.

**Three of the eight were tests of mine passing for the wrong reason** — 1, 3 and 6 —
which is the same failure the mutation round had already caught three times in this
diff. The pattern is consistent enough to name: a fixture built to exercise the happy
path certifies the branch it never enters.

**Finding 2 is the one to remember about gates.** `test/unit/core/chart-narration.test.js`
asserted `out.includes('it runs as a straight chain with no forks')` — so the suite
was green while the sentence was false of a converging machine, a disconnected pair,
and a bare list of states with no transitions at all. A test that pins a string pins
the string.

**Two mutants survive and are documented as equivalent rather than papered over.**
`isChain`'s in-degree check is provably redundant given its three neighbors (a state
entered twice needs a cycle, and a cycle in a forward-only graph is impossible), and
the self-loop label's index lookup agrees with positional lookup as long as both
parsers number states contiguously. Both are kept, both say in place that no test can
kill them and why.

**The checker also refuted a claim in this note, correctly.** The extraction's proof
was a scratch script over 8973 row shapes — and the script was gone, so the number was
unreproducible by construction. It is now
`test/unit/core/bullet-facts-parity.test.js`: the pre-extraction arithmetic
transcribed verbatim from ba10cd1, run against the kernel over **8976** rows (16
shipped gallery rows plus 8960 generated), asserting zero divergence. It carries a
second cell proving the instrument is not vacuous — the same corpus through the two
mistakes the extraction could plausibly have made registers >100 differences each.
Do not refactor the reference to share helpers with the kernel; a reference that
imports what it checks proves only that the code agrees with itself.

**Artifact-level proof, because in-process was not enough.** The checker demonstrated
findings 1, 3 and 4 through `narrateChart` rather than through an emitted `.vtt`, and
named that as the one thing it had not produced. Driving the real CLI export found
something the in-process check could not: **the first run still showed the old
behavior, because `dist/lattice-emulator.js` is a build artifact and had not been
rebuilt.** After `npm run build`, the emitted caption bytes carry "Organic 60%",
"raised in Q3 3" and "Band 99.5% 99.7%" — all three authored lines restored, in the
artifact a listener actually receives.

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
