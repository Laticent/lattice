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
before and 141 after. **On the SHIPPED corpus the cost is exactly zero**: all 16
bullet slides in the tree narrate identically before and after, and the refusal
fires on none of them.

*(An earlier draft said "one slide in the tree carries an indent this refuses, a
`docs/public/components.md` fragment". A checker found that file is generated and
untracked, and that it carries none of the refusal shapes. The real answer is
stronger than the one that was written — the sentence was a guess dressed as a
measurement, in a section about exactly that.)*

## The eighth round — the corpus could not reach the fix (2026-09-21)

The seventh round's fixes went to an eighth checker. It found **three more
regressions** and one thing that reframes the whole sequence.

**THE ROUND'S CENTRAL CHANGE WAS EXERCISED BY ZERO DECKS IN THE CORPUS IT SHIPPED.**
Round seven's headline was a narrowing: a row refuses its relationship only when a
nested line carries a VALUE, so prose children leave the row's own pills alone.
Every ambiguity shape in the generator carried a `Target` or `Floor` — so
`nestedHasValue` was always true and the narrowing never changed an outcome on a
single deck. Measured by the checker: "restores a spoken target on 0 rows across 0
decks". A fix with no coverage in the corpus that ships with it is a fix nobody has
tested, and it is the fourth consecutive round where the corpus, not the code, was
what let the defect through.

**AND THE PROJECTION COULD NOT HAVE SEEN IT EITHER.** When a nested line is absorbed
into the ROW's lead, the `<desc>` clause it produces CONTAINS A NEWLINE. The
row-level cell's regex had no whitespace normalization, `.filter(Boolean)` dropped
the row, and the "skip rows the `<desc>` does not name" rule then skipped exactly
the rows the defect produces. One `.replace(/\s+/g, ' ')` takes that cell from 0
invented rows to 60 on the same corpus and the same narrator.

### The three regressions, each verified against the render

**`rowLineAmbiguous` fired on a typo and deleted the author's target.** The
threshold was "more than one space after the dash". CommonMark caps the content
column at five and only then is the row's content an indented CODE BLOCK — so
`-  Uptime \`5\` \`4\`` is an ordinary scored row, and refusing it deleted the `4`
the chart draws as its plan line. That is verbatim the defect the same commit's
third paragraph says it fixed. **Two claims, two thresholds now**: any gap over one
moves the content column and makes the CHILDREN unreadable; only past four are the
ROW's own pills unreadable.

**"Prose children can override nothing" is false.** markdown-it folds an ambiguous
non-bullet line into the row's own `<li>` lead — a lazy continuation at any indent,
an indented code chunk — the pills stop being TRAILING, `stripTrailingPills` returns
none, and `parseBullet` drops the row from `drawable` entirely. The chart draws no
bar and no plan line while the voice spoke both. The axis is not "is this child
prose" but **"can markdown-it fold this into the row's own paragraph"**.

**The four-column rule had a one-line bypass.** A non-bullet line set
`contentCol = Infinity`, which made both the enclosure test and the four-column test
false on the line after it — so a `- Target \`4\`` six spaces under a continuation
slipped past the rule the round had just added.

### And the three-level test bailed on ordinary markdown

Moving it ahead of the `keyInPills` return was right; comparing INDENTS was not.
`  - a plain note` (content column 4) over `   - \`Target\` \`4\`` (indent 3) makes
the two SIBLINGS — a readable two-level shape the chart scores — and the narrator
returned `null` for the whole slide, so `slideToSpeech` read the raw bullets. Three-
space child indentation is used in this repo. It compares against the prose line's
CONTENT COLUMN now. A pilled line genuinely inside a kept child's item is newly
caught, which nothing had ever marked.

### Measured

```
round 7   invented rows 11 | tally diverged 2 of 122
round 8   invented rows  0 | tally diverged 0 of  86
```

The shipped corpus is unchanged again: 16 bullet slides, 0 differ from round 7.

**The floor moved with the corpus, and that is worth recording.** With the ambiguity
shapes at equal odds with the clean ones, only 21 of 400 decks spoke a tally at all
— a number that measures the generator, not the narrator. They are drawn at about
one child in five now, every shape is still counted as reached, and the floor is
set against that.

