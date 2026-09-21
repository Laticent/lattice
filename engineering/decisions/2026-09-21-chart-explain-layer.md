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
the floor speaks it as its own sentence, and `bullet` builds *"Each row shows where
we landed against where we planned"* around it. The manifest validator rejects a
leading capital and a trailing period — both land mid-track as *"Sized by how often
each came up. ."* — and rejects a frame on a component with no `data`, which would
have nothing to frame.

*(`word-cloud` composed a count around it too — *"Nine terms, sized by …"* — until
the fourth round below removed the count. It now speaks the clause alone, which is
why the capitalization rule still matters for it: `openSentence` capitalizes what
the manifest must not.)*

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
bullet       Each row shows where we landed against where we planned. Two of five
             cleared the plan line. New ARR, four point two million against a five
             million target — eighty-four percent of plan, closing on plan.
             Expansion ARR, three point six million against a three million target
             — one hundred twenty percent of plan. …

word-cloud   Sized by how often each came up. Time-to-value is the biggest at five,
             one clear of security and onboarding at four each. The rest follow,
             down to contracts and residency at one each.

state-chart  A three-state machine from Draft to Published. In Review is where it
             decides, with two ways out. One transition steps back and In Review
             loops on itself. From Draft, submit goes to In Review. …
```

*(This block is the CURRENT reading, captured off `examples/chart-explain-narration.md`
after the fourth round. Two things moved since the first cut and both are recorded
below: `word-cloud` no longer states a term count, and the state-chart's shape facts
are separate sentences rather than one semicolon chain.)*

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
| | *(superseded: the term count is gone entirely — see the fourth round. What this finding was really protecting, that such a word is NAMED, is what its arm asserts now.)* | |
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

## Reading a value by what it IS, not by how it was typed

Raised as feedback on the first cut of this work — *"my hope is narration reads
900K and 0.9M the same. It shouldn't care."* That is right, and it turned out to
be a defect rather than a preference. Narration handed the author's raw pill to
the speech layer, so it was reading a SPELLING:

```
900k     -> "nine hundred thousand"             } one quantity,
0.9M     -> "zero point nine million"           } two readings

1.2M     -> "one point two million"             } one quantity, three readings,
1200k    -> "one thousand two hundred thousand" } and the second is not English
1200000  -> "one million two hundred thousand"  }

