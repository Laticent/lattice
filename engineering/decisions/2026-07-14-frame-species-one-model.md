---
status: in-progress
summary: Every component's slide root is already a Frame with a stage Cell (forms.md); the implementation drifted into three hand-maintained buckets. An adversarial trio falsified the first draft's CSS migration (mechanism + value), so it is cut to step A — declare each component's stage sizing (flow|canvas), collapse the three Sets into one drift-tested catalog-derived classifier (behavior-preserving), and route a real single-stage-cell-for-viz through the blessed .viz-frame merge.
---

# Frame species — one composition model, no exceptions

**Date:** 2026-07-14
**Status:** accepted — first draft hardened by an adversarial trio; the CSS
migration is **cut** to the model-coherence step (step A). Owner chose step A on
2026-07-14.
**Extends:** `design/forms.md` (the canonical Form model — the vocabulary authority).
**Coordinate with:** `2026-07-13-viz-color-and-frame-unification.md` (the `.viz-frame`
merge — same DOM, same byte-identical constraint, already has an owner-go-ahead path).

---

## 1. The invariant (the vision — correct)

> **Every component's slide root is a Frame. Every Frame has a stage Cell.
> Components differ only in WHICH Cells their Frame carries and how the stage Cell
> is sized — never in whether they are a Frame at all.**

Biological framing: one **body plan** (a Frame of Cells — masthead, stage, footer),
many **species** (different organs present, the stage sized differently). No
"not-an-animal" in the catalog. This is exactly `forms.md` §1 — *"A Frame divides a
box into Cells; each Cell holds a Tile; the slide's root is a Frame."* — and
`forms.md` already ships the machinery: `frame.kind` (`root` keeps chrome ·
`sovereign` claims the canvas + `suppresses` chrome cells) and a `cells` list with
`region: masthead | stage | footer`. **The model is right; the implementation
drifted from it.** The vision is retained; the first draft's *mechanism and value
case for enforcing it via CSS* did not survive review.

---

## 2. Where the implementation violates the invariant today

`masthead.transform.js` classifies every layout into one of **three hand-maintained
`Set`s**, and only the first is a full Frame:

| Bucket | Count | Gets | Frame-complete? |
|---|---|---|---|
| `STAGE_MIGRATED` | 31 | masthead + **`.cell-stage`** + footer | ✅ real Frame |
| `STAGE_DEFERRED` | 17 | masthead, body is bare direct children | ⚠️ no stage Cell |
| `FORM_TOGGLE_SKIP` (sovereign) | 8 | no bands, drives own layout | ❌ modeled as "not a Form" |

The `lib/forms/frame/` catalog ships **10** frame manifests but **none** for
charts/diagram/media, and components are bound to a frame by imperative `Set`
membership, not declared data — a HARD RULE #1 smell, and the soil the 2026-07-14
cell-stage selector bugs grew in.

---

## 3. What the adversarial trio falsified

### 3.1 FATAL — "one self-sizing box to rename" is false; the stage region is multiple flowed siblings
The masthead lift moves **only** eyebrow + h2 (`masthead.transform.js:253-263`);
everything else stays a **sibling** section child. Rendered reality:
- **chart family (13):** `section > .chart-masthead + .chart-header (subtitle) +
  .chart-body (canvas) + .chart-caption` — three stage-region boxes
  (`chart-family.css:263/363/477`).
- **diagram:** `section > <p> + .mermaid-svg + <blockquote>`.
- **wifi/contact:** `section > <p> + <ul>` — `.qr-card` isn't even the sole child.

So `.chart-body` is **not** the stage — it's one box in a multi-box region. A single
stage Cell needs a **wrapper** for ~14 of 17 deferred components (DOM restructure,
byte-identical re-earned), and a marker on `.chart-body` alone aligns the canvas
while the subtitle/caption stay pinned — incoherent.

### 3.2 The value is mostly already shipped or vacuous
- **`claim-*` is already universal** on charts/diagram/media (`stage.css:319,
  337-341`; `2026-07-03-claim-content-claims-the-stage.md`). Not a gain.
