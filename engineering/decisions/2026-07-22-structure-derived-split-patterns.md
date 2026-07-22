---
status: proposed
summary: Make auto-split less component-centric — hardened by TWO HARD RULE #25 trio passes (§12) + owner design review. The split kernel is generic. The rendered structure supplies a CANDIDATE axis (list→item, table→row, svg→container-responsive), realized only for opted-in seams; one per-component discriminator (connected/read-across) plus a small retained vector (opt-in gate, heavy/light, reshape, pacing) decides treatment. Graphics are container-responsive (not "scaled"); a viewBox graphic still needs a legibility floor→ring; atomic text-grid tables (roadmap/obligation-matrix, no viewBox) can't scale or split — ring on overflow — unlike glossary, which pivots its table. Every split rides a universal envelope (COVER → BODY → optional CLOSING, §0a); heavy members atomize deterministically (1 per slide) and connected/related members carry a relationship signal (→next / ↻loop / compare N-of-M). All 59 components placed (§0c). The mechanism win is collapsing the 9 carousel DOM-parsers into content-conservation-gated slot re-authors.
builds-on: 2026-06-22-the-fit-spine.md, 2026-06-21-reflow-as-form-capability.md, 2026-06-23-read-across-carousel.md, 2026-06-25-retire-landscape-locks-portrait-everything.md
---

# Structure-derived split patterns — structure supplies the mechanism, not the policy

**Date:** 2026-07-22 · **Status:** Proposed (design model; no code) — **hardened
by two HARD RULE #25 adversarial trio passes, §12** · **Decision owner:** Sharmarke

The prompt behind this doc: *the auto-splitter and the fluid work are excellent,
but they still feel component-centric — we hand-craft split behavior per
component, and we can't keep doing that. Markdown has well-defined structures;
can't the split pattern come from the structure itself, so it's generic,
deterministic, and low-effort on any component, including brand-new ones?*

The instinct is right about the **mechanism** and wrong about the **policy**, and
the difference is the whole doc. A first draft of this note claimed the split
*policy* could be derived from structure + the required `form`/`substance`,
reducing the per-component declaration to one `readAcross` boolean. The
adversarial trio (§12) refuted that against shipping code. This is the corrected
model: it says precisely which part is already generic, which part is genuinely
irreducible authored intent, and where the real, buildable win actually is.

---

## 0. The thesis in one paragraph (corrected)

> **A slide's split pattern is NOT a pure function of its rendered structure. It
> is governed by a small vector of AUTHORED-INTENT dimensions that
> identically-shaped markup does not determine** — (a) the pagination axis, (b)
> whether a collection is even a split seam, (c) read-across vs stackable, (d)
> whether the split earns an accent cover, (e) the overflow-reshape move, (f)
> per-page pacing. **Structure supplies the MECHANISM — what to iterate over, how
> to re-author a cover→content sequence — but not the POLICY.** So the win is not
> "delete the declarations." It is two things: **DEFAULT the intent vector from
> the required `form`/`substance` classification where that is provably safe
> (fewer authored fields for a new component, but the opt-in gate is RETAINED so
> undeclared never means auto-split); and collapse the 9 bespoke DOM-parsing
> carousel builders into slot-driven re-authors GATED by content-conservation**
> (retiring the hand-parsing for the ~45 flow layouts; the ~14 sovereign builders
> remain). The pivot/transpose move already ships as `cover-cards` and is
> generalized, not invented.

*Amended by §0a (owner decision): dimension (d) is resolved to a universal rule —
every split gets a cover — so the per-component vector is **five**, not six.*

---

## 0a. Owner decision (2026-07-22) — the universal split envelope

After the trio, the owner ruled that split *structure* is a **universal
envelope**, not a per-component variable:

> **COVER (always) → BODY (1…n) → CLOSING (only if earned).**

- **Cover — always.** Every split opens with a dedicated cover slide carrying the
  **masthead** (eyebrow · title · subtitle · lede). Rationale: a slide substantial
  enough to split has masthead material worth a consistent lead-in, and every split
  then reads identically. This **overrides today's split** between bare-partition
  (repeat the heading with `(cont.)`) and accent-cover (`cover-paginate`): bare
  partition is retired as a split *look*; the cover becomes universal.
- **Body — the split content**, one item/row/card per page, built per the
  per-component body policy (§3 a/b/c/e).
- **Closing — conditional.** A final slide carries the universal trailing material
  (below-note, key-insight, verdict) **only when it exists** — never an empty
  closing slide. Generalizes what `splitCoverSides` already does for one family.
- **Footer, pagination, and the progress rail ride every slide** in the envelope
  (cover and closing included).

**Consequence for the model.** Dimension (d) "accent-cover vs bare" leaves the
per-component intent vector entirely — it is now a **constant**. The vector shrinks
to **five** (axis · split-seam · read-across · reshape-move · pacing), and only the
**body** varies per component; the envelope is uniform. This *simplifies* the
mechanism (§5): one slot-driven re-author fills the cover from masthead slots, the
body from the collection slot, and the closing from the trailing-note slots.

