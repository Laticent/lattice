---
status: shipped
summary: >
  The Guide could not point at a part nothing declares. It searches one hardcoded element list
  for all 71 components, so a transform that renders its parts as spans is invisible to it: a
  `team-profile` roster resolved 46.8% of its cues and drew a box around a card that already had
  a border. Manifests now carry `handles` — the RENDERED part and the token that names it — and
  the Guide reads a generated catalog of them, the same arrangement `density.domSelector` already
  has with the Fix-Me overlay. Measured on one corpus, both runs back to back, 187 decks /
  10,810 cues: 87.2% -> 89.3% resolved, 1,383 hidden cues -> 1,153, and no component loses a
  resolution. Two findings changed what got built. `slots` was refused again, this time for a
  second reason: it is an authoring contract. And the issue's own target — "12 of the 18
  components at `body` 100%" — does not survive measurement, because ten of those eighteen are
  at `body` CORRECTLY: their only cues are the slide heading, whose own words are the handle.
companion:
  - ./2026-09-20-gesture-audit.md
  - ./2026-08-05-guide-gesture-semantics.md
  - ./2026-07-10-overflow-cause-highlighting.md
---

# The manifest as the spine: declaring the part a gesture can point at

**Date** 2026-09-21 · **Status** SHIPPED, measured. Issue #2251, following #2244.

The ask was the maintainer's: *"my hope is the manifest serves as the spine that helps connect
the svg to vetrina in a generic way."* The answer is yes, on one condition that took two
measurements to pin down — the manifest has to declare what the component **renders**, not what
an author **writes**.

---

## 1. The symptom, on one component

`team-profile` renders a roster. Each person is a photo and three spans:

```html
<li class="person">
  <span class="person-figure"><img …></span>
  <span class="person-text">
    <span class="person-name">Marcus Vale</span>
    <span class="person-role">Program Director</span>
    <span class="person-note">Runs the weekly cadence.</span>
```

Narration says *"Marcus Vale, Program Director: Runs the weekly cadence."* Two separate things
went wrong, and conflating them is why the issue's acceptance criterion was wrong.

**The cue could not be placed at all.** No element holds that sentence — the projection composed
it across three spans — so the pointer hid. 47 of the 86 cues on the component's own gallery.

**When a cue WAS placed, the ink went on the container.** `anchorFor`'s chain is phrase ->
marker -> header -> body, and `headerRange` cuts at the first nested BLOCK. There is no block
inside a person, only spans, so the cut never happens and the whole card is the handle. `bracket`
then drew a second outline around a card that already had a border — which is the
redundant-boundary defect the handle model (`2026-08-05-guide-gesture-semantics.md` §3) exists to
stop, arriving through the one element shape its heuristic cannot see.

## 2. `slots` was refused twice, and the second reason is the one worth keeping

The gesture audit measured the first: **55 of 220 slot x component pairs never match the rendered
DOM**, concentrated on exactly the components that need this. `funnel.stages` says `ol > li` and
the transform emits `<polygon>`; `team-profile.role` says `ul > li > ul > li > code` and the
transform emits `<span class="person-role">`.

The second reason is simpler and does not depend on that number holding: **`slots` answers a
different question.** It describes the Markdown an author writes, so it is a contract with the
author. A handle is a contract with the **renderer**. Those drift apart the moment a component
grows a transform, which is precisely the population that needs a handle.

`density.domSelector` fails the same way for a different reason, and this one was measured here
rather than inherited. It IS a rendered selector and it IS accurate — and the brief's suggested
first step was to make the Guide consume the two declarations that already exist, `kanban`'s
`.kanban-cards > .kanban-card` and `timeline-list`'s `.timeline-spine > .timeline-item`. **It
moves nothing, and the reason is upstream of the Guide entirely**: `chart-narration.js` (§ its
own header comment) gives `kanban`, `timeline-list`, `progress`, `gantt`, `roadmap`, `map`,
`word-cloud` and `piechart` no narrator, so not one cue on those components ever names a card.
Their cues are the slide's heading and eyebrow. A handle there could never fire.

That is the whole distinction in one measurement: `density.domSelector` names **the collection a
word budget counts**; `handles` names **the token that identifies a part**. The two components
that declare the first need none of the second.