- **`align-*`** is the only new reach, and **near-vacuous** — a canvas fills its own
  box (`100cqi − padding`), so aligning it is a no-op.
- **`clip`** is marginal (canvases self-clip; the section probe already catches them).

### 3.3 "species" is a §2.5 third-synonym violation
- **`stage-own` = `frame.kind: sovereign` restated** (redundant with shipped data).
- **`stage-flow` vs `stage-canvas`** is a Cell **sizing** contract → **one** field:
  `cell.sizing: "flow" | "canvas"` (default `flow`), read Node-side. No `stage-*`
  class triad in the cascade.

### 3.4 The cheap phases aren't as cheap as billed
- The flow/canvas cut **isn't derivable** from `form:` (which spans all three) or
  bucket — it needs **new declared data** per component. The sovereign half **is**
  already manifest-derived (`deriveFormToggleSkip()`, `plugins.js:466`), so only that
  half is free.
- "Delete the JS Sets" is partly illusory: the runtime bundle can't fs-load
  manifests, so a baked fallback stays; net source count could rise, not fall.
- `math`/`compare-code` only suppress the masthead and **keep the footer** — partial
  sovereigns; the 8 aren't homogeneous.

### 3.5 Two collisions to respect
- The 07-14 fix (`ff02eca`) moved three rule groups to `> .cell-stage >`; its test
  pins `form: off`, so re-verify Form-*on*.
- `2026-07-13-viz-color-and-frame-unification.md §2` already proposes `.chart-frame` +
  `section.diagram` → `.viz-frame` (same DOM). The viz-frame merge should **lead** a
  single viz stage Cell; a separate reorg guarantees rework.

---

## 4. Decision — what we do (step A only)

**A. Make the taxonomy honest and data-shaped (small, internal-correctness, ZERO
visual/export change).**
- Each component **declares its stage sizing** (`stage: "flow" | "canvas"`) in its
  manifest; the sovereign case stays expressed by `frame.kind`/`exemptFromChrome`
  (already manifest-derived).
- `masthead.transform.js` reads **one** classifier — `stageSizingFor(cls) → "flow" |
  "canvas" | "sovereign"` — instead of three hand-maintained `Set`s. The browser
  bundle keeps a baked fallback (the `deriveFormToggleSkip` idiom).
- A **drift test** asserts the new classifier reproduces the OLD partition
  (`STAGE_MIGRATED`/`STAGE_DEFERRED`/`FORM_TOGGLE_SKIP`) **exactly** for every layout —
  the safety proof that behavior is unchanged.
- **Value:** the transform expresses the model; the 07-14 selector-bug class gets
  harder to reintroduce; the taxonomy is data, not three drifting lists. **Not** an
  author-facing capability — an internal-correctness investment, taken with eyes open.

**B. A single stage Cell for the viz family — only inside the `.viz-frame` merge**
(the 2026-07-13 track), gated on real `align-*` demand and a byte-identical proof on
`diagram` first. **Not started here.**

**Cut:** the "rename, no wrapper" mechanism (false, §3.1); the sovereign `stage-own`
relabel (redundant, §3.3); "delete the Sets" as a headline (illusory, §3.4); any
`stage-*` class triad (§3.3).

---

## 5. Non-goals (guardrails the trio insisted on)

- **No manifest-driven render (`forms.md` §11).** The sizing field is a *validated*
  build-gate contract, not a render input.
- **No recursive frames** (`2026-06-18-frame-recursion-cells.md`).
- **No re-bless inside a byte-identical step.**
- **One front on the masthead transform / cell-stage CSS at a time** (HARD RULE
  #17/#18) — coordinate with PR #990 and the viz-frame track.

---

## 6. Why record this even though most of it is "don't"

The expensive part of this work is the *analysis* — the trio proved a plausible,
attractive migration rests on false premises and chases already-shipped value. This
doc is the durable record so the "make every component a real cell-stage" idea isn't
re-proposed from scratch. Step A delivers the honest, model-level coherence the vision
wants; the real canvas-stage work has a home (viz-frame) when it's actually wanted.
