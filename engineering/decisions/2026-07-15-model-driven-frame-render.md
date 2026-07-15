---
status: proposed
summary: >
  North star (owner): the Frame/Cell/Tile model is the source of truth; components must
  not violate it. The gap is real — the model declares each frame's `cells` + each
  component's `slots`, but the render hand-builds structure that drifts: canvas/sovereign
  components never materialize their declared stage cell, slots hoist inconsistently
  (eyebrow/title/subtitle → masthead; caption/key-insight/below-note float loose), and
  compact/full-bleed are partly per-component. The FIRST draft proposed a runtime
  buildFrame() model-INTERPRETER; an adversarial trio (red team + Munger + independent
  checker), grounded in real renders + computed styles, cut that: (1) the interpreter is
  forms.md §11's execute-the-manifest rung, a NON-GOAL the 07-14 decision accepted a day
  earlier, and it triplicates across three render paths the browser can't fs-load; a
  CONFORMANCE GATE (a test) + extending the already-shared masthead kernel delivers the
  same author-visible outcome (universal stage cell, universal compact/full-bleed,
  provable conformance) at a fraction of the blast radius. (2) A GLOBAL gate is
  un-shippable (red until all 58 conform → monster branch, HARD RULE #17/#18) → make it
  PER-COMPONENT opt-in (`conformance:strict`), migrate one component per PR. (3) The cqi
  fear was FALSE (measured): an unstyled zero-inset stage wrapper leaves 100cqi + box-
  local reflow unchanged — wrapping is geometry-neutral; bytes move from the per-component
  `section.X > child` selector rewrite, not the box. (4) compact/full-bleed already exist
  universally for SPACING (section.compact, claim-bleed) — only per-component font-role
  tweaks stay. (5) Vocabulary fixes: "heart" = the existing subtitle/lede (do NOT coin);
  "note" is three registers (key-insight + below-note co-occur in the stage, annotation is
  the EXISTING overlay cell); caption is component-owned inside its stage cell (owner call
  2026-07-15 — NOT hoisted, NOT a new cell). (6) It is a slot→cell DATA migration across 56
  manifests, not a refactor. Recommended:
  ship the conformance gate + kernel extension, migrate per-component byte-identical-first
  behind pixel-check + export sign-off, AFTER the .viz-frame merge, PROVING it on `diagram`
  first. NOT YET BUILT.
---

# Model-driven frame render — the declared model builds the DOM; a gate proves components conform

**Date:** 2026-07-15
**Status:** proposed — first draft hardened by an adversarial trio; the runtime-interpreter
mechanism is **cut** to a conformance gate + shared-kernel extension.
**North star (owner, 2026-07-15):** *The Frame / Cell / Tile / Component model is the
source of truth. Modifying the model is fine; components violating it is not.*
**Builds on:** `2026-07-14-one-frame-model.md` (step A: stage CLASSIFICATION is
data-driven), `design/forms.md` §5/§10/§11.
**Sequence AFTER:** `2026-07-13-viz-color-and-frame-unification.md` (the `.viz-frame`
merge must lead the chart/diagram DOM — one front on this CSS at a time, HARD RULE #17/#18).

---

## 1. The gap (model-violations, evidenced)

`forms.md` declares the truth — every frame lists its `cells`; every component lists its
`slots` — but the render hand-builds structure and has drifted from it:

| Violation | Evidence | Consequence |
|---|---|---|
| **Stage cell declared, not built** | every frame manifest declares `cells:["stage"]`; kernel builds `.cell-stage` only for `flow` (31/56) | canvas (17) + sovereign (8) parts float loose in `<section>`; `> .cell-stage` rules dead (contact) |
| **Slots hoist inconsistently** | eyebrow+title+subtitle → `masthead-lede`; caption / key-insight / below-note stay loose | the 07-14 cell-stage selector-bug class |
| **compact/full-bleed partly per-component** | `section.compact` sets `--sp-*` universally (shared.styles.css) BUT q-and-a/cards-stack tune font-roles per component; charts carry ~125 lines bespoke `claim-hero` | a new component re-implements the semantic half |

**Root cause:** the model is *declared* data but not *the render's contract* — nothing
forces the rendered DOM to equal what the frame declared, so it drifts.

---

## 2. The invariant (north star, made enforceable — by a GATE, not an interpreter)

> **The rendered DOM of every component that opts into `conformance: strict` must equal
> its declared `{frame.cells} ∩ {component.slots}` — every declared cell materialized,
> every present slot hoisted into its cell, nothing loose, no dead `> .cell-stage`. A
> conformance test renders each opted-in component and fails the build on drift.**

Why a gate, not a runtime `buildFrame` interpreter (the trio's core cut):
- The interpreter is `forms.md` §11's *execute-the-manifest* rung — a **non-goal the
  07-14 decision accepted 24h earlier** ("No manifest-driven render; the field is a
  validated build-gate contract, not a render input").
- It must be reimplemented identically across **three render paths** (engine HTML-string,
  emulator, runtime DOM-walk) and the **browser bundle can't fs-load manifests** →
  a baked duplicate of the whole model → the parity hazard the baked catalogs already fight.
- A gate + extending the **already-shared** masthead kernel gives the **same
  author-visible outcome** (universal stage cell, universal compact/full-bleed, provable
  conformance) without a new render engine. Structural *non-violability* (interpreter) vs.
  *caught violation* (gate) is not worth a 3-path rewrite.

**Per-component opt-in is mandatory** (else the gate is red until all 58 conform → a
monster branch, HARD RULE #17/#18). Un-migrated components stay on today's
`wrapsStageBody` path (fail-safe by inclusion); each PR flips one component's flag.

---

## 3. The universal vocabulary — slots → cells (corrected by the trio)

One slot set, one cell each. Names must reconcile with the SHIPPED nouns (§2.5, no third synonym).

| Authored part | Cell / region | Status today | Fix |
|---|---|---|---|
| eyebrow (`p>code` before h2) | `masthead-lede` | hoisted ✅ | — |
| title (`h2`) | `masthead-lede` | hoisted ✅ | harmonize manifest slot name (`title` vs `heading`) |
| **lede** (lead statement — owner's "heart") | `masthead-lede` | hoisted ✅ as subtitle | **map "heart" onto existing `subtitle`/`lede`; do NOT coin "heart" (§2.5)** |
| content (body) | **stage** | flow-only ❌ | materialize the stage cell for all |
| **key-insight** (`> blockquote`) | **stage** (z2 sub-slot) | loose ❌ | hoist into stage; co-occurs with below-note |
| **below-note** (em-dash trailing `p`) | **stage** (z2 sub-slot) | loose ❌ | **distinct from key-insight — they co-occur; NOT one "note" slot** |
| **annotation** (review italic) | **`overlay` cell (z4)** | **already modeled** (`overlay.cell.json` + `tile/annotation`) | leave as-is — NOT a stage note |
| **caption** (image/chart figure line) | **stays in the component's stage cell** — component-owned, NOT hoisted | placed by the component's own CSS | **owner decision (2026-07-15): the component owns placement of its non-hoisted parts within its stage cell. NOT a separate cell; the footer cell holds ONLY footer + progress + pagination.** |
| footer (`_footer:`) | `footer`/`footer-left` | hoisted ✅ | — |
| logo · meta · **status** | `masthead-bay` tiles | docked ✅ | **status was omitted from the first draft — include it** |
| pagination · progress | `pagination-right` · `progress-centre` | docked ✅ | — |
| watermark | **`stage`** (per `watermark` tile `fits:["stage"]`) | docked ✅ | first draft said overlay — it's stage |

Stage-cell **sizing** = step A's `stage` value: `flow` = clip flex column · `canvas` =
holds the component's own self-sizing box (the box, e.g. `.chart-body`, keeps its OWN
`container-type:size`; the stage cell is its unstyled parent — **not** the measurement
container; the first draft's §4.3 claim was measured false).

**Two model rules the owner ratified (2026-07-15):**
- **Not everything hoists.** Only the chrome slots (eyebrow · title · lede · footer +
  logo/meta/status/progress/pagination tiles) hoist into named cells. A component's OWN
  non-hoisted parts — caption, figure furniture, per-component structure — live **inside
  its stage cell**, placed by the component's own CSS. The component owns its semantics;
  the frame owns the cells.
- **Universal authoring concepts are stage content.** Key Insight (`> blockquote`),
  below-note, pills, and the lifted eyebrow/subtitle are first-class occupants of the
  **stage cell**; universal-modifier CSS addresses them *through* the stage cell — which
  is exactly why they must live in it consistently (the 07-14 selector bugs were these
  floating loose as bare section children).

---

## 4. Mechanism — extend the shared kernel, gate the result

1. **Materialize the stage cell for every opted-in component.** Extend the existing
   `masthead.transform.js` (already shared across the 3 paths via the registry adapter)
   so the body wraps in `.cell-stage` for canvas/sovereign too — an unstyled, zero-inset
   wrapper (proven geometry-neutral). The stage cell's sizing class comes from `stage`.
2. **Hoist the loose slots** (key-insight, below-note; caption stays component-owned in the
   stage cell per §3) into the stage cell, and **rewrite that component's
   `section.X > child` selectors to `> .cell-stage >`**
   — this per-component selector rewrite is the real byte-change engine (the wrapper is
   neutral), so it is inherently N rewrites, one per component, behind pixel-check.
3. **Conformance gate:** a test renders each `conformance:strict` component and asserts
   its cell tree == declared `{frame.cells} ∩ {slots}`.
4. **`compact` / `cover` as class-driven modifiers** on the now-uniform stage:
   `section.compact` (spacing — already universal) + a **`cover`** modifier (the universal
   "claim the whole canvas" — owner's name, better than "full-bleed"; mirrors
   `background-size: cover`) that toggles the sovereign chrome-suppression already
   data-driven via `exemptFromChrome`. So `cover` makes ANY component full-bleed by the
   same mechanism sovereigns use.
   **Honest scope:** these unify the STRUCTURAL/spacing half; per-component font-role
   tweaks (which nested element is "the answer") stay — a frame token can't carry them.

**Multi-zone (split-panel, compare-code, matrix-2x2, redline):** the two panels are the
**component's private CSS inside its single stage cell** — the stage cell becomes the grid
container the component's body splits within. This is NOT the rejected recursive-frames
branch (that was a Cell holding a composed *Frame*). Migration cost: move the
section-level grid onto `.cell-stage`. Model holds; slot map is not uniform for them.

---

## 5. What this is NOT (guardrails — the trio's + the owner's hard line)

- **⛔ The measuring machinery is a PROTECTED surface — it will NOT be broken (owner,
  2026-07-15).** The overflow probe (`lib/core/overflow-probe.js`), autosplit /
  read-across carousel, the Fit Spine, virtual lists, and HARD RULE #20 margin
  discipline must behave **identically**. The probe keys on clip cells
  (`CLIP_CELL_SELECTOR`), so materializing `.cell-stage` for a canvas/sovereign changes
  what it sees — every migration MUST prove the probe's overflow verdict AND autosplit's
  page decisions are unchanged (a canvas can't overstuff; wrapping it must never induce a
  false overflow or a spurious split). This is a named, gated verification per slice — the
  first thing the diagram proof (§6 PR 1) checks, not an afterthought.
- **NOT a runtime manifest interpreter** (§2). Gate + kernel extension only.
- **NOT recursive frames.** Multi-zone components split inside their OWN body within the
  single stage cell (component-private CSS) — categorically NOT "a Cell hosts a composed
  Frame" (the rejected 2026-06-18 branch). Recursion stays out — too complex and unneeded;
  revisit ONLY if a real "a cell must host a full sub-frame" case appears (we have none).
- **NOT a global gate.** Per-component opt-in; one component per PR.
- **NOT byte-changing by fiat.** Each canvas/sovereign migration attempts byte-identical
  first; re-bless only with a **one-deck (dark+light) export sign-off** naming why those
  pixels moved. No blanket mass re-bless (it would launder regressions past the sign-off;
  the gallery gate is page-count-only — no interior-geometry backstop but pixel-check).
- **NOT concurrent with `.viz-frame`.** That merge leads the chart/diagram DOM; this
  rides on top of it. One front on this CSS at a time.
- **NO new vocabulary in the cascade** until ratified in `forms.md` + `design-system.md`
  §2.5 in a docs-only PR first ("heart"→subtitle; caption decided; note split in three).

---

## 6. Sequence (small, independently-shippable, gate-verified PRs)

- **PR 0 — docs:** ratify the slot/cell vocabulary (§3 corrected) in forms.md + §2.5;
  land the **conformance gate** as opt-in (zero components strict yet → green).
- **PR 1 — the proof slice: `diagram`.** The hardest-cheapest canvas: no stage cell today,
  a single Mermaid SVG + a loose key-insight blockquote, and it's *already* the sanctioned
  byte-identical proof target for `.viz-frame`. Materialize its stage cell, hoist the
  blockquote, flip `conformance:strict`, prove byte-identical (or one-deck sign-off). If it
  can't be made byte-identical AND isolated to one PR → fall back to the gated-codemod-only
  path and we learned it for one component, not a monster branch.
- **PR 2…N:** connect/media (contact, wifi, video) → chart family (on top of `.viz-frame`)
  → flow components (mostly already conform) → sovereign/multi-zone last.
- Each: byte-identical-first, pixel-check, export sign-off on change, one component's flag.

**Landed:** PR 1 = `contact` (2026-07-15). PR 2 = `wifi` (2026-07-15). PR 3 = `diagram` (2026-07-15)
— the **first strict VIZ canvas** and the sanctioned proof target of this record. Its body (the
pre-rendered Mermaid SVG + optional dek + trailing Key Insight `blockquote`) now hoists into
`.cell-stage`; the **title is untouched** — diagram's section-level `<h2>` keeps lifting into
`masthead-lede` (the depth-aware lift, which it already used, still finds it). Two facts made this
NOT a mechanical repeat of the QR-card recipe:
- **No self-size flex pin — the Mermaid SVG self-scales, so the stage clip can never silently
  swallow it.** contact/wifi needed `flex: 0 0 auto` because a fixed-height card, flex-shrunk in the
  bounded stage, clips its excess invisibly (the silent-overflow bug). diagram is the opposite: the
  SVG is forced to `height:100%` (mermaid.css) and letterboxes via `preserveAspectRatio`, so a
  shrinkable diagram box is SCALED, not clipped — no content is lost. Keeping the pre-migration
  `flex:1` (self-scaling) is what makes the **overflow-probe verdict identical pre/post**: a fitting
  diagram → not-over, and a genuinely over-tall body (a long Key Insight) → over — proven with the
  emulator's own detector AND `probeSectionOverflow` (before==after; the over-tall case is CAUGHT in
  the stage, not swallowed). Applying the QR-card pin here would have been a REGRESSION — it forces
  the SVG to its natural height and spuriously overflows an over-tall diagram that should scale to fit.
  New gate: `test/integration/parity/diagram-overflow-preserved.test.js`.
- **The Mermaid width inset + the runtime sibling-div both survive the wrap.** The
  `section.diagram .mermaid-svg` width `calc()` uses a DESCENDANT combinator, so it still matches under
  `.cell-stage`. But the RUNTIME path renders by inserting a sibling `<div class="mermaid">` (and, on
  failure, `.mermaid-error`) next to the source `<pre>`; once the `<pre>` hoists into `.cell-stage`
  that sibling lands INSIDE it, so the `section.diagram > .mermaid` / `> .mermaid-error` rules
  (`mermaid.css`, `highlight-js.css`) and diagram's own `> p`/`> blockquote`/`> :is(pre)` rules each
  gained a `> .cell-stage >` arm (the bare arm kept for the un-wrapped `no-form` slide). `applyToDom`
  (the runtime DOM mirror) wraps the diagram body identically (verified in **jsdom**: pre + blockquote →
  stage, the runtime `.mermaid` sibling lands in the stage, cell-footer built). The selector is
  deterministic and the `.cell-stage` arm is styling-identical to the pre-existing `> .mermaid` rule, so
  risk is low — but per HARD RULE #23 the runtime `.mermaid` render is **UNVERIFIED on the real web
  surface** (no live playground render was exercised from this sandbox); a real-browser Playground diagram
  render should confirm it when that surface is reachable.
- **Pixel: simple diagrams byte-identical (AE 0); a diagram with extra stage content shifts ~2px on the
  CLI/committed-PDF export path.** The sample and any diagram with NOTHING but the SVG in its stage are
  pixel-identical. A diagram whose stage ALSO carries a dek (above) and/or a Key Insight (below) shifts
  its self-scaled SVG ~2px — and this is the shipped **CLI/PDF export**, not a preview cosmetic:
  `dist/lattice-emulator.js` is the package `main`, the `lattice` bin, and what `build:exemplar-pdfs` /
  `build:gallery-*` invoke, so the committed diagram PDFs' bytes genuinely move. Root cause: the
  standalone Node exporter does NOT stamp `--_sec-1cqi`, so the section's own gap resolves against the
  section's ANCESTOR container (a "preview self-reference" ~16px) while the stage's body-gap resolves
  against the section (its true own-cqi, ~14.4px), and the self-scaling SVG fills the slightly taller
  box. Empirical (git-stash before/after, indaco): plain diagram AE 0; +dek AE 7,155; +Key Insight AE
  5,120; +both AE 16,098 (shift scales with gap count) — a content/mermaid slide and a kpi slide are AE
  0 (blast radius is diagram-only). The **web/desktop runtime stamps `--_sec-1cqi`**, so both gaps
  collapse to the section's own cqi and the runtime render is **byte-identical** (proven by stamping
  `--_sec-1cqi` on the emulator DOM — before==after, mermaid+blockquote rects identical). The exporter's
  new gap actually MATCHES what the runtime playground shows (the old ancestor-approximation did not), so
  the shift moves the CLI export TOWARD runtime fidelity — but "toward correct" does not waive sign-off:
  this was an **export delta owed the §5 dark+light sign-off**. **Sign-off GIVEN by the owner
  2026-07-15** (dark+light before/after composites, all four cases: plain AE 0, +dek, +Key Insight,
  +both — "being larger is a good thing"). The strict-wrap affects **only** diagram: contact/wifi/charts
  (progress/funnel) and flow (content/kpi) are all AE 0.
- **Adversarial trio (HARD RULE #25) — the crux held under all three.** This slice touches the §5
  PROTECTED overflow/autosplit machinery AND templates the chart family, so it earned the full trio (red
  team + Munger inversion + independent checker), applied to the shipping diff. All three independently
  attacked the crux — *"does `height:100%` clamp EVERY Mermaid type, or can one silently overflow the
  `.cell-stage` clip and defeat the probe?"* — and all three confirmed it: the SVG is forced
  `width/height:100%` with `preserveAspectRatio="xMidYMid meet"` (no Mermaid type emits `…slice`), so it
  letterboxes to fit at any size and CANNOT overflow the stage. Munger probed 10 Mermaid types
  (`mermaidBoxSpillPastStage:0` everywhere); the red team probed 4 hard types (wide sequence, tall gantt,
  deep mindmap, large ER — SVG ⊂ stage) plus a 40-sentence Key Insight (`over:true` pre==post, caught via
  the clip-cell path, NOT swallowed). `flex:1` (not the QR-card `flex:0 0 auto` pin) is VERIFIED correct,
  because the SVG scales instead of clipping. No silent-swallow path exists.
- **Forward-caution for the chart family (from the Munger inversion).** The `flex:1`-not-`flex:0 0 auto`
  divergence from contact/wifi is principled — self-scaling SVG (viewBox + `preserveAspectRatio` + forced
  `height:100%`) is *scaled* when squeezed, never clipped; a fixed-height card *loses* content, so it
  needs the pin. **A later SVG-chart flag (pie/radar/map/quadrant/funnel/word-cloud — a DIFFERENT render
  than diagram) MUST re-run the "self-scaling test" before copying `flex:1`:** render the body squeezed
  and confirm it scales rather than clips. A mis-classification reintroduces silent clipping — the exact
  §5 failure. This self-scaling test is the explicit gate for choosing `flex:1` vs the pin, per component.
- **Follow-ups found by the trio — off-path, LOGGED not fixed here (HARD RULE #18).** None block this
  slice; each is a pre-existing, repo-wide, or malformed-input concern that pulling into a conformance PR
  would violate #8/#17:
  1. **`examples/*.pdf` cosmetic drift is un-gateable; the decks are STRUCTURALLY fresh (investigated
     2026-07-15, post-merge).** The red team flagged committed `examples/*.pdf` as "stale" — and the
     pixels ARE stale (e.g. `diagram-narration.pdf` was ~100K-AE off bare `main`, from prior PRs that
     reflowed diagrams without rebuilding it). BUT the follow-up investigation found this is a **cosmetic
     ~2px positional reflow, NOT structural**: every example deck's committed PDF page count equals a fresh
     render (spot-checked `diagram-narration` 9==9, `sequence-narration` 10==10, `focus` 14==14,
     `auto-glossary` 7==7 — no slide dropped/merged/autosplit-changed anywhere). **This changes the
     disposition the red team assumed:**
     - **No bulk re-bless.** Cosmetic PDF drift here is fundamentally un-gateable and not worth chasing —
       the CLI export is non-deterministic (byte-level churn on every rebuild) and cross-runner Skia
       rasterization isn't bit-identical, which is exactly why the repo already RETIRED the `regress` pixel
       gate and made `golden-diff` non-gating (2026-06-12-p4-regression-gate-retire-marp.md §0). A
       ~90-PDF non-deterministic-byte re-bless would fix nothing structural and be un-reviewable.
     - **The one real gap** is that `examples/` lacks the deterministic **page-count** freshness gate that
       `exemplars/` has (`test/integration/exemplars/exemplar-render.test.js`) — which catches STRUCTURAL
       drift (a silently dropped/merged slide) machine-independently. It would PASS on every current
       example PDF (all structurally fresh) and only fire on a future structural regression. **Deferred,
       not built:** it renders ~92 decks, ~tripling the integration tier's render load, to insure a drift
       class that is not currently occurring — a poor cost/benefit to impose unilaterally. Available as
       cheap future insurance (mirror the exemplar test) if a structural regression ever appears. The
       diagram slice's own ~2px on `sequence-narration`/`typed-diagram-narration` is part of this accepted,
       un-gateable cosmetic-drift class; pixel-safety was proven by the signed-off composite, so no example
       PDF is the verification surface.
  2. **The render-side conformance gate under-asserts §2.** It checks only that each declared cell's DOM
     class EXISTS (`EXPECTED_CELLS = ['stage']`), not that every slot hoisted and nothing is loose — so a
     conforming-looking empty stage with loose body would pass. Empirically the diagram DOM is correct
     (both render paths verified), so no lie ships; but the gate is weaker than §2's promise. Pre-existing
     design inherited from contact/wifi. **Fix: strengthen the gate to assert the full tree, its own issue.**
  3. **A titleless / eyebrow-only strict diagram gets `.cell-stage` but no masthead band.** A `_class:
     diagram` slide with no *top-level* `<h2>` (truly titleless, or the h2 buried in a blockquote) wraps
     the body but builds no `masthead-lede` — the strict "title hoists" claim is silently unmet for
     malformed authoring. Both render paths agree, nothing overflows/crashes, and it matches pre-migration
     behavior (not a regression). No gate flags it. **Log only** — malformed-input territory.
  4. **`.mermaid-fallback` (total parse failure) is unstyled.** It inherits the `pre` arm (`flex:1`);
     a long broken source can overflow inside the stage, but the probe catches it (clip-cell path) — not
     silently swallowed, identical pre-migration. **Log only**, tracked note.

**Canvas migration is per-component, not mechanical — evidenced by wifi.** The
`contact` → `wifi` pair shares one QR-card kernel, yet the mechanical recipe that
worked for contact (move before `mastheadLift`, flip `conformance:strict`, add
`flex:0 0 auto`) produced pixel AE 80,641 on wifi. Two wifi-specific facts the
recipe didn't cover:
- **Depth-blind title lift (the kernel fix).** wifi
  emits its title as an in-card `.qr-head > h2`; contact emits no `<h2>` at all (its
  name is a `.qr-name` paragraph). The masthead kernel's `extractH2` was a plain
  first-`<h2>` regex — depth-blind — so it yanked wifi's nested title into a masthead
  band. Fixed by making the lift depth-aware (`findTopLevelH2`, mirroring the
  pre-existing depth-aware `findTopLevelEyebrow`): lift ONLY a section-level `<h2>`.
  For the wifi PR this was gated on `wrapsStageBody(cls)` — a WRAPPED component only —
  precisely to KEEP the chart family (whose h2 nests in `.chart-header`, chartFamily
  runs before mastheadLift) on the legacy depth-blind lift, since converging the
  charts was a separate export change owed its own sign-off. **That convergence is
  now shipped (see the chart title-placement resolution below); the depth-aware gate
  is `wraps || chart-frame`.** The DOM mirror (`masthead-lift.js`) already uses
  `:scope > h2` (depth-aware for all), so wifi agreed on both paths from the start.
- **Chart title placement — RESOLVED (2026-07-15): converge in `.chart-header` now
  (Option 1); hoist to the masthead band later with the strict migration.** Because
  the DOM mirror uses `:scope > h2`, it had ALWAYS returned no-band for charts, while
  the engine (depth-blind) built one — the two render paths disagreed on chart titles
  (a latent HARD RULE #1 gap, pre-existing). **The wifi note above framed this as
  "plausibly the right fix, deferred"; the owner has now chosen it after an
  adversarial trio.** The engine masthead lift is depth-aware for `chart-frame`
  components too (`depthAware = wraps || chartFrame`), so it stops lifting the nested
  `.chart-header > h2`. Both paths now keep eyebrow + title + subtitle **together in
  `.chart-header`**, in correct order, with NO masthead band — converged. This also
  **revives** the pie/radar `claim-hero`/`claim-bleed` bottom-shelf title treatment
  (built on `.chart-header h2`, dead on the engine while the h2 was lifted). Scope
  verified: **exactly the 13 `chart-frame` layouts change** (progress, gantt, radar,
  piechart, funnel, kanban, quadrant, timeline-list, journey, roadmap, state-chart,
  word-cloud, map — each now renders title in `.chart-header`, no band); `diagram`
  (still on the legacy lift, the `.viz-frame` proof target), `video`, `contact`,
  `wifi`, and the flow components (content, cards-grid, kpi, checklist) are all
  **AE 0** (150-DPI pdftoppm + ImageMagick `compare`). The overflow-probe verdict is
  unchanged pre/post (charts are not `.cell-stage`-wrapped — the eyebrow moving
  between direct children doesn't flip it). This is Option 1: the **converge-now**
  half. The full model-conformant **hoist of the chart title INTO the masthead band**
  (per §3, where titles hoist) is still **deferred** to the `.viz-frame`-coordinated
  chart `conformance:strict` migration, WITH the dark+light chart-gallery export
  sign-off that owes.
- **QR quiet-zone in the safe margin.** wifi's QR tile is the card's LEFT column and
  is content-box sized (12em SVG + 1em padding + 1px border), so its border-box
  overhangs its `.qr-side` column by ~1em+1px each side; the left overhang is the
  QR's white quiet-zone padding, which sits in the frame's left safe margin. The
  SVG itself sits exactly at the stage's content edge. The `.cell-stage`'s
  `overflow: clip` shears that quiet zone (AE 1525 even on a fitting deck; a QR
  needs its quiet zone to scan). Fixed with `overflow-clip-margin: 1.5em` on
  `section.wifi > .cell-stage` — the stage may PAINT the decoration into the safe
  margin while keeping `overflow: clip`, so the scrollHeight overflow probe is
  untouched. contact never hit this: its tile is on the RIGHT, fully inside the
  content box, so nothing reaches a stage edge.

Two follow-on notes for wifi:
- The `flex: 0 0 auto` card pin is **defensive/consistency** for wifi, not
  load-bearing as it was for contact: wifi's `.qr-card` is `overflow: visible`, so
  an overstuffed card's excess bleeds to the stage and the probe catches it even
  without the pin (removing the pin does NOT reproduce contact's silent clip). Kept
  for parity with contact and to stay safe if the card ever gains `overflow:hidden`.
- wifi's **manifest `sample`** (a long title) is ~15px taller than the frame; under
  the old direct-child body that overflow bled silently into the frame padding, and
  the conforming frame now (correctly) flags it. Off-path here (touches the isolated
  galleries, HARD RULE #8); logged for a sample-tightening follow-up.

**`video` remains deferred.** It is a `canvas` but NOT strict: its poster/badge/QR
compositions must be re-expressed against the stage cell before it can wrap
byte-identically — a larger per-component job than wifi's.

---

## 7. Decisions (owner) — resolved 2026-07-15

1. **`caption` — RESOLVED: component-owned inside its stage cell.** Not hoisted, not a new
   cell. The component owns placement of its non-hoisted parts within its stage cell; the
   footer cell holds ONLY footer + progress + pagination (§3, §5).
2. **Rung — RESOLVED: accept the trio's cut** (conformance gate + kernel extension, NOT a
   runtime interpreter). "Violation caught," not "violation impossible."
3. **Vocabulary — RESOLVED, lands as PR 0:** "heart"→`subtitle`; `note`→{key-insight,
   below-note} (annotation stays overlay); add `status`; `watermark`→stage.
4. **`cover`/`compact` naming — RESOLVED:** `cover` (not `full-bleed`) for the universal
   full-bleed modifier; `compact` unchanged.
5. **Overflow/measuring machinery — RESOLVED: PROTECTED, non-negotiable** (§5). Every slice
   proves the probe verdict + autosplit decisions are unchanged.

6. **`diagram` proof slice — RESOLVED 2026-07-15: SHIPPED.** The one-component test that earns the
   sequence. Built, verified by the full adversarial trio (the crux — self-scaling SVG cannot overflow
   the stage — held under all three; §6), export sign-off GIVEN by the owner (the ~2px CLI-export shift on
   diagrams with extra stage content; "being larger is a good thing"). `diagram` joins the strict set
   (contact, diagram, wifi). The sequence is earned; the SVG-chart flags follow, each re-running the
   self-scaling test (§6 forward-caution) and owing its own export sign-off.

---

## 8. Why this still delivers the north star

The model stays the source of truth; a **conformance gate** makes a violating component
**fail the build** (caught, not merely discouraged); the stage cell becomes **universal**;
`compact`/`cover` become uniform for structure/spacing. A jr engineer learns one rule
— *"my parts live in my frame's cells; the frame builds them; my `stage`/`compact`/
`cover` are knobs; the gate proves I conform."* The trio's cut keeps that outcome while
removing the runtime interpreter, the monster branch, and the byte-roulette — the three
things that would have made it a swamp.
