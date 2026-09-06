---
status: in-progress
summary: Narration prices time by STRUCTURE only — syllables, punctuation glyphs, blank lines, and two flat slide constants — so nothing on a slide can buy itself room, and a diagram gets the shortest narration in the deck with the most to look at. This record separates the two quantities the complaint folds together (ABSORPTION, how long the eye needs, which is counting; EMPHASIS, which words matter, which is salience) and builds a measured bake-off of competing absorption cost models. THE FIRST RUN PICKED MODEL E AND WAS WRONG. An adversarial trio (red team + Munger inversion + independent checker) found the measurement broken in six independent ways — it never read the slide headline or coda (1065 of 1602 slides), charged KaTeX glyphs and invisible SVG accessible text as words, double-counted every Mermaid diagram on the live browser path, scored eleven Mermaid grammars at zero, and read a chart axis-range operator as a link — and found the design wrong besides: 78% of what the model added was ARRIVAL silence, 84% of it on prose slides the record claimed got none. Corrected, the answer inverts: a two-line control (hold every visual slide 3s) reaches 41 of 41 visual slides where the measured model reaches 18, and the model exit correlates with mark count at -0.13, meaning its differentiation is noise. The measurement is kept as a diagnostic; the pick is withdrawn. No LLM, no embedding model, no new dependency. Nothing is wired to the player.
companion:
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-11-manifest-speech-contract.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-07-cadenza-caption-timeline.md
---

# Slide absorption — giving content weight to the narration clock (2026-09-06)

> **Symptom.** "Narration of slides and diagrams doesn't place any weight based on the content
> and therefore doesn't let slides and important information breathe."
>
> **Root cause.** Every rung of the pause ladder keys on a glyph or a boundary. A word costs its
> syllables, a pause is a punctuation character, a paragraph is a blank line, and the two deepest
> rungs — `SLIDE_PAUSE_MS` and `SECTION_PAUSE_MS` — are flat constants keyed on boundary depth
> alone. Nothing on the slide can buy itself room.
>
> **Decision (this doc).** Split the complaint into two quantities, fix the one that is countable,
> and prove the cost function on real decks rather than asserting it.

## 0. THE PREMISE WAS FALSE — read this before anything below

**Measured on the real surface, a `diagram` slide narrates for 40.6 seconds and then advances.**
It is not starved of time, and it does not "advance the instant the voice stops with nothing said".
Everything in this record after this section was built on a measurement error.

### The error

`projectDeckToSpeech` is **one stage** of the narration pipeline. Both the CLI
(`lattice-emulator.js:5037`) and the live Studio run the shared `narrateChart` **on top of it** —
and for a `diagram` slide that narrator speaks the whole flowchart, node by node. This record timed
the projection alone:

| slide | this record measured | the shipped caption actually runs |
|---|---|---|
| `diagram-narration.md` #2 | 4.3 s | **40.6 s** |
| `diagram-narration.md` #3 | 4.7 s | **29.9 s** |

Roughly **9x too small, on exactly the slides the work was about.**

### Triangulated on the real surface

Driving the actual Present overlay in Chromium, per-slide dwell matches the caption duration plus
the 1.4 s arrival beat, to a tenth of a second:

```
slide   caption ends   observed dwell
01        20.88s          21.0s     (playback started here — no arrival beat)
02        40.60s          42.0s     = 40.6 + 1.4
03        29.92s          31.3s     = 29.9 + 1.4
```

An A/B with `AudioContext` deleted returns identical dwells (21029/42003/31314 against
20972/41979/31381), so this is the estimate clock running in real time — not an audio stall, not
synthesis latency, not a buffering hold. Three independent measurements agree.

### What the instrument says once it is fed correctly

`tools/absorption-bakeoff.js` now applies `narrateChart` like the shipped pipeline does. Every
measured model collapses:

```
model              VISUAL EXIT  visual w/ beat  ADDED total
A · text time      0.0s         0/41            0.9s
B · density fill   0.0s         0/41            2.3s
C · role-weighted  0.0s         0/41            0.0s
D · visual cost    0.2s         3/41           12.4s
E · hybrid         0.3s         6/41           20.7s
T · flat control   3.0s        41/41            2.0m
```