1,25M    -> "one hundred twenty-five million"   <- A HUNDRED TIMES TOO MUCH
```

**The last one is the serious one.** `1,25M` is what a deck pasted out of a
French, German, Italian or Swedish spreadsheet contains — `normalizeSeparators`
exists because this repo has had those decks. The PICTURE reads it correctly and
draws 1.25M; the VOICE read the comma as a thousands separator and said "one
hundred twenty-five million" over that chart. A confidently wrong number is the
worst thing narration can do, and it was doing it on the one input class the
parser had been hardened for.

`spokenValue` parses to the value and then says it the way a person would: the
largest magnitude whose mantissa is at least one. **Three narrowings, each from a
defect the first draft shipped** — a bare number is never re-scaled (`2024`, a
documented data value, came out as "two point zero two four thousand"); a unit
suffix is not a magnitude (`150 ms` is the author's unit); and the sign rides in
front of a currency prefix (rebuilding it after produced the unreadable literal
`"$-800k"`).

**It deliberately does not reproduce the chart's PRINTED form**, and that is the
part worth keeping straight. `fmtFor` normalizes every row on a chart to one
magnitude so a reader's eye does not re-scale between rows — a whole-chart
decision, entangled with the axis, that a per-value function cannot make. So a
chart mixing `900k` and `1.2M` still prints "0.9M" while the voice says "nine
hundred thousand". Both are correct readings of the same number; only the CHART
has a reason to prefer one unit. The earlier framing of this as "the voice should
match the print" had it backwards: the voice should match the NUMBER.

## Narrowing "nobody has listened"

That caveat rode this swimlane from the start, and it was doing too much work. The
shipped voices are a cloud engine (barred from the per-PR path by HARD RULE #24) or
on-device Kokoro (WebGPU, browser), so no sandbox here can hear the artifact — true,
and still not the whole story. **Some of what an ear catches is not about sound. It
is about the SHAPE of the track, and the shape is in the bytes.**

`tools/measure-cue-profile.mjs` reads cue lengths, pacing, monotonicity, overlaps
and karaoke-tag containment off an emitted `.vtt`. **It found a real defect on its
first run:** a THIRTEEN-SECOND, 39-word cue on the hazards slide, because
`narrateMachineShape` joined six clauses with semicolons into one sentence and the
segmenter makes one cue per sentence. A cue is three things at once — a caption
line, a re-anchor unit, and one TTS clip — so that was also one long utterance a
listener cannot scrub back into.

| | before | after |
|---|---|---|
| longest cue | 13.2s / 39 words | **10.1s / 28 words** |
| p90 duration | 7615 ms | **6940 ms** |
| structural problems | 0 | 0 |

**And the track was actually synthesized.** `espeak-ng` is not the shipped voice, so
it says nothing about timbre — but it does turn the caption track into real audio,
and real audio can be measured against the `.vtt`'s own timings:

```
slide 01  spoken  13.6s   vtt says  14.3s
slide 02  spoken  49.5s   vtt says  49.3s
…
TOTAL     spoken 226.0s   vtt says 225.7s   ratio 1.00
```

That is a real-surface check of something previously taken on trust: the track
builder's pacing model predicts actual synthesized duration to within **0.3 seconds
over 226**. A model that drifted would put every caption out of step with the voice,
and nothing before this measured it.

**What none of this closes.** It cannot tell you the words are the RIGHT words. A
track can score perfectly on shape and timing while saying something false, and the
only check for that is a person who knows the deck listening to it. The caveat is
narrower, not gone.

## The fourth round — nine more, and what the pattern was (2026-09-21)

Three checker rounds found **8, 8 and 9** confirmed defects, on top of the **six**
I found by reading my own first output. The rate is not falling. The fourth round
is worth writing down because its findings share a shape the first three did not:
**three rounds each fixed the instance and left the class.**

| Round | Found | Fixed | Left standing |
|---|---|---|---|
| — | 6 (+1) | by reading the first output aloud | the parse each one came through |
| 1 | 8 | the eight, listed above | the parse each one came through |
| 2 | 8 | eight more, including a guard a docs-only commit had deleted | why no test could see it |
| 3 | — | the numbers, the pacing | the claims the comments made about both |
| 4 | 9 | the class in each case | see round 5 |

*(Round 3 is the value-reader and pacing work below. It is listed without a count
because none was recorded at the time, and an earlier draft of this table invented
one — a "5" nothing in this document supports, in a section whose subject is claims
nobody re-derives. A checker caught it.)*

**A count narration cannot check.** `narrateWordCloud` opened on "Thirteen terms"
over a canvas drawing twelve. `tools/measure-word-cloud-drop.mjs` — committed,
because a checker could not re-derive the first measurement from its description
(it looked at `data-label`, which by construction never carries a dropped name) and
could not tell whether "every deck in the tree" meant its 33 slides or my 34 — names
its roots (`examples test lib docs/public`; `docs/dist` is a build copy and would
double-count) and compares each slide's top-level bullets against the
`<text class="wc-word">` nodes in the real render, so it reports the NAME:

```
examples/seq-ramp-canvas-aware.md slide 1: drew 12 of 13 — lost leverage
examples/seq-ramp-canvas-aware.md slide 2: drew 12 of 13 — lost leverage

2 of 34 word-cloud slides draw fewer words than they list
```

*(Its first run reported a third slide — `gallery-jargon.md`, "drew 6 of 6 — lost
\"next quarter\"", which is its own refutation: a `<text>` node is escaped HTML and
the Markdown is not, so it was comparing against `&quot;`. Entity and smart-quote
normalization fixed it. A measurement tool that can report a loss on a slide that
lost nothing is worth the extra twelve lines.)* There is no better
count: the packer seats words on a spiral and drops what will not fit, and which
word that is depends on glyph widths, the pack box and the rung
`packPortraitLadder` settles on — none of which exist until the transform runs,
and narration runs on markdown on every call path in the tree. So the census goes,
and so does its twin ("eighteen more follow"), because removing one and keeping
the other four sentences later leaves the rule for which counts are allowed
impossible to state. A word cloud is the only chart in the family whose picture
can hold fewer things than its source lists; `noteLabelDrop(…, 'pack')` is the
only DATUM-level drop the family reports.

**A guard that compared two reads of the same scanner.** `tally.total ===
drawnRowCount(md)` was meant to say "every drawn row was scored", and both sides
came from one line scanner — so it saw a row the narrator could not PARSE and was
blind to one the narrator parsed DIFFERENTLY from the transform. 91 of 356
generated decks that spoke a tally spoke one the rendered chart contradicts.

The guard was not the defect. `parseBulletRow` was, and it now transcribes the
transform's rule rather than approximating it: the value is the LAST pill and the
key swallows the rest (so `- \`Target\` \`80%\`` is structural, which it was not),
and nothing may sit inside the item after the value (so `- Target \`4\`` over
`  - note` is detail, which it was not). `test/unit/core/bullet-narration-parity.test.js`
compares the tally the VOICE speaks against the tally the RENDERED chart states in
its own `<desc>` — nothing internal on either side — and 0 of 351 diverge.