**A THIRD UN-DERIVABLE NUMBER SHIPPED IN THE COMMIT THAT CORRECTED TWO.** "81 rows
across 72 generated decks" reproduces under neither natural reading (0, or 152/129).
It is removed rather than re-invented.

**A guard was written, shipped and inert for one iteration.** `parseBulletRow`
returns a NEW object and did not carry `structurallyAmbiguous` over, so
`narrateBullet` read the flag off the mapped rows and it was always false. The fuzz
still showed dozens of decks diverging until the guard read `raw` instead. A guard
nobody can see fail is the same defect as a measurement nobody can re-derive.

*(An earlier draft of this paragraph quoted "45 of 317". A checker swept eighteen
reconstructions of the inert-guard state and the figure appears in none — it came
from a working tree that was never committed, which is exactly what makes a number
unre-derivable. It is stated qualitatively here rather than re-invented.)*

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

## The seventh round — the whitelist's own prose was ahead of its code (2026-09-21)

The sixth round's refusal went to a seventh checker, which found **two more
regressions and three holes in the whitelist itself** — one of them a rule the
round's own docblock claimed to implement.

**THE FOUR-COLUMN CODE RULE WAS NAMED AND NOT WRITTEN.** The docblock said structure
is read only where the indent "is exactly a parent content column", and listed "an
indent that matches no parent" among the refusals. The code tested three things and
not that one. Four or more columns past the enclosing content column is an indented
CODE BLOCK — the item's text stops being text — and `- Uptime \`5\`` over a
six-space `- Target \`4\`` renders Uptime as a BARE BAR while narration read the
target and said "one of two cleared" over a chart scoring one row.

**THE MARKER RULE WAS NEVER APPLIED TO THE ROW'S OWN LINE**, because
`parseDataRows` returns at `isTopLevelBullet` before the whitelist runs.
`-     Uptime \`5\` \`4\`` makes the ROW's content an indented code block: the chart
prints the backticks literally and scores nothing. And a nested-looking bullet
BEFORE the first row had no row to flag at all — markdown-it makes it a sibling and
the chart draws it as a full row, so ` - Phantom \`1\` \`2\`` above two real rows
rendered three scored rows against a spoken "one of two".

**THE REFUSAL DELETED A NUMBER THE SLIDE PRINTS.** This is the one that matters most,
because it is the class `speakLeftover` exists to prevent, re-opened from the other
side. `narrateBullet` seeds `consumed` with every row's own line index
unconditionally, and the ambiguous path threw away `targetRaw` — so the second pill
an author typed ON THE ROW LINE was consumed by the narrator and spoken by nobody.
`- Uptime \`5\` \`4\`` with a tab-indented prose note narrated "Uptime, five." while
the chart drew the 4 as its plan line.

*(An earlier draft quoted "81 rows across 72 generated decks". A checker could not
reproduce it under either natural reading — 0 rows, or 152 across 129 — and the
commit gave no recipe. It was the THIRD un-derivable number in a commit whose own
section corrected two, and it is removed rather than re-invented.)*

The fix is the distinction the round should have drawn in the first place: **a row
refuses what its children could have changed, and no more.** Where a nested line
carries a VALUE, the whole relationship goes — a child's `Floor` above its `Target`
makes the chart decline to score at all. Where the children are pure PROSE they can
override nothing, and the row's own pills stand. Where the ROW LINE is what is
malformed, its own pills go too. The tally stays suppressed in every case, because
it is a whole-chart claim and the row COUNT may itself be wrong.

**AND A ROUND-FIVE BUG SURFACED UNDER IT.** The `keyInPills` early return was added
ahead of the three-level check, so a code-spanned key never marked a row
three-level — and a structural child at depth THREE was absorbed as the row's
target. The check runs first now.

### The state-chart clause combined two sets by LABEL

`strandedBoth` matched `unreachable` against `deadEnds` on `s.label` while
`summarizeGraph` keys everything else on `index`. Two states may share a label, and
then a state WITH an outgoing arrow landed in the "nothing leads out of" set: the
voice denied an edge it read out three clauses later, and the other state's clause
was dropped. That is the self-contradiction the `unreachable`/`cutOff` split exists
to remove, re-introduced by the clause that combined them. Keyed on index now.

### Measured across the three generations, on the widened corpus

