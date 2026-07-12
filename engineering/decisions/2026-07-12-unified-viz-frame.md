---
status: proposed
summary: Charts and Mermaid diagrams are the same presentation object, so a single .viz-frame is directionally sound — but an adversarial trio (red-team + inversion + independent checker) dismantled the first draft's specifics. The durable, separable win is an ENGINE-WIDE token-hygiene invariant (every SVG paint reads only a designed viz token, never raw core), which kills the compiler's core-token flattening at the root and pays for its own risk; the .viz-frame merge is a real but OPTIONAL maintainability play whose safety justification evaporates once the token work lands, and which is costlier than the draft claimed (the Mermaid width calc relocates rather than deletes, the tagger is 3 insertion points, the bridge lives in JS not mermaid.css, and the layout hoist needs export sign-off). Resequenced into Phase A (token hygiene, independent) then Phase B (frame merge, optional, decided after A). No code.
---

# Unified visualization frame — one `.viz-frame`, charts and diagrams as citizens

**Date** 2026-07-12 · **Status** PROPOSED (design; **materially revised after adversarial review**, see §Adversarial review) · **Extends** `2026-07-12-chart-color-static-palette.md`

> One-line: a framed chart and a Mermaid slide are the same presentation object. The durable
> win is making **every SVG paint read only a designed viz token, never a raw core engine
> token** (engine-wide). A single `.viz-frame` is a real but *optional* maintainability
> follow-on — not the safety fix, and not free.

---

## Why now

The static-palette compiler emits **two plane groups** (`build-chart-palette-css.js:97`): a
`chart` group on `.chart-frame` and a `diagram` group on
`.chart-frame, section.diagram, .lp-figure`. The diagram group flattens the engine-wide
`--cat-*` / `--diagram-*` palette **plus a handful of raw core tokens**, because Mermaid's
SVG reads core tokens directly. The prior fix (chart-color doc) already **contained and
gated** the danger — emission is scope-locked to the diagram/chart roots and a compiler test
rejects a deck-wide `section, figure` plane. So what remains is not a live hazard; it is
that the compiler *still flattens core color at all*, which it should never need to.

From a **presentation** standpoint there is no difference between a framed chart and a
Mermaid diagram — both are one visualization in the content zone. That symmetry is real and
motivates unification. But the review below shows the *mechanism* matters more than the
symmetry, and splits the work into a part that pays for itself and a part that does not.

## Not in scope (deliberately)

- **No 12→8 palette merge.** `--chart-cat-*` (8-slot) and `--cat-*` (12-slot) are two designed
  systems by design; `--cat-*` is *canonical* under HARD RULE #11, not legacy. Kept separate.
- **No auto-`_class: diagram`.** Authoring-ergonomics change, out of scope.

---

## Adversarial review (2026-07-12) — what the trio found