**The residual design works. Its verdict is that no extra time is needed** — the narration already
provides it. Only the flat control still fires, and it fires precisely by ignoring narration: it
would add three seconds of silence to a slide that has just spent forty describing itself.

### What that means for this branch

The problem this work set out to solve does not exist in the form stated. Two earlier claims in
this record are also false and follow from the same error: that `projectDeckToSpeech` "drops
`.cell-coda`" (the shipped caption speaks it) and that a diagram gets "the shortest narration in the
deck" (it gets the longest). The sections below are retained as a record of how a measurement error
survived three fix passes, two adversarial trios, 58 mutation-verified tests and a green pipeline —
because none of them ever checked the one input everything else was computed from.

## 1. Two quantities, not one

The request names "weight" once but asks for two different things, and they need different
instruments:

| Quantity | The question | How it is measured | What it drives |
|---|---|---|---|
| **Absorption** | how long does the eye need? | counting the rendered slide | the arrival beat + a new exit hold |
| **Emphasis** | which words matter? | salience over the text | micro-pause and rate within a clip |

**Absorption needs no semantics.** It is a quantity question — how much is on the slide — answered
by counting nodes. That is the half this record addresses, and it is the half the complaint leads
with ("slides and diagrams… don't breathe").

Emphasis is where a salience model earns its place, and it is deliberately out of scope here. It
also has a hard ceiling worth stating now: **neither TTS rung supports SSML**
(`2026-07-09-cadenza-narration-quality.md` §8), so the in-clip levers are injected punctuation and
the per-clip `speed` parameter — not `<emphasis>` tags.

## 2. What was already in the tree, unwired

Three separate dwell models exist, none connected to the narration clock:

| Model | Where | Scales on |
|---|---|---|
| `readMs` | `docs/src/lib/cadenza/cadence.ts` | spoken word count, clamped 1–6 s |
| `readMs` | `docs/src/lib/vetrina/storyboard.ts` (the Teaching Beat) | caption words, clamped 1.2–4.5 s |
| `ROLE_MULT × (0.6 + words/45)` | `docs/src/components/studio/present/rehearsal.js:47` | component role + density |

Plus two catalogs of authored content weight nobody times anything from:

- **All 61 manifests carry `adapt.priority`** — a ranked slot salience (`["number","caption","eyebrow"]`).
- **29 carry `density: {axis, soft, hard}`**, generated into `lib/runtime/axis-dom-catalog.generated.js` —
  a per-component crowding budget with a DOM selector, already bundled to the runtime.

`rehearsal.js`'s `ROLE_MULT` is the repo's existing content-weight model. It coaches a human
("Let the number land — stop talking for a beat") and never reaches the clock. This work lifts it
onto the clock rather than deriving a second one; `slide-absorption.test.js` pins the two equal.

## 3. Where the signal dies

`projectDeckToSpeech(sections)` (`lib/transformers/prose-projection.mjs:797`) renders the
**component-aware** DOM, reads `data-class`, knows which slot every phrase came from — and returns
**one flat string per slide**. Cadenza then re-segments it blind. The entire channel from "this is
the headline metric" to "hold longer here" is punctuation and blank lines.

Two narrower losses on the same path:

- `lib/core/slide-speech.js:135` strips `**bold**` — the author's own emphasis marking, deleted
  before timing.
- `MEDIA_COMPONENTS` (`prose-projection.mjs:84`) makes a chart/diagram/image narrate its heading
  and caption only, skipping the visual **by design**. So the slides with the most to look at get
  the least narration, and then advance the instant the voice stops. That is not a bug in the
  projection — a screen reader should not narrate an SVG's internals — but it means **the voice
  never buys a media slide any absorption time**, which the spend rule below has to model
  explicitly.

## 4. The spend rule — shared, so only the cost function competes

Every model answers one question — how many milliseconds of looking does this slide owe? — and one
shared `spend()` turns that into two beats:

