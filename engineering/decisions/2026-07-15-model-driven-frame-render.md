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

**Landed:** PR 1 = `contact` (2026-07-15). PR 2 = `wifi` (2026-07-15).

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

**Still open — the one go-ahead the owner gates:** start the `diagram` proof slice (§6 PR 1)?
That is the one-component test that earns (or refutes) the whole sequence at the price of one
component. Not begun without explicit go.

---

## 8. Why this still delivers the north star

The model stays the source of truth; a **conformance gate** makes a violating component
**fail the build** (caught, not merely discouraged); the stage cell becomes **universal**;
`compact`/`cover` become uniform for structure/spacing. A jr engineer learns one rule
— *"my parts live in my frame's cells; the frame builds them; my `stage`/`compact`/
`cover` are knobs; the gate proves I conform."* The trio's cut keeps that outcome while
removing the runtime interpreter, the monster branch, and the byte-roulette — the three
things that would have made it a swamp.