The corpus gained the four-column shape, lowercase row labels (`rowTargets` anchored
on a capital and the generator emitted only `Row0…Row5`, so a lowercase deck
contributed nothing to that cell, silently) and counts for both:

```
round 5   invented rows  59 of 400 | tally diverged 123 of 338
round 6   invented rows   1 of 400 | tally diverged  32 of 154
round 7   invented rows   0 of 400 | tally diverged   0 of 104
```

**The shipped corpus is unchanged across all three** — 16 bullet slides, 0 differ.

## The ninth round — an exact oracle, and what it found (2026-09-21)

Eight rounds of review had all measured narration against the SVG `<desc>`. That is
a **lossy projection** of the transform: it collapses a row to one sentence, says
nothing about which of measure/target/floor/bands moved, and drops a row whose lead
was corrupted. Defects hid in every one of those gaps, and four consecutive rounds
found them by hand.

**So the oracle changed.** `test/unit/core/bullet-structure-parity.test.js` compares
narration's four structural fields against `parseBullet`'s — the transform's own
reader, on the same slide, from the same list HTML markdown-it hands it. Nothing
internal on either side, and no projection in between.

**It put most comparable decks in disagreement, and every disagreement was the
MEASURE.** Not one was visible to any previous test.

The counts that first made this case are deliberately not quoted here. They were
measured against a generator that shipped in the same commit as the fix, so nothing
in the tree reproduces them — an independent checker reconstructed the round-eight
narrator twice and got two different totals with the same conclusion. That is the
fourth un-re-derivable number in this document, and the rule it teaches is now
written down rather than re-learned: a number measured against a corpus that changes
in the same commit is not a measurement, it is a memory. The durable form is the
committed test.

### The contract it enforces is not equality

Narration may read **less** than the transform — that is the whole refusal design.
What it must never do is read something **different**. Those are different
properties and only the second one is a defect, so the test asserts the second.

### What the 87 said

The measure is exactly as derived as the target. A child `Actual` overrides the
row's own first pill; a malformed row line voids it entirely. So round seven's
narrowing — "keep the row's own pills, refuse the children" — was never safe, and
rounds six and seven were arguing about where to put a boundary that should not have
existed.

**An ambiguous row is not narrated at all now, and its line is left UNCONSUMED**, so
`speakLeftover` reads the authored text verbatim. The listener loses the SENTENCE,
not the numbers. That single rule replaces the three-way narrowing, and it is what
both previous rounds were reaching for from opposite sides: refusing too little
invented a plan line, refusing too much deleted a number the slide prints.

The last five disagreements were a blank line followed by indented content, where
what the block belongs to depends on CommonMark rules no indent comparison can
settle. Refused, like everything else this parser cannot prove.

### Measured

```
compared row-for-row   165
  read EXACTLY          37
  read more quietly    128   <- the cost
  read DIFFERENTLY       0   <- the defect class
row counts differ      331   -> of those, speaking a tally: 0
```

**The cost is real and it is bounded.** On unusual markdown narration now says less
than it safely could. On the decks this repo ships it costs nothing: 16 bullet
slides, 14 narrate, and **not one reads differently than it did before any of this**.

### The corpus lesson, for the third and fourth time

Weighting is part of the test. At equal odds the odd shapes dominated — 75% of rows
carried a wide marker gap, every one was refused, and only 6 of 500 decks reached
the exact-match floor. A corpus that is mostly malformed measures the generator. The
axes are weighted toward real authoring now, each one still counted as reached, and
there is a floor on exact matches so the refusal cannot quietly swallow the corpus.

### What is still true

Narration still derives list structure from a line scanner, and **#2295** is still
the change that would remove the need to. What this round buys is different: the
failure mode is now provably ONE-DIRECTIONAL, and it is verified against the parser
the picture is built from rather than against my expectations.

### What this says about the next round

It should be expected to find more. What changed in this one is that each fix
closes a CLASS — a parse rule rather than a shape, a reachability closure rather
than a bail, a measured mutation table rather than a claim — so the next round's
findings should be new ground rather than the same ground in a new costume. That
is a prediction, not a result.

## The tenth round — the defect the row-for-row oracle could not have (2026-09-21)

The ninth round built an exact oracle and reported zero. An independent checker then
found a defect on **ordinary authoring**, proved it on the real `--captions` export,
and the oracle could not have seen it — not because its corpus was narrow this time,
but because of what it compares.

