---
status: in-progress
summary: The foundational spine for responsive/dense-slide work — Frames are the single owner of box-response; a solver fits content by COLLAPSE → SHED → SPLIT and stops at a readability FLOOR, never shrinking. Defines the earn-its-keep ledger (keep/refactor/purge for every existing adaptive mechanism), the Munger inversion that produces the design rules, the red-team that attacks them, and a phased clean-canvas teardown that keeps the tree green at every step. Supersedes the de-boost and reframes per-component reflow as a Frame property.
---

# The Fit Spine — Frames own box-response; a solver fits without shrinking

**Date:** 2026-06-22 · **Status:** In progress — **P0** ratified · **P1** (de-boost
purge) shipped · **P2** rescoped to doc-only · **P3** collapse done, relocate
blocked on islands→Form realization · **P4** split kernel in progress (pulled
ahead) — see §7 · **Decision owner:** maintainer

This is the **spine**: the load-bearing model that the responsive / dense-slide
work hangs off, and the acceptance test every future change is measured against.
It does not introduce a feature. It decides *what the system is* so that the
features (de-boost purge, Frame slicing, the partition solver, the data backfill)
each have one obvious place to live and one reason to exist.

It builds on, and partly supersedes, the scattered prior work:
`2026-06-21-reflow-as-form-capability.md` (Frames as the reflow owner — **kept,
promoted to invariant**), `2026-06-20-native-to-reflow-feasibility.md` (the
solver/pagination scoping — **kept, re-sequenced**), `2026-06-21-portrait-prose-deboost.md`
(text de-boost — **superseded; purged**), and `design/forms.md` (the Frame · Cell ·
Tile grammar — **the spine's vocabulary, unchanged**).

---

## 0. The one-sentence spine

> **A Frame fits its content to whatever box it is given by COLLAPSING, then
> SHEDDING, then SPLITTING — and if none of those make it fit at the readability
> floor, it shows an honest overflow, it never shrinks the type.**

Everything below is the justification, the boundaries, and the demolition plan for
that sentence. Two corollaries fall straight out of it and are the heart of the
rework:

- **Box-response has exactly one owner: the Frame**, reading exactly one classifier
  (`families.js`) — not 32 components each reinventing it. (§2)
- **Readability is a hard floor, not a soft preference.** There is no
  shrink-to-fit primitive anywhere in the system; "make it smaller until it fits"
  is not a move the engine can make. (§3)

---

## 1. First principles (the axioms the spine is derived from)

Stated so the rest is *derivation*, not opinion. If a later decision contradicts
one of these, the decision is wrong, not the axiom.

1. **Readability is the single most valuable property.** A slide that is smaller
   than legible has failed, regardless of whether "it fit." We would rather show a
   visible overflow than an illegible slide.
2. **A look is a function, not a picture.** `(Frame × box × resolution × theme) →
   look` (`forms.md` §1, `reflow-as-form-capability.md` §1). Responsiveness is not
   a mode; it is the *box* argument changing. This is why box-response belongs to
   the Frame — the Frame is the function.
3. **One source of truth per concern (HARD RULE #1).** Box-response, the split
   kernel, the type floor, the box-shape signal — each has exactly one
   implementation, consumed everywhere.
4. **Delivered content is never silently lost (`forms.md` §6 — clip+ring over
   fade).** Shedding *relocates* or *honestly flags*; it never makes authored
   content vanish without a trace.
5. **Earn-its-keep.** A mechanism survives only if it serves the spine. "It works"
   and "it's already here" are not reasons to keep it. The default for anything
   that doesn't serve the spine is **delete**, not deprecate-in-place — a
   deprecated mechanism is a broken window.

---

## 2. The Frame is the sole owner of box-response

### 2.1 What "remove reflow" actually resolves to

"Reflow" in today's tree is **three** unrelated mechanisms (the deep assessment
established this). The earn-its-keep test resolves each:

| Mechanism | Today | Serves the spine? | Verdict |
|---|---|---|---|
| **(a) Per-component `@container` self-adaptation** — 32 components each answer "what do *I* do in a tall box?" | component `.styles.css` | **No** — 32 owners of one concern; the exact drift HARD #1 forbids | **Refactor up** into Frame slicing; retire the per-component CSS as components become Tiles |
| **(b) `[data-orientation]` section-element flips** — split-panel, citation-card flip their own axis | 2 components | **No** — rides a *second*, coarser signal (3-bucket) | **Refactor up** — become Frames with `tall`/`strip` slicing |
| **(c) Collapse-to-one-column** — a 3-col grid → 1 col on a phone | emergent from (a) | **Yes, intrinsically** — it is physics, not a strategy | **Keep, relocate** — owned by the Frame, expressed once |

The honest finding, stated plainly so we don't lie to ourselves later:
**collapse-to-one-column cannot be removed.** A four-up card grid at 390px gives
~120px columns; that is illegible, and you forbade shrinking, and four atomic
cards can't be split or shed without losing 75% of the slide. *Something* must
make it one column. The win is not eliminating that move — it is **moving it from
32 component stylesheets to one Frame contract.** "Remove reflow" = *"no component
ever decides its own box-response; the Frame decides, the Tile fills."* That is
coherent, buildable, and is exactly `reflow-as-form-capability.md` §9.

> **Red-team, answered up front:** *"Then you didn't remove reflow, you renamed
> it."* Correct, and we say so. We remove the **duplication and the ownership
> sprawl**, not the capability. The capability collapses from 32 owners to 1. If
> the intent were *zero* box-responsive CSS anywhere, the only consistent way to
> honor it is build-time-only rendering with no live preview responsiveness — a
> worse product (no authoring feedback, churn on resize) for a purity that buys
> nothing. **Rejected branch**, named so it stays rejected.

### 2.2 One classifier, two stamps (corrected 2026-06-22)

An earlier draft of this section called for retiring `data-orientation` into
`data-family` as "one signal." The P2 inventory corrected it: those two attributes
are **not redundant** — they are the **same classifier (`lib/adaptive/families.js`)
emitted at two timings**, and the M1 boundary unification already makes them
provably unable to disagree:

- **`data-orientation`** — the **authored** orientation, stamped **server-side**
  (`lib/engine/slides.js`) from the deck's `@size`. Present in **static exports
  (PDF/HTML, no JS)** — it is what gives an author-made portrait deck its portrait
  type and reflow in a plain export. 3-value (landscape / square / portrait).
- **`data-family`** — the **measured** box family, stamped at **runtime**
  (`lib/runtime/index.js`) from the live box. Drives the responsive-Frame slicing;
  **absent from a static export** (which correctly shows the authored look).
  4-value (wide / square / tall / strip), where portrait = tall ∪ strip.

**HARD #1 is satisfied by the one classifier, not by one attribute.** Both derive
from `families.js` (`familyFor` → `FAMILY_TO_ORIENTATION`), sharing one boundary
set `[0.5, 0.9, 1.05]`, so the leaf (`@container`) and the Frame (`data-family`)
can't disagree. The genuinely redundant *third* encoding — per-component
`@container aspect-ratio` queries — is the one that retires, folding up into Frame
slicing as components become Tiles (§5, P6). **Merging the two stamps into one
attribute was considered and rejected**: it would force the engine to stamp the
4-family server-side, rewrite ~15 component stylesheets + typography + 4 JS
transforms, and change static-export bytes — all to merge two stamps that serve
different timings and already share one classifier. It does not earn its keep.

---

## 3. The Fit Ladder — the only four moves, in priority order

A Frame fitting content to a box has **exactly four** moves. They are ordered;
each fires only when the cheaper one above is exhausted. This closed list *is* the
solver's policy — there is no fifth move, and crucially **no shrink move.**

| # | Move | Owner | Continuous or discrete | Loses content? |
|---|---|---|---|---|
| 1 | **Collapse** — give the Tile a narrower Cell (3-col → 1-col) | Frame slicing (CSS keyed on `data-family`) | continuous (CSS, no churn) | no |
| 2 | **Shed** — relocate a low-priority Cell (chrome bay → footer) or, if genuinely redundant, `region: null` | Frame slicing | continuous | no (relocate) / explicit (null) |
| 3 | **Split** — re-paginate across frames at a declared seam | the partition kernel | **discrete, build-time** | no (continuation) |
| 4 | **Floor** — none of 1–3 fit at the legible floor → stop, show the overflow ring | overflow watcher | terminal | no (honest failure) |

Three properties make this the spine and not just a list:

- **Moves 1–2 are continuous and declarative.** Collapse and shed are generated
  Frame CSS keyed on the measured `data-family`; they respond to a live-resizing
  fluid box with zero churn, because they restyle, they don't re-paginate. This is
  what makes a live preview viable.
- **Move 3 is discrete and build-time.** Splitting changes slide *count*, which
  the engine has never owned. **It is scoped to the PRESENTATION families —
  `square`, `tall`, `strip` (square · portrait · story · mobile) — and does not run at
  `wide`.** This note's original wording said "portrait/square `@sizes`" and gave the
  wrong reason: *"in a wide/landscape box, moves 1–2 (collapse + shed) resolve overflow
  before split is reached."* That is an assumption and measured it is false — four
  committed landscape decks and five component galleries carry a clipping slide today,
  which moves 1–2 did not resolve. **The real reason is that 16:9 is the box a deck is
  AUTHORED in** (2026-07-29): an author judging fit at `hd` has already decided the slide,
  and re-cutting it would be the engine solving a problem they do not have. `4K` is the
  same box at 2× — `cqi` is width-relative — so the two behave identically. Those
  landscape clips are real authoring defects, and the ring plus `lint:deck`'s
  `capacity-overflow` (which names the non-split) is their terminal. The gate is a
  FAMILY, not an @size list, so a custom geometry classifies correctly. See
  `2026-07-29-autosplit-is-not-a-toggle.md` §"Two corrections". It runs
  at render time against a known target
  geometry (the per-device export the emailed-link reader receives), in ONE pass
  over one kernel (`lib/core/auto-split.js`): a **measured** loop renders the
  deck headless, finds the slides that *actually* clip (by their
  `scrollHeight/clientHeight` ratio), divides each by that ratio, and re-renders +
  re-measures until the deck fits. It catches **density**
  overflow — few but tall items that no count threshold sees — the dominant cause
  in a tall/portrait box. There was once a second, **count-based** pre-cut that split a
  slide past its layout's `capacity.hard`; it was **retired 2026-07-29** because a count
  is not a fit — it cut slides that fit their box comfortably. `capacity` is an editorial
  budget read by `lint:deck`, and the splitter now reads it only for *pacing* once the
  measured pass has decided to cut. **Live runtime re-pagination is rejected** — re-breaking
  and re-numbering slides as a phone rotates is churn and a navigation/anchor
  maintenance nightmare (the inversion in §4 derives this). **Narrowed 2026-06-25:**
only the *unbounded* form stays rejected; a *bounded* runtime split — portrait
viewing family only, logical (run-id) addressing, eventual-consistency
placeholders, landscape artifact untouched — is accepted in principle and specced
in `2026-06-25-runtime-autosplit-eventual-consistency.md`. Shipping code is still
build-time-only until that is built.
- **Move 4 is a hard stop, by design.** The floor is the curated per-orientation
  type scale (already shipped — `2026-06-20-typography-categories.md`). Below it,
  the engine does **not** have a smaller size to reach for. The overflow ring is
  the contract: *readability, or a visible honest failure — never a silent
  shrink.*

---

## 4. Munger inversion — design the failure, then forbid it

Instead of asking "how do we build this well," ask **"what would guarantee this
becomes a tech-debt maintenance nightmare?"** Each failure mode inverts directly
into a binding design rule.

| If we wanted to GUARANTEE failure, we would… | …so the rule is |
|---|---|
| Scatter box-response across N component stylesheets so every one drifts | **One owner: the Frame. One signal: `data-family`.** (§2) |
| Ship a shrink-to-fit escape hatch — it silently becomes the default crutch and the readability bar erodes everywhere, invisibly | **No shrink primitive exists.** The floor is a hard stop with a visible ring. (§3) |
| Build the split logic twice (build-time + runtime) so they diverge | **One pure partition kernel** (HARD #1), consumed by both; runtime *re-pagination* rejected outright. |
| Let the solver guess shed/split when a component declares no priority | **Missing `priority`/`droppable`/`keepTogether` is a lint error, not a guess.** The solver refuses to act on undeclared intent. (§6) |
| Let "shed" silently drop authored content | **Shed relocates or rings; never silent drop** (axiom 4). |
| Keep dead mechanisms "just in case" / deprecate-in-place | **Earn-its-keep: not serving the spine ⟹ deleted**, not parked. (§5) |
| Re-introduce per-named-size layout variants to "handle phones" | **Looks are a function of the box, never enumerated per size** (axiom 2). |
| Mask the density problem so we can't see it | **Purge the de-boost first** — it hides clipping behind shrunk type; removing it makes the real problem visible, which is the precondition for solving it. (§7) |

The last row is the sharpest piece of inversion and it sets the teardown order: a
**masked** problem is worse than a visible one, because you optimize against the
mask. The de-boost is the mask. It comes out first.

---

## 5. The earn-its-keep ledger — every adaptive mechanism, judged

The question for each: *does it serve the Frame spine?* Keep / Refactor-up /
Purge. This is the clean-canvas inventory.

### Keep — load-bearing for the spine

| Mechanism | Why it earns its keep |
|---|---|
| **Form / Frame / Cell / Tile model** (`design/forms.md`, `lib/forms/`) | The spine itself. |
| **`families.js` four-family classifier** | The single box-shape classifier (§2.2) — emitted as `data-orientation` server-side and `data-family` at runtime. |
| **`data-orientation` stamp (authored / static)** | The server-side stamp that carries the authored orientation into **static exports** (no JS); one classifier with `data-family`, can't drift (§2.2). Kept, not purged. |
| **Capacity contract** (`adapt.capacity` + `priority` / `droppable` / `keepTogether`) | The solver's decision inputs (§6). Keep the schema; **backfill coverage** is a workstream. |
| **`countAxis` / `collections.js`** | The solver's render-exact measurement. Extend with `partitionAxis`. |
| **`startOverflowWatcher`** | The Fit Ladder's trigger (when to act) and its move-4 terminal (the ring). |
| **Curated per-orientation type scales** | They *are* the readability floor (move 4). |
| **Fluid-box viewer** (`#472`) | The host for continuous collapse/shed **and** the authoring preview — **not** a live re-paginator. |

### Refactor up — capability is right, ownership is wrong

| Mechanism | Move it to |
|---|---|
| **Per-component `@container` reflow** (32 components) | Frame slicing; retire the per-component CSS as each component becomes a Tile. |
| **`[data-orientation]` structural flips** (split-panel, citation-card) | Move the per-component flip into Frame `tall`/`strip` slicing. (The stamp itself is kept — §5 Keep; only the component's *structural use* of it retires.) |
| **`adapt.mode` manifest field + `checkAdaptDeclarations` gate** | Re-aim: today it gates "CSS has `@container` ⟹ mode `reflow`." When reflow becomes a Frame property the gate's subject changes; keep the *discipline* (a static gate proving box-response is declared, not drifted), retarget the *assertion*. |

### Purge — does not serve the spine; deletion, not deprecation

| Mechanism | Why it goes |
|---|---|
| **Prose de-boost** (`--prose-deboost`, `--dense-body`/`-compact`/`-message`) | It is shrink-to-fit by another name; violates the readability floor (§3) and masks the density problem (§4). Hermetic removal — see `2026-06-21-portrait-prose-deboost.md` purge map; landscape stays byte-identical. |

### Stays rejected (re-affirm, so it doesn't creep back)

- **Frame recursion** (`2026-06-18-frame-recursion-cells.md`).
- **Live runtime re-pagination** (§3, §4) — *the UNBOUNDED form. A bounded form
  (portrait family · logical addressing · eventual-consistency placeholders, with
  the landscape export artifact untouched) is accepted in principle and specced in
  `2026-06-25-runtime-autosplit-eventual-consistency.md`; not yet built.*
- **`section-as-grid`** (`2026-06-16-retire-section-as-grid.md`).
- **Per-named-size layout variants** (axiom 2).

---

## 6. The solver's inputs are declared, not inferred — and currently sparse

The solver decides *collapse vs shed vs split* by reading manifest declarations,
never by guessing from content. The contract exists; coverage is the gap:

| Field | Meaning to the solver | Declared on |
|---|---|---|
| `capacity` (`axis`, `sweet`/`soft`/`hard`, `escalateTo`) | when a Cell is over budget, and the authored escape | 14 / 52 |
| `priority` | what leads; what sheds first | 23 / 52 |
| `droppable` | what may be shed in `strip` | 5 / 52 |
| `keepTogether` | what must never be split mid-figure | 11 / 52 |

Per the inversion (§4), **undeclared intent is a lint error, not a default
guess.** That makes the backfill a hard prerequisite, not a nice-to-have: a solver
that splits where the author would have shed, or sheds a load-bearing column, is
worse than the overflow ring. Sizing it honestly: ~40 components need a `priority`
audit, ~47 need a `droppable`/`keepTogether` pass. This is the unglamorous bulk of
the work and the doc names it so it is planned, not discovered.

---

## 7. The clean-canvas teardown — green at every step, no broken windows

Each phase is one branch → one PR (HARD #17), independently shippable, tree green
throughout. Ordered by the inversion: **unmask first, unify second, build third.**

- **P0 — ratify this spine** (this doc). ☑ **Done.** The acceptance test for P1–P6.
- **P1 — purge the de-boost.** ☑ **Shipped** (`1dd1d46`). Hermetic, low-risk, landscape byte-identical.
  *Effect:* dense portrait slides clip again — the problem becomes **visible and
  honest** (the overflow ring now tells the truth). Precondition for solving it
  well. Restores axiom 1's terminal state as the baseline.
- **P2 — classifier hygiene (rescoped 2026-06-22; doc-only).** ☑ **Done** (this
  amendment). The inventory found
  this phase's premise false: `data-orientation` (authored / static) and
  `data-family` (measured / runtime) are **one classifier at two timings**, already
  non-drifting (M1) — not three disagreeing signals. Rescoped to *documenting* that
  model (§2.2); the export-adjacent stamp-merge was weighed and rejected as not
  worth its keep. **No code sweep.** The one encoding that still retires —
  per-component `@container` — folds up in P3/P6, not here.
- **P3 — Frame slicing: collapse + shed (continuous moves).** ◐ **Partly done /
  partly blocked.** *Collapse (same-band)* already works — `masthead-lift` builds
  real `.cell-masthead` / `.masthead-bay` DOM bands and `--masthead-cols` restacks
  them at `tall`/`strip`; the slicing **gate is fully built** (`validateSlicing` +
  `checkIntegrity` + `checkSlicingTokenRefs`). *Shed-relocate (cross-band)* is
  **blocked**: moving the bay to the footer needs a real **footer Cell in the DOM**,
  but the footer / progress rail / pagination are still the legacy positioned
  "islands" chrome, not Form Cells (`footer-left` is `css:false`). So cross-band
  relocation — and the full "Frame owns box-response" thesis — depends on a
  **prerequisite: finish the islands→Form chrome realization**
  (`reflow-as-form-capability.md` §10), which this teardown originally under-sequenced.
  *(Dependency found by grounding, 2026-06-22.)* `region:null` shed (drop) is cheap
  but has **no consumer yet** and must not ship as a standalone "drop" hammer
  (it would invite the content loss `forms.md` §6 forbids).
- **P4 — the partition kernel + the split move.** ☑ **Both slices done.** *Slice 1
  (the pure kernel):* `partitionAxis(html, axis, perSlide)` in `lib/core/collections.js`
  — splits the primary collection (`item`/`row`) into per-slide groups, repeats heading
  + wrapper + `<thead>`, renumbers `<ol>`; returns `null` for the non-splittable axes
  (`col`/`cell`/`line`) so the caller escalates. *Slice 2 (the build-time wiring):*
  `lib/core/auto-split.js` drives the kernel from the MEASURED overflow verdict at
  export (in `lattice-emulator.js`, after the render that produces it, so copies
  renumber for free). ~~**OPT-IN** per deck (`autosplit: on`)~~ — **RETIRED 2026-07-29:
  splitting is intrinsic.** The opt-in existed so existing decks and galleries stayed
  byte-unchanged, and the note that added it said default-on was "a later decision,
  once the catalog is audited". That audit ran, and then the directive went entirely:
  a deck is authored once and presented at many sizes, so its page COUNT is a function
  of the content and the box rather than an authoring switch. This matters to THIS
  note's own thesis — with no shrink move, SPLIT and the honest ring are the only two
  terminals, and leaving split opt-in made the ring the unasked-for one. The opt-outs
  are per-SLIDE (`<!-- stress-slide -->`, a specimen) and the emulator's `--no-split`
  (a measurement rig). ~~`capacity.hard` drives the cut~~ — **also corrected 2026-07-29:**
  it never drives the cut, only the *pacing* of one the measured pass ordered, and
  `capacity-overflow` lint is un-retired at `wide`, where nothing will be split.
  Maker-checker
  caught + fixed a front-matter-vs-body flag scope bug and a duplicate-`id` on copies.
  Demo: `examples/auto-split.md`. Member-level `keepTogether` is honoured by
  construction. *Follow-ups:* a `(cont.)` adornment; CSS-counter components (agenda)
  restart numbering per copy; default-on once the catalog is audited.
- **P5 — backfill solver data** (§6) across the catalog; turn on the
  undeclared-intent lint. ☑ **Done** (`2026-06-22-solver-intent-backfill.md`).
  All 52 components declare `adapt.priority` (was 23/52) and `keepTogether` on the
  atomic members/pairs (26/52); the native `agenda`/`checklist`/`list-criteria` and
  matrix `obligation-matrix` that had *no* intent are covered. Maker-checker caught +
  reverted a `logo-wall` `droppable` the strip CSS doesn't honor (recorded as the
  rubric's discipline). `droppable` is deferred to the strip-CSS pass (P3) — declare
  a shed only where the CSS provably drops it. **The undeclared-intent gate is live**
  (`checkSolverIntentDeclared`, via `build:check`): a new component can't land without
  declaring its solver intent.
- **P6 — retire per-component `@container` reflow** as components graduate to
  Tiles; re-aim the `adapt` gate (§5).

P1 and P2 are pure subtractions/unifications and can land immediately. P3–P6 are
the build, gated by this spine.

---

## 8. Red team — attack the spine before we commit to it

- **"Collapse-as-Frame-CSS is reflow you didn't delete."** Acknowledged in §2.1.
  Claim is *consolidation* (32 → 1), not elimination. Honest and stated.
- **"Build-time pagination makes the engine own slide count — huge blast
  radius."** Yes. It is gated by export sign-off + maker–checker, deterministic
  and testable. It is the committed P2-class work from the feasibility study, not
  the rejected live-runtime P3.
- **"Sparse solver data means the solver can't act for most components."** True
  today — which is why §6 makes the backfill a prerequisite and §7 schedules it
  before the lint turns on. Not hand-waved.
- **"Read-across tables can't collapse, shed, or split without losing meaning."**
  Correct, and already handled: `compare-table` / `compare-code` / `redline` are
  quarantined `single-orientation: ["landscape"]`. The solver *escalates* (move 3's
  `escalateTo`), it never splits a read-across ledger. The closed move-list makes
  this a rule, not a special case.
- **"An atomic card that overflows even at 1-column + floor?"** Move 4 fires: the
  overflow ring. The system guarantees *readability or a visible honest failure*,
  by design, with no silent shrink. That is the contract, not a gap.
- **"Is the fluid viewer still worth its keep if it can't re-paginate live?"**
  Yes — it hosts the continuous moves (collapse/shed) and is the authoring preview.
  Delivery to Persona 2 is the per-device build-time export. Two surfaces, one
  Frame model, no churn.

---

## 9. What this doc decides (so the next PR is unambiguous)

1. **Box-response has one owner — the Frame — and one classifier — `families.js`**,
   emitted as `data-orientation` server-side (static exports) and `data-family` at
   runtime; the two can't drift (§2.2).
2. **The Fit Ladder is a closed four-move list: collapse → shed → split → floor.
   There is no shrink move.**
3. **Continuous moves (collapse, shed) are declarative Frame CSS; the one discrete
   move (split) is a build-time pure kernel. Live runtime re-pagination is
   rejected** in its *unbounded* form; a *bounded* runtime split is accepted in
   principle and specced in `2026-06-25-runtime-autosplit-eventual-consistency.md`
   (not yet built; shipping code stays build-time-only).
4. **The de-boost is purged; per-component `@container` reflow refactors up into the
   Frame.** `data-orientation` is **kept** as the authored / static stamp (§2.2).
5. **Solver intent is declared, never inferred; the backfill is a prerequisite.**
6. **Teardown order is unmask → unify → build, green at every step.**

The single fork left for the owner is whether §3's resolution of "remove reflow"
(consolidate box-response into the Frame, which *is* still box-responsive CSS at
the Frame altitude) matches the intent — or whether the stricter "zero
box-responsive CSS, solver-only" reading is wanted (the rejected branch in §2.1,
which costs the live preview and buys nothing). The spine above takes the former.