**And the first cut of the second clause was wrong in five more ways, which a
fifth checker found and the fuzz could not.** "Nothing may sit inside the item"
was implemented as a bare `>` against the previous KEPT child's marker indent.
markdown-it's actual rule is the item's CONTENT column — marker indent plus marker
width — and it applies to the last line SEEN, not the last one this parser kept.
The gap made five shapes narrate a tally the chart contradicts: a prose child
between the structural line and a deeper line (the deeper line is inside the PROSE
item, which this parser never keeps, so the comparison reached past it), a
one-space over-indented sibling, three-space child indentation — which decks in
this repo use — and the two constructs that are not bullets at all, a lazy
continuation and an ordered sublist.

The fuzz reported 0 of 351 throughout, **because its generator only ever emitted
two-space children.** That is the round's sharpest lesson about its own evidence:
a differential test is exactly as wide as its corpus, and "0 divergences" names
the corpus, not the narrator. The indentation axis is in the generator now, and
the same 400 decks put the old rule at **105 of 351**.

**`transcribes` is still a claim about what was measured, not a proof.** This
reads LINES; `parseBullet` reads markdown-it's TREE. A construct nobody thought to
try can still come apart, and the honest version of the earlier "close match, not
an exact one" is that the known gaps are closed and pinned rather than listed.

**An endpoint claim that denied itself two sentences later.** "A three-state
machine from Draft to Draft and Filed. … Nothing leads to Filed." Both halves read
true facts. "from X to Y" is a claim about a ROUTE, so `summarizeGraph` computes
the forward closure from the start and the clause names only terminals in it.
`unreachable` moves onto the same closure and gets stronger for free: in-degree
cannot see an ISLAND, two states pointing at each other and cut off from the start.

**Which needed a SECOND sentence, not a wider set under the old one.** The first
cut widened `unreachable` and left the clause reading *"nothing leads to Alpha"* —
an in-degree claim, refuted by the arrow this same narrator reads out three clauses
later. That is the contradiction the endpoint fix removed, moved one clause over,
and a test of mine pinned it as correct. `unreachable` keeps its in-degree meaning
and its sentence; `cutOff` is the island, and it says *"the machine never reaches
Alpha and Beta."*

**Four ways the voice said less than the picture.** A row that CLEARED never
reached the band clause, so the `Band` lines this narrator absorbs reached no
surface at all. A rounded percentage read "one hundred percent of plan" on a row
that missed (99.1 against 99.5 is 99.6%) — the `<desc>` gets away with that by
printing "below plan" beside the number and the voice named no verdict. A heading
carrying any two numbers suppressed the tally, so "Three pilots, five weeks in."
deleted it; the tally SHAPE ("N of M") is what states it. And one trailing prose
bullet did the same, because the guard counted rows rather than asking whether a
DROPPED row carried a value.

**Two spellings `spokenValue` still read wrong.** `$-0.8M` puts the sign inside
the prefix and rebuilt as the literal "-$-800k"; `0.5k` fell under the smallest
magnitude and came back as "zero point five thousand", the exact shape the
function exists to remove.

**And the comments were measured instead of argued.** `isChain`'s comment asserted
in prose that three of its four guards were "provably redundant". Enumerating every
machine up to three states — every edge subset, in both edge orders (because `next`
keeps the LAST edge out of a state), with every choice of START — says otherwise:
`states.length < 2` is LOAD-BEARING (a single state with a self-loop reads as a
straight chain without it), the back-edge test carries 256 of 4200, and out-degree
and in-degree are a MUTUALLY redundant PAIR — dropping either alone changes nothing,
dropping both changes 16. That last one is the useful result: a mutation test on
either reports it dead, and neither may be deleted.

**The first cut of that enumeration hard-coded `states[0]` as the start**, which
`inferRoles` does not: one `start` tag decides it for the whole chart, and it
changes which machines are chains. So the sweep was four states wide through a
narrower slice of the real parameter space while its title read "every machine" — a
false exhaustiveness claim in the test written to replace a false redundancy claim.
A fifth checker caught it. A four-state sweep with every start ran once and agrees
on every conclusion (655360 machines; `back` 1856, `out`/`in` 0 alone and 224
together); three states is what is committed, because five starts by 2^16 edge
subsets by two orders is minutes in the unit tier.