**Tradeoff accepted (A over B).** Cover-always costs a slide — a 2-item overflow
becomes cover + 2 body (+ closing). The owner chose total consistency over the
leaner "carried heading for trivial overflows" option, on the ground that if a
slide is worth splitting it carries material worth a cover.

---

## 0b. The settled model — design synthesis (2026-07-22)

*Resolved through design review with the owner. Where this differs from the
exploratory §3–§4, **this synthesis governs**; those sections are kept as the
derivation that led here.*

**Every split is two moves. Structure supplies a *candidate*; one per-component
discriminator (plus a small retained vector) decides the treatment.**

**Move 1 — the rendered structure supplies a CANDIDATE axis (realized only for
opted-in seams).** Auto-split runs on the *rendered* deck, so the DOM offers a
candidate axis:

| Rendered structure | Candidate split |
|---|---|
| `<ul>` / `<ol>` | by list item |
| `<table>` | by row (glossary pivots to a key→value card via its table transform) |
| `<svg>` / single figure | **none — container-responsive (the parent box sizes it)** |
| `<pre>` | **code-cards by line / block — PROPOSED, not shipped** (`partitionAxis` refuses the `line` axis today) |

This **refines the trio's "axis is not derivable" finding** (§8 rule 1, §3a): that
held for *authored* markdown — `glossary` authors as a list but renders as a table —
but the split runs on *rendered* HTML. **The candidate is not "free," though**: the
retained opt-in gate (§3b) still decides whether a rendered list/table is a *real*
seam. `matrix-2x2` renders a live `<ul>` of quadrant `<li>`s, and `roadmap` /
`obligation-matrix` render live `<table>`s — the candidate rule would split and
*destroy* all three; they are saved **only** because they never opt in
(`capacity=null, split=null`). So structure yields a candidate; the per-component
gate ratifies it. `capacity.axis` survives as the pre-render count estimate; the
render-time DOM is the axis authority for opted-in seams.

**Content type — graphics vs text — decides scale-vs-split, but "figure" is two
buckets, not one:**
- **viewBox graphics** (pie/radar/funnel/map/word-cloud/diagram) are
  *container-responsive*: `viewBox` + `width:100%`, the parent box sizes them, and
  internal text scales as a ratio of the viewBox. They are **not** "scaled" by an
  engine step — they respond to their container by construction. **But
  container-responsive is not floor-free:** a dense figure can scale its text below
  legibility while the *box* never overflows, so the overflow probe (which measures
  box spill) sees nothing. A viewBox graphic therefore needs a **rendered-text
  legibility floor** — when its effective text would render below the floor, the
  export emits the honest ring, it does **not** silently ship 6px type (§8 rule 8,
  the FM-1 fix).
- **atomic text figures** (`matrix-2x2`, `roadmap`, `obligation-matrix`) have **no
  viewBox** — they cannot scale (their cell text hits the type floor) and must not
  split (the grid/axis meaning is the point). Overflow → the honest ring is the
  accepted terminal, not "container-responsive."

**Move 2 — one per-component DISCRIMINATOR decides treatment** (it is not the whole
per-component signal — §3 retains the opt-in gate (b), a heavy/light target, reshape
(e), and pacing (f); this bit is the one that disambiguates *identically-structured*
pairs). Two identical rendered structures can demand opposite handling:

- two `<table>`s — a **comparison** (keep whole / per-dimension) vs **records**
  (pivot per row);
- two `<ol>`s — **connected steps** (atomize + relationship signal) vs
  **independent items** (plain split).

That is the `read-across / connected` discriminator (§3c). Note structure *also*
can't tell heavy from light — `cards-grid` and `list` are **both** `ul>li` with
opposite targets — so a heavy/light signal is a second retained input.

**Granularity — deterministic, uniform (owner decision).** Content-aware packing
(fit as many as measured) is rejected: it either overflows a content-heavy member or
produces jarring uneven slides (1 card here, 3 there). Split is **deterministic**:

| Member kind | Per-slide target |
|---|---|
| independent-light (bullets) | pack a **fixed uniform** count |
| independent-heavy (cards, record rows, tiers, options) | **1 per slide** — overflow-proof + uniform (not content-aware) |
| connected / related (steps, cycle, comparisons) | **1 per slide + a relationship signal** (see below) |
| whole figure — viewBox graphic | whole slide, container-responsive (+ legibility floor → ring) |
| whole figure — atomic text (matrix/table-grid) | whole slide; overflow → ring (no scale, no split) |

*Watch item:* a `stats`/`kpi` **tile** (a lone number) at 1-per-slide reads sparse —
tiles are small enough to hold a uniform fixed group; flag for the build.

