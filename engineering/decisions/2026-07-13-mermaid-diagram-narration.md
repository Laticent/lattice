---
status: proposed
summary: >
  Design record for the next item in the JS-narration TAIL of the manifest-speech contract
  (2026-07-11-manifest-speech-contract.md §13.2 F-D): a narrator that reads a `diagram`
  slide's Mermaid FLOWCHART topology aloud, instead of the silence it produces today (the
  projection skips the SVG, so a graph narrates to heading + eyebrow only — its nodes and
  edges, the whole substance, are dropped). Names the axes (WHERE the narrator lives, HOW the
  export sees the fence that `rawMd` bakes to SVG before narration, WHICH Mermaid types are in
  scope, HOW topology is phrased) and recommends: a `narrateDiagram` markdown narrator in the
  shared kernel `lib/core/chart-narration.js`, fired on both surfaces by feeding the export a
  FENCE-INTACT section split; scoped to `flowchart`/`graph` only, with a clean null-fallback
  (→ today's heading+caption projection) for the other ~25 Mermaid types and for any parse it
  can't trust. Audio naturalness stays UNVERIFIED (HARD RULE #23); only the spoken STRING is
  claimed. This doc ships no code — it is the design deliverable; implementation is HELD for a
  maintainer go-ahead.
companion:
  - ./2026-07-11-manifest-speech-contract.md
---

# A Mermaid flowchart narrator — reading a `diagram` slide's topology aloud (design, 2026-07-13)

> **Symptom.** A `diagram` slide — a Mermaid flowchart that IS the slide's message ("the
> relationships between nodes carry meaning the audience needs to see"; `diagram.docs.md`) —
> narrates to **its heading and eyebrow only.** Read-aloud/the `.vtt` say *"Boxes and arrows.
> The most-used diagram type."* and then go silent: the nodes, the arrows, the decision
> branches — the entire substance — are never spoken. **Root cause:** the speech projection
> classes `diagram` as a MEDIA component and SKIPS its visual (`prose-projection.mjs`
> `MEDIA_COMPONENTS`, `projectDeckToSpeech` "prose caption only; visual skipped"), and no
> narrator fills the gap (the 5 chart narrators in `lib/core/chart-narration.js` don't cover
> `diagram`). **Decision (this doc):** add ONE narrator — `narrateDiagram` — that reads a
> flowchart's topology from the Mermaid source, shared by both narration producers, scoped
> tight to `flowchart`/`graph` with an honest null-fallback for everything it can't read.

This doc records a design; it ships no code. It is the design deliverable of the request to
narrate the JS-narration tail's diagram bucket, following the design-first rule (write the
model, name the axes, run the adversarial trio on the DESIGN, fold, then STOP for a go-ahead
before coding — HARD RULE #25).

## 1. Where this sits in the contract

The manifest-speech contract (`2026-07-11-manifest-speech-contract.md`) is largely shipped:
Phase 1 (the component-blind normalizer lexicon), Phase 2 (`projectDeckToSpeech` with the
`speakStats`/`speakTable`/`speakQuote`/`speakBigNumber` walkers), Phase 3's first tail item
(state-marker class-readers, §13.4), producer unification (Present narrates the DOM projection,
§13.5), and chart-narration parity (the 5 chart narrators run on BOTH surfaces via the shared
`lib/core/chart-narration.js`, §13.6). What the census (§13.2 **F-D**) explicitly left as the
remaining **JS narration tail**:

> (3) **Dedicated narrators/skip-rules**: math (equation), diagram (mermaid), video (provider).

and §13.4 confirms these are deferred: *"math-equation / mermaid-graph narration, video provider
synthesis … deferred."* This doc takes **one** of those three — **diagram (mermaid)** — per SCOPE
DISCIPLINE (HARD RULE #17: one feature, one branch, one PR) and invariant #5 (*prove one component
end-to-end, verified, before the second*).

**Why diagram over math or video, as the next slice:**
- **Diagram** is the biggest "substance silently dropped" gap: today a graph is **wholly silent**
  beyond its heading. It's genuinely novel (parse Mermaid topology → prose), and it fits the
  existing narrator pattern (a markdown narrator in `chart-narration.js`), so it reuses a proven
  shape rather than inventing one (HARD RULE #15).
- **Math** is the highest-RISK of the three: TeX→speech is an unbounded notation problem
  (fractions, integrals, matrices, Greek, scripts), and a *confidently wrong* equation reading is
  worse than silence — a poor fit for a first slice whose whole point is a verifiable win.
- **Video** is the LOWEST-value and least novel (a URL→provider parse); it's a clean fast-follow
  but doesn't clear the "genuinely novel" bar this design-first process is scaled for.

Diagram is the one where the effort/value/novelty balance lands right for the next slice.

## 2. What exists today (verified against source)

- **The projection skips the diagram visual.** `MEDIA_COMPONENTS` includes `diagram`
  (`prose-projection.mjs:79-82`); `projectDeckToSpeech` routes a media component to
  `speakGeneric` — "prose caption only; visual skipped" (`:703`). `speakGeneric` selects
  `p, ul, ol, dl, blockquote, table, figcaption, h3, h4` (`:622`) — an inline `<svg>` is not on
  that list, so the diagram's rendered SVG is never read. A `diagram` slide therefore narrates:
  eyebrow + heading + any authored prose (a `> note` blockquote), and nothing of the graph.
- **No chart narrator covers it.** `NARRATORS` = `[narrateFunnel, narrateJourneyWeighted,
  narrateRadar, narrateQuadrant, narrateStateChart]` (`chart-narration.js:938-944`);
  `narrateChart` returns null for a `diagram` slide, so both producers fall through to the
  projection above.
- **The Mermaid source is FENCED Markdown, rendered to SVG at build.** A `diagram` slide authors
  a ```` ```mermaid ```` fence (`diagram.docs.md` Slots: *"Fenced ```mermaid block, pre-rendered to
  SVG at build time"*). The engine's `preprocessMermaid` (`lattice-emulator.js:1109-1151`)
  replaces every ```` ```mermaid ```` fence with an inline `<svg>` **before** `rawMd` is built:
  `rawMd = appendAutoGlossary(preprocessMermaid(md))` (`:1161-1162`).
- **The narration producers, and the source each sees.** *(CORRECTED by the trio — §8/F1: there
  are **THREE** producers, not two; the third is projection-only and does not call `narrateChart`
  at all.)*
  - **Live Present:** `narrationAt(i) = … getNote(md) || narrateChart(md) || projection[i] …`
    (`PresentOverlay.tsx:127-141`), where `md` is the Studio's `---`-split editor slide — the raw
    Markdown the user typed, **fence intact.**
  - **CLI/export:** `writeCaptionsSidecar` runs `narrateChart(blocks[i])` where
    `blocks = splitSourceToSections(rawMd)` (`lattice-emulator.js:2851-2862`) — and `rawMd` has
    already had the fence **baked to SVG** by `preprocessMermaid`.
  - **Docs-site caption download (MISSED in the first draft):** `shareCaptions`
    (`share-export.ts:533`) builds its `.vtt` from `mergeNarration(notes, projectSectionsToSpeech(
    sections), …)` (`:581-585`) — the **DOM projection ONLY, no `narrateChart` call.** So it already
    narrates every CHART (funnel/radar/…) heading-only today, and a markdown-narrator diagram fix
    would not reach it either — it has no per-section SOURCE to feed a fence-intact split (it projects
    already-rendered, mermaid-baked section HTML). This is a pre-existing parity gap the §13.6 work
    also excluded, but the "both surfaces / HARD RULE #1" framing below understates it.

**This asymmetry is the design crux for a MARKDOWN-source narrator** (and, per the correction above,
does not even close the third producer). A markdown narrator that reads the ```` ```mermaid ````
fence fires on Present (fence present) but sees only `<svg>…</svg>` on the export (fence gone) —
so the same deck would narrate its diagram richly live and silently in the `.vtt`. That breaks
HARD RULE #1 (both surfaces narrate identically) and would re-open exactly the parity gap §13.6
closed for the other charts. Any design here MUST resolve it, not ship Present-only.

## 3. The axes

### Axis A — WHERE the narrator lives

- **A1. A markdown narrator in `lib/core/chart-narration.js`** (the `narrateFunnel`/`narrateRadar`
  shape). It reads the ```` ```mermaid ```` fence's own grammar (nodes + edges) directly. Pros:
  reuses a proven, adversarially-hardened pattern (`speakLeftover`, `heading`,
  `eyebrowBeforeHeading` are already there); the Mermaid grammar — which is what carries the edges
  — is right there in the fence; rides the existing `narrateChart` → `read-along-core` bundle to
  Present, and the existing `writeCaptionsSidecar` substitution on export. Cons: on the EXPORT it
  needs the fence, which `rawMd` has baked away (Axis B).
- **A2. A DOM/SVG walker in `prose-projection.mjs`** (a `speakDiagram(stage)` reading the rendered
  `<svg>`'s `<text>` nodes). Pros: symmetric by construction (both surfaces project the same
  rendered DOM), no fence problem. Cons: **the SVG does not cleanly encode the graph.** Mermaid's
  output is absolutely-positioned `<g>`/`<path>`/`<text>` with layout coordinates; recovering
  "A → B, labeled 'yes'" from `<path>` geometry + nearest-`<text>` heuristics is fragile and
  exactly the "confidently wrong" hazard the chart narrators were built to avoid. The census
  itself flags this: *"Bespoke SVG `<text>` walker / DSL parser — NO path today"* (§13.1 diagram)
  — i.e. it's an open research problem, not a v1.

**Recommend A1** — read the Mermaid grammar, not the SVG geometry. It's where the edges actually
live, and it reuses the hardened narrator substrate.

### Axis B — HOW the EXPORT sees the fence (resolving the §2 asymmetry)

- **B1. Feed the export a FENCE-INTACT section split.** Today the export narrates
  `splitSourceToSections(rawMd)` (baked). Switch the narration split to a source where the fence
  survives: `splitSourceToSections(appendAutoGlossary(md))` — the ORIGINAL source (fences intact),
  with the auto-glossary slide appended so the section COUNT still matches `rawMd`'s (the
  auto-glossary append is Mermaid-independent). **Key invariant that makes this safe:**
  `preprocessMermaid` only *replaces a fenced block inline with an `<svg>` string* — it adds no
  `---`, no headings, no thematic breaks — so the baked and fence-intact sources have **identical
  section boundaries and counts**, differing only in ```` ```mermaid ```` vs `<svg>`. The 5
  existing chart narrators parse LIST Markdown (funnel stages, radar axes) that the bake never
  touches, so running them on the fence-intact split is behavior-identical. Only `narrateDiagram`
  reads the fence. Pros: one small, verifiable wiring change; makes the export's narration source
  *closer* to Present's fence-intact model (a parity improvement, not a regression). Cons: it
  touches the shared chart-narration export path → maker-checker applies; the parity test
  (`chart-narration-export-parity.test.js`) must still hold (block count == section count).
- **B2. Present-only for v1** (accept the asymmetry, log it). Rejected: it directly violates
  HARD RULE #1 and re-opens the §13.6 parity gap the contract worked to close — a diagram would
  narrate live but be silent in the exported `.vtt`. Not acceptable as a shipped slice.
- **B3. Narrate the export diagram from the baked SVG** (A2 on export only). Rejected for A2's
  reasons AND because it would make the two surfaces narrate the same diagram by two DIFFERENT
  code paths — the exact drift HARD RULE #1 exists to prevent.

**Recommend B1** — one fence-intact split, all narrators run on it, verified equivalent for the
existing 5.

### Axis C — WHICH Mermaid types are in scope

Mermaid has ~26 diagram types (the gallery enumerates them: flowchart, sequence, class, state, ER,
journey, gantt, pie, quadrant, requirement, gitgraph, c4, mindmap, timeline, zenuml, sankey,
xychart, block, packet, kanban, architecture, radar, treemap, venn, ishikawa, treeView). Each has
its own grammar.

- **C1. `flowchart` / `graph` ONLY** (v1). These are THE documented, dominant diagram type
  ("Boxes and arrows. The most-used diagram type"; the flowchart is `diagram.docs.md`'s canonical
  example). Their node/edge grammar is bounded and well-specified. Every other type → **null**,
  which falls cleanly to today's projection (heading + eyebrow + caption) — no regression, just
  "not yet richer." Pros: tight, verifiable, honest; the highest-frequency type first.
- **C2. flowchart + a second type (e.g. `stateDiagram`)**. Rejected for v1: `stateDiagram` overlaps
  conceptually with the existing `state-chart` COMPONENT narrator (confusing to duplicate), and
  each added grammar multiplies the parse surface and the "confidently wrong" risk. A fast-follow,
  not v1.
- **C3. Generic "read every node label"** for all types. Rejected: a node-label bag with no edges
  is noise for most types (a sequence diagram's participants, a class diagram's members) and
  actively misleading for spatial ones — worse than the honest "see the slide" silence.

**Recommend C1** — `flowchart`/`graph` only; null-fallback (→ projection) for the other ~25 and
for any flowchart the parser can't trust.

### Axis D — HOW topology is phrased (the spoken string)

The narrator REPLACES the base narration for its slide (the `narrateChart` contract): it speaks
eyebrow + heading + topology + any leftover prose (via the existing `speakLeftover`, so an authored
`> note` blockquote is never dropped — invariant #1, "never say less than `slideToSpeech`").

Topology phrasing (targets, not verified audio — §5):
- **Title.** Mermaid's own `--- \n title: X \n ---` in-fence frontmatter (present in the gallery
  samples) → *"A flowchart: X."*; absent → *"A flowchart."* (a short frame so an eyes-free
  listener knows a graph is being described).
- **Edges are the substance.** `A --> B` → *"A leads to B"* (by node LABEL, not id). An edge label
  (`A -->|scored signal| B`, `A -- text --> B`) → *"A, scored signal, leads to B."* Group a node's
  multiple out-edges for natural intonation (reuse `coordinate`/`joinWithAnd`): *"From the scoring
  model: a scored signal leads to the decision log; a recalibration loops back to it."*
- **Node shapes** (`[]` rect, `()` round, `{}` decision/diamond, `(())` circle, `{{}}` hexagon,
  `([])` stadium, `[()]` cylinder/store, `>]` flag) carry light semantics. v1 reads the LABEL only
  (shape → prose is a logged refinement); a decision diamond's branches are already conveyed by its
  labeled out-edges ("yes"/"no").
- **Self-loops / cycles** (`A -.-> A`, back-edges) read literally as edges — no cycle detection in
  v1 (a diagram is a graph; "loops back to" falls out of the edge reading).
- **Subgraphs** (`subgraph title … end`): v1 acknowledges the group as context (*"In the group
  Ingest: …"*) and still narrates its edges; nested-subgraph elegance is a logged refinement.
- **Return null when there are no readable EDGES** (a node-only or unparseable flowchart) — a bag
  of node names with no relations is weak; better to fall to the projection. (An edge is the whole
  reason a flowchart isn't a list.)

## 4. Recommended plan (the slice)

**One narrator, shared kernel, both surfaces, flowchart-scoped.**

1. **`narrateDiagram(markdown)` in `lib/core/chart-narration.js`.** Gate on `_class: diagram` +
   a ```` ```mermaid ```` fence whose first meaningful line is `flowchart`/`graph`. Parse the
   fence's in-fence frontmatter title, nodes (id→label, all shape delimiters), and edges (all
   arrow forms + optional edge label). Emit eyebrow + heading + topology + `speakLeftover`. Return
   null for any non-flowchart type, an empty/uparseable graph, or a graph with no edges. **It must
   NOT run `withoutFences`** (which blanks fenced bodies) — it EXTRACTS the ```` ```mermaid ````
   fence instead; a doc-example fence (a slide teaching Mermaid inside a ```` ```markdown ````
   fence) is guarded the same conservative way the other narrators guard fenced examples.
   Add it to `NARRATORS`.
2. **Export parity — the fence-intact split (Axis B1).** In `writeCaptionsSidecar`, derive the
   narration blocks from a fence-intact source (`splitSourceToSections(appendAutoGlossary(md))`)
   rather than `rawMd`. Verified equivalent for the existing 5 narrators (they don't read the
   fence) and required for `narrateDiagram`. The count guard + per-slide try/catch stay.
3. **Rebuild the `read-along-core` bundle** so Present's `narrateChart` import picks up
   `narrateDiagram` (`npm run read-along-core:build`; and `cadenza-lib:build`/`emulator:build`
   if their inputs move — they don't here).
4. **Demo deck (HARD RULE #9)** `examples/diagram-narration.md` (+ committed `.pdf`, 6–10 slides):
   a signal-pipeline flowchart, a decision-branch flowchart, an edge-labeled flow, a subgraph, and
   a non-flowchart type (sequence) that correctly falls back to heading+caption — so the demo shows
   BOTH the rich reading and the honest fallback.
5. **Docs + CHANGELOG in the same change (HARD RULE #6/#10).** Update
   `2026-07-11-manifest-speech-contract.md`'s tail scoping (§13.4 deferral → this ships the diagram
   item) and note it in `CHANGELOG.md` `## Unreleased`.

## 5. Verification honesty (HARD RULE #23)

- **Claimed (verifiable):** the display→spoken STRING. Unit tests in
  `test/unit/core/chart-narration.test.js` pin `narrateDiagram`'s output on real flowchart fixtures
  (edges, edge labels, decision branches, the in-fence title, a subgraph) AND its null-fallback on
  each non-flowchart type. An export-parity test renders the demo through the REAL engine and
  asserts the fence-intact split still aligns 1:1 with rendered sections (extending
  `chart-narration-export-parity.test.js`) and that the diagram slide's `.vtt` cue carries the
  topology. The end-to-end `.vtt` is produced via the real CLI (`node lattice-emulator.js …
  --captions`).
- **UNVERIFIED:** audio naturalness — no Kokoro/TTS in this sandbox. Whether "A leads to B" *sounds*
  right on a real voice is never claimed. Real-browser Studio Present is also UNVERIFIED here
  (sandbox blocks egress); the shared kernel guarantees Present's spoken STRING is identical to the
  CLI's, which IS verified.

## 6. Scope boundary — what this deliberately does NOT do (HARD RULE #17/#18)

- **Not math, not video.** Both remain in the tail (§13.4); this is one slice.
- **Not the other ~25 Mermaid types.** sequence/class/state/ER/gantt/pie/… fall back to
  heading+caption (no regression). Logged as fast-follows.
- **Not node-shape semantics, nested-subgraph phrasing, or cycle detection** — v1 reads labels +
  edges + edge labels + one subgraph level; the rest are logged refinements.
- **Not the SVG-walker research path (A2).** Recovering topology from baked SVG geometry is an open
  problem; logged, not attempted.

## 7. Open questions for the maintainer (the go-ahead gate)

1. **Slice choice** — is **diagram (mermaid flowchart)** the right next tail item, or would you
   rather I take **video** (smaller, lower-risk, less novel) or **math** (highest-value, highest-
   risk) first?
2. **Flowchart-only v1** — OK to null-fallback the other ~25 Mermaid types to today's
   heading+caption (rich reading for flowchart/graph only), or do you want a second type
   (e.g. sequence) in the first PR?
3. **Export wiring** — comfortable with switching the export's narration split to the fence-intact
   source (Axis B1, verified equivalent for the existing chart narrators), which is the parity fix
   that lets the diagram narrate identically on both surfaces?

**No code ships until you answer.** This doc is the round's deliverable; on a go-ahead I implement
the slice, then run the adversarial trio again on the shipping diff (HARD RULE #25).

---

## 8. Adversarial trio on this design — findings, resolutions, and a FLIPPED recommendation (2026-07-13)

Per HARD RULE #25, three independent agents (red team + Munger inversion + independent checker),
blind to each other, verified §1–§7 against source. The checker found the factual claims sound
(**0 FALSE, 1 PARTLY** — an abbreviated `narrationAt` formula, not load-bearing). The red team and
inversion converged on findings that **do not merely harden the diagram slice — they change which
slice ships first.** The corrected synthesis:

### 8.1 Findings (convergent; each verified against source before folding)

- **F1 (HIGH, red team + checker) — a THIRD narration producer exists and is projection-only.**
  `share-export.ts` `shareCaptions` (the docs-site "Download captions") narrates
  `mergeNarration(notes, projectSectionsToSpeech(sections), …)` (`:581-585`) — **no `narrateChart`
  call**, and no per-section source to feed a fence-intact split. §2's "two producers" was wrong.
  A markdown-source diagram narrator (Axis A1/B1) reaches Present + the CLI export but **not**
  `shareCaptions`, which keeps narrating diagrams (and, already today, every chart) heading-only.
  So the design's own HARD RULE #1 parity goal is not met by the diagram plan without additional
  `shareCaptions` wiring it never scoped.
- **F2 (HIGH, inversion + red team) — the null-fallback bar is far too weak; the hazard is
  *mis-read* edges, not *absent* edges.** Standard flowchart grammar the Axis-D phrasing never
  models — `&` fan-out (`A & B --> C`), chained edges (`A --> B --> C` on one line), undirected
  `A --- B`, reversed/bidirectional `A <-- B` / `A <--> B`, terminator variants `--x`/`--o`, `%%`
  comments, quoted labels containing arrow text, and id-only (no-label) nodes — all yield *readable
  edges*, so "no edges → null" does not fire, and the narrator speaks **confidently-wrong topology
  (inverted direction, dropped/merged nodes)** — worse than the silence the slice exists to fix,
  and the exact hazard the doc invokes to reject math (§1) and the SVG-walker (Axis A2).
- **F3 (HIGH, red team + inversion) — skipping `withoutFences` risks reading raw Mermaid aloud, and
  the "guarded like the other narrators" claim is self-contradictory.** `speakLeftover` speaks every
  unconsumed line; the five narrators avoid leaking fence bodies *only because* they call
  `withoutFences` first — the very mechanism §4.1 forbids. And that mechanism is *also* the
  doc-example guard §4.1 claims to inherit (`narrateStateChart` was patched for exactly a
  fenced-example-above-the-real-chart slide; `diagram.docs.md` authors that shape). So the design
  removed its own guard and its own fence-leak protection in one sentence.
- **F4 (MEDIUM, inversion + red team) — label internals reach the voice raw.** Node labels carry
  arbitrary text — `<br/>`, entity-encoded `&amp;`, raw `→`/`%`, `Ratio 16:9` (a mid-token colon the
  cadenza softener does NOT catch without a following space). Axis D says only "reads the LABEL"; it
  never specifies the emphasis/link/quote scrub the funnel/radar parsers apply, nor a rule to emit
  whitespace after every generated `:`/`;`.
- **F5 (MEDIUM, red team; inversion concurs) — Axis B1's "identical boundaries" is asserted,
  untested, and mis-blames the safe path.** The parity test carries **zero** mermaid decks. The
  reviewers actually reversed the risk: a `​```mermaid` fence is an *opaque* markdown-it token, while
  the BAKED replacement is a multi-line `<div><svg>…</svg></div>` html_block that terminates at the
  first blank line — so the fence-intact split is *safer*, and the count guard (fails closed to
  heading-only, never to misalignment) is the real protection. The claim to fix: say "the count
  guard protects it; ship a mermaid-covering parity test," not "identical by construction."
- **F6 (MEDIUM) — the test plan is happy-path only.** It lists edges/labels/branches/title/subgraph
  + per-type null-fallback, but **none** of F2's adversarial inputs — so a fixture written by the
  parser's author would pass green against exactly the cases that bite (verification theater).
- **F1-blast-radius (LOW — reviewers converged AGAINST the inversion's worry):** switching the
  export narration split to `appendAutoGlossary(md)` is byte-identical to `rawMd` on every
  non-mermaid deck (`preprocessMermaid` is a no-op there), so the five shipped narrators and the
  existing parity decks are unaffected; `md` is module-scoped and reachable in `writeCaptionsSidecar`
  (`:447`), and `appendAutoGlossary` appends the same slide count regardless of baking (front-matter-
  driven). So Axis B1 itself is *feasible and low-risk* — its problem is F1 (it still misses the
  third producer) and F5 (untested), not blast radius.

### 8.2 The flip — VIDEO is the disciplined first slice; diagram is the designed second

F1 is decisive when read against invariant #5 (*prove one component end-to-end, verified, cheaply,
first*) and HARD RULE #1 (*all surfaces narrate identically*):

- A **video** narrator is a `speakVideo(stage)` walker **inside `projectDeckToSpeech`** — the DOM
  projection that **all three** producers already call (Present via `narration-projection.ts`, the
  CLI via `projectDeckSpeechFromHtml`, and `shareCaptions` via `projectSectionsToSpeech`). So it is
  **symmetric across every surface by construction, with ONE walker**: no fence problem, no
  export-split change, no `narrateChart` wiring, and — because provider is a deterministic URL parse
  — **no confidently-wrong-topology and no fence-leak risk** (F2/F3/F4 simply do not arise). It
  directly delivers census F-D.3 (video provider synthesis) + F-C (skip the poster/QR, inject the
  provider) + F-E (URL/routing-pill suppression), and it is the *cheapest verifiable win* the tail
  offers.
- **Diagram** remains the higher-*value* gap (a graph is wholly silent today) and is genuinely
  novel — but the trio shows it needs: a conservative recognized-subset parser that **bails to null
  on any unrecognized arrow/edge/fan-out/multi-node/comment form** (F2), a `withoutFences`-blanked
  leftover pass + render-faithful fence extraction (F3), label-internal scrubbing (F4), a
  mermaid-covering parity test (F5/F6), AND a decision on the third producer (F1: either wire
  `narrateChart` into `shareCaptions` — which needs giving it a fence-intact per-section source it
  lacks — or scope it out with the parity consequence stated). That is a meatier, riskier slice that
  should follow, once the tail's mechanics are proven on the symmetric video slice.

**Corrected recommendation: ship the VIDEO narrator first** (symmetric-by-construction, no new
hazards, proves the tail cheaply), and take **diagram second** with the F2–F6 hardening designed in
and the F1 third-producer question answered. This is the same shape as the parent contract's own
§11, where the trio flipped the recommendation after the fact — the adversarial pass is doing
exactly its job. The slice order is the maintainer's call (open question #1), now made with the
trio's evidence in hand.

### 8.3 If diagram is chosen first anyway — the mandatory hardening

Should the maintainer prefer diagram first (its value is real), these are non-negotiable, folded
from the trio: (i) parse only a **conservative recognized subset**, bail to **null** on ANY
unrecognized grammar (never guess an edge); (ii) extract the rendered `​```mermaid` fence with the
**same regex `preprocessMermaid` uses** (render-faithful) and run the leftover pass on
`withoutFences(md)` so no fence line can leak; (iii) strip quotes + scrub label internals + emit
whitespace after every generated `:`/`;`; (iv) ship a **mermaid-covering export-parity test** and
**adversarial fixtures** (reversed/undirected/chained/`&`/`%%`/quoted-arrow) asserting each either
parses correctly OR null-falls-back — never confidently wrong; (v) decide the **third producer**
(wire or scope-out, consequence stated). Video does not carry (i)–(v) at all.

### 8.4 Open questions for the maintainer — REVISED (the go-ahead gate)

1. **Slice order.** Trio-recommended: **video first** (symmetric across all three producers, no
   fence/topology/leak hazards, cheapest verifiable win), **diagram second** (higher value, needs
   §8.3 hardening + the third-producer decision). Or: diagram first anyway (value-led), with §8.3
   mandatory? Or: math (highest value, highest risk) — not recommended first.
2. **The third producer (`shareCaptions`).** For whichever slice: is bringing the docs-site caption
   download into parity in-scope, or explicitly out-of-scope-with-consequence-stated for this PR?
   (Video reaches it for free; diagram does not.)
3. **Diagram scope, when it comes.** Flowchart/`graph` only with null-fallback for the other ~25
   Mermaid types — confirm, or want a second type (sequence) in that PR?

**No code ships until you answer.** On a go-ahead I implement the chosen slice, then run the
adversarial trio again on the shipping diff (HARD RULE #25).