### The defect: a second list the picture does not draw

```markdown
<!-- _class: bullet -->

## Are we on plan.

- Uptime  `99.9%` `99.5%`
- Latency `180ms` `200ms`

Measured at quarter end.

- Churn   `2%` `3%`
```

The blank plus the column-0 paragraph ends the list, so `Churn` starts a second one.
Every chart in the family is built from **one** list — `bullet.transform.js` calls
`extractFirstList` (`lib/core/html-lists.js`) and never sees the rest — so the slide
draws two bars and renders `Churn` as a plain bullet. The voice said:

> One of **three** cleared the plan line. … Churn, two percent against a three
> percent target — sixty-seven percent of plan, closing on plan.

A whole-chart tally over a count the picture contradicts, plus a plan-line
relationship for a row that has no bar. That is the exact class the swimlane exists
to close, arriving through the one door nine rounds of row-level work left open.

### Why every previous check was blind to it

**The oracle compares row for row, and this defect is a row the comparison never
had.** Worse, the harness fed `parseBullet` a greedy match to the last `</ul>` — so
it handed the transform's parser BOTH lists and then agreed with narration about
them. 33 of its own 500 decks were fed something the transform never receives.
Swapping that one regex for `extractFirstList` — the function the transform actually
calls — turned the committed `diverged: 0` into a real divergence.

**An oracle that re-implements its subject proves only that the code agrees with
itself.** That is the same sentence the ninth round wrote about the `<desc>`, one
level further in.

### The fix is a boundary, not another rule

