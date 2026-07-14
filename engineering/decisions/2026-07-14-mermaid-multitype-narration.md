---
status: proposed
summary: >
  Design for extending read-aloud narration from Mermaid FLOWCHARTS (shipped: the walk #971
  + the gist #991) to the WHOLE Mermaid family (~22 remaining types). Grounded in per-type
  authoring grammar researched from the official Mermaid docs. Names a 4-tier narratability
  taxonomy (STRUCTURAL / TEMPORAL-SCRIPT / DATA / SPATIAL-HARD), the central "authored-verb
  faithfulness asymmetry" (for typed-relationship diagrams a symbol's meaning is Mermaid-DEFINED,
  so speaking it as a verb is faithful — unlike a flowchart's banned invented verbs), the shared
  never-invent invariants, a type-token dispatch over the existing `chart-narration.js`
  scaffolding, the summarize-vs-enumerate rule for firehose charts, a reuse map, the honest
  whole-type BAILS (zenuml / block / packet, + architecture edges), and a sequenced rollout of
  one-narrator-per-PR slices. Ships NO code — the design deliverable, HELD for a maintainer
  go-ahead after the adversarial trio (HARD RULE #25).
companion:
  - ./2026-07-13-mermaid-diagram-narration.md
  - ./2026-07-11-manifest-speech-contract.md
---

# Narrating the whole Mermaid family — a faithful, tiered, bail-safe design (2026-07-14)

> **Where this sits.** Read-aloud narrates a `diagram` slide's Mermaid FLOWCHART today: the
> topology WALK (#971) + a lean shape GIST (#991). Every OTHER Mermaid type — ~22 of them —
> still `null`-falls-back to a heading-only caption (`parseFlowchart` bails unless the first
> keyword is `flowchart`/`graph`). This doc designs faithful narration for the rest, one type at
> a time, keeping the flowchart narrator's discipline: **bail rather than guess, never invent a
> relationship's meaning.** It ships no code; it is the design deliverable, held for a go-ahead
> after the adversarial trio (design-first, HARD RULE #25).

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
