---
status: in-progress
summary: >
  Design for extending read-aloud narration from Mermaid FLOWCHARTS (shipped: the walk #971
  + the gist #991) to the WHOLE Mermaid family (~22 remaining types). Grounded in per-type
  authoring grammar researched from the official Mermaid docs. Names a 4-tier narratability
  taxonomy (STRUCTURAL / TEMPORAL-SCRIPT / DATA / SPATIAL-HARD), the central "authored-verb
  faithfulness asymmetry" (for typed-relationship diagrams a symbol's meaning is Mermaid-DEFINED,
  so speaking it as a verb is faithful — unlike a flowchart's banned invented verbs), the shared
  never-invent invariants, a type-token dispatch over the existing `chart-narration.js`
  scaffolding, the summarize-vs-enumerate rule for firehose charts, a reuse map, the honest
  whole-type BAILS (zenuml / block / packet, + architecture edges), and a one-narrator-per-PR
  rollout. The adversarial trio (§12) then CUT the scope: apply the manifest bar ("narrate only
  when the render computes a fact the text doesn't say") and most types are transcription → the
  reshaped scope is a ~6-narrator FIRST WAVE (sequence, state, class, ER, C4, pie; radar as a
  fast-follow), with the rest bailed or deferred. Ships NO code — the design deliverable, HELD for
  a maintainer go-ahead after the trio (HARD RULE #25). §12 supersedes the §1/§8/§9 scope.
companion:
  - ./2026-07-13-mermaid-diagram-narration.md
  - ./2026-07-11-manifest-speech-contract.md
---

# Narrating the Mermaid family — a faithful, tiered, bail-safe design (2026-07-14)

> **Where this sits.** Read-aloud narrates a `diagram` slide's Mermaid FLOWCHART today: the
> topology WALK (#971) + a lean shape GIST (#991). Every OTHER Mermaid type — the current family
> is ~30 types — still `null`-falls-back to a heading-only caption (`parseFlowchart` bails unless
> the first keyword is `flowchart`/`graph`). This doc designs faithful narration for the ones that
> earn it, keeping the flowchart narrator's discipline: **bail rather than guess, never invent a
> relationship's meaning.** §§1–11 survey all the types; **§12 records the adversarial trio and
> the reshaped scope** — a ~6-narrator first wave, the rest bailed/deferred. It ships no code; it
> is the design deliverable, held for a go-ahead (design-first, HARD RULE #25).

Grammar for every type was researched directly from the official Mermaid docs
(`mermaid.js.org/syntax/*`), cross-checked against the repo. The per-type grammar detail lives in
the research transcripts; this doc records the **contract, taxonomy, invariants, dispatch, reuse,
bails, and rollout** — the things the trio must attack and the maintainer must approve.

---

## 1. The narratability taxonomy — four tiers

Every Mermaid type falls into one of four tiers by *how* a faithful aural reading works (or
whether one exists):

- **STRUCTURAL** — nodes + relationships; read the relationship graph. (flowchart, state, ER,
  class, requirement, C4, mindmap, gitgraph)
- **TEMPORAL-SCRIPT** — an ordered sequence of events; read them in source order. (sequence)
- **DATA** — the picture encodes authored numbers; read the values (+ trivially-derived facts
  like a pie %). (pie, xychart, quadrant, radar, gantt, timeline, journey, kanban)
- **SPATIAL-HARD** — the meaning IS 2-D position / geometry / bit-layout; serializing it either
  drops the content or reads coordinates aloud. Either **BAIL** the whole type, or (for large
  data charts) **SUMMARIZE** rather than enumerate. (block, packet, architecture-edges; sankey,
  treemap as firehoses; zenuml as a nested code DSL)

### Master table (verdict per type)

| Type | Token(s) | Tier | Verdict |
|---|---|---|---|
| flowchart / graph | `flowchart`,`graph` | STRUCTURAL | **shipped** (#971/#991) |
| stateDiagram(-v2) | `stateDiagram-v2`,`stateDiagram` | STRUCTURAL | **narrate** (flat v1; bail composite/concurrency) |
| erDiagram | `erDiagram` | STRUCTURAL+DATA | **narrate** (cardinality both-counts; attrs optional) |
| classDiagram(-v2) | `classDiagram(-v2)` | STRUCTURAL | **narrate** (defined-verb symbols) |
| requirementDiagram | `requirementDiagram` | STRUCTURAL+DATA | **narrate** (keyword-verb + read `text:`) |
| C4* | `C4Context/Container/Component/Dynamic/Deployment` | STRUCTURAL | **narrate** (typed nodes + `Rel` + boundaries) |
| mindmap | `mindmap` | STRUCTURAL (hierarchy) | **narrate** (outline tree; bail ambiguous indent) |
| gitGraph | `gitGraph` | STRUCTURAL | **narrate** (log-reader w/ branch cursor) or summarize |
| sequenceDiagram | `sequenceDiagram` | TEMPORAL-SCRIPT | **narrate** (ordered messages; neutral "sends to") |
| pie | `pie` | DATA | **narrate** (read all; derive %) |
| journey | `journey` | DATA | **narrate** (steps + "scores N") |
| timeline | `timeline` | DATA | **narrate** (periods → events) |
| gantt | `gantt` | DATA | **narrate** (tasks + `after`→name; no date math) |
| radar(-beta) | `radar-beta` | DATA | **narrate** (reuse `narrateRadar` scale tail) |
| quadrantChart | `quadrantChart` | DATA | **narrate** (0–1 → high/low vs axis labels) |
| xychart-beta | `xychart-beta` | DATA | **narrate** ≤~8 pts, else **summarize** |
| kanban | `kanban` | DATA/structural | **narrate** (categorized list; low ROI) |
| sankey-beta | `sankey-beta` | SPATIAL-HARD (firehose) | **summarize** (count + top-N flows) |
| treemap(-beta) | `treemap-beta` | SPATIAL-HARD (firehose) | **summarize** (top-level sums + largest leaves) |
| architecture-beta | `architecture-beta` | HIERARCHY+SPATIAL | **partial**: narrate containment, **bail edges/junctions** |
| block-beta | `block`,`block-beta` | SPATIAL-HARD | **BAIL whole type** (position IS the content) |
| packet(-beta) | `packet`,`packet-beta` | SPATIAL-HARD | **BAIL whole type** (bit geometry) |
| zenuml | `zenuml` | code-DSL | **BAIL whole type** (nested; caller/return inferred) |

---

## 2. The central invariant — the authored-verb faithfulness asymmetry

The flowchart narrator BANS invented edge verbs: an unlabeled `A --> B` reads a neutral "leads
to", never "A depends on B", because the arrow's meaning is not authored. **That ban does NOT
carry to the typed-relationship diagrams.** For state / ER / class / requirement / C4, the
relationship's meaning is **Mermaid-DEFINED**, so speaking it is reading the author's *choice*,
not inferring:

- classDiagram `<|--` **is defined by Mermaid** as inheritance → "B inherits from A" is faithful.
- `*--` = composition, `o--` = aggregation, `..>` = dependency, `..|>` = realization — a fixed,
  documented symbol→verb table is legitimate here.
- requirementDiagram `satisfies`/`verifies`/`derives` — the author *typed the keyword*; it IS the verb.
- erDiagram `||--o{` **is defined** as "exactly one to zero-or-more" → reading the cardinality is faithful.
- stateDiagram `[*]` **is defined** as start/end; a `--> B : e` transition's event label `e` is authored.

So each typed narrator ships a small **defined-symbol→English table**, and that table is faithful
*by construction* — the opposite of the flowchart's neutrality. This asymmetry is the design's
backbone and must be stated in every typed narrator's header so a future reader doesn't "fix" it
into flowchart-style neutrality.

The counter-cases stay neutral: a flowchart-family arrow with no defined meaning (architecture
`--`, a sequence arrow *glyph*) is read neutrally ("connects to" / "sends to") — see §3.

---

## 3. Shared faithfulness invariants (the never-invent rules)

Every narrator obeys these; the trio should hunt violations:

1. **Never speak geometry as meaning.** Port sides (L/R/T/B), grid columns, bit offsets, node
   shapes, icons, x/y pixel positions, quadrant coordinates-as-numbers — none are content. (Kills
   block/packet/architecture-edges; shapes-as-meaning in mindmap; raw 0–1 coords in quadrant.)
2. **Never assert a relationship between elements that merely share a container.** mindmap
   siblings, C4 boundary co-members, architecture group co-members, kanban cards in a column have
   NO authored relationship to each other — only shared parenthood.
3. **Read the display label, never the id.** `participant A as Alice`, `state "…" as s1`,
   `id1[Label]`, `curve a["Alice"]` — resolve id→label; match endpoints on id.
4. **A defined symbol/keyword is a faithful verb; an undefined glyph stays neutral.** (§2.) Do NOT
   verbalize sequence sync/async/reply from the arrow *shape* (`->>` vs `--)`) — that's convention,
   not authored; a bare "sends to" is the faithful reading.
5. **Derived-but-faithful is allowed only where Mermaid ITSELF derives it.** A pie % (Mermaid
   displays the derived %, not the raw value), a radar auto-scale (`niceCeil`), a treemap branch
   sum — read these, but label a computed total as computed; never fabricate a total/unit/end-date
   the author didn't write and the renderer doesn't compute (gantt: resolve `after d1`→the task
   NAME, never the resulting start DATE).
6. **Bail rather than guess.** Any unrecognized construct → the narrator returns null → today's
   heading+caption. A partial parse that would misstate structure is worse than silence.
7. **Firehose → summarize, don't enumerate.** Past a size threshold, read a faithful summary
   (count + top-N) instead of every value (§5). Log that a summary was chosen (no silent truncation).

---

## 4. Dispatch architecture + shared scaffolding

**One dispatcher, N narrators, each self-bailing.** `narrateChart`/`narrateDiagram` already own
the `diagram`-slide fence. Extend the fence handler to:

1. **Detect the type token** — the first non-blank line after stripping `---…---` frontmatter and
   `%%{init}%%` directives. Match **longest-first** (`stateDiagram-v2` before `stateDiagram`;
   `classDiagram-v2` before `classDiagram`) and accept **beta aliases** (`block`/`block-beta`,
   `packet`/`packet-beta`). Unknown token → null (heading fallback), exactly as today.
2. **Route** to the per-type narrator (`narrateSequence`, `narrateState`, `narrateEr`, …).
3. Each narrator **parses its own grammar and bails to null** on anything it can't fully
   recognize — no narrator ever emits a partial/guessed reading.

**Shared scaffolding already in `chart-narration.js` (reuse, don't reinvent — HARD RULE #15):**
`withoutFences` (heading/eyebrow without source leak), `stripQuotes`/`scrubLabel` (label scrub +
`<br>`→space), `joinWithAnd`, `terminate` (no doubled terminal punctuation), `numberToWords` /
`toSpokenText` (say-as for numbers/dates), the `hasClassToken` gate, and `NARRATORS` registration.
A shared **skip-list** (comments `%%`, `%%{init}` directives, `---` frontmatter carrying `title:`,
`accTitle:`/`accDescr:`, `direction`, styling `classDef`/`class`/`style`/`:::`/`click`) covers the
in-diagram non-content lines for every type. Node-shape extraction (`id[Label]`, `NODE_SHAPES`) is
reusable for kanban's `id[Label]@{…}` cards.

**Both surfaces, one kernel (HARD RULE #1).** Every narrator lives in the shared `lib/core`
kernel, bundled to the browser via `read-along-core` and used by the CLI export via the
fence-intact split — identical spoken string live and exported (the parity #971 established).

---

## 5. The firehose problem — summarize vs enumerate

Four DATA types can explode: **sankey** (dozens of links), **treemap** (deep nested tree),
**xychart** (12 months × 3 series = 36 numbers), **radar** (4 series × 8 axes = 32). Reading every
value is unlistenable AND drops the structure that is the point. The rule:

- Below a size gate (≈ 8 data points): **enumerate** (read all values).
- Above it: **summarize** with faithful, trivially-derived facts only — **count** (N links / nodes
  / points), **top-N by magnitude**, and (treemap) top-level **sums** labeled as computed. Never a
  narrative ("energy is wasted"), never a causal reading.
- sankey/treemap are summarize-first even when small-ish; pie/journey/timeline/gantt read-all
  (Lattice caps them small by authoring convention). This gate is a shared helper, not per-type.

---

## 6. Reuse map (what shares code with what)

- **radar-beta → reuse `narrateRadar`'s tail.** Semantics are identical to Lattice-native radar
  (series × axis on a shared scale). Factor the "series→spoken + `niceCeil` auto-scale" tail out of
  `narrateRadar` and feed it a Mermaid-radar parse. **Best reuse win.**
- **C4 → reuse the flowchart directed-edge core.** C4 is a typed directed graph with labeled
  `Rel`s; the edge-reading + label-faithfulness machinery transfers, plus node-type vocabulary +
  boundary containment.
- **state → reuse a shared start/terminal-inference helper**, NOT `narrateStateChart` (that's
  Lattice's OWN `state-chart` component DSL — numbered states + `event => N` — a different grammar).
- **quadrantChart → do NOT route to `narrateQuadrant`.** Native quadrant auto-fits a real-world
  axis SCALE (its reason to exist); Mermaid quadrant is fixed 0–1 with text axes — no scale to fit,
  different grammar. New narrator; borrow only the spoken cadence.
- **journey → do NOT route to `narrateJourneyWeighted`.** That fires only on native `journey
  weighted` and computes a volume % from `+N` pills Mermaid has no concept of. New parser; mirror
  the cadence.
- **pie → new % derivation.** Native piechart authors the % directly (no reader); Mermaid pie
  authors raw values and Mermaid derives the % — a sum+divide the native path never needed.
- Everything else reuses only the scaffolding (§4).

The reuse verdict is deliberately conservative: **share a tail helper only where the SEMANTICS are
identical (radar) or the graph model is the same (C4/flowchart); never share a PARSER across
grammars.** Surface-similar syntax (a zenuml `A->B:` looks like a sequence message; a native
quadrant pill looks like a Mermaid point) hides incompatible semantics.

---

## 7. The honest bails (safe, correct outcomes — not failures)

Per invariant #6, these are the right answer, not a gap:

- **block-beta** — hand-placed 2-D grid; columns/spans/`space` fillers ARE the content. Serializing
  to a label list discards the only authored thing (position). **Bail whole type.**
- **packet-beta** — bit-offset field layout; the honest options are a meaningless label list or a
  robotic number recital. **Bail whole type** (prefer surfacing an authored `accDescr`/`title` as
  the caption).
- **zenuml** — a nested, code-like DSL (implicit callers from lexical nesting, `if/try/return`,
  assignments). A faithful read needs a recursive parser and risks inventing caller/return/control
  semantics. **Bail whole type** (a later strict flat-subset reader is possible but out of scope).
- **architecture-beta edges** — ports (L/R/T/B) are pure geometry and edges carry no labels;
  `junction` nodes make connectivity an unspeakable mesh. **Narrate containment only; bail the
  edges** (and the whole type when junctions are present).

Each bail still recognizes its **type token** (so it's a deliberate bail, not an accidental
mis-parse) and falls back to the heading+caption that ships today.

---

## 8. Per-type reading contracts (condensed)

Grouped by rollout tier (§9). Each: the faithful reading shape + the key bail. Full grammar in the
research transcripts.

**Tier 1 — structural graphs & the sequence script (highest value, cleanest grammar):**
- **sequenceDiagram** — walk messages in source order: "‹Alice› sends to ‹Bob›: ‹label›." Read
  note text ("Note: …") and block labels with neutral connectives ("Alternatively, if ‹cond›:",
  "Repeatedly:"). Neutral "sends to" — never verbalize sync/async/reply from the glyph. Bail on
  unrecognized arrow glyphs and deep nested `par`/`alt`.
- **classDiagram** — "‹B› inherits from ‹A›; ‹A› is composed of ‹B›; ‹A› depends on ‹B›" via the
  defined-symbol→verb table; a relationship LABEL overrides; multiplicity `"1"-->"*"` → "one to
  many". Longest-match tokenize the prefix-ambiguous `..`/`--` symbols; honor arrowhead side for
  direction. Bail combined/lollipop arrows.
- **stateDiagram (flat v1)** — "starts at ‹Idle›. From ‹Running›, on ‹stop›, goes to ‹Idle›;
  ‹Running› can end." `[*]`=start/end by position; event label = "on ‹e›". Bail composite `{…}`,
  concurrency `--`, fork/join.
- **erDiagram** — "one ‹Customer› ‹places› zero or more ‹Order›" — read the label as the verb,
  attach BOTH cardinality counts (never gamble a single direction). Attribute blocks optional
  ("‹Customer› has attributes: name, a string, the primary key"). Bail malformed crow's-foot.

**Tier 2 — the rest of the high-value set:**
- **C4** — "‹Customer›, a person: ‹descr›. ‹Customer› — ‹label› — ‹System›, over ‹tech›." Honor
  `Rel` direction (and `Rel_Back` reversal; `_U/_D/_L/_R` are layout — ignore). "Within the ‹Bank›
  boundary: ‹A› and ‹B›." Say "external" only on `_Ext`. Quote-aware comma splitting.
- **requirementDiagram** — "Functional requirement ‹fr1›: '‹text›'. Risk: high. ‹auth_service›
  satisfies ‹fr1›." Normalize the two relationship direction forms. Read `text:` verbatim.
- **mindmap** — DFS outline: "Root topic: ‹Product›. Product branches into ‹Growth› and
  ‹Retention›. Growth contains ‹SEO› and ‹Referrals›." Strip icons/classes. Bail ambiguous
  indentation / multiple roots; summarize past ~25 nodes.
- **gantt** — "In the ‹Dev› phase: ‹Design› runs 5 days from ‹Jan 1›. ‹Code› is critical, 10 days,
  after ‹Design›." Resolve `after id`→task NAME; never compute end dates. Read status tags as
  adjectives. Bail unparseable time-spec.
- **timeline** — "Phase 1. In ‹2024-01›: ‹Planning›; ‹Design›." Period before first colon; events
  after; carry the period across `:`-leading continuation lines.
- **journey** — "‹Go to work›. ‹Make tea› scores 5, for ‹Me›." Read "scores N" (or "N out of 5" —
  1–5 is documented); never editorialize into "happy/frustrated". Bail non-1–5 scores.
- **pie** — "‹Budget›. ‹Marketing›, forty percent. ‹Sales›, thirty-five percent." Derive % (sum &
  divide) as Mermaid does; with `showData` optionally add the raw value. Bail <2 rows or sum ≤ 0.
- **radar-beta** — "‹Grades›, on a scale of 0 to 100. ‹Alice›: Math, 85; Science, 90." Pair
  positional/keyed curve values to axes; read scale from `min`/`max` or `niceCeil`. Reuse
  `narrateRadar` tail.

**Tier 3 — data charts (read-all-or-summarize) + the low-ROI ones:**
- **quadrantChart** — "Reach on the horizontal, engagement on the vertical. ‹Campaign A›: high
  reach, low engagement." Threshold 0–1 at 0.5 into high/low against the axis text labels; never
  speak raw coordinates or fabricate real-world units. Summarize by region past ~10 points.
- **xychart-beta** — "‹Sales by quarter›. Q1, 250; Q2, 400." Detect x-axis category-list vs
  `min --> max` range; name series if labeled else "the bar series". Summarize (min/max/trend)
  past ~8 points.
- **kanban** — "‹Todo›: ‹Create Documentation›, assigned to John, ticket PROJ-123, priority High."
  Read column TITLE + card + `@{…}` metadata; never infer progress from a column name. (Low ROI —
  a categorized list; a maintainer may defer it.)
- **gitGraph** — "A git graph. Commit ‹init›, tagged ‹v1.0›. Branch ‹develop›. Merge ‹develop›."
  Branch-cursor log-reader; read ops + `id:`/`tag:`; skip `type:`/`order:`. Summarize large graphs.

**Summarize tier:**
- **sankey-beta** — "A Sankey flow of 68 links across 42 nodes. The largest is ‹Natural gas› to
  ‹Losses›, at 900." Quote-aware CSV parse (RFC-4180). Read-all only when ≤~4 links.
- **treemap-beta** — "A treemap of two sections. ‹Section 1› totals 24; ‹Section 2› totals 45. The
  largest leaf is ‹Leaf 2.2› at 25." Compute branch sums (label as computed). Read-all only when
  tiny/shallow.

**Bail tier:** zenuml, block-beta, packet-beta (whole type); architecture-beta (containment only,
edges bailed).

---

## 9. Rollout — one narrator per PR (HARD RULE #17)

This is ~15 narratable types + 4 bails; **not one PR.** Each narratable type is its own
branch→PR→trio-on-the-shipping-diff, sequenced by value × cleanliness so each slice compounds and
stands alone (HARD RULE #8/#17). Proposed order:

1. **sequenceDiagram** — highest value, self-contained temporal reader, no reuse entanglement.
2. **stateDiagram (flat)** — reuses the flow-walk mindset; ships the shared start/terminal helper.
3. **classDiagram** + **erDiagram** — the defined-verb table pattern (§2); ship together or back-to-back.
4. **C4** — reuses the flowchart edge core; establishes typed-node + boundary vocabulary.
5. **requirementDiagram**, **mindmap** — structural, self-contained.
6. **pie**, **journey**, **timeline**, **gantt** — DATA read-all; ship the shared say-as helpers.
7. **radar-beta** — factor + reuse the `narrateRadar` tail.
8. **quadrantChart**, **xychart-beta** — DATA with the summarize gate (§5); ship the gate helper.
9. **sankey-beta**, **treemap-beta** — the summarize path.
10. **gitGraph**, **kanban** — lower ROI; ship if the value survives the trio.
11. **The bails** (zenuml/block/packet/architecture-edges) — documented + a test asserting each
    recognizes its token and returns null; no per-type reader.

Each slice: a per-feature demo deck + `.pdf`/`.vtt` (#9), unit tests asserting the SPOKEN STRING
(audio UNVERIFIED, #23), both-surface parity, docs + CHANGELOG, and the trio on the shipping diff
for the genuinely novel ones. The dispatcher + shared skip-list + type detection land in slice 1
and are extended thereafter.

---

## 10. Verification honesty (HARD RULE #23)

Audio stays UNVERIFIED (no TTS in CI); only the display→spoken STRING is claimed per type, with a
per-type demo `.vtt`. Each narrator is fuzzed for no-throw + determinism and checked for the
never-invent invariants (§3). "Bail" verdicts get a test proving token-recognition + null return.
The real Studio is exercised via the Cloudflare preview per slice; the shared kernel makes the
string identical live and exported (verified since #971).

---

## 11. Open questions for the trio + the maintainer

1. **Tier boundaries.** Is `kanban` / `gitGraph` worth a narrator, or defer as low-ROI? Is the
   `xychart`/`radar` summarize gate at the right size?
2. **The defined-verb table (§2).** Is "Dog inherits from Animal" the right register, or too
   jargon-y for a boardroom listener vs a plainer "Dog is a kind of Animal"? Per type.
3. **quadrant coordinate reading.** high/low-against-axis (recommended) vs percentage vs raw — does
   high/low ever mislead near the 0.5 midline?
4. **Summarize honesty.** For sankey/treemap, is "top-N + count" genuinely faithful orientation, or
   does picking "the largest flow" over-privilege one number? Should it just bail?
5. **The bails.** Are block/packet/zenuml/architecture-edges correct whole/partial bails, or is
   there a faithful minimal reading we're leaving on the table?
6. **Sequence sync/async.** Is refusing to voice `->>` vs `--)` (invariant #4) too conservative —
   would "asks" vs "notifies" ever be faithful? (Recommendation: no — it's convention, not authored.)
7. **Scope of slice 1.** Should the dispatcher + detection + skip-list land as their own
   infrastructure PR before the first narrator, or bundled with sequenceDiagram?

This design is HELD for the maintainer go-ahead after the adversarial trio folds its findings.

## 12. Adversarial trio findings + the RESHAPED design (2026-07-14)

The design got the full trio (red team + Munger inversion + independent checker). The dispatch is
confirmed **bail-safe** (native narrators gate on the slide's `_class:` directive, not the fence
body, so they can't cross-fire on Mermaid content; an unknown token falls to null). Grammar and
reuse claims were verified against the live docs + repo. But the trio converged on **one
structural verdict that reshapes the scope**, plus concrete correctness fixes. This section
supersedes the scope of §1/§8/§9.

### 12.1 The load-bearing inversion (Munger) — the design over-reached against its own bar
The manifest-speech contract's bar is: **narrate only when the render computes a fact the source
text doesn't state.** For roughly 10 of the 15 proposed narrators the render computes **nothing** —
the narrator reads back a list/log/schedule/board the author typed verbatim. That is transcription,
and the flowchart-gist precedent (§12 of the companion doc) already proved that transcription heard
once is worse than a heading + one authored caption. "Narrate all ~22 types" is the wrong goal.
**Cut to the types that clear the bar; bail the rest with a good authored-caption path.**

### 12.2 Correctness fixes the trio verified (must fold before any build)
- **Radar `niceCeil` reuse is a faithfulness violation (red-team, WORST).** Mermaid radar defaults
  `max` to the **data max**, not a nice-rounded ceiling; reusing `narrateRadar`'s `niceCeil` tail
  would speak "on a scale of zero to one hundred" for data topping 85 — an axis bound the listener
  never sees (breaks invariant #5). Radar, if shipped, needs its **own** scale = explicit
  `max`/`min` or the data max; the "free reuse win" evaporates.
- **classDiagram symbol table is one-sided (red-team).** `A --|> B` / `A --* B` (right-anchored
  single arrows) invert if the §2 left-anchored table is applied by substring. Fix: resolve the
  verb by **which end carries the head** (`<|`,`|>`,`*`,`o`,`<`,`>`), per symbol; bail reversed/
  combined forms the parser can't confidently orient.
- **C4 must NOT reuse `renderFlowNarrative`'s framing (red-team).** That renderer imposes "fans out
  to / the flow ends at / loops back" — a *process* frame that misdescribes a static architecture
  ("…fans out to the Database. The flow ends at the Database."). Reuse the `{nodes,edges}` parse
  SHAPE only; C4 gets its own static "‹A› — ‹label› — ‹B›" reading.
- **stateDiagram overloaded `:` (red-team).** Disambiguate by presence of `-->`: a `:` on an arrow
  line is the event; a `:` on a bare line is a state description — the parser must not fabricate a
  transition from a description. Bail the description-ambiguous case.
- **Beta-alias bug (checker + red-team).** Current Mermaid makes the **bare** token primary for
  `xychart`/`sankey` (and `radar`/`treemap` circulate both). The design listed only `-beta` for
  these → a current-syntax deck would **silently never narrate**. Fix: accept both bare and
  `-beta` for every graduating type (strip an optional `-beta`), as already done for block/packet.
- **Completeness (checker + red-team).** The master table missed ~7 current types — `swimlanes`,
  `eventmodeling`, `venn`, `wardley`, `cynefin`, `ishikawa`, `treeView`. They **bail safely**
  (unknown → null), but the "whole family / ~22" framing is false and is corrected: these join the
  §7 bail inventory. `swimlanes` is a *separate type*, not a flowchart mode — it will not mis-route.
- **Detection hygiene (red-team).** Run the skip-list (comments/frontmatter/`%%{init}`) BEFORE
  reading the type token; and state the shipped split for every narrator: parse the RAW fence,
  use `withoutFences` only for heading/leftover (a narrator that parses `withoutFences(md)` sees a
  blanked body and never fires). `classDiagram-v2` is not a real Mermaid keyword (harmless
  over-provisioning; drop it).
- **Verified faithful, no change needed:** ER both-cardinality reading; quadrant's 0.5 threshold
  (Mermaid's crosshair is fixed at 0.5 — high/low IS its own divider, though near-0.5 points are
  fragile); pie % (Mermaid-derived); journey 1–5 + bail-non-1–5; gantt `after`→task-name (never a
  date); C4 `Rel_Back` reversal / `_U/D/L/R` layout-only.

### 12.3 The reshaped scope (supersedes §1/§8/§9)
Organized by the "computes a fact / carries genuinely-inaccessible content" bar:

- **FIRST WAVE — ship (clears the bar with a clean, verified-faithful reading):**
  `sequenceDiagram` (genuinely inaccessible content; **hard message cap → summarize past ~N so it
  never becomes a wall**), `stateDiagram` (flat; structure computed; `:` disambiguation),
  `classDiagram` (relationships only; per-symbol head resolution), `erDiagram` (relationships only,
  **no attribute schema dump**; both-cardinality), `C4` (own static reading), `pie` (the model —
  Mermaid derives the %). The dispatcher + skip-list + type-detection + beta-alias normalization
  land in the first slice.
- **RADAR — fast-follow, only with its OWN scale** (data-max/explicit, not `niceCeil`); the reuse
  isn't free, so it's decoupled from the first wave.
- **BAIL (correct, cheap — token recognized, returns null → heading + authored caption):** the four
  original whole-type bails (block, packet, zenuml, architecture-edges) **plus** the transcription/
  firehose cuts — `kanban`, `gitGraph`, `gantt`, `xychart`, `quadrantChart`, `sankey`, `treemap`
  (for sankey/treemap, **bail is more honest than "top-N"** — one flow misrepresents a
  distribution) **plus** the 7 newer types (venn/wardley/cynefin/ishikawa/treeView/swimlanes/
  eventmodeling). Each gets a test asserting token-recognition + null.
- **DEFER (low value, low harm; build only on real user demand):** `journey`, `timeline`,
  `requirement`, `mindmap` — the author typed everything; a heading + authored caption already
  orients. Revisit if usage data or a user asks.

Net: **~6 narrators in the first wave (+ radar as a scoped fast-follow), not ~15.** The bail tier
absorbs the rest safely. The register for the shipped structural types (class/ER/state) is the
developer register the defined-verb table gives — correct for their actual (developer) audience.

### 12.4 Open decision for the maintainer (the go-ahead gate)
The reshaped first wave (sequence/state/class/ER/C4/pie, + radar fast-follow) is the trio's
recommended scope and mine. The genuine call to confirm: **ship the tight first wave, or a
different cut?** — e.g. include/exclude radar, or defer C4 (its own reading is more work than the
"free reuse" implied). No code proceeds until this is confirmed.

## 13. Go-ahead + rollout status (2026-07-14)

Maintainer confirmed the reshaped **first wave** (§12.3): sequence · state · class · ER · C4 · pie,
with radar as a scoped fast-follow. Implementation proceeds one narrator per PR (trio on each
shipping diff), each held for merge sign-off.

- **Slice 1 — dispatcher + `sequenceDiagram`** (SHIPPED 2026-07-14): refactored the mermaid fence
  handler into a type dispatcher (`narrateMermaidFence` + `firstFenceKeyword`, longest-match +
  `-beta` strip), flowchart path byte-identical (verified by both trios); added `narrateSequence` —
  ordered "‹A› sends to ‹B›: ‹label›", single-line notes ("Note: …"), single-level blocks as
  connectives, neutral "sends to" (never voices the arrow glyph's sync/async/reply convention),
  message cap → prefix + remainder count; bails on nested blocks / multiline notes / unrecognized
  lines. Demo: `examples/sequence-narration.md`.

  **Slice-1 adversarial trio — findings folded before ship** (red team + independent checker, run
  on the shipping diff; the checker's 489-case faithfulness fuzz found 0 residue / 0 arrow-semantic
  leaks post-fix):
  1. **WORST (red team) — arrow-glyph in message TEXT corrupted src/tgt and leaked a raw glyph into
     speech** (`A->>B: prefer -->> over ->` → wrong participants + spoken "-->>"). Fixed: `parseSeqMessage`
     splits the line at the FIRST `:` to isolate the signature, then matches the arrow within the
     signature only (a participant id/signature never contains a `:`). Also removes the spurious
     whole-diagram bail on a trailing arrow glyph in the label.
  2. **Secondary (red team) — a `%%{init}%%` directive / `%%` comment before the type token made the
     narrator silently bail** even though the dispatcher recognized the fence (`narrateSequence`
     re-derived the token and skipped only frontmatter). Fixed: `narrateSequence` now applies the
     same skip-list (blanks + `%%` + `%%{…}%%`) as `firstFenceKeyword` before the token check (§12.2).
  3. **Block-scope leak (Munger) — a message after a closed block read as if still inside it** (a
     "disconnect" swept into "Repeatedly, every 5s"). Fixed: `end` at the top level pushes a
     `SEQ_CLOSE` marker rendered as an "Afterwards:" resume cue — only when more content follows.
  4. **Cap discarded the whole script for a bare count (Munger).** Fixed: past the 12-message cap the
     reading speaks the first twelve faithfully, then folds the remainder into "And ‹N› more messages."
  5. **A first `alt` mis-read as "Alternatively" (Munger)**, falsely implying a prior option. Fixed:
     the opening `alt` reads "If ‹cond›:"; `else` reads "Otherwise, if ‹cond›:".
- Slices 2+ (state, class, ER, C4, pie, then radar) follow in order now that slice 1 has landed.

## 14. The architect-grade reading model — a four-pass trio hardens (and shrinks) it (2026-07-14)

Slice 1 first shipped the *faithful ordered message dump* ("A sends to B: x. B sends to C: y. …").
The maintainer's bar is **"whoever is reading it must be an expert architect"** — the same lift the
flowchart got when it moved from an edge-dump to a flow reading (2026-07-13 §10) plus a gist (§12).
So a reading-model design (axes A–D: orientation/gist · sender-coalescing · return framing · cast
intro) was put through the same scientific method: one **research** pass (a11y standards + how
engineers verbalize a sequence diagram) and an **adversarial trio** (faithfulness red-team · Munger
inversion · architect-quality checker on 8 real diagrams). The four passes *disagreed productively*
and converged on a smaller, honest model.

### 14.1 The load-bearing finding — under faithfulness, "talk-register" prose is partly unreachable

A flowchart is a graph with **no inherent linear order**, so synthesizing the flow *creates* value.
A sequence diagram's order is **already authored** — so the extra "architect insight" it seems to
promise (this is a request-response / fire-and-forget / OAuth flow) lives in the **arrow glyph +
domain knowledge**, both of which faithfulness forbids us to voice. Chasing "reads like a talk"
means inventing exactly what this narrator family exists to prevent. For an eyes-free reference
artifact an architect *scans* (looking for one specific call), **faithful-and-locatable beats
fluent-and-abstracted**. The honest target is a faithful walk with the stutter removed + one
orientation clause — not a prose summary.

### 14.2 Verdict per axis (research → red-team → Munger → architect-quality, then maintainer pick)

- **Axis C — return / round-trip framing → CUT (C0).** The crux, and decisively cut. "returns",
  "responds", and even the conservative **"back to A"** are all round-trip claims that are correct
  *only* when the arrow is a dashed reply — i.e. correctness is 100% glyph-derived, the exact signal
  we ban. Refuted with solid-arrow B→A cases that are **not** replies (an independent follow-up
  question; an async callback/push; an unrelated message; user ping-pong clicks), all misread by C;
  and C *misses* a genuine reply when a self-message splits the pair. The direction reversal is
  already spoken faithfully as the next "B sends to A" — a *return* claim adds only invention.
  **These failing inputs are recorded here so C is never re-added without re-earning it.**
- **Axis A — orientation → A1 count only; A2 shape CUT.** A message-COUNT frame ("A seven-message
  sequence diagram") is the one faithful orientation the walk can't self-state (the sequence analog
  of the flowchart gist's DEPTH). The **shape names** (relay / hub / request-response / polling) are
  all interpretation or glyph/intent-derived: a bare `loop` isn't "polling", a dominant sender is as
  often a broadcast as an "orchestration", and a small diagram is too small to have a shape — a
  confident wrong noun at the highest-blast-radius position (the §12 org-chart caveat, reborn). Cut.
- **Axis B — sender coalescing → KEEP, strictly guarded.** De-repeat the narrator's *own* "X sends
  to Y" scaffolding, never authored labels: consecutive same-sender→same-receiver → "A sends to B:
  x; then y; then z"; same-sender fan-out → **lossless** "From A: to B, x; to C, y" (every receiver
  AND label retained — the distinction the red-team/Munger first conflated with a lossy comma list).
  Guard: a run flushes at **any** intervening event — a note, a self-message, a different endpoint,
  or a block open/close/continuation — so a conditional or a note inside a same-pair run is never
  swept into an unconditional run (the red-team's worst case).
- **Axis D — cast intro → CUT.** Redundant with the walk (which names every acting participant) and
  an anti-signal when the declared cast is layout-ordered or larger than the message count; "among a
  silent participant" is a false claim. Keep only the count (A1).
- **Free lift kept — self-message wording.** `A->>A: validate` reads "A, to itself: validate" (internal
  work), not "A sends to A" — glyph-independent, faithful, and it excludes self-messages from a run.
- **Terminal-proof cap (an architect-quality correctness fix).** The >12 cap used to delete the final
  messages — but the last message is often the *payoff*. Now: first `SEQ_MSG_CAP` (coalesced), the
  remainder count, AND the final message ("… And ‹N› more messages, ending: ‹final›").
- **`-x` "lost message" stays neutral.** Voicing "does not arrive" would read a glyph convention
  exactly as voicing "reply" would — barred by the same rule, applied symmetrically. "Sends to"
  describes the authored act of sending; delivery is not claimed.

**Maintainer pick:** the **faithful ceiling** — ship A1-count + guarded-B1 + self-message wording +
terminal-proof cap; cut C, A2, and D. Never misleads; the misfire risk of the cut axes is exactly
what this narrator family exists to prevent. The gains that would have pushed toward talk-register
(returns, shape, protocol-naming) are precisely the parts that lie, so they are deliberately *not*
built — recorded as an honest ceiling, not a gap to close later.

## 15. Slice 2 — pie · class · state · ER · C4, in one PR (SHIPPED 2026-07-14)

Maintainer directive: ship the rest of the first wave in ONE PR, each narrator hardened by its own
adversarial pass ("trio after each"). All five route through the slice-1 type dispatcher
(`narrateMermaidFence`); each is a self-contained `narrate<Type>` sharing a `mermaidPrelude` (skip
frontmatter/`%%{init}%%`/`%%`, confirm the type token) and the existing scaffolding
(`scrubLabel`/`stripQuotes`/`joinWithAnd`/`numberToWords`/`terminate`). Every narrator self-bails on
any construct a faithful reading can't support.

The **authored-verb asymmetry (§2)** is the backbone here: unlike the flowchart's neutral arrow, a
class `<|--`, an ER crow's-foot, a state `[*]`, a C4 `Rel` all have a Mermaid-DEFINED meaning, so
speaking that meaning reads the author's choice — a small defined-symbol→English table per type,
faithful by construction.

- **pie** (DATA) — each slice with its DERIVED % the way Mermaid derives it (§3.5); `showData` adds
  the raw value. Bails <2 slices, non-positive SUM, **or any non-positive slice** (Mermaid errors on
  a ≤0 value — no rendered pie to narrate; a pie-check finding).
- **classDiagram** (STRUCTURAL) — the defined-symbol→verb table (`<|--` inherits, `*--` composed of,
  `o--` aggregates, `..>` depends on, `..|>` realizes, `-->` associated with, `--` linked to), the
  arrowhead/diamond SIDE deciding subject/object (verified correct on every base + reversed form);
  an association LABEL overrides the verb; `"1"--"*"` multiplicity trails "one to many". Members read
  "‹Class› has ‹names›". Bails namespace / lollipop `()` / combined `<|--|>`. Folded: standalone
  `<<annotation>> Name`, generic-name tildes, `n`/`0..n` multiplicity.
- **stateDiagram** (STRUCTURAL, flat v1) — `[*]` start/end BY POSITION; `X --> Y : e` reads "From X,
  on e, goes to Y"; BOTH label forms (`state "d" as id` AND `id : d`) resolve the display label
  (a state-check finding). Bails composite `{…}` / concurrency `--` / `<<fork>>`/`<<join>>` — a flat
  reading would misstate parallel/nested structure.
- **erDiagram** (STRUCTURAL+DATA) — both crow's-foot counts read LITERALLY on each side (never a
  gambled direction; verified correct on all 16 combos), the label as the verb; attribute blocks read
  fields + key roles. Folded: comma-separated composite keys `PK, FK` (were bailing the whole
  diagram), quoted-label quote-stripping.
- **C4** (STRUCTURAL) — typed elements ("‹label›, a ‹kind›[, external]: ‹descr›"; "external" only on
  `_Ext`; Container/Component/Node read the tech field), `Rel` honoring `Rel_Back` reversal + `BiRel`
  and IGNORING the `_U/_D/_L/_R` layout suffixes, boundaries as authored containment (never a peer
  relationship — §3.2). Folded: a boundary NESTING STACK (a scalar had flattened nesting and leaked a
  sibling to the top level — a C4-check finding), boundary-alias→label registration so a `Rel` to a
  boundary resolves, a label-less `Rel` → neutral "is connected to", and a `)` inside a quoted field
  no longer truncates the args.

**Adversarial passes (one per type, verified against the live Mermaid grammar by running the code):**
pie — negative/zero-slice fabrication (fixed). class — direction + faithfulness + bails ALL clean;
prose/coverage polish folded. state — structure bails all safe; the `id : description` label form
(fixed). ER — cardinality/direction clean on all 16 combos; composite-key bail + quoted-label (fixed).
C4 — tech/direction/layout/external/quote-comma all clean; nested-boundary + boundary-alias leaks
(fixed). Every fix carries a regression test. Demo: `examples/typed-diagram-narration.md`.

A recorded corner: a `stateDiagram` transition whose SOURCE id equals a statement keyword
(only `end` is a plausible id) is parsed as a transition, not dropped — the keyword-skip yields to
a `-->` line (a final-check finding).

Remaining first-wave follow-on: **radar** (`radar-beta`, reuse `narrateRadar`'s scale tail) as the
scoped fast-follow; then tier-2/3 types per §9. Audio UNVERIFIED (no TTS in CI); only the spoken
string is asserted.