Deciding where a CommonMark list ends needs the block rules this file has been wrong
about five times (#2295). So the scanner does not decide: **once a row has been seen,
the first column-0 line that is not another row ends the scan, and everything after
it stays unconsumed** for `speakLeftover` to read verbatim. Blank-then-indented
*prose* ends it too, because `-  Row2` puts its content at column 3 and a following
two-space paragraph is inside neither the item nor the list.

It is quieter than markdown-it in two shapes it need not be — a lazy continuation
keeps one list open, and so does a column-0 line that merely interrupts a paragraph.
Quieter is the direction this parser fails in.

### And the widened corpus found a second one, pre-existing

Adding the interruption axis reseeded the generator, which surfaced a shape the old
corpus never produced and which reproduces byte-identically on the previous head:

```markdown
- Row2 `80%` `1`
  - `Floor` `5`
    - note
    - `Target` `4.2M`
```

`Target` is a grandchild — a child of `Floor` — so the chart reads Row2's target off
its own pills (`1`). Narration said `4.2M`. The cause was that the enclosure was ONE
SLOT: `note` overwrote `Floor`, and when `Target` came back out to `note`'s level
there was nothing left to compare against, so the line looked like a direct child.
**It is a stack now**, popped per line, and the shape is seen for what it is: a third
level, which this narrator refuses.

### Measured

Five rules, five mutants, each applied at load time to the production file and each
turning the oracle red:

```
unmutated                         pass 3  fail 0
tab-in-indent rule deleted        pass 2  fail 1
list-boundary stop deleted        pass 2  fail 1
blank-then-prose rule deleted     pass 2  fail 1
enclosure stack flattened         pass 2  fail 1
row refusal deleted               pass 2  fail 1
```

The tab rule is worth naming: it had been shipping for two rounds and **no test
anywhere killed it**, because the corpus emitted `'\t'` as a single indent
character — one column, already refused by the one-space-sibling rule, so the tab
clause never decided anything. `'\t\t'` and `'  \t'` reach it. A rule with no killer
is a rule nobody can safely change.

Cost on the shipped tree, narration string by narration string against the previous
head:

```
slides carrying a _class:   3725
narration identical          501
both silent                 3224
CHANGED                        0
```

### What this says about the next round

The ninth round predicted that its findings would be new ground rather than the same
ground in a new costume. That held: this round's defect is a different SHAPE of
comparison, not another parse rule. The prediction to make now is narrower and less
comfortable — **every oracle here has been wrong in the permissive direction exactly
once, and each time the next one found it.** The `<desc>` was too lossy; the row-for-row
feed was too wide. There is no reason to believe the current one is the first to be
exactly right.

## The eleventh round — the boundary rule broke the thing it was added to protect (2026-09-21)

The tenth round closed a whole-chart defect and opened one. An independent checker
found it on ordinary authoring and proved it on the real `--captions` export, and it
is the fourth time in seven rounds that a fix has introduced a new defect of the
class it was closing.

### What broke

```markdown
- Alpha `5` `4`
- Beta `9` `4`
- Methodology

  Measured at quarter end.

- Gamma `2` `4`
- Delta `1` `4`
```

The two-space paragraph sits at `Methodology`'s own content column, so markdown-it
keeps ONE list: the chart draws five rows, scores four, and two clear. The tenth
round's boundary rule stopped there anyway, `parseDataRows` returned a PREFIX, and:

| | |
|---|---|
| previous head | *"Two of four cleared the plan line"* — right |
| round ten | *"All two cleared their target"* — over a four-row chart, with Gamma and Delta demoted to raw text |

### Two mistakes, not one

**The rule was too wide.** Stopping is for prose OUTSIDE every open item. The pop
loop already leaves the innermost item a line is inside, so an empty stack is the
whole test — and with it, an ordinary `- Row` with a paragraph under it keeps its
list. That one condition recovers roughly a third of the readings the unconditional
stop was giving up.

**And the truncation was invisible.** `parseDataRows` stopped and said nothing about
it. `narrateBullet`'s tally guard already asked the two questions it could — is any
dropped row scored, is any row ambiguous — and both came back clean, because the row
that stops the scan is usually a bare prose bullet with no pills and the rows after
it are in neither list. So the return value now carries `truncated`, and it is keyed
on whether a top-level row really does follow the boundary: a slide ending in a
trailing HTML comment stops the scan and loses nothing, and treating that as
incomplete silenced six correct slides on our own demo deck.

### And two more the same checker found, both real

**A fenced block was invisible to the boundary.** `withoutFences` blanked the fence
DELIMITER along with its body, so a code block between two rows looked like empty
lines. Measured on the real export: a chart drawing ONE bar while the voice said
*"two of three cleared the plan line"*. The delimiter now leaves a mark, which is
already a column-0 non-bullet line, so no new rule was needed.

**A foreign list ABOVE the rows is the list the chart draws.** `extractFirstList`
takes the first `<ul>` OR `<ol>` and `isTopLevelBullet` matches only `-`, so an
ordered list above the data is what the picture is built from. The voice read the
rows below it and none of the list: *"none cleared its target"* over a chart where
`Alpha` cleared at 125%. The boundary rule closes the trailing edge and needs a row
before it can fire; this is the leading edge, and the answer is the same refusal.

### The test had to change more than the code

**The tally needed a direct guard.** Every cell compared row for row, and questioned
a tally only when the two parses disagreed about how MANY rows there were. A tally
can be wrong while the counts agree — that is exactly what round ten shipped. There
is now a cell that compares the two numbers the voice SAID against the two the
chart's own parse gives, through `bulletFacts.summarizeRows`, the kernel both
surfaces share.

**And the old proxy had to go, because it started crying wolf.** `- Methodology`
between two scored rows is drawn, scores nothing, and is not in narration's row list,
so the counts differ 3 to 2 while *"one of two cleared the plan line"* is exactly
right. Asserting the proxy would have forced a refusal on ordinary authoring to keep
a cell green.

### Two corpora, because there are two questions

Three rounds re-weighted the generator by hand and the fourth found only 7 of 500
decks still speaking a tally. The axes were drawn independently per row and per
child, so every axis added in good faith multiplied with the rest. The fix is
structural rather than another weighting:

- **sparse** — one oddity per deck — answers *what does this cost an author*.
- **dense** — every axis drawn independently — answers *can the voice ever contradict
  the picture*.

Measured, which is why both ship — and the first version of this sentence overstated
it. On `sparse` alone **four of sixteen** mutants die (the tab rule, the column-0
boundary stop, the blank-then-prose rule, the row refusal); the other twelve are
killed by the FIXTURES below, not by either corpus. On `dense` alone the cost cells
measure the generator (`exact` falls to 36 and 14 of 500 decks speak a tally). So the
division of labor is: the corpora find shapes nobody thought of, and the fixtures hold
the named rules in place.

```
sparse   checked 434 | exact 362 | quieter  72 | silent  66 | diverged 0
dense    checked 144 | exact  36 | quieter 108 | silent 319 | diverged 0
```

### And the rules got fixtures, because a corpus is a poor way to PIN one

A corpus finds shapes nobody thought of; it is bad at holding a rule in place,
because the shape a rule turns on can drift out of the draw and take its only killer
with it. That happened twice here: the tab rule shipped for two rounds with no
killer, and the enclosure-stack rule lost its own when the generator was rebalanced.
Each rule now has a named deck from a checker or a real export, with the reading the
transform gives. Twelve mutants, twelve kills:

```
unmutated                              pass 6  fail 0
tab-in-indent rule off                 pass 4  fail 2
column-0 boundary stop off             pass 2  fail 4
blank-then-prose rule off              pass 4  fail 2
blank-then-prose loses its exemption   pass 5  fail 1
enclosure stack flattened              pass 5  fail 1
row refusal off                        pass 5  fail 1
tally ignores `truncated`              pass 5  fail 1
word cloud ignores `truncated`         pass 5  fail 1
foreign leading list not refused       pass 5  fail 1
fence delimiter not marked             pass 5  fail 1
`lostRows` never set                   pass 4  fail 2
stop fires inside an open item         pass 5  fail 1
```

**One of those numbers is a lesson on its own.** An earlier run of this table
reported all twelve mutants SURVIVING, which was wrong: the harness file had been
overwritten by the checker's own, it keyed on a different environment variable, and
every run was unmutated. A mutation table that reports no kills should be suspected
of not running before it is believed.

### What is still true

Narration still derives list structure from a line scanner, and **#2295** is still
the change that removes the need to. Two limits are now written down rather than
implied: the boundary is a REFUSAL and not a model of where a list ends, so it is
quieter than markdown-it on a lazy continuation; and a whole-chart tally stands down
after any truncation, even where one over the rows it did read would have been right.

## The twelfth round — three of the four were the scanner's idea of "top level" (2026-09-22)

A third checker blocked, and it found the root the previous two rounds kept circling:
**narration's line scanner and markdown-it disagree about which lines are top-level
and where an item's content column is.** Three of the four findings reduce to that one
sentence. All four are closed here, and the two the eleventh round created were closed
first.

### What was wrong

| # | Defect | Whose |
|---|---|---|
| 1 | `lostRows` keyed on `isTopLevelBullet` (`/^-\s+/`, column 0), so a marker indented one space — a SIBLING item markdown-it draws and scores — reported no loss and the tally spoke over a prefix | round ten's, not closed by eleven |
| 2 | the `!enclStack.length` narrowing re-opened the `-\tMethodology` shape round ten had closed, because narration counts characters and markdown-it expands a tab to the next four-column stop | **round eleven's** |
| 3 | the `FENCE_MARK` sentinel reached the voice — two NUL bytes in a state-chart's emitted `.vtt` | **round eleven's** |
| 4 | `foreignListFirst` was anchored at column 0, so ` 1. Alpha` above the rows still produced *"none cleared its target"* over a chart whose first row cleared at 125% | pre-existing, on-path |

Every one was proved on the real `--captions` export, with lint, `npm test` and
`build:check` all green — #23 in its purest form.

### The sentinel was the wrong mechanism, not a leaky one

The fence fix wrote a NUL into the blanked text so the boundary rule could see a code
block. `speakLeftover` stripped it; `narrateStateChart` builds its own flatten with
`slideToSpeech` and never passes through `speakLeftover`, so it spoke the sentinel.

**A sentinel in shared text is only as safe as the least careful of its consumers, and
there are five.** So the boundary is a SET OF LINE NUMBERS now — `fenceMarkerLines`
returns the indices, `parseDataRows` takes them as an argument, and no text anywhere
carries a marker. The leak is not patched; it is unrepresentable.

### The other three are one anchoring bug in three places

- `lostRows` now fires on any marker at indent 0–3, which is where CommonMark starts a
  top-level list.
- `foreignListFirst`'s regex allows the same 0–3.
- The enclosure entries carry `colTrusted` — was this content column computed from
  spaces only? The narrowed stop asks whether a line sits inside an open item, which is
  a question about content columns, so where a tab made one uncomputable the answer is
  unavailable and the scan stops, as it did before the narrowing.

### One fix I tried and measured wrong

The checker's suggested patch included routing a dropped row's `structurallyAmbiguous`
into the whole-chart veto. **Measured, it silenced a correct tally.** The
blank-then-prose rule flags a prose row whenever a paragraph sits under it — including
the ordinary `- Methodology` / blank / two-space paragraph that markdown-it keeps in one
list and the chart scores completely — so the veto killed *"two of four cleared the plan
line"* over a four-row chart. What the veto needs is not "was any row unreadable" but
"might a row be MISSING", and `truncated` asks that directly. The tab case is covered
there instead: an untrusted content column stops the scan, which sets `truncated`.

### Measured

Sixteen rules, sixteen mutants, sixteen kills:

```
unmutated                                pass 7  fail 0
tab-in-indent rule off                   pass 5  fail 2
column-0 boundary stop off               pass 3  fail 4
fence boundary ignored                   pass 6  fail 1
blank-then-prose rule off                pass 4  fail 3
blank-then-prose loses its exemption     pass 6  fail 1
colTrusted ignored                       pass 6  fail 1
enclosure stack flattened                pass 6  fail 1
row refusal off                          pass 6  fail 1
tally ignores `truncated`                pass 6  fail 1
word cloud ignores `truncated`           pass 6  fail 1
foreign leading list not refused         pass 6  fail 1
foreign list anchored at column 0        pass 6  fail 1
`lostRows` never set                     pass 5  fail 2
`lostRows` anchored at column 0          pass 6  fail 1
stop fires inside an open item           pass 6  fail 1
```

**And the corpora kill four of those sixteen, not all of them.** Running the two corpus
cells alone (`--test-name-pattern 'transform does|spoken tally'`) kills the tab rule,
the column-0 stop, the blank-then-prose rule and the row refusal; the other twelve are
killed by `REGRESSION_DECKS`. The eleventh round's claim that "on sparse alone every
mutant survives" was wrong in the other direction, and is corrected above.

Cost on the shipped tree, with the method recorded this time because the figure moves:

```
roots examples test lib docs/public | split /^---\s*$/m | baseline e69b12bf4
files 446 | sections with a _class: 3734 | narrate 501 | CHANGED 0
```

### What this round says about the next one

Three checkers, three blocks, and this is the first whose findings share ONE root
rather than three. That is either convergence or the last coincidence before it. The
honest statement is the one the tenth round made and the eleventh proved: **#2295 is
the change that removes the disagreement**, and every round until then is buying
refusals at the price of coverage.

## The thirteenth round — the first one whose central claim survived (2026-09-22)

A fourth checker ran, and for the first time the thing under review came back
intact. It found two blocking defects, and neither is on the axis the last eleven
rounds bled from.

### The negative result is the finding

The checker built a generator biased at exactly this commit's axes, **proved it
sensitive** by pointing it at the parent commit — 146 contradictions between the
spoken tally and the transform's own — and then ran it against this head:

```
~330,000 adversarial decks, ~6,100 spoken tallies
contradictions between the voice's tally and the chart's own count: 0
parent commit, same generator, same 20,000 decks:                 146
```

It also re-derived the sixteen-mutant table independently, under a hook it proved
fires (an always-null self-test kills three cells; the unmutated control passes all
seven). Sixteen named rules, sixteen kills, and the corpus-versus-fixture split
reproduces: the corpora kill four, `REGRESSION_DECKS` holds the rest.

**And it could not refute the fix I reverted.** Round twelve removed the
dropped-row ambiguity veto that round eleven's checker had suggested, on the grounds
that it silenced a correct tally. The checker looked for a shape where a dropped
row's ambiguity means a row is MISSING and `truncated` does not catch it — by
construction and by fuzz — and found none: every list-ending mechanism markdown-it
has routes into `stopped`, and the tab disagreement is one-directional, so narration
pops more and stops more, which is the silent direction.

### What it did find

**A thematic break is not a lost row.** Round twelve widened `lostRows` to any marker
at indent 0–3, and `* * *`, `+ + +` and `- - -` all match while markdown-it renders
them as `<hr>` — the chart's list is COMPLETE. A deck ending in a closing note and a
rule went from *"all two cleared their target"* over a 2-of-2 chart to no tally at
all. That is precisely the hole `lostRows` was written to close, re-opened by its own
widening, and it is a regression round twelve created.

**And the root was only two-thirds closed.** `isTopLevelBullet` is `/^-\s+/` — column
0 — so a `-` indented one space is a top-level item to markdown-it and invisible to
this scanner. `foreignListFirst`'s widened regex deliberately excluded `-` because
`-` is `isTopLevelBullet`'s job, and that anchor was never moved. When such a list
comes FIRST it is the one `extractFirstList` hands the chart:

```
 - Alpha `5` `4`        ← the chart draws THIS, and only this

  Inside prose.
- Beta `9` `4`          ← the voice read these two, with plan lines
- Gamma `2` `4`
```

One bar drawn; two plan-line readings for rows rendered as plain bullets. Pre-existing
and unchanged by round twelve — but it is the leading-edge half of the root that
commit named, and the changelog claimed the closure. Fixed rather than re-worded.

### Three rules were live and unguarded

The checker wrote seven mutants of its own that survived the whole file. Three were
worth closing, and one of them taught something:

- **The NESTED half of `colTrusted`.** Only the read site was pinned. Forcing the
  nested write to `true` left every cell green while changing narration on 573 of
  4,000 tab-heavy decks. The first fixture written for it was worthless: it put the
  prose at two spaces, which pops back to the ROW entry, so the nested entry is never
  the stack top when the rule consults it. It takes prose indented far enough to stay
  *inside* the tab-indented child.
- **The fence boundary at two of its four call sites.** `parseDataRows` takes the
  fence indices in four places and only `bullet` was pinned, so dropping the argument
  at the word-cloud or data-series site changed nothing any test could see.

### And the fixture runner could not tell two outcomes apart

A `tally: null` cell passed whether the narrator refused the TALLY or refused the
WHOLE SLIDE. Those are different outcomes, and a fixture that went null for an
unrelated reason would have certified the refusal it was written for. The runner now
demands one or the other explicitly — and adding that assertion immediately caught
**four** existing fixtures passing on total silence.

### Measured

```
unmutated                              pass 8  fail 0
HOOK SELF-TEST (narrateBullet → null)  pass 5  fail 3   ← the hook fires
thematic-break exemption removed       pass 7  fail 1
leading `-` at indent 1-3 not refused  pass 7  fail 1
nested colTrusted forced true          pass 7  fail 1
fences arg dropped at word-cloud       pass 7  fail 1
fences arg dropped at data-series      pass 7  fail 1
```

Cost on the shipped tree, unchanged through all of it:

```
roots examples test lib docs/public | split /^---\s*$/m | baseline e69b12bf4
files CONTAINING a _class: 446 | sections with a _class: 3734 | narrate 501 | CHANGED 0
```

(That first number is the count of files that CARRY a `_class:`, not the number
walked — the checker walked 489 and got the same three other figures. The earlier
label was ambiguous.)

### What this round says about the next one

The four rounds before this each found the central mechanism broken. This one found
the central mechanism sound and the edges rough: a regex that over-matched, an anchor
that was never moved, three rules nobody had mutated. That is a different kind of
finding, and it is the first evidence in this swimlane that the refusal design has
converged.

It is not evidence that **#2295** is unnecessary. The leading-edge defect is exactly
the disagreement #2295 removes, and it went unnoticed through four review rounds
because nothing in the tree can see it — the scanner cannot, and the transform is
never asked. What changed is the expected VALUE of a fourteenth round: the last four
each found the thing under test broken, and this one did not.

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
- **And dropping the census did not drop narration's exposure to that.** The voice
  names the leader, the runner-up and the smallest term, and below nine terms it names
  EVERY term, so a word the packer cannot seat can still be spoken over a picture that
  does not draw it. Narration runs on Markdown and the drop does not exist until the
  transform runs, so this cannot be closed from the narration side — what can be done
  is measure it, and `tools/measure-word-cloud-drop.mjs` now reports it as a second
  number: **0 of 34 slides name an undrawn word**. On the two that lose one, `leverage`
  sits at weight 4 in a thirteen-term list — past the enumerate cap of 8 and neither the
  leader nor the tail, so the voice never reaches it. That is a measurement, not a
  property: a smaller cloud that loses a word would be spoken. The detector is not
  vacuous — on the same slide it matches the four terms the voice does name (`execution`,
  `discipline`, `risk`, `drag`).
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