- **arrive** — a beat on the new slide, already rendered, *before* the voice starts.
- **exit** — the **residual** after narration ends: what the eye still owes, minus what the voice
  already bought.

**The residual is the idea. The FIRST CUT GOT IT HALF RIGHT AND SHIPPED THE OTHER HALF AS A PLAIN
ADDITIVE PAUSE**, which is the failure this design exists to avoid, with the sign flipped. `exit` was
a residual; `arrive` was a flat share of the same cost with no narration credit at all — and arrive
is where the time went. Measured over the record's own corpus:

```
added ARRIVE 307.9s | added EXIT 89.2s        78% of the addition was ARRIVE
of that arrival silence, 259.7s landed on PROSE slides    84%
```

A slide with 83 prose words took **8.5 s of silence before the voice began reading those same 83
words aloud for 56 s** — on the population §6 described as getting "no padding". The claim was true
of one beat and false of the model.

**Two corrections follow from asking what each beat is FOR.**

**The arrival beat buys time to take in what the voice is NOT about to tell you.** Prose is exactly
what the voice IS about to tell you, so pre-reading silence buys nothing there. `arriveCost` now
reads the **look channel only**; a prose slide's arrival beat is the floor and no more.

**Narration is credited PER CHANNEL.** The voice reads the slide's prose, so it pays the read channel
down in full — on every component, media or not. It does not describe the picture, so it barely
touches the look channel. Blending the two and discounting the whole thing to 25% on a media
component is what made a diagram's cost track its CODA rather than its diagram, and is the same flaw
that gave a `math` slide 18 s of silence around narration that was its own prose.

Two safety properties, both pinned by test *and by mutation*:

- **The arrive beat never drops below the caller's floor**, which is today's flat `SLIDE_PAUSE_MS`.
  This model can only *add* room.
- **A beat is either zero or perceptible.** A sub-`MIN_BEAT_MS` residual is dropped, not rounded up.

**The deck's `pace:` register scales the model** rather than being outgrown by it. The first cut
voided it silently: an arrival beat of `max(floor, cost x share)` stops consulting the floor once the
cost term grows, so above ~27 prose words `brisk`, `natural` and `deliberate` played identically —
against `resolve-pace.mjs`, which argues at length that rhythm is the author's directorial choice and
travels with the deck.

## 5. The five candidates

| | Model | Cost function |
|---|---|---|
| A | text time | silent reading time of the slide's prose |
| B | density fill | rendered items against the component's calibrated `soft` budget |
| C | role-weighted | `rehearsal.js`'s ROLE_MULT lifted onto the clock, unchanged |
| D | visual cost | what is painted: marks, diagram nodes, diagram edges, images |
| E | hybrid | `max(read, look) × role` |
| **T** | **flat control** | **`if (isVisual) exit = 3000`. Two lines, no measurement.** |

**T is not a joke entry, and adding it is the single most useful change to the bake-off.** A cost
model that cannot beat two lines has not earned its module. The first run had no column that could
show this, which is how a model spending 78% of its budget on arrival silence over prose slides was
picked as the winner: the only column the report dignified was one a model is rewarded for inflating.
The control deliberately does **not** take part in the residual — not knowing the narration time is
the whole point of it.

`max` and not a sum in E: reading and looking are not sequential — a viewer scanning a chart's
labels does both at once, and summing double-charges every slide with words *and* marks.

## 6. The measured result — and the pick is WITHDRAWN

`node tools/absorption-bakeoff.js` over 4 decks / 142 slides / 41 visual slides / 50.1 min of
narration. Without a model every slide gets a flat 1.4 s arrival beat and a 0 s exit hold.

```
model              VISUAL EXIT  visual w/ beat  ADDED total  added arrive  added exit  prose exit
A · text time      1.5s         8/41            64.4s        0.0s          64.4s       0.0s
B · density fill   1.5s         8/41            65.8s        1.4s          64.4s       0.0s
C · role-weighted  0.0s         1/41            0.5s         0.0s          0.5s        0.0s
D · visual cost    0.6s         13/41           27.3s        4.7s          22.6s       0.0s
E · hybrid         2.0s         18/41           1.5m         9.0s          83.7s       0.0s
T · flat control   3.0s         41/41           2.0m         0.0s          2.0m        0.0s
```