## 3. What shipped

**`handles` in the manifest** — an array of `{ part, names, note }`, where `part` is the repeated
rendered element and `names` is the token inside it that says what it is:

```json
"handles": [
  { "part": ".person", "names": ".person-name", "note": "A person is a photo plus three spans; …" }
]
```

**`tools/build-guide-handles.js`** projects every declaration into
`docs/src/components/studio/guide-handles.generated.ts`, prefixing each `part` with
`section.<component> ` so one component's anatomy can never answer for another's. The Guide reads
a generated catalog rather than holding one — the objection round three raised was to Guide
*learning* the component catalog by heart, and reading a generated projection is what
`tools/build-axis-dom-catalog.js` already does for the Fix-Me overlay.

**Two consumers, because the declaration answers two questions.**

- `anchorFor` gains a `part` role, between `marker` and `header`. A `::marker` is a real glyph the
  element renders; "everything before the first nested block" is a guess, and a declaration beats
  a guess.
- `findNamedTarget` is a new LAST tier of `findCueTarget`, after the mark tier. A cue LED by a
  part's own name, as whole words, resolves to that part. Ambiguity resolves to nothing.

**The guard is the mark tier's, minus one.** `findMarkTarget` has two: the label must lead, and
the value must corroborate. A declared token carries no value, so the lead rule and the ambiguity
refusal are the whole defense — which is why the lead is strict (whole words, or a person called
`Al` leads "Already shipped.") and the longest name wins.

**It runs last by construction**, so it cannot change an answer an existing tier already gave.
That is what makes the table below a pure addition rather than a trade, and the role counts prove
it: `marker` and `phrase` are byte-identical across the two runs.

## 4. Measured — one corpus, both runs back to back

187 decks, **10,810 cues in both runs, at `47d0f4e`** (the audit's §7 records what a
before/after straddling a rebase costs: a reported gain that was a re-authored deck, and a corpus
delta 42% too large). The base is quoted because the corpus moves — this pair was re-rendered and
re-run from scratch when #2249 renamed `compare-table` to `table` and re-authored several decks,
rather than quoting the pair taken before it. The renders are shared by both runs and the change
touches nothing that renders, so "the same corpus" is by construction, not by claim.

| | before | after |
|---|---|---|
| corpus resolved | 9,427 (87.2%) | **9,657 (89.3%)** |
| cues where the pointer hides | 1,383 | **1,153** |
| handle `body` | 4,767 | **4,579** |
| handle `part` | — | **421** |
| handle `marker` · `phrase` | 689 · 3,292 | **689 · 3,292** (unchanged) |
| components that LOST a resolution | — | **none** |

| component | cues | before | after |
|---|---|---|---|
| `table` | 325 | 60.9% | **97.8%** |
| `team-profile` | 62 | 46.8% | **100%** |
| `matrix-grid` | 46 | 30.4% | **100%** |
| `obligation-matrix` | 21 | 42.9% | **100%** |
| `roadmap` | 109 | 56.0% | **69.7%** |
| `journey` | 188 | 46.8% | **51.6%** |
| `glossary` | 107 | 94.4% | **100%** |
| `statute-stack` | 79 | 74.7% | **78.5%** |
| `state-chart` | 357 | 63.9% | 63.9% (handle mix `body` 99.6% -> `part` 62.7%) |

`state-chart` is the row that shows the two halves apart: it gains no resolution and **143** of
its cues move from "a wash over the whole node" to "a tap on the node's label". `header` moved
679 -> 676 — three `journey` cues traded an inferred header for a declared one, which is the
priority above working as intended rather than a loss.

**The 421 is two different things and the split matters:** 191 cues whose handle MOVED (188 from
`body`, 3 from `header`) plus 230 cues that were not resolving at all. An earlier draft of this
section said `state-chart` moved 224, from multiplying 62.7% by its 357 CUES instead of its 228
RESOLVED — the table two rows up contradicts it twice over, and an independent check caught it
rather than a reader.