**Relationship signal — atomize, but carry the cross-slide relationship (owner
decision, resolves the trio's "atomizing destroys the comparison/sequence").** When
a connected/related member is atomized, each non-terminal slide carries a wayfinding
adornment so the set still reads as one thing:
- **sequence** (steps) → "→ next: {next step}";
- **comparison** (verdict-grid, pricing) → "Option *N* of *M* · comparing
  {shared criteria}" — the tiers stay one-per-slide (spotlight) but read as a
  compared set;
- **cycle** → "↻ back to {stage 1}" on the last card (not dropped);
- **hierarchy** (authority-chain) → "governs ↓ / under ↑", not a temporal "→ next".

The progress rail already shows *N of M*; the adornment adds *what the relationship
is*. The adornment is **derived from the neighbor member at build time, never
authored** (§8 rule 9), so it can't go stale.

All of it rides the **§0a envelope**: Cover → Body (these units) → optional Closing.

**The vertical "budget" is real but not scarce where splitting happens.** Chrome
(footer / rail / pagination) is width-relative, so it costs a fixed ~162px on every
portrait preset — ~7% of a `mobile` slide's height, ~15% of a `square`'s. Body
budget = slide height − chrome − (masthead, cover only). Every portrait preset is
1080 wide, so body type is one size across them; a taller preset simply holds more
units. **"Budget" is the internal fill line that decides *where to break to the next
slide* — never shown to a reader, never a truncation** (overflow is always more
slides, or the honest ring for an un-splittable figure that hits the legibility
floor — never "…").

## 0c. Completeness — every one of the 59 components has a treatment (2026-07-22)

Run of the whole catalog against the model. Every component has a treatment; the
three marked † are *proposed* placements that need a new authored opt-in (they carry
`capacity=null, split=null` today, so under the retained gate they currently ring).

| Treatment | Components |
|---|---|
| **Anchor — never splits** | title, closing, divider |
| **viewBox graphic — container-responsive + legibility-floor→ring** | piechart, quadrant, radar, word-cloud, funnel, map, diagram, scene, state-chart (JS-scaled; no-JS UNVERIFIED) |
| **Bitmap asset — responsive, no split** | image, video |
| **Atomic — whole slide, overflow→ring** (single text units + shared-geometry grids that can't scale or split) | big-number, quote, math, citation-card, contact, wifi, matrix-2x2, obligation-matrix, roadmap, gantt |
| **List → item · light** (pack a fixed uniform count) | list, checklist, content, agenda, list-criteria, inventory, logo-wall (by image) |
| **List → item · heavy** (1/slide, deterministic) | cards-grid, cards-stack, actors, kpi, stats *(tile — watch)*, q-and-a, policy-recommendation |
| **Record-shaped → 1 per slide** (glossary pivots via its table transform; the rest are `ol/ul>li` → list-item split) | glossary, list-tabular, regulatory-update, statute-stack |
| **Connected / related → 1/slide + relationship signal** | list-steps (→next), cycle (↻loop), authority-chain (governs↓), journey† (→next), timeline-list† (→next), verdict-grid (compare N/M), pricing (compare N/M) |
| **Read-across → keep whole / carousel** | compare-prose, compare-table, decision, redline, split-compare, split-panel, compare-code, kanban (per-lane — note: loses the cross-lane read; a keep-whole is arguably better) |
| **Code → code-cards** (by line / block — PROPOSED) | code |
| **Needs an opt-in call** | progress† (CSS bars, not a viewBox graphic — so *not* "scale like a graphic"; it's list-heavy if enrolled, else whole-slide) |

**Owner resolutions (2026-07-22):** `quadrant` stays whole (viewBox graphic);
`matrix-2x2` is **kept** (a prioritization matrix — SWOT/Eisenhower/BCG — not a
cards-grid duplicate; its `related` distinguishes them) and treated as an **atomic
text grid** (no viewBox → ring on overflow, not "container-responsive"); `cycle`
atomizes to a card per stage with a **↻ loop-back** signal on the last card;
`verdict-grid`/`pricing` are **spotlight cards (1/slide) + a comparison relationship
signal** ("Option N of M · comparing {criteria}") so the atomized tiers still read as
a compared set; heavy members are **1/slide deterministic** (not content-aware
packing — rejected as jarring); `code` splits into multiple code-cards.

**Follow-on build items (not gaps — named work):**
- **opt-in backfill** — `journey`, `timeline-list`, `progress` need an authored
  `capacity`/`split` to receive their proposed treatment (they ring today).
- **`progress`** — decide: enroll as list-heavy (split by row) or keep whole. It is
  **not** a scalable graphic (CSS bars, no viewBox).
- **`code`** — a line/block code-card splitter (`partitionAxis` refuses `line` today).
- **`kanban`** — reconcile "keep-whole" vs its `kanban-lanes` per-lane split (the
  per-lane split loses the To-Do/Doing/Done read).
- **stale `capacity.axis`** — remove it from `matrix-2x2` (atomic, not splittable);
  verify `cycle`'s is right for card-splitting.

**SVG container-responsiveness audit (2026-07-22) — the "graphics fill their box"
contract holds, with one logged defect.** All SVG components (funnel, map, quadrant,
radar-base, word-cloud, piechart, diagram/mermaid, scene) are genuinely
container-responsive: `viewBox` + `width:100%`, internal text sized as a ratio of the
viewBox. Mermaid's fixed-px output is correctly overridden to `100% !important`.
Off-path defects found and logged (a **separate** code fix, not this doc — HARD #18):
- **`radar` small-multiples** — `.radar-svg--mini { width:188px; height:188px }`
  (`radar.styles.css:236-238`) hard-pins physical px, so mini tiles don't track the
  container/resolution. Fix: cqi (or a shared token).
- **lint blind spot** — `tools/check-chart-responsiveness.js` blanket-exempts any
  `-svg` selector, which is why the fixed px above escaped the gate. The exemption
  should cover viewBox-internal units, not `width`/`height` on the SVG element box.
- **`state-chart`** — container-responsive via a *runtime JS* scaler, not pure
  CSS/viewBox; its no-JS static fallback is **UNVERIFIED**.

---

## 1. What already holds — the kernel is NOT component-centric (with one caveat)

The split *decision core* branches only on an abstract structural **axis**, never
on a component name:

- `lib/core/collections.js` `partitionAxis(html, axis, perSlide)` splits `item`
  (list `<li>`) and `row` (table `<tr>`), repeats heading + `<thead>`, renumbers
  `<ol>` via `start=`, and **returns `null` for `col`/`cell`/`line`**.
- `lib/core/auto-split.js` `SPLITTABLE = new Set(['item','row'])` drives the
  measured `measure → split → re-render → re-measure` loop.
- Universal chrome — eyebrow/title/subtitle (first slide, `(cont.)`),
  key-insight, below-note, footer, pagination, **progress rail** (`applyRails`) —
  is component-independent, detected by markdown shape. This is exactly the
  "header first, universal stuff carried, pagination + rail everywhere" the
  prompt asks for. It exists.

**Caveat the trio added (HARD #1 honesty):** the *pure kernel* is generic, but
component-shape knowledge sits just outside it. `CLIP_CELL_SELECTOR =
'.cell-stage, .panel-right, .compare-right'` (defined `overflow-probe.js:35`) is
imported by `collections.js:309` and baked into the item selector
(`collections.js:310-314`, `ITEM_SELECTOR`), and the driver keys overflow
eligibility off strategy-name lists (`STRUCTURAL_CAROUSEL_NAMES` /
`PAGINATOR_CAROUSEL_NAMES` in the generated `lattice-emulator.js` — line numbers
omitted as it is a generated file). "The kernel
is generic" is true of `partitionAxis`/`countAxis`/`SPLITTABLE`; it is not true of
the whole split pipeline.

## 2. The residue — where component-centricity actually lives

**(a) The DATA is hand-declared.** A component participates by authoring
`capacity.axis` and/or `split` in its manifest; the driver enrolls it only if
`axis || m.split` (the `SPLIT_CAP` map build in the generated `lattice-emulator.js`). A component that declares neither
falls to the ring. This *opt-in* is the owner's target ("why declare?"), and §3–§4
answer it honestly.

**(b) The MECHANISM hand-parses each component's DOM.** Read-across and
accent-cover layouts are re-authored by `lib/core/carousel.js`, which dispatches
`split.strategy` into **9 builders** (`feature-cover`, `cover-rows`, `cover-sides`,
`cover-decision`, `cover-code`, `redline-blocks`, `kanban-lanes`, `cover-cards`,
`cover-paginate`). Each hand-parses that component's rendered DOM
(`readFeature`→`.panel-right`/`.watermark`; `readCode`→`.code-cols`). This is the
genuinely hand-crafted code the prompt reacts to — and §5 is where it can actually
be reduced.

## 3. The intent vector — the dimensions structure cannot supply

*(Six were identified; §0a then resolved (d) to a universal rule, so **five** remain
per-component. The table keeps (d) for the record, marked RESOLVED.)*

The owner's question — *why declare?* — has a real answer: because splitting
depends on facts about **meaning and authored intent** that identical markup does
not carry. The trio enumerated them from shipping code. Each is a dimension
`(form, substance, rendered structure)` fails to determine:

| # | Dimension | The declaration that carries it | Why structure can't supply it |
|---|---|---|---|
| a | **Pagination axis** (`item` vs `row`) | `capacity.axis` / `split.axis` | `glossary` slot is `ul > li` but it splits on `row` — a runtime transform turns the list into a table; its manifest states *"the row axis is not measurable at authoring time"* (`auto-split.js:230` handles exactly this). Render-shape ≠ authoring-shape. |
| b | **Is this collection a split seam?** | declaring `capacity.axis` and/or `split` at all (the `axis \|\| m.split` opt-in that enrolls a component into the derived `SPLIT_CAP` registry in the generated `lattice-emulator.js`) | ≈20 components carry a `ul`/`table` slot that must NOT paginate — `big-number`, `funnel`, `piechart`, `citation-card`, `radar`, `map`, … Their list is incidental (a caption, a data legend). The opt-in declaration *is* the discriminator. |
| c | **Read-across vs stackable** | `split.strategy` presence | The genuine irreducible bit. Real collision: `split-panel` (`panel`/`structure`, read-across, `feature-cover`) vs `policy-recommendation` (`panel`/`structure`, stackable, `capacity.axis:item`) — identical `form` AND `substance`, opposite split treatment. |
| d | **~~Accent cover vs bare partition~~ — RESOLVED (§0a)** | ~~`cover-paginate` vs none~~ → now a **universal rule: cover always** | **No longer a per-component dimension.** The owner ruled every split gets a cover (§0a), so this constant leaves the vector — which shrinks from six to five. (Historically: stackable split two ways — bare `partitionAxis` vs accent `cover-paginate`; that difference is now unified to always-cover.) |
| e | **Overflow-reshape move** | `WIDTH_REDUCING_STRATEGIES` membership | `{cover-code, cover-sides, cover-cards}` are width-reducers (actionable on *any* overflow); the rest paginate vertically (actionable on vertical overflow only). This cuts *across* read-across and, per the `WIDTH_REDUCING_STRATEGIES` set + its rationale comment in the generated `lattice-emulator.js`, is what stopped a wide `compare-table`/`obligation-matrix` row-splitting futilely and ballooning the deck (**bugs #499/#500**). |
| f | **Per-page pacing** | `split.perPage` | Authored intent: `decision.perPage:1` (one justification per slide — editorial), `glossary:8` (dense), `statute-stack:2`. The measured pass only *densifies* toward a cap (`per = min(manifestPer, ratioBased)`, `carousel.js:353`); it cannot recover the seed. |

**Consequence for "why declare?":** the declarations are not hand-crafted *layout*
(the owner's fear) — they are a compact **intent vector** of at most ~5 fields, and
the engine already applies it generically. The fear is right about the *mechanism*
(§2b) and wrong about the *vector* (§3): the vector is irreducible to structure.

## 4. What is derivable, what is defaultable, what is irreducible

Sorting the vector honestly (this replaces the first draft's "derive and delete"):

- **Irreducible — stays a per-component signal, no exceptions:**
  - **axis (a)** — *superseded by §0b.* This section argued the axis is
    irreducible because it can't be read from *authored* markdown (`glossary`
    authors as a list, splits as a table). The synthesis corrects the altitude:
    the split runs on **rendered** HTML, where the axis **is** derivable from the
    DOM (list → item, table → row, svg → container-responsive). `capacity.axis`/`split.axis` is
    **retained only as the pre-render count estimate**, not as the split authority
    — not "VETOED as irreplaceable." The forbidden guess is inferring intent from
    *authored content*; reading the *rendered* structure is deterministic.
  - **split-seam opt-in (b)** — a rendered collection does not imply a split
    axis. The opt-in gate is **retained**; undeclared collection → the ring, never
    an auto-split.
- **Universal — no longer per-component (§0a):** accent-cover (d) is resolved to a
  constant by owner decision — every split gets a cover. It leaves the vector.
- **Defaultable — derive a DEFAULT from the required classification, allow
  override:** read-across (c) and reshape-move (e) correlate with `form`/`substance`
  (e.g. `panel`/`split` forms lean read-across; `graph`/`series` substance leans
  atomic). A new component can inherit a sane default and only *override* when the
  classification is wrong for it. This is the low-effort win — fewer fields to
  author — WITHOUT deleting the vector or the opt-in gate.
- **Authored — no default is honest:** pacing (f). `perPage:1` is an editorial
  choice; a derived count would flatten it. Keep it authored (defaulted to "as
  many as legibly fit" only when unspecified).

**The pivot/transpose (correction).** It is **not new**: `coverCardsSections`
(`carousel.js:297-335`) already transposes a table row into a `<dt>/<dd>` card, and
it is wired to the read-across `compare-table`. The first draft's "gate pivot on
`readAcross:false`" is backwards — the safe seam is *between rows* (each row's cells
stay together in one card), which is **orthogonal** to read-across. So §4 of the
build is "generalize `cover-cards`," one transposer, one source of truth (HARD #1)
— not a second, oppositely-gated move.

## 5. The mechanism collapse — slot-driven re-authors, gated by conservation

This is where hand-crafting genuinely retires. The §0a envelope makes it
tractable: the re-author has **one shape** for every component — cover ← masthead
slots, body ← the collection slot, closing ← trailing-note slots — so only the body
iteration varies. The manifest exposes each
component's structure as slot selectors (`slots.<slot>.selector` in the manifest
and mirrored in `dist/docs/components.json`; e.g. `compare-table` →
`slots.table.selector: "table"`, `slots.title.selector: "h2"`). A single
slot-driven re-author can replace the hand-parsers **for the flow layouts**, with
two hard limits the trio surfaced:

- **Slot insufficiency (sovereign tail stays).** Some slots can't drive a generic
  walk: `state-chart`'s `transitions` and `detail` share the *identical* selector
  `ol > li > ul > li` (disambiguated only by a human note); `compare-code` has two
  positional singleton slots (`h3:nth-of-type(2) + pre`) and no collection slot.
  These ~14 sovereign builders are **retained** behind an allowlist — matching, not
  contradicting, the §9 plan.
- **Content-conservation gate (mandatory).** Slots expose only title + primary
  collection, but the builders extract more that no slot names — `readFeature` pulls
  `.watermark`, `.panel-eyebrow`, `.lede`; `splitCoverSides` carries the `.below-note`
  **verdict** to a final slide. A naive slot walk would silently drop them —
  exactly the clip-not-fade loss `forms.md §6` / Fit Spine axiom 4 forbid. So a
  builder is retired **only** when a conservation gate proves the emitted pages'
  leaf/text nodes are a superset of the source section's.

## 6. Reconciling with the Fit Spine (what changed from the first draft)

The first draft claimed axis-derivation "is not a guess; it is a total function
over declared inputs." The trio proved that false (§3a: `structure` substance maps
to both `item` and `row`; only per-slide DOM separates them). So this doc does
**not** derive the axis from content and does **not** retire `capacity.axis`. It
stays inside the Fit Spine's rule: *the solver acts on declared, per-component
intent, never on a per-slide content guess.* What it adds is (1) **defaults** for
the *defaultable* dimensions (c/e; (d) is now the universal envelope per §0a)
computed from the required `form`/`substance`
— deterministic, identical for every deck using that component — and (2) a generic
**mechanism**. HARD RULE #1 (render paths share one source of truth) is served by
consolidating the mechanism, not by deleting the per-component vector.

Two corrections to older docs, folded in: the **landscape-lock quarantine** for
read-across was **retired 2026-06-25** (read-across is now re-authored into a
portrait carousel, not orientation-locked); the catalog is ~59 components.

## 7. Red team — the surviving refutations (folded from §12)

- **"One boolean" is refuted** — the driver needs the orthogonal
  width-reducing/reshape axis (#499/#500) *and* a heavy/light signal (`cards-grid`
  and `list` are both `ul>li`, opposite targets), so treatment spans ≥2 orthogonal
  inputs beyond structure, not 1. *(The pre-§0a "bare vs `cover-paginate`" two-way
  split is retired — cover is now universal, §0a.)* (§3 c/e.)
- **"Derive the axis, retire the field" is not byte-faithful** — `glossary`
  (list-authored, row-split) and the chart bucket (`state-chart`/`gantt`/
  `timeline-list` carry `ol>li` but must not paginate) break it. (§3 a/b, §4.)
- **"9 → one re-author" is contradicted by the plan itself** — the sovereign tail
  is retained; slots are insufficient for it. (§5.)
- **The pivot already ships** as `cover-cards`, gated backwards in the draft. (§4.)
- **The §3 "byte-identical" proof was wrong** — `list-tabular` is `ol > li`, not a
  table, and differs in `substance` from `compare-table`. Replaced with the real
  `split-panel` vs `policy-recommendation` collision. (§3c.)

## 8. Munger inversion — the binding rules the build must adopt

Each is a failure mode the first draft left open; stated as a rule so it stays shut.

1. **Axis is read from the RENDERED DOM at split time (§0b), never inferred from
   authored content.** The rendered structure (list / table / svg / pre) is the
   authority; `capacity.axis` is retained only as the pre-render count estimate.
   (This supersedes the first draft's "never read from a slide's DOM" — that
   confused authored markdown with rendered HTML; see §0b.)
2. **`readAcross` alone cannot reconstruct the policy.** Any retirement of
   `split.strategy` must preserve the width-reducing/reshape class (#499/#500); the
   migration is to a small enum, not a boolean. (Accent-cover is NOT a preserved
   class — §0a made the cover universal.)
3. **A rendered collection does not imply a split seam.** The opt-in gate is
   retained; an undeclared collection defaults to the ring, not structural-split.
4. **The transpose is `cover-cards`, generalized — one transposer.** No second,
   oppositely-gated pivot path (HARD #1).
5. **A retired derived field needs a STANDING oracle.** A committed, blessed golden
   of `{component → (axis, read-across, cover-class, reshape-class)}`, gated in
   `build:check`, so a later DOM refactor that drifts a *default* fails CI —
   parity-at-migration is necessary but not sufficient.
6. **Slot-driven re-author must pass content-conservation before any builder
   retires** (§5) — no silent drop of watermark/eyebrow/lede/verdict.
7. **No dead-but-present fields.** A field is deleted in the same PR that flips its
   consumers to the default (HARD #18); and any signal the browser probe consumes
   must resolve at registry-build time from static manifest data, not render.
   `capacity.escalateTo` (a component-substitution graph, `verdict-grid` →
   `compare-table`) is authored routing and must be explicitly kept or migrated,
   not silently dropped with `capacity`.

*(Rules 8–12 added by the second trio pass — §12.)*

8. **A viewBox graphic has a rendered-text legibility floor.** Container-responsive
   is **not** floor-free: a dense figure scales its internal text below legibility
   while the box never overflows, so the overflow probe (box-spill only) sees
   nothing and the slide ships silently at 6px type. Measure the figure's effective
   on-page text px; below the floor → the honest ring, never a silent shrink. This
   is the FM-1 fix and it removes the §0b contradiction between "no type floor" and
   "the honest ring."
9. **"Cover always" (§0a) is a MECHANISM phase, not a free consequence.** No split
   path may emit a bare `(cont.)` partition once §0a lands: `autoSplitDeck` and
   `resplitDoc`'s plain branch must route through the same cover→body→closing
   builder as `cover-paginate`, and `partitionAxis`'s repeated `post` must hoist any
   `.below-note`/key-insight into ONE closing slide — never stamped per body page (it
   duplicates today). A gate asserts every split run begins with exactly one cover
   and carries ≤1 closing. (FM-2.)
10. **The pre-render count pass may only DEFER, never CUT.** With axis derivation at
    render time, the startup pass's sole job is "might this overflow? → hand it to
    the measured loop." It must not emit a final partition on the *authoring*-shape
    axis (which would land coverless and the measured pass can't retro-wrap it). Any
    real cut + its cover is produced by the render-time builder that reads the real
    DOM, so the estimate axis and the split axis can't disagree in shipped bytes.
    (FM-4.)
11. **The oracle records a VERIFIED default, it never mints one.** Adding a component
    to the standing golden (rule 5) requires a committed demo deck exercising its
    overflow path (HARD #9) + reviewer sign-off that the derived (axis, read-across,
    reshape) matches intent — the entry is the *record* of a verified default, not
    the *source*. Drift-detection ≠ initial-correctness. (FM-5.)
12. **Relationship signal is derived + the kernel operates on the content cell.**
    (a) The adornment (→next / ↻loop / compare N-of-M / governs↓) is synthesized from
    the neighbor member at build time, **never authored**, so it can't stale (a test
    asserts editing member N+1 changes member N's emitted signal). (b) The generic
    split resolves its collection **inside the content cell** (`.cell-stage` / the
    declared content slot), never "first `<ul>` in the section" — chrome, masthead,
    footer, and nested-component lists are out of scope by construction. (FM-6, FM-3.)

## 9. Phasing (corrected; each one branch → one PR, HARD #17; green + demo each step)

- **P0 — this design model (hardened).** ☐ The acceptance test for P1–P4.
- **P1 — the content-conservation gate + one slot-driven re-author for the flow
  layouts.** Retire the flow-layout hand-parsers in `carousel.js`; sovereign
  builders retained behind an allowlist (§5). Maker-checker (shared-kernel blast
  radius). This is the pure mechanism win — no policy change, no field retirement.
- **P2 — defaults for the defaultable dimensions (c/e) from `form`/`substance`,
  with per-component override and the standing golden oracle (rule 5).** ((d) is
  handled by the universal envelope, §0a — not a defaulted per-component field.) A new
  component inherits a sane split default; existing components' resolved vector is
  parity-pinned. No field deleted (rule 7 applies only once a default provably
  matches).
- **P3 — generalize `cover-cards`** into the shared transposer for tall tables
  (§4); portrait-family only. Per-feature demo deck + committed PDF (HARD #9).
- **P4 — (only if P2's evidence supports it) collapse `split.strategy` to the
  small enum** implied by §3 c/e (read-across × reshape-move; cover is universal
  per §0a), migrating each component; `capacity.axis`,
  `perPage`, `escalateTo` stay. Gated by the oracle.

*Phases added by the second trio pass (§12):*
- **P0-backfill — opt-in for `journey`, `timeline-list`, `progress`** (they ring
  today; their §0c placement needs an authored `capacity`/`split`).
- **P-envelope — the universal cover→body→closing mechanism** (rule 9): route the
  plain `partitionAxis` path through the cover-emitting builder and hoist the
  below-note to one closing slide. Must land **before** any defaulting (P2), since
  §0a is unbuilt on that path today. Maker-checker.
- **P-floor — the viewBox legibility floor + honest ring** (rule 8): measure
  rendered figure text; ring below the floor. Gates the "graphics never ship
  illegible" claim before default-on.

## 10. What this doc decides

1. The split **kernel is generic**; the residue is the hand-declared **intent
   vector** (§3) and the hand-parsed **mechanism** (§2b) — and shape-coupling just
   outside the kernel (§1 caveat).
2. Split policy is **only partly derivable from structure** (refined by §0b): the
   **axis (a) IS derivable from the RENDERED DOM** (list/table/svg/pre) — `capacity.axis`
   is kept only as the pre-render count estimate, and only ratifies an **opted-in**
   candidate; **split-seam opt-in (b)** is retained;
   **read-across / connected (c)** is the **one irreducible discriminator** for treatment
   (alongside a retained heavy/light signal);
   **accent-cover (d)** is **universal (§0a — cover always)**; **reshape-move (e)** is
   **defaultable from the required classification**,
   and pacing (f) stays **authored** (§0a, §3–§4).
3. The real win is **(1) a generic slot-driven mechanism gated by
   content-conservation** and **(2) classification-derived defaults** — never
   deleting the vector or the opt-in gate (§5, §8).
4. The **pivot is `cover-cards` generalized**, one transposer (§4).
5. This stays inside the Fit Spine (no content-guess; defaults are deterministic
   per component) and serves HARD #1 by consolidating the mechanism (§6).

## 11. The one fork left for the owner — now evidenced

The first draft asked whether `split.strategy` is "one bit in nine costumes." The
trio answered it from shipping code: **it is not.** Split intent spans **≥2
orthogonal dimensions beyond structure** — read-across? · width-reducing/reshape? —
plus a heavy/light target and authored `perPage`; **cover is universal (§0a), not a
dimension.** So the P4 migration, *if taken*, is **9 → a small real enum**, never
**9 → one boolean**. The genuine remaining fork is narrower and yours to weigh:

> **Is P4 worth doing at all?** P1 (the mechanism collapse) and P2 (defaults)
> deliver most of the "stop hand-crafting / low-effort for new components" goal
> without touching `split.strategy`. Collapsing the 9 strategies to an enum (P4) is
> additional churn for a smaller marginal gain. **Recommendation: ship P1–P3;
> treat P4 as optional, pending P2's evidence that the enum is cleaner than the
> named strategies.**

## 12. Adversarial trio (2026-07-22) — the HARD RULE #25 obligation, and what it changed

This proposal is genuinely novel and gates an engine-transform build (high blast
radius), so it got the full trio — applied to the recommendation as written.

- **Independent checker** — verified every file:line and cross-reference; caught
  that the load-bearing §3 proof was **factually wrong** (`list-tabular` is
  `ol > li`, not a table; differs in `substance`), so the chosen example *refuted*
  the thesis it was meant to prove. → §3 rebuilt on the real `split-panel` vs
  `policy-recommendation` collision.
- **Munger inversion** — surfaced that the axis is **not derivable from the
  required classification** (`glossary`: list-authored, row-split) — *later refined
  by §0b: it IS derivable from the RENDERED DOM at split time, just not from authored
  markdown* — that
  "atomic-by-structure" is **empirically false** (≈20 components carry an incidental
  collection), that the opt-in gate is a **safety gate** the draft deleted, and that
  a retired field leaves **no standing oracle**. → §3a/b, §4, §8 rules 1/3/5/7.
- **Red team** — refuted "one boolean" (stackable splits two ways + the
  width-reducing axis, #499/#500), "9 → one re-author" (sovereign tail retained;
  slot insufficiency), and "new pivot" (`cover-cards` already transposes). → §3d/e,
  §4, §5, §11.

**Net effect:** the *descriptive* thesis survived (the kernel is generic; a real
irreducible read-across bit exists). The *prescriptive* thesis was **inverted** —
from "derive the policy from structure and delete the declarations, reducing to one
boolean" to "structure supplies the mechanism, not the policy; default the
irreducible-to-structure intent vector from classification and collapse the
hand-parsers, retaining the axis, the opt-in gate, and pacing." Recording that
inversion is the HARD RULE #25 obligation for work of this blast radius.

### Second trio pass (2026-07-22) — on the settled model (§0a/§0b/§0c) before merge

After the envelope + settled-model + coverage rewrite, a second full trio ran on the
current doc. All three converged; the descriptive spine held again, but several
*settled-model claims as worded* were false or self-contradictory and are corrected
above.

- **Independent checker** — found 7 internal contradictions (stale amendment
  cross-refs: §11/§7/§8 still treated accent-cover as a live dimension after §0a made
  it universal; the summary still said "graphics scale") and **one factual error**:
  §0c's "Table → row · records" bucket misclassified 3 of 4 members —
  `list-tabular`/`regulatory-update`/`statute-stack` render as `ol/ul>li` (list-item
  split), only `glossary` pivots a real `<table>`. → §0c relabeled; §7/§8/§11 accent-cover
  refs fixed; summary reworded.
- **Red team** — killed the wording of three settled claims: **"axis free from
  structure"** (`matrix-2x2` renders a live `<ul>`, `roadmap`/`obligation-matrix` live
  `<table>`s that must NOT split — saved only by the opt-in gate → §0b Move 1 now says
  "candidate, ratified by the gate"); **"container-responsive, never split"** conflated
  viewBox graphics with atomic text grids → §0b/§0c split into two buckets;
  **"heavy = 1/slide" vs authored `sweet`** → resolved by the owner to deterministic
  1/slide (below).
- **Munger inversion** — six build-time failure modes → §8 rules 8–12 + §9 phases:
  **FM-1** a container-responsive figure with no legibility floor ships silently at
  6px type (the "honest ring" is mechanically impossible for a scaled viewBox) — the
  worst, "ships quietly wrong"; **FM-2** cover-always is unbuilt on the plain
  `partitionAxis` path and duplicates the below-note per page; **FM-3** "first `<ul>`"
  splits chrome/masthead; **FM-4** pre-cut vs render axis; **FM-5** the oracle blesses
  a wrong default for a new component; **FM-6** the relationship signal must be derived,
  not authored.

**Owner decisions folded in (2026-07-22):**
1. **Heavy members atomize deterministically — 1 per slide, not content-aware
   `sweet`-packing.** Rationale (owner): packing either overflows a content-heavy
   member or produces jarring uneven slides (1 here, 3 there); uniform 1/slide is
   overflow-proof and consistent. (Watch: a `stats`/`kpi` *tile* — a lone number — at
   1/slide reads sparse; tiles take a uniform fixed group.)
2. **`verdict-grid`/`pricing` are spotlight cards (1/slide) PLUS a comparison
   relationship signal** ("Option N of M · comparing {criteria}") so the atomized
   tiers still read as a compared set — generalizing the forward-pill into a family
   of relationship signals (→next / ↻loop / compare-N-of-M / governs↓), all derived
   from the neighbor at build time.

**Net effect of the second pass:** no change to the *direction*; the settled model's
*claims* were tightened — candidate-axis-not-free, two figure buckets with a
legibility floor, one *discriminator* (not "one bit") atop a retained vector,
deterministic atomization with relationship signals, and the coverage table
corrected — plus five new binding rules and three new phases for the failure modes a
build would otherwise hit.