Red-team + Munger inversion + independent checker, each verified against source. The core
thesis (charts and diagrams are one presentation object; `.chart-frame` is a real reusable
frame; `section.diagram`'s load is re-parentable; no hard blocker) **survived**. The first
draft's specifics did **not**. Corrections folded into this doc:

1. **`width:100%` for the Mermaid SVG is wrong (was CRITICAL/fatal-as-written).** The chart
   family itself pins `.chart-body { width: calc(100cqi − 2×--sp-2xl) }` *because* `100%`
   resolves to 0 against an indeterminate ancestor in the VS Code webview
   (chart-family.css:459-473; diagram.styles.css:37-40). The `calc` **relocates to a
   content-zone wrapper, it does not disappear** — the draft's "more robust, less code" was
   false. `section.diagram` has no `.chart-body` wrapper today, so a wrapper (or a
   `cqi`-pinned width on the diagram track) has to be *added*.
2. **The Mermaid `themeVariables` bridge is JS, not `mermaid.css`.** It is `MERMAID_VAR_MAP`
   in `lattice-emulator.js:524-629` + `buildMermaidThemeVars()` in `lib/runtime/index.js:70-289`
   (mirrored, must stay in lockstep). And **9 diagram types ignore `themeVariables` entirely**
   (journey, mindmap, treemap, c4, venn, sankey, packet, block, xychart) — they are colored
   only by CSS overrides in `mermaid.css` that read core tokens directly in ~10 places
   (`--text-heading`, `--bg`, `--bg-alt`). Repointing only the JS bridge reaches none of them.
3. **The "SVG reads only viz tokens" invariant is ENGINE-WIDE, not diagram-only.** The chart
   side violates it too: `chart-key-label { fill: var(--text-body) }`,
   `chart-key-head/value { fill: var(--text-heading) }` (chart-family.css:700-714), and
   radar/venn labels read `--text-heading`. So the completion needs a `--chart-*` text/ink
   token *and* the `--diagram-*` completion — both sides repointed — before "0 raw-core" holds.
4. **The tagger is N passes, and the draft dropped two roots.** Stamping `.viz-frame` must be
   wired into the emulator, the owned engine, AND `prose-projection.mjs` (which mints
   `.lp-figure` re-hosts with hardcoded class strings — `projectSpatial` hardcodes
   `lp-figure lp-spatial chart-frame word-cloud`, L188). The draft's mechanism list omitted
   **`section.word-cloud` and `section.math`**, which get the chart palette today without
   being chart-frames — they would silently lose it.
5. **Miscounts / mis-attributions.** There are **3** `align-self:stretch` overrides, not 4
   (diagram.styles.css:19,29,51), and the Form-scoped one (L29) is **load-bearing** — a
   non-Form diagram keeps a centered dek by design (L24-28), so `align-items:center` is not
   pure "un-centering." Both chart and diagram headers **center** today (chart-family.css:47);
   the draft's "the frame is left-aligned" was wrong — a unified frame must center. `--accent`
   is read by **journey** (a chart-frame member), not by `mermaid.css`.
6. **The danger is already contained + gated.** The root-cause safety win is real but does
   **not require the frame merge** — it is delivered entirely by the token-hygiene work below.
7. **Byte-neutrality overstated.** Renaming the anchor to `.viz-frame` changes the canonical
   anchor union the chart-color gates lock (invariants #2/#4) and shifts override specificity
   (`section.diagram.dark` (0,1,1) → `.viz-frame.dark` (0,2,0)); those gates + the compiler
   tests must be rewritten. Not a no-op. (Bloat, however, is a non-issue — `.chart-frame`
   already carries both plane groups, so co-emitting on `.viz-frame` is byte-neutral.)

**Verdict of the trio:** directionally sound, no hard blocker — but **resequence**. The
value that pays for its own risk is the token-hygiene invariant; the frame merge is an
optional maintainability follow-on, correctly costed below.

---

## Decision (revised): two phases, not one refactor

### Phase A — engine-wide token hygiene (the durable win; independent of the frame)

**Invariant:** *every SVG paint reads only from a designed viz palette (`--chart-*` for
charts, `--cat-*`/`--diagram-*` for diagrams) — never a raw core engine token
(`--bg`, `--text-*`, `--accent`, `--border`, `--pass/warn/fail`).*

Work:
- **Complete `--diagram-*`** — add the missing bounded tokens (`--diagram-text`, `--diagram-bg`,
  `--diagram-node-*`; today only `--diagram-stroke/-line/-band/-note/-active/-critical/-done/-today`
  exist) and define each across all 32 themes.
- **Add a `--chart-*` text/ink token** for the chart-side SVG label reads.
- **Repoint every SVG core-read:** the ~10 direct reads in `mermaid.css` (the 9 bridge-ignoring
  types), the chart-key label paints (chart-family.css:700-714), radar/venn labels, and the
  JS bridge (`MERMAID_VAR_MAP` + `buildMermaidThemeVars`, both mirrors).
- **Gate it.** Design a check that flags a raw-core `var(--…)` in an *SVG paint* context.
  Note the real difficulty (open question O1): distinguishing an SVG-paint `var(--core)` from
  a legitimately-live HTML-chrome `var(--core)` in the same shared `.css` — `checkChartPaintFlatness`
  today checks flatness, not core-token provenance.

Effect: the compiler auto-discovers core reads by scanning source (`build-chart-palette-css.js:297-309`);
once **no** SVG paint reads core, the compiled plane **stops flattening core tokens at the
root** — the danger is eliminated, not merely contained. This is the correct reading of
"migrate diagrams onto new tokens": complete the diagram system so it is self-sufficient.

**Honest cost:** this is a real per-theme visual migration (32 themes × new tokens), and if any
new `--diagram-text` differs from the core token it replaces, diagram/chart decks re-color →
**gallery visual sweep + export sign-off (a hard stop).** It is *not* free; it pays for itself.

### Phase B — the `.viz-frame` merge (optional maintainability; decided AFTER Phase A)

Once Phase A lands, the frame merge's safety justification is gone; it stands purely on "one
frame, one compiler group, one paint rule, no hybrid special-case — simpler for a component
author." Still worth doing, but on its own merits and correctly costed:

- `.viz-frame` = the promoted `.chart-frame` (edge-to-edge, gap-spaced, centered header,
  footer band, palette anchor). Charts stay byte-identical **only if `.viz-frame` adds no box
  property they lack** — no new `display`/`gap`/`container-type`/`padding` (specificity
  `section.chart-frame` (0,1,1) already beats bare `.viz-frame` (0,1,0), so this holds as a
  strict superset-anchor).
- `section.diagram` becomes a citizen: its 3 stretch overrides + base `align-items:center`
  are reconciled against the shared centered-header model (the Form-scoped dek stretch is
  **kept**, not deleted); the Mermaid SVG gets a `cqi`-pinned content-zone wrapper (the `calc`
  relocated, per finding 1) and its whitespace is tuned to the chart cell `gap` so a diagram
  and a chart slide feel spatially identical (the "aligned" decision, 2026-07-12).
- One compiler plane group on `.viz-frame`, painted by **one tagger wired into all 3
  insertion points** (emulator, owned engine, `prose-projection.mjs`), stamping every viz root
  incl. `section.word-cloud` and `section.math`. Rewrite the chart-color gates + compiler
  tests for the new anchor union.
- **Gated behind:** the chart+diagram gallery visual sweep (QUALITY BAR), Fit-Spine height
  re-verification (HARD RULE #20 — local breathing room is `padding`/`gap`, never `margin`),
  and **export sign-off**.

## The concrete win (corrected)

| Surface | Today | After Phase A | After Phase B |
|---|---|---|---|
| Raw-core tokens in a compiled plane | ~8-10 (SVG reads core) | **0** (SVG reads only viz tokens) | 0 |
| Compiler plane groups | 2 | 2 | **1** |
| Layout foundations | 2 (`.chart-frame` + `section.diagram`) | 2 | **1** (`.viz-frame`) |
| diagram stretch overrides | 3 (one load-bearing) | 3 | reconciled (Form-scoped kept) |
| Mermaid SVG width | `calc(100cqi − 2×--sp-2xl)` | unchanged | `100%` of a `calc`-pinned wrapper (relocated, not removed) |

## Open questions (for the human)

- **O1 — the gate design.** How to statically flag a raw-core `var()` in an *SVG paint* while
  allowing it in HTML chrome, in a shared `.css`. Without this, Phase A's invariant is
  discipline, not enforced.
- **O2 — disposition.** Do Phase A now and decide Phase B later (recommended), or commit to
  both up front as one program? Phase A is independently valuable and independently shippable;
  Phase B's payoff is elegance, and its danger-justification is spent once A lands.
- **O3 — palette-consistency scope** (still parked): the chart-bucket strays
  (journey/roadmap/radar/state-chart that mix `--chart-*` and `--cat-*`).