**What the table does not show is that 464 cues get a different VERB.** The handle moving to a
small token changes which gesture fits it: `tap` 801 -> 1,088, `wash` 3,473 -> 3,361, `underline`
3,210 -> 3,262, `circle` 577 -> 585, `bracket` 1,366 -> 1,361, and `fellBack` (the rest position
had to be searched for) 1,987 -> 2,120. That is the intended effect — a name is a small thing and
gets a small verb — but it is the number a reviewer weighing "how it feels" should have.

**This reaches the prose joins the issue scoped out, by a different route.** Route A — an anchor
token threaded out of `projectDeckSpeech` — changes a shared kernel contract the CLI export also
consumes, and it is still the answer for `kpi`, `pricing` and `verdict-grid`. It is not the only
way to reach a composed sentence: `table`'s +120 and `matrix-grid`'s +32 are composed
sentences answered by a row's first cell, with no kernel change at all.

## 5. The acceptance criterion did not survive the measurement, and why that is the useful part

#2251 asked for **12 of the 18 components at `body` 100%** to stop being there. They cannot,
and the reason is that "always resolves to `body`" conflates three situations:

- **Ten of the eighteen are at `body` correctly, because their only cues are the slide heading.**
  `kanban`, `timeline-list`, `progress`, `map`, `heatmap`, `bar`, `bullet`, `line`, `slope`,
  `stacked-bar` — an `<h2>` is one line of words and its own words ARE the handle. There is
  nothing smaller inside it to name, and (per §2) their charts are never spoken about at all.
- **`funnel` is at `body` on a `<polygon>`**, which carries no text: the mark IS the handle, and
  that was #2244's win, not a defect.
- **Only the rest are a handle failure**, and there are far fewer than eighteen of them: across
  all 71 components, **nine** render a part with a name inside it, and all nine now declare one.

So the measure shipped here is the one the maintainer approved in place of it: **every component
that HAS a nameable part gets one (9 of 9, derived from the render, not from a list), the corpus
resolve rate rises, and no component loses a resolution.** All three are a diff of two sweep
runs. The sweep now prints the `body`-only roster as a standing report with the reason most of it
is correct, so the number stays visible without being mistaken for a backlog.

The general lesson is the cheap one: **a roster counted by a mechanism is not a defect list until
someone asks why each row is on it.** Eighteen components were reported as a defect; ten of them
were working.

## 6. The gates, and what each one cannot see

Three arms, because one text matcher cannot answer all three questions.

- **`checkGuideHandles`** (`tools/check-ownership.js`, via `build:check`) — every class a `handles`
  selector names has to be one something under `lib/` writes. The `checkChartMarks` precedent,
  for the `slots` reason. A class-free structural selector (`tbody > tr`) is allowed and
  deliberately so: a transform cannot rename structure, and the render-side arm covers it.
  **Cannot see** whether the `part` ever contains the `names` element at render time — it is a
  text match over sources.
- **`test/unit/components/guide-handles.test.js`, arm 1** — every declared row resolves against
  real rendered DOM, on a surface the component OWNS (its `sample`, its `stressDoc.sample`, its
  gallery), **at both canvas orientations**. Owning the surface is the point: `list-tabular`
  declared a table row and renders a list — a corpus deck had simply put a markdown table on one
  of its slides — and the row was dropped. The orientation half was learned the same way:
  `journey`'s `.journey-vstage` is the portrait board, a landscape-only pass called it
  unverifiable, and dropping it cost 9 real corpus cues for a row that was correct.