**And the parse changes leaked onto narrators they had nothing to do with.**
`nestedIsData` is a WHOLE-SLIDE flag — one row with no pills of its own but a
pill-carrying child flips EVERY row's children into data — and the code-spanned key
line satisfied it. On a real `scatter` render whose `<desc>` plots two points and
files `Reviewed \`2024\`` as mark detail, the voice said *"Alpha, ten, twenty:
Reviewed, two thousand twenty-four"*: the phantom-data-point class `classifyDepth`'s
own docblock says was closed, reopened from the side. The key line is invisible to
every signal now except `parseBulletRow`.

### Blast radius, measured rather than reasoned about

The parse changes land in `parseDataRows`, which every chart narrator calls — so
"it only affects `bullet`" is a claim that needed an artifact. Narrating every
slide in the tree with the pre-round build and the current one:

```
34 of 499 narrated slides changed (3442 slides scanned across 1108 files)
0 non-word-cloud slides changed
```

All 34 are the word cloud losing its census. **Not one deck in the repo uses either
divergent bullet shape**, which is the same fact from the other side: the defect was
invisible because nothing we ship walks into it, and a fuzz found it in 91 of 356
generated decks because a generator does not write the shapes an author has learned
to avoid.

**And the same question asked of the OTHER narrators**, since the leak above was
found by a checker rather than by that corpus: 800 generated decks across `bar`,
`line`, `stacked-bar`, `scatter`, `slope`, `progress`, `word-cloud` and `bullet`,
base against head.

```
slope         0 of 87      scatter       0 of 93      line          0 of 82
stacked-bar   0 of 81      bar           0 of 71
word-cloud   68 of 77      bullet       45 of 97
```

Every divergence is in the two components the round set out to change. Zero
anywhere else.

One latent crash was found by re-reading the diff rather than by a checker: the
three-level bail returned `{ rows, consumed }` without the new `dropped` key, so a
caller reading it would have hit `undefined.some`. `narrateBullet` returns null
before that point today, so it was a shape guarantee rather than a live fix — but a
bail that hands the next caller a crash is not a bail.

## The sixth round — the answer stops being another rule (2026-09-21)

The fifth round's fixes went to a sixth checker, and it found **three more
regressions of the same class**. The new content-column `hasDeeper` rule fixed the
five shapes it was shown and broke a wider set: a **tab** (markdown-it expands it
to a four-column stop; every length in the scanner counts characters), a **marker
gap over one space** (it moves the content column, and past four the content
becomes an indented code block), and a **one-space indent** (markdown-it makes it a
SIBLING, not a child). Measured over an indentation grid: 159 cells where the
pre-round code agreed with the render and the fix did not.

**Four rounds, four times the same answer: model one more of markdown-it's list
rules.** That is the finding, and it is about the approach rather than the code.
CommonMark list nesting is tab stops, marker width, a content-column cap at five
spaces, a four-column code rule, lazy continuation and a one-space sibling — and a
line scanner cannot carry it. `parseBullet` has no such problem because it reads
markdown-it's OUTPUT; narration runs on Markdown, before any render, on every call
path in the tree.

**So the sixth answer is a WHITELIST and a REFUSAL, not a seventh rule.** A nested
line's structure is read only in the shape that can be proved — spaces only, one
space after the marker, an indent that is exactly a parent content column. Anything
else marks the ROW ambiguous, and then:

- `parseBulletRow` reads it as a bare bar, with **no target, no floor, no bands**.
  Refusing only the children was the first cut and was not enough: a child can carry
  a `Target` or `Floor` that decides whether the chart scores the row at all
  (`- Row0 \`2\` \`2\`` over `- Target \`4\`` / `- Floor \`80%\`` renders UNSCORED,
  because the floor lands above the target — narration dropped the children, kept
  the row's own second pill, and said "exactly at plan" over a bar with no plan line);
- `narrateBullet` speaks **no tally** for the whole chart.

It fails toward silence, which is the one direction that is safe against a shape
nobody has thought of yet.

**THE COST, STATED.** On the generated corpus, 343 of 400 decks spoke a tally
before and 141 after. On the SHIPPED corpus the cost is zero: one slide in the tree
carries an indent this refuses, a `docs/public/components.md` fragment with no
tally to lose.

**A guard was written, shipped and inert for one iteration.** `parseBulletRow`
returns a NEW object and did not carry `structurallyAmbiguous` over, so
`narrateBullet` read the flag off the mapped rows and it was always false. The fuzz
still showed 45 of 317 diverging until the guard read `raw` instead. A guard nobody
can see fail is the same defect as a measurement nobody can re-derive.

### And the test's own projection was too narrow

The parity fuzz compared `{cleared, scored}` from the tally sentence and nothing
else. Two blind spots, both measured: **121 of 341** decks took the "none cleared
its target" branch, where the denominator is never compared at all; and the
**per-row readings were never compared**, so an invented target was invisible
whenever it sat above the measure — both sides then report `cleared: 0`.

There is a row-level cell now, and the ambiguity axis is in the generator. The pair
discriminates: against the pre-guard narrator, **95 invented rows of 400 and 105
tally divergences of 343**; after, **0 and 0**.

*The round-five lesson was "0 divergences names the corpus, not the narrator". The
round-six lesson is that it also names the PROJECTION.*

### Two more the same eyes found

**A dead-end sentence the picture contradicted**, found by rasterizing the demo
deck rather than reading the caption track. "Parked stops without being marked an
ending" — and the slide draws Parked into the same final marker Done converges
into, because the runtime router takes `isTerminal || !hasOut` while the node
styling follows `inferRoles`, where one `end` tag suppresses inference everywhere.
Two rules, one slide, opposite answers. The clause says "nothing leads out of X"
now, which both rules support; the disagreement is the transform's and pre-existing,
filed as #2290.

**A self-loop is an arrow.** `incoming` excludes self-loops — right for `isChain`,
wrong for a sentence about arrows — so a state whose only inbound arrow was its own
loop read as "Orphan loops on itself … nothing leads to Orphan". `incomingAll`
counts it, and a state stranded on both sides gets one clause rather than two true
ones back to back.

### What this says about the next round

It should be expected to find more. What changed in this one is that each fix
closes a CLASS — a parse rule rather than a shape, a reachability closure rather
than a bail, a measured mutation table rather than a claim — so the next round's
findings should be new ground rather than the same ground in a new costume. That
is a prediction, not a result.

## Known limits

- **Nobody has judged the sound.** The track's SHAPE and TIMING are now measured
  against real synthesized audio (see the section above), and the words are verified
  in emitted bytes. What is not verified is whether a person who knows the deck finds
  the readings right — and `espeak-ng` is not the shipped voice, so it says nothing
  about how the real engines render it.
- **The voice and the printed slide may pick different units for the same number.**
  Narration now canonicalizes the VALUE (see the section above), and the chart
  normalizes the whole chart to one magnitude, so a deck mixing `900k` and `1.2M`
  prints "0.9M" and says "nine hundred thousand". Both are correct; only the chart
  has a reason to prefer one unit, and `bullet.docs.md` already tells authors not to
  mix magnitudes. A BARE number is left entirely alone, so `1200000` and `1.2M` still
  read differently — deliberate, because a bare number has only one spelling and
  rescaling one is how `2024` became "two point zero two four thousand".
- **The `<desc>` strings are unchanged** — tracked as #2278. `word-cloud`'s is still
  the flat list of counts the caption stopped giving, and improving it moves rendered
  bytes, which would have muddied this PR's output-identical claim.
- **`lint:deck` coaches on speaker-note prose that never narrates** — tracked as
  #2277, 161 spurious wall-of-text flags across 187 decks. Found here, off this
  change's path, so logged rather than pulled into the diff (HARD RULE #18).
- **A word cloud can silently lose a word, and two shipped slides do** — tracked as
  #2286. `examples/seq-ramp-canvas-aware.md` lists thirteen terms and the packer
  seats twelve. That is the deck's defect, not narration's, and `noteLabelDrop` already
  reports it — off this change's path, so filed rather than fixed here.
- **`parseValue` reads a U+2212 in front of a currency symbol and not behind it** —
  tracked as #2287. `$−0.8M` plots POSITIVE while `$-0.8M` plots negative. It is the shared
  parser every chart in the family uses, so fixing it moves rendered bytes; filed,
  and pinned in `chart-facts.test.js` so the voice can never disagree with the bar.
- **A state chart still reads its metadata tokens aloud** — tracked as #2288.
  "Draft start. In Review at-risk. Published end." is the state list reaching the flatten with `start`,
  `end` and the status keywords in it — a closed vocabulary the chart draws as a
  disc, a ring and a status color. Pre-existing on `main` (verified by running its
  `narrateChart` against this deck), so filed.
- **Only the CLI export path was driven.** Present and the browser read-along run the
  same kernel; both narrators were added to `tools/build-read-along-core.js`'s
  re-export list, which is still hand-kept and still has no gate.