**The two-line control wins.** It reaches **every** visual slide where the best measured model
reaches 18 of 41, holds them longer (3.0 s against 2.0 s), and costs 2.0 m of added silence against
E's 1.5 m — a difference of half a minute across fifty minutes of narration, for 23 more slides
covered.

**And model E's differentiation is noise.** Its exit correlates with the slide's mark count at
**-0.13** — essentially zero, and slightly the wrong way. It correlates with *narration length* at
**-0.41**, which is the residual doing its job. So what little signal E carries comes from the spend
rule, which every model shares, and not from the measurement, which is E's entire reason to exist.

**Read the columns as a PAIR.** `visual exit` × `visual w/ beat` is what a model buys; `ADDED` is
what it costs. The first run reported neither `ADDED` nor a control, and argued from two columns that
carry no signal at all:

- **`prose exit` is ~0 for every prose slide under every model**, structurally. Silent reading
  (250 wpm) always beats reading aloud (120–175 wpm) and prose narration is now credited in full, so
  the residual cannot be positive. "No padding" is a property of the spend rule, not of a cost
  function.
- **`spread`** (removed) was `max/min` arrive, but min is pinned at the floor and max at the ceiling,
  so it reported whether *one* slide saturated.

**The population is `isVisual`, not `isMedia`.** `MEDIA_COMPONENTS` answers "whose narration skips
the visual" — a projection question, and the reason a media slide earns little look-channel credit.
Seven components (`gantt`, `kanban`, `matrix-grid`, `progress`, `roadmap`, `timeline-list`, `scene`)
are things a viewer looks at while sitting outside that list, so the first run scored them in the
column it told the reader to ignore. Reusing the list looked like reuse (HARD RULE #15) and was not:
same set, different question.

### What E is still right about, and it is not nothing

On the seven `diagram` slides of `examples/diagram-narration.md`, E holds 9 s where T holds 3 s — and
E is correct there. Those slides carry **47 words of coda that the narration never speaks**: the
projection emits the lede (10 words) and drops `.cell-coda` entirely. A viewer really is left reading
text the voice never reads. T cannot see that; E can.

That is a genuine argument for a measured model — and it is also a **narration-content defect worth
more than the timing one**. The better fix is to narrate the coda, not to hold silence while someone
reads it. Logged as off-path (HARD RULE #18), not pulled into this diff (#17).

## 7. Two modeling errors the bake-off found

Both were introduced by me, both survived reading, and both were caught only by running the
numbers over real decks. They are recorded because each is a plausible-sounding choice.

**7.1 A blanket `sqrt` curve underprices exactly the range most slides live in.** The first draft
charged `sqrt(marks) × 120 ms × 2` to avoid a tuning constant. A five-node, four-edge flowchart
priced at **0.7 s** — under the existing 1.4 s floor — so model D gave every diagram in the tree a
beat of zero, at spread 1.0×. The marks were counted right; they were *valued* wrong. Fixed by
charging per element **kind** (a traced edge is not a scanned bar), linear below a 4 s knee and
logarithmic above it.

**7.2 A chart's labels are not prose.** Reading time was charged on every visible word, so a
quadrant with 51 scattered axis labels priced at 12.2 s of "reading" and model E gave it
**13.8 s of silence** — worse than the flat beat it replaced. Fixed by splitting `proseWords` from
`labelWords` at measurement time: text under a prose block is read, everything else is scanned.

**7.3 (mechanical, same class.)** `textContent` concatenates adjacent elements with no separator,
so `<p>…three</p><text>alpha</text>` counted as one word. The measurement now walks text nodes.
Real rendered markup has newlines and mostly got away with it; a fixture does not.

## 7b. What the maker-checker pass found (nine defects, all fixed)

A checker agent audited the first commit and confirmed nine defects; all are fixed, each with a
regression test **verified by mutation** — the source is broken and the named test must go red.

**7b.1** `diagramMarksOf` produced node names that were not in the diagram: an unspaced link
(`Server--xClient`, which shipped decks use) fused the operator's characters into the name, yielding
`Server--`, `xClient`, `Worker--` with the real participants dropped. Nodes are now derived from
edges (`edges + 1` bounds a connected graph), so nothing parses an identifier and nothing can invent
one. **7b.2** Mermaid YAML frontmatter counted as two edges, its delimiters being literally `---`.
**7b.3** A ReDoS: `={2,}>` backtracked quadratically on author-controlled fence text. Every
quantifier is bounded; 200k `=` now scans in ~4 ms. **7b.4** Model B scored against a hardcoded
`'li, dt, tr'` where `collections.js` owns the rule — HARD RULE #5 makes a card a nested list, so 46
of 60 catalog-backed slides counted every card twice. **7b.5–7b.9**: KaTeX's `.katex-mathml`
duplicate counted as prose; overlapping mark sets; a role probe still reading `textContent`; NaN from
two models on a partial measure that `spend` silently turned into zero absorption; a floor invariant
that broke above the ceiling.

## 7c. What the ADVERSARIAL TRIO found — and why the pick was withdrawn

Three independent passes (red team, Munger inversion, independent checker) ran against the shipping
state after §7b. They found the measurement wrong in six independent ways and the design wrong
besides. **Four of the six are the same class of error §7 and §7b record as already fixed** — the
fixes had treated symptoms and left the causes.

### The measurement

**7c.1 — The headline and the coda were never counted.** `stageOf` rooted every measurement at
`.cell-stage`, but the engine puts the headline in a sibling `.cell-masthead > .masthead-lede > h2`
and a harvested insight in a sibling `.cell-coda`. Both are painted. **1065 of 1602 slides carry text
outside the stage, and 141 measured at ZERO words while showing visible prose** — including whole
diagram decks whose entire text is a headline plus a coda. Models A, B, C and E all read `words`, so
§6's original ranking was computed on counts systematically short on two thirds of the corpus. The
cause is instructive: `stageOf` was copied verbatim from `prose-projection.mjs`, where it is correct
*because the projection reads the heading separately* (`headingOf`, `eyebrowOf`). Copying one of
three collaborating functions took the part and left the contract.

**7c.2 — Every Mermaid diagram was charged twice on the live browser path.** `lib/runtime/index.js`
inserts the rendered SVG as a **sibling** of the `<pre>`, never a descendant, and defangs the source
by rewriting `language-mermaid` to `language-mermaid-source` — which still matched a `[class*=]`
**substring** selector. So the hidden 0x0 source block was measured as a second whole diagram on top
of the SVG that replaced it: **+82% cost, +2.97 s of silence on a five-node flowchart**, on the exact
slide class this model exists to serve and the exact path §7b marked UNVERIFIED. Fixed by matching the
class exactly and looking for a drawn twin among **siblings**. Pinned against the runtime's real DOM
shape. A related trap surfaced while fixing it: the runtime marks the drawn diagram
`aria-hidden="true"` (correctly — the source carries the accessible text), so adding that attribute
to the skip set would have erased the rendered diagram from the measurement. `aria-hidden` means "do
not announce", not "do not paint".

**7c.3 — Invisible SVG `<title>`/`<desc>` counted as on-slide words.** The SVG spelling of
`.lattice-description`. A world basemap carries one `<title>` per country: `examples/map.md` slide 3
measured **257 words of which 17 are visible**, and every `map` slide pinned both beats at the
ceiling. 144 slides carried it.

**7c.4 — KaTeX's per-glyph spans counted as words.** Skipping `.katex-mathml` (7b.5) treated the
symptom; the *visible* rendering sets every symbol in its own `<span class="mord">`, so
`f : [ a , b ] -> R` billed as eight words at reading speed. `examples/cat-ink-tier.md` slide 1 still
took **arrive 9000 + exit 9000 — 18 s of silence**, the exact symptom 7b.5 claims in the past tense
to have closed. A whole `.katex` subtree is now one look.

**7c.5 — Eleven Mermaid grammars priced at exactly zero**, 15 shipped fences, including every chart in
`examples/xychart-narration.md`. §8's claim that matching arrows keeps the estimate grammar-agnostic
was false: `xychart`, `gitGraph`, `timeline`, `sankey`, `gantt` and the rest carry content as
statement rows and have no arrow-shaped operators at all. Worse, where `xychart` *did* score, `-->` is
the **axis-range operator** (`x-axis "Trial" 1 --> 5`) — the diagram's absorption cost was a count of
how many axes declared a range. Row grammars are now measured by their rows; axis and config lines,
quoted labels, bracketed label bodies and trailing `%%` comments are stripped before the edge scan.
**Zero of 116 shipped fences now score zero.**

**7c.6 — Uniform mark sets are one picture, not N looks.** `examples/map.md` renders a basemap as 175
identically-classed `<path class="map-region">`. That is the §7.1 error (marks counted right, valued
wrong) in its largest instance. A run of marks sharing one class is now charged a bounded number of
looks; distinctly-classed marks are not discounted, so a 20-series chart is still twenty things.

Two more, lower: `measureSlide` was the only unguarded entry point (a null argument threw, and in a
per-slide player loop one un-rendered slide takes down the clock), and `ROLE_MULT[role] || 1` returned
a truthy **function** for `toString`/`constructor`, reproducing 7b.8 exactly — NaN, which `spend`
turns into cost 0.

**And a performance defect:** the measurement was `O(elements × depth)` — `closest()` against 11
compound selectors per text node — taking **11.4 s on a 38 KB deck where the existing prose projection
walks the same DOM in 77 ms**. It is now a single walk carrying a skip-depth counter.

### The design

**7c.7 — 78% of what the model added was arrival silence, 84% of it on prose slides.** Recorded in §4.

**7c.8 — A two-line rule beats the measured winner.** Recorded in §6, and now a permanent control row.

**7c.9 — `MEDIA_COMPONENTS` was the wrong population for the metric.** Recorded in §6.

**7c.10 — It silently voided the `pace:` register.** Recorded in §4.

**7c.11 — The tree already held contrary evidence this record never cited.** `cadence.ts:79-85`
records `PARAGRAPH_PAUSE_MS` being tuned **down** from ~1000 to 750 after on-device review, because a
deep pause at every block seam "read as the highlight lagging" — and says in as many words that
"long pauses feel worse here than the literature predicts". The first cut raised the mean arrival beat
from 1400 ms to 3600 ms without mentioning it.

### Claims in the first cut that were false

Recorded because the subject of this document is claims nobody re-derives, and it shipped six:

| Claim | Reality |
|---|---|
| "each with a regression test named for the failure it closes" | fix 7b.7 had **none**; two mutations survived all 29 tests |
| "**0 role flips** across 1602 slides" | there is **1** |
| "the mark sets are **DISJOINT** by construction" | a `<td>`'s text was billed as a label word *and* the `td` as a cell |
| "**E reaches 33 of 34** with a 3.1 s mean media exit" | the table 20 lines above said 32/34 and 2.6 s |
| "prose exit is **structurally 0** under every model" | false as stated — the cost is a `max`, so a label-dense non-media slide escapes it |
| two "pinned by test" safety properties | both **vacuous**: the `max`-not-sum test passed with `max` replaced by `+` (71 ms of slack), and the "zero or perceptible" test never constructed a sub-threshold positive residual |

**Every fix in this record is now mutation-verified.** Break the source, the named test goes red —
checked for all of 7b and all of 7c, including the three design corrections in §4.

### What the trio confirmed as sound

The ReDoS fix is complete and linear. `spend()` was fuzzed over **145,152 parameter combinations**
(including `NaN`, `±Infinity`, `null`, strings, negatives) with **zero anomalies**. HARD RULE #22
correctly has no jurisdiction: the kernel reads DOM and returns numbers — it assembles no document,
injects no markup, embeds no `<style>` and re-wraps no CSS. `<template>` payloads are not
double-counted. The export path is *not* affected by 7c.2 (the emulator removes the source `<pre>`
entirely). And the item mirror, though not selector-equivalent to `collections.js`, agrees with it on
**1602 rendered slides, 653 non-zero, 0 divergent**.

## 8. A constraint the export path imposes

**On the CLI/export path a Mermaid diagram has no marks.** Mermaid renders in a browser, so in
Node/jsdom the slide holds `<pre><code class="language-mermaid">` and its DSL text. A DOM-only
visual model therefore scores every diagram in the tree at zero — §7.1's symptom had two causes,
and this was the second.

So `diagramMarksOf` estimates from the **source** when no SVG is present: an edge is an arrow
operator, a node is a bracketed declaration or an identifier adjacent to an arrow. Deliberately
shallow — it does not parse Mermaid and does not need to, because the cost runs through a knee
curve where being out by a node moves the beat by tens of milliseconds. Matching the *arrow* keeps
it grammar-agnostic, which matters: the bracket-only rule scored a `classDiagram` at zero nodes.

## 9. Why no NLP library, and where one would go

The question that prompted this work was whether a library capturing semantic meaning could
supply the weight without an LLM. For **absorption**, no library is needed or useful — the
quantity is countable, and the manifests already carry the calibrated budgets.

The ladder, recorded for the emphasis half rather than discarded:

| Tier | What | Cost |
|---|---|---|
| 0 | manifest role, `adapt.priority`, restored `**bold**`, element counts | zero deps — **what this work uses** |
| 1 | deck-relative TF-IDF / surprisal | ~100 lines, zero deps |
| 2 | `wink-nlp` (POS + BM25) or `compromise` | a runtime dependency |
| 3 | MiniLM sentence embeddings via `@huggingface/transformers` | ~23 MB ONNX model |

**One hard architectural constraint either way:** Cadenza is zero-dependency and gated —
`checkCadenzaBoundary` (`tools/check-ownership.js:7127`) fails the build on any non-relative
import. **No NLP library can live in Cadenza.** Weight is computed upstream and handed down as
numbers, which keeps Cadenza's stated contract intact: not a decider of what to say, and now not a
decider of what matters either.

## 10. What this ships, and what it does not

**Ships:** `lib/core/slide-absorption.mjs` (the measure, six models including the control, the spend
rule), `tools/absorption-bakeoff.js` (the diagnostic), and **50 unit tests**, every one of which was
mutation-verified — the source is broken and the named test must go red. Three cross-module pins are
compared by **identity** (`MEDIA_COMPONENTS` against the projection's, `ROLE_MULT` and `TABLE_COMPS`
against `rehearsal.js`'s) and one against `collections.js`'s item rule.

**Does not ship:** any change to what a deck renders, exports, or narrates. Nothing calls the kernel.
The arrive beat is still `slideBeatMs`'s flat constant and the exit hold does not exist on any
surface.

**Does not ship a PICK.** The first cut named model E the winner; on the corrected measurement the
two-line control beats it on coverage, on depth, and on differentiation that means anything. The
honest output of this work is an instrument and a defect catalog, not a chosen cost function.

**UNVERIFIED, and named as such (HARD RULE #23):** every number here is a *computed beat*, not an
observed delivery. Nobody has watched a deck present itself under any of these models. That gap is
what the whole exercise kept failing to close, and three adversarial passes agree it is the only thing
that can settle `arriveShare`, the media narration credit, and whether a uniform 3 s hold feels
better or worse than a differentiated one.

## 11. Next

1. **Watch a deck.** Wire the flat control — it is two lines — and watch a narrated delivery. Every
   remaining question in this record is a question about how silence feels, and none of them is
   answerable from a table. This is the step that should have come first.
2. **Narrate the coda.** `projectDeckToSpeech` emits the lede and drops `.cell-coda` entirely, so a
   diagram slide carries 47 words the voice never reads (§6). Fixing the narration is worth more than
   holding silence while someone reads it. Off-path here (#17/#18); its own branch.
3. Only then, if a measured model still looks worth it, re-run the bake-off against the shipped
   control rather than against a flat beat nobody was defending.
4. The **emphasis** half, on its own branch, starting at Tier 0 (§9).