- **`test/unit/components/guide-handles.test.js`, arm 2** — the all-or-nothing half, #1945's
  lesson ("a half-enriched catalog is worse than either end state"). It DERIVES the set needing a
  declaration from the render — a part that is repeated, composite, and carries a name — rather
  than pinning a hand-written list of 71 components, so a component added next year is measured
  by the same rule. `SANCTIONED_NO_HANDLE` holds the two deliberate exemptions (`math`'s KaTeX
  internals, `wifi`'s never-cued credential rows) and the gate fails on a stale row. It found
  `statute-stack` while it was being written. **Cannot see** a part that appears only under a
  modifier none of the owned surfaces names, and it recognizes two shapes; a third would need a
  third arm.

**`checkMarkIdentity`** closes the standing fragility the issue named separately. The mark tier
#2244 shipped rests entirely on a convention: **twelve** component transforms emit `data-label` /
`data-value` (the issue said fourteen, from the same loose count that put five non-emitters in
the first ledger), a handful of per-component tests assert them, and nothing cross-cutting checked
that the set holds — so a refactor dropping the attribute would degrade every gesture on that
chart with no test going red. It is a CENSUS rather than a rule, because whether a chart's marks
can carry a label is a property of the chart, not something a gate can derive. It fails three
ways: a listed file that stopped writing the attribute, a file that started without being listed,
and a stale row.

Both gates were verified able to fail: renaming `.person-name` to `.person-nayme` reddens the
first, and rewriting `data-label` to `data-lbl` in `funnel.transform.js` reddens the census.

**The census's matcher had to be fixed before its ledger meant anything, and the fix shrank the
ledger from 18 rows to 13.** The first cut asked `src.includes('data-label')` over whole files,
which fired on a COMMENT — a docblock under `lib/` that merely names the attribute reddened
`build:check` with a message that was false, and a gate that cries wolf is one somebody switches
off. Worse, the ledger had been BUILT with that matcher, so five of its rows were never emitters:
three name the attribute only in prose (`_chart-family/label-drops.js`, `_chart-family/svg-label.js`,
`word-cloud.transform.js`) and two write a DIFFERENT attribute that starts the same way
(`chart-family.js` writes `data-label-drops`, `journey.transform.js` writes `data-label-len`). The
matcher now strips comments, bounds the attribute name, and also sees the `dataset.label` spelling
a substring search misses entirely — each arm fault-injected.

## 6b. What was actually watched, and what was not

The audit's §8 points here for verification, so this section has to carry it rather than gesture
at it.

**Driven on the real Present surface**: `docs/e2e/present-guide-handles.spec.ts` opens the
Studio, sets a roster deck, turns Guide on, plays it, and asserts a Vetrina stroke lands on a
`.person-name` while none wraps the `.person` card. It passes, and it was **verified able to
fail** by disabling `declaredHandle` and rebuilding — it reddens with "no Guide stroke ever
landed on a `.person-name`". It watches the WHOLE playback rather than stopping at the first hit,
because stopping there checks the second assertion over a prefix only.

**Looked at, not just asserted**: the live pointer ringing "Ada Okafor" and then moving to
"Marcus Vale" as the narration advances, captured at 1440, 820 and 390. The gesture the handle
picks for a name is `tap` — a ripple centered on it — with `underline` on the longer names.

**NOT watched, and these are real gaps.** The e2e oracle is geometric: it can say the ink is on
the name and not around the card, and it cannot say the result is GOOD. Nobody has presented a
full deck with Guide on and judged the new cadence end to end, which is the gate the semantics
record calls the one that matters most. Touch is untested — Present on a real phone or tablet is
**UNVERIFIED** from here. And the deployed preview could not be driven from this sandbox at all:
the egress proxy re-terminates TLS with a CA the headless browser rejects, and the documented
remedies do not take, so every real-surface claim here is from a local build of the same source.

**The spec does not gate this PR.** It carries no `@smoke` tag, so the per-PR e2e job skips it and
the nightly runs it — the same arrangement `present-guide.spec.ts` already has. That is a
convention rather than a regression, but it means this PR's strongest artifact is not re-run
before a merge.

## 7. What is still open

- **The prose joins that no rendered token names.** `kpi`, `pricing` and `verdict-grid` compose
  a sentence across elements with no single token leading it.
  Route A is still the answer, and still changes the shared export kernel's contract.
- **`quadrant` and `radar`** put their labels in SVG `<text>`. Roughly 65 corpus cues are
  reachable there, but they are chart marks, so the work overlaps the `data-label` tier rather
  than this one.
- **`diagram` (855 cues — the largest single block of dark cues in the corpus)** is
  Mermaid's own SVG. Its `<g>` elements would answer about 54 of them, but the output is
  third-party and `2026-08-18-post-sanitize-injection-queue.md` records why taking anything back
  out of it needs its own care. Its own card.
- **`logo-wall` (`body` 100%)** renders its items as bare `<li>`s with no class, so there
  is no token to declare. The gate refuses a selector naming a class nothing writes, which is the
  correct refusal: the component needs a classed name token first.
