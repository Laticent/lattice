---
status: shipped
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

---

## 9. SHIPPED (2026-07-14) — diagram first (owner pick), with the §8.3 hardening

The maintainer chose **diagram first** (open question #1, option B) over the trio's video-first
recommendation, and left the third producer to the tight-PR default. Built accordingly:

- **`narrateDiagram` (`lib/core/chart-narration.js`)** — reads a `diagram` slide's Mermaid flowchart
  from the SOURCE fence: eyebrow + heading + `"A flowchart[, title]."` + one spoken step per forward
  edge (edge labels as clauses, chained edges split), then any authored prose via `speakLeftover`.
  Added to `NARRATORS`, so both producers route it through `narrateChart`. All §8.3 hardening landed:
  - **(i) Bail-not-guess.** A conservative recognized grammar (`id[Label]`-shape nodes; FORWARD
    `-->`/`-.->`/`==>` with pipe/inline-text/chained forms). ANY unrecognized construct — a
    non-flowchart type, undirected `---`, reversed `<--`, terminator `--x`/`--o`, `&` fan-out, class
    shorthand, a node-only graph — returns null → the heading-only projection (today's behavior). No
    confidently-wrong topology.
  - **(ii) No source leak / no fenced-heading confusion.** Topology is read from the RAW fence (the
    same `/```mermaid\n…```/` match `preprocessMermaid` renders), but heading/eyebrow/leftover run on
    `withoutFences(markdown)` — the fence BLANKED — so no Mermaid line reaches the voice and a fenced
    doc-example `##` can't masquerade as the slide heading.
  - **(iii) Label scrub** — quote-strip + `<br>`→pause + emphasis/link/backtick drop, mirroring the
    funnel/radar scrub; units/glyphs left to the shared cadenza say-as layer.
- **Export parity (Axis B1).** `writeCaptionsSidecar` now splits `appendAutoGlossary(md)` (fence
  intact) instead of `rawMd` (mermaid baked to SVG), so the fence survives to `narrateChart` on the
  export exactly as it does live. Verified byte-neutral for the 5 existing narrators (they parse list
  Markdown the bake never touches) and boundary-neutral for the split (a `​```mermaid` fence is an
  opaque token — it emits no stray `hr`/heading).
- **Bundle.** `read-along-core` rebuilt so Present's `narrateChart` import carries `narrateDiagram`.
- **Demo deck** `examples/diagram-narration.md` (+ committed `.pdf`): labeled flow, decision branch,
  chained + dotted feedback, subgraph, and a sequence diagram showing the honest fallback.

**Third producer (`shareCaptions`) — scoped out, consequence stated** (the tight-PR default, HARD
RULE #17). It stays projection-only, so it narrates diagrams (and, already, every chart) heading-only;
tracked as a follow-up, recorded in the CHANGELOG and §13.4 of the parent contract.

**Verification (HARD RULE #23).** Spoken STRING is claimed and pinned: `chart-narration.test.js` (real
flowcharts + the full adversarial null-fallback set — reversed/undirected/terminator/`&`/class-
shorthand/non-flowchart types/node-only) and `chart-narration-export-parity.test.js` (a mermaid deck:
the fence does not shift the 1:1 section alignment, the flowchart narrates on the export split, a
sequence type defers). End-to-end on the REAL CLI: `node lattice-emulator.js examples/diagram-narration.md
--captions` produced `.vtt`s carrying the topology on the flowchart slides and a clean heading+caption
(no source leak) on the sequence slide. **UNVERIFIED:** audio naturalness (no TTS in CI); real-browser
Studio Present (sandbox blocks egress) — the shared kernel makes its spoken string identical to the
CLI's, which is verified.

*Logged off-path follow-ups (HARD RULE #18):* the other ~25 Mermaid types (sequence/class/state/ER/
gantt/pie/…); node-shape semantics and nested-subgraph phrasing; and the `shareCaptions` third-producer
parity gap. Each is a separate slice, not pulled into this PR.

---

## 10. Reworked reading — describe the graph as a FLOW, not an edge dump (2026-07-14)

Maintainer feedback on the shipped §9 reading: *"this is not how architecture diagrams are read."*
Correct — §9 emitted one sentence PER EDGE in source order ("A leads to B. A leads to C. A leads to
D."), which repeats the verb, ignores structure, and explodes a fan-out into identical stubs. A person
walks a diagram as a **flow**: from the entry, following the path, grouping branches, closing at the
stores. Presented three reading models (grouped-adjacency, +structural-lead, full flow-path) with
concrete before/after on a moderate architecture; the maintainer picked **full flow-path**.

**Shipped model (`renderFlowNarrative` + `renderGroupedNarrative` in `lib/core/chart-narration.js`).**
The parser (`parseFlowchart`) now returns the graph by ID (`{nodes, edges}`); the renderers analyze it:
- **Flow reading (DAG with ≥1 entry).** Topological walk from the entry nodes (`topoSort`, stable by
  first-appearance): **coalesce a linear chain** (single-out → single-in) into "A leads to B, then C";
  **group a fan-out** (out-degree ≥2) into "D fans out to X, Y, and Z"; fold each edge **label** in as
  a faithful adverbial clause; **close** with "The flow ends at ‹terminals›" (out-degree-0 nodes).
- **Grouped fallback (cycle, or no entry).** `topoSort` returns null on a cycle → a neutral,
  order-faithful per-source reading ("Draft leads to Review. Review leads to Publish. Publish leads to
  Draft."). This is the "bail rather than guess" discipline applied to READING ORDER: a cyclic graph
  has no honest entry→exit order, so the narrator does not impute one.

**The honesty line (why not the literal Option-C preview).** The presented flow-path preview took the
liberty of inventing edge verbs — "Auth *writes to* the User DB", "Search *reads from* the cache" — for
UNLABELED arrows. Those verbs are nowhere in the diagram; shipping them would be exactly the
confidently-wrong this narrator exists to avoid. So the shipped reading drives naturalness from
**structure** (enters/chain/fans-out/ends) + the **authored labels** only; an unlabeled edge stays a
neutral "leads to". Structural cues that ARE faithful — "fans out to" (out-degree ≥2), "the flow ends
at" (out-degree 0) — are used; imputed data-flow verbs are not.

*Verification:* `chart-narration.test.js` gains flow cases (chain coalescing, fan-out grouping, decision
labels, terminal framing, and a cyclic graph → grouped fallback with no "fans out"/"flow ends"); the
existing bail/ReDoS/leak cases are unchanged. The `examples/diagram-narration.md` demo + its `.vtt` are
regenerated (one slide now showcases the cycle → grouped fallback). *Deferred (logged):* fan-IN
coalescing ("Auth and Orders both lead to the User DB"), de-duping parallel edges to the same target,
and a size cap/summary for very large graphs. Audio remains UNVERIFIED (HARD RULE #23).

### 10.1 Adversarial trio on the flow reading — findings folded (2026-07-14)

The flow rework (§10) got the full trio (red team + Munger inversion + independent checker). Checker:
8/8 sound — correct, deterministic, both-surfaces-identical, faithful (no invented verbs). Red team +
inversion found four real quality defects, all folded before merge:

- **Labeled fan-out was an un-disambiguable comma list (Munger, CRITICAL).** "Triage fans out to Page
  on-call, p0, Create ticket, p1, …" — the comma between a target and its label was indistinguishable
  from the comma between branches; on a decision diamond (the shape a flowchart exists for) this was a
  regression vs the per-edge form. **Fix:** any labeled branch now renders as "From X: on ‹label›, leads
  to ‹target›; …" — each branch a verb-bound clause, semicolon-separated. Pure-unlabeled fan-outs keep
  the clean "fans out to A, B, and C".
- **One feedback edge collapsed the whole flow to grouped (Munger, HIGH).** `topoSort` returned null on
  ANY cycle, so a clean pipeline with a single retry edge lost all flow framing. **Fix:** DFS `backEdges`
  removes the feedback arcs to get a DAG, the flow walks that, and the arcs narrate as "V, retry, loops
  back to I" — which also restores the cycle signal a grouped dump erased. A pure cycle now reads as a
  flow + a loop-back instead of a neutral dump.
- **An orphan node was a false flow terminal (red team, WORST).** A floating `Z[Legend only]` (in = out =
  0) was swept into "The flow ends at B and Legend only" — confidently-wrong topology about a node the
  narration never introduced. **Fix:** a terminal is a REACHED sink (out-degree 0 AND in-degree > 0); an
  orphan is excluded and never mentioned (its label lives only in the blanked fence).
- **Parallel edges read as "B and B" (red team, MEDIUM).** Two edges A→B narrated as two destinations.
  **Fix:** `analyzeGraph` dedupes parallel edges to one target, merging their labels.

*The org-chart caveat (Munger, logged not fixed):* the frame — "fans out to", "the flow ends at" — is
imposed on any `flowchart`/`graph`, so a hierarchy or dependency graph drawn as a flowchart is read with
process verbs. Each structural fact stays TRUE (a node with ≥2 out-edges does fan out; an out-degree-0
node is a leaf); only the *framing* assumes a process. Detecting "is this a process flow?" is fragile, so
this is an accepted limitation, not a fabrication. Tests cover the four fixes (decision disambiguation,
feedback loop-back, pure-cycle flow, orphan-not-terminal + parallel-dedupe); `renderGroupedNarrative` is
now a defensive belt-and-suspenders fallback (back-edge removal makes the flow reader always succeed).

## 11. Labels read faithfully as verbs, de-repetition by STRUCTURE (2026-07-14)

Maintainer feedback on the §10 flow reading: *"when I read an architecture diagram it's not 'leads to'
but 'connects' or 'uses' or 'relies on'; avoid repetition, I switch it up; two concurrent usages want a
'which X'."* Plus an explicit ask for **domain experts** on flowchart-reading semantics and a fresh
**adversarial trio**. Three experts (software architect, plain-language editor, accessibility/BLV
specialist) converged on one principle — **DECLARE, DON'T SNIFF**: contextual verbs come ONLY from the
author's edge LABEL (ground truth), never inferred; the listener's variety and de-repetition come from
TOPOLOGICAL STRUCTURE (chain / fan-out / fan-in / loop / overview), *not* from rotating the relation verb
(a varied verb implies a varied relationship the diagram never stated — fabrication through the
prose-polish door).

**Two maintainer decisions (one `AskUserQuestion` round).**
- **Q1 — where do richer verbs come from? → "From edge labels."** A labeled edge reads the author's word
  AS the connective ("app relies on core-lib"); an UNLABELED edge stays the neutral "leads to". The
  narrator never invents "uses/relies on" for a bare arrow — that can INVERT a dependency (on `A → B` in a
  dependency graph, B is the prerequisite), the exact confidently-wrong this narrator exists to avoid.
- **Q2 — which de-repetition moves? → "①②③ + ④ overview":** ① the fork is its own sentence (no ", which"
  hinge); ② fan-IN coalesces ("Auth and Orders both lead to User DB"); ③ tighter heard-once sentences;
  ④ a gated topological overview ("It begins at X and ends at Y").

**The adversarial trio then hammered the shipping diff and found the design's own premise too broad —
folded before merge:**
- **Label-as-verb assumed EVERY label is a verb (all three, CRITICAL — the one inversion).** Real edge
  labels are dominated by NOUNS, codes, cadences, versions, slashed fragments (`data`, `HTTP 200`,
  `nightly`, `v2`, `decide / close`). Reading those as verbs ("Producer data Consumer") is a broken
  non-sentence — *worse* than the appositive it replaced, and the demo fixture exhibited it. **Fix:** a
  label is spoken three ways by GRAMMAR, biased to precision — a recognized VERB or verb+preposition
  (`isVerbLabel`: a curated `EDGE_VERBS` set + a preposition-as-second-word test) → "A calls B"; a branch
  CONDITION (`isCondition`) → "on yes, leads to B"; **anything else → the grammatical APPOSITIVE "A,
  ‹label›, leads to B"**, valid for any noun/code label. A false "verb" is broken prose; a missed verb is
  only the slightly-wordy-but-valid appositive — so the unknown defaults to the appositive.
- **`pluralizeVerb` emitted non-words (all three, the worst fan-in defect).** The lazy trailing-`s` strip
  turned `processes`→"processe", `is`→"i", `has`→"ha" — misspeaking the author's own label on the very
  fan-in feature it powers. **Fix:** a real 3rd-person-singular→base conjugator (irregulars `is`→"are"/
  `has`→"have"; `-sses`/`-shes`/`-ches`/`-xes`/`-zes`/`-oes`→strip `es`; `-ies`→`y`; else strip a lone
  `-s`, keeping `-ss`).
- **`isCondition` was source-dependent and inconsistent (red team).** The "source ends in `?`" rule turned
  a VERB label on a question node into a false condition ("FAQ?, on answers, leads to"), and the fan-in vs
  fan-out paths called it with different `srcLabel`s → the SAME label classified two ways. **Fix:**
  classification is now LABEL-ONLY, so both paths agree and a verb on a `?`-named node reads faithfully.
- **The overview restated the walk (Munger).** The `nNodes ≥ 7` trigger fired on a 7-node linear chain and
  a lone fan-out, duplicating the very next sentence. **Fix:** the gate is now `entries > 1 || (branch &&
  (merge || loop))` — an overview only where the shape can't be reconstructed from a single walk sentence.
- **Doubled `?.` (red team + Munger).** The chain builder appended a bare `.`, so a node label ending in
  `?` doubled ("Within policy?."). **Fix:** every sentence push routes through `terminate()`.
- **Fan-in never coalesces a CONDITION or a NOUN label** ("both on yes V" / "both data V" would break) —
  only unlabeled ("both lead to") or verb ("both depend on") relations merge; the rest read their own
  sentence. Back-edges read the same three ways (condition / verb / appositive).

*Verification:* `chart-narration.test.js` gains coverage the trio flagged as absent — verb-as-connective,
noun→appositive, label-only condition classification, fan-in coalesce (unlabeled + verb + `all` for 3+),
`pluralizeVerb` on sibilant/`-es`/`-ies` verbs, condition-fan-in-not-coalesced, and the gated overview
(fires on a diamond, silent on a chain/fan-out, names a loop). The `examples/diagram-narration.md` demo is
rebuilt to SHOWCASE the range (labeled architecture → verbs; dependency graph → fan-in merge; noun labels
→ appositive; decision; feedback loop; overview; honest sequence fallback) with `.pdf`/`.vtt` regenerated.
Both surfaces stay identical (the export split is fence-intact); audio remains UNVERIFIED (HARD RULE #23) —
only the spoken STRING is asserted.

**Second trio pass on the shipping diff — three fold-introduced regressions caught + fixed.** The three
verifiers re-ran (warm) against the folded code and confirmed all prior findings resolved with no drops /
double-narration, bail-safe, deterministic. Three NEW defects the fold itself introduced, each found by
running the actual code, were fixed before push:
- **`isVerbLabel`'s verb+preposition branch didn't gate the FIRST word on `EDGE_VERBS`** (red team +
  Munger, convergent) — so a NOUN + preposition ("request to", "response to", "part of", "access to")
  read as a verb ("Gateway response to Client", and "both response to Client" on the fan-in), re-opening
  the exact broken non-sentence the appositive was added to prevent, on the very common request/response
  deck. **Fix:** the multi-word branch now requires `EDGE_VERBS.has(words[0])`, symmetric with the
  single-word branch — every real verb+particle phrase's verb (`reads`, `writes`, `depends`, `connects`,
  `ingests`, `loads`, `publishes`) is already in the set, so the gate costs nothing.
- **Four push sites bypassed `say()`/`terminate()`** (the three back-edge branches + the "The flow ends
  at …" terminal line) — so a terminal or loop-target label ending in `?`/`.` doubled its punctuation
  ("The flow ends at Resolved?.", "loops back to Ready?."). **Fix:** all four route through `say()` now,
  so the doubled-terminal guard is universal.
- **`pluralizeVerb` mis-conjugated silent-`e` / `-ize` stems** (independent checker, from a full scan of
  all 128 `EDGE_VERBS`) — the `-sses`/`-ches`/`-zes`→strip-`es` rule over-stripped `caches`→"cach",
  `authorizes`→"authoriz", `normalizes`→"normaliz" (their 3rd-person adds only `s`). **Fix:** an
  `-ize`/`-ise`/`-yze`→`e` rule and a `caches`→`cache` case precede the sibilant strip; a scan of the full
  set now conjugates every curated verb cleanly. Tests cover all three regressions.
