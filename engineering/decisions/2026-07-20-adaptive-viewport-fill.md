---
status: proposed
summary: >
  Finish and polish the adaptive capability that already ships — make the deck FILL the
  viewport in present mode and the HTML player instead of letterboxing a fixed box into it.
  Today those surfaces hand the layouts the pinned authored box and scale the whole thing
  with fitScale, so any screen that isn't the authored aspect gets bars (the "widescreen
  movie on an HD screen" strip); the one place the box is unpinned to the viewport — the
  fluid-box viewer — is opt-in AND phone-only, so the landscape strip (16:9 deck on a 16:10
  laptop / 4:3 projector / 21:9 ultrawide) is the piece nobody built. This is NOT a new
  system: the placing machinery (collapse/reflow, families classifier, portrait type scale,
  build-time autosplit) already ships — this changes the BOX those layouts fit into and the
  SURFACES/aspects it fires on. Chosen direction (owner-aligned): Option B — fill within a
  tolerance band, reflow at the edges — over A (pure fill, always) and C (fill on demand);
  scorecard + rationale inside. Reuses the Fit Spine's collapse→shed→split→floor ladder;
  the two visible gaps (portrait clip, ultrawide dead-band) are the polish. Landscape export
  bytes are UNTOUCHED (viewer-only), so this is not an export-sign-off change; the present/
  player default shift is a visual-review change. Amends the fluid-box viewer's locked
  "opt-in, phone-only, wide-screens-keep-authored-shape" scope with new prototype evidence.
builds-on: 2026-06-22-the-fit-spine.md, 2026-06-21-fluid-box-viewer-design.md, 2026-06-25-runtime-autosplit-eventual-consistency.md, 2026-07-07-html-lattice-player.md
---

# Adaptive viewport fill — the deck fills present mode + the player, it never letterboxes

**Date:** 2026-07-20 · **Status:** Proposed (direction owner-aligned; not yet built) ·
**Decision owner:** Sharmarke

This doc decides *what "adaptive" finishes as* on the two interactive surfaces a human
actually watches — **present mode and the HTML player** — so the build that follows has one
obvious shape. It does not ship code. It is the design PR that precedes the build slices.

> **Scope fence.** This is limited to the **interactive viewing surfaces** (present mode, the
> self-contained HTML player, and the docs-site present/playground stages that share their
> transport). The **static exports — PDF / PPTX / PNG and the canonical export HTML — are a
> fixed-paper deliverable and stay byte-for-byte unchanged** (same guarantee the fluid-box
> viewer already keeps). No exported bytes change → this is **not** an export-sign-off change
> under the Quality Bar; the present/player *default* shift is a normal visual-review change.

---

## 0. The decision in one paragraph

Today present mode and the player hand the component layouts the **pinned authored box**
(e.g. 1280×720) and then scale that whole finished box into the viewport with `fitScale`
(`lib/core/present-transport.mjs:31`) — a uniform `min(vw/sw, vh/sh)`, so every screen that
is not the authored aspect gets **letterbox/pillarbox bars**. We change the default: in
present mode and the player the section box is **sized to the viewport** (fill), and the
adaptive machinery that already ships re-places the content into it. To keep the author's
composition recognizable, fill operates **within a tolerance band** around the authored
aspect (Option B): inside the band the layout just breathes to use the whole box; beyond it,
the box **reflows to the nearest family** (the existing `wide/square/tall/strip` classifier)
or **caps the fill** with a designed symmetric frame rather than spreading into dead space.
This is the completion of the adaptive capability, not a second one — the *placing* is
already built; we are changing the *box* it fits and the *surfaces/aspects* it fires on.

---

## 1. The problem — the strip, made visible

A slide is authored at a fixed shape; that shape is baked into a fixed px box
(`lib/engine/css.js` `scaffold()` emits `section{width:1280px;height:720px}`). Present mode
and the player keep that box and **scale it as a unit** to fit the viewport
(`lib/export/player-core.mjs:341` `transform:scale(var(--lp-fit-present))`, factor from
`fitScale`). The leftover is bars — the *"widescreen movie on an HD screen"* strip.

A throwaway prototype (`.scratch/adaptive-proto/`, 2026-07-20) drove the **real engine** —
`examples/fluid-box.md` through the actual runtime at five screen shapes — and the strip is
worst exactly where intuition says: a **vertical** screen is ~half dead bar; **4:3** loses a
fat top-and-bottom band; **21:9** gets thick side pillars. Only a ~16:9 screen is clean
today. The prototype is the evidence base for this doc (comparison artifact rendered for the
owner; screenshots retained in `.scratch/adaptive-proto/shots/`).

## 2. The reframe — this is the missing half of the capability we already have

"Auto-adaptive" is two layers. The engine already owns one and not the other:

| Layer | What it does | Where it stands today |
|---|---|---|
| **The placing** — how content re-flows when the box changes shape | collapse 4-across → 1-col (`@container` reflow), the portrait `--fs-*` type scale, the `families.js` classifier, build-time autosplit | **Ships.** It is what makes the prototype's fill shots reflow at all — no new placing machinery is needed |
| **The box** — what shape box the viewing surface hands that machinery | present/player hand the **pinned** authored box, then `fitScale` scales it (letterbox). The **only** unpinned-to-viewport path is the fluid-box viewer — and it is **opt-in AND phone-only** | **The gap.** Landscape screens never get a matching box |

So the engine already knows *how to re-place content when the box changes*; it just never
hands present mode or the player a box that matches the screen. This work **supplies the
box**; the shipped capability does the placing. That is the whole reframe, and it is why the
prototype needed zero engine changes to produce genuine reflow.

### 2.1 The reused-vs-new ledger (HARD RULE #1 — reuse, don't rebuild)

| Piece | Reused (ships) / New | Note |
|---|---|---|
| Reflow layouts to the box (collapse) | **Reused** | `@container (aspect-ratio…)` fires off the measured box; nothing new |
| `families.js` classifier (`wide/square/tall/strip`, boundaries `[0.5,0.9,1.05]`) | **Reused** | the one box-shape signal; drives reflow-at-edges |
| Portrait type scale + `--_sec-1cqi` stamp | **Reused** | `patchSectionGeometry()` re-stamps on resize |
| Fluid box (unpin to `100dvw×100dvh`) | **Reused, ungated** | `base.fluid-view.css` exists; today gated to phone + opt-in — we fire it on landscape and by default |
| Build-time autosplit (portrait clip) | **Reused** | `lib/core/auto-split.js`, opt-in `autosplit: on` — the deferrable half of the clip fix |
| **Kill the letterbox default in present/player** | **New** | replace the `fitScale` default with the fill box on these surfaces |
| **Fire fill on landscape screens** | **New** | today `initFluidView` defaults fluid only when `innerHeight > innerWidth` (`lib/runtime/index.js:1809`) |
| **Edge handling — band cap / vertical distribution** | **New** | Option B's core new work (the ultrawide dead-band fix) |
| **Live split for the portrait clip** | **New (specced)** | `2026-06-25-runtime-autosplit-eventual-consistency.md`; the hard part, deferrable |

The new column is a **trigger + coverage + edge-polish** change, not a new placing engine.

## 3. The three options, scored

The direction fork is **how far the deck drifts from the authored look to fill the screen**.
Scored 0–10 against weighted criteria (the owner's goal — actually fill — and the boardroom
quality bar dominate; control, cost, risk, and architectural fit round it out).

| Criterion (weight) | A · Pure fill, always | B · Band + reflow | C · Fill on demand |
|---|:--:|:--:|:--:|
| Solves the goal — fills, kills the strip (30%) | 10 | 8 | 4 |
| Boardroom quality across all screens (20%) | 5 | 8 | 6 |
| Author control / fidelity (15%) | 3 | 7 | 9 |
| Feasibility now — ships on existing machinery (15%) | 3 | 7 | 9 |
| Risk & reversibility — regression, export-safety (10%) | 4 | 7 | 9 |
| Architectural fit — Fit Spine, forms axiom, one-owner (10%) | 8 | 9 | 6 |
| **Weighted total** | **6.1** | **7.7** | **6.6** |
| **Rank** | 3rd | **1st** | 2nd |

- **A · Pure fill** wins the goal outright and is the purest expression of the forms axiom,
  but the prototype convicts it on quality: **ultrawide leaves a dead band, dense portrait
  clips**. It fills, but not always *well*, and to be safe against the clip it needs the
  unbuilt live re-pagination (largest build, highest blast radius). The **north star**, not
  the first step.
- **B · Band + reflow (chosen)** kills the strip on every common screen using machinery that
  already ships, and is the only option that handles **both** edges (no dead band, no ragged
  clip). It **strictly dominates A visually** — same portrait behavior, but it caps the
  ultrawide instead of spreading into air. Control is bounded and predictable (reflows snap
  to a *known* family, not continuous drift). Best architectural fit: it is the Fit Spine
  activated and extended into landscape.
- **C · Fill on demand** is safe, cheap, and high-control, but the **default stays the
  strip** — a presenter who doesn't tap the toggle still watches bars. Good fallback if the
  appetite for a real default shift is low; it does not make the deck *inherently* adaptive.

**Chosen: B**, with **A as the north star** it grows toward once the portrait-clip fix
(live split) lands. Sensitivity: crank cost+risk+control and C wins; crank goal-maximalism
and discount the visible edge gaps and A wins — but the prototype is the argument against
that, because A's gaps are in the renders, not in theory.

## 4. What B is, precisely

Three rules define the fill policy on present mode + the player.

1. **The box is the viewport.** On these surfaces the section is sized to the available
   stage (`100%`/`100dvh` of the present stage), not the pinned authored px box. The
   `fitScale` letterbox transform is **not** the default here anymore. *Note:* fill **resizes
   the box** rather than **scaling a fixed box**, so it sidesteps the iOS
   `zoom`-vs-`container-type` bug that forced `transform:scale` in the first place
   (`2026-07-02-preview-scale-zoom.md`) — a genuinely resized container re-resolves `cqi`/
   `container-type:size` normally. *(Expected advantage; **UNVERIFIED** on real iOS from this
   sandbox — flagged for the build's real-surface bar, HARD RULE #23.)*

2. **Inside the band: breathe, don't reflow.** When the viewport aspect is within a tolerance
   band of the authored aspect (the `wide` family covers ~16:9↔16:10↔3:2↔4:3), the layout
   keeps its composition and the `cqi` gaps/paddings simply grow to use the whole box. **At a
   screen that IS the authored aspect, fill == letterbox with the bars removed — the
   composition is pixel-identical, zero reflow surprise.** This is the reassurance that a
   presenter's careful ~16:9 composition is never disturbed on a ~16:9 projector; only the
   bars go.

3. **At the edges: reflow to the nearest family, or cap the fill.** Beyond the band (portrait
   phone, 21:9 ultrawide), the box crosses a `families.js` boundary and the existing reflow
   fires (row → column on `tall`/`strip`). Where filling further would spread content into
   dead space (the ultrawide case), **cap the fill with a designed symmetric frame** (a
   composed margin, never a ragged bar) up to a max aspect, or distribute vertically — the
   new edge-handling work.

## 5. The two gaps — visible in the fill shots, and how B closes them

Both are real in the prototype renders, not hypothetical. They are the polish that separates
"fills" from "fills well," and they map onto the Fit Spine's existing ladder.

- **Gap 1 · portrait clip.** A dense slide reflows to one column correctly but is now taller
  than the screen and the last card is cut off. **Fix = the Fit Ladder's move 3/4** (split
  across screens, or stop at the legible floor + honest overflow ring;
  `2026-06-22-the-fit-spine.md` §3). **Build-time split already ships** opt-in
  (`autosplit: on`); the *live* split is specced (`2026-06-25-...eventual-consistency.md`) and
  is the deferrable hard part. Shared with Option A.
- **Gap 2 · ultrawide dead-band.** Pure fill anchors content to the top with an empty region
  below — filling the width did not fill the composition. **Fix = rule 3's band-cap /
  vertical distribution.** This is the one gap B has that A does not solve at all.

## 6. Relationship to prior decisions (what this builds on, and what it amends)

- **Builds on `2026-06-22-the-fit-spine.md`** — reuses collapse→shed→split→floor verbatim;
  adds no fifth move and no shrink move. Fill is the *box* argument to the Frame function;
  the ladder is unchanged.
- **Builds on `2026-06-25-runtime-autosplit-eventual-consistency.md`** — the portrait-clip
  fix on the *live* surface is exactly its bounded runtime split (portrait family, logical
  addressing, eventual-consistency placeholders). This doc gives that spec a consumer.
- **Amends `2026-06-21-fluid-box-viewer-design.md` (locked decisions 4b + §5).** That doc
  locked fluid as **opt-in** and **phone-only** ("wide screens keep the authored fixed-shape
  presentation even in fluid mode"). This doc **proposes revisiting both**, with the new
  prototype evidence that the *landscape* strip is the core unmet complaint: fill becomes the
  present/player **default** and fires on **landscape** aspects. This is a deliberate,
  evidence-backed change to a prior owner-locked scope — recorded as such, not a silent
  contradiction. The fluid-box viewer's **export-safety guarantee is kept** (viewer-only;
  landscape artifact byte-identical).
- **Extends `2026-07-07-html-lattice-player.md`** — the player's Present view is one of the
  surfaces whose default this changes; the transport kernel (`present-transport.mjs`) is
  where `fitScale` lives and where the fill box is selected.

## 7. Munger inversion — design the failure, then forbid it

| To GUARANTEE this becomes a mess, we would… | …so the rule is |
|---|---|
| Reflow continuously on every pixel of resize, thrashing layout | Reflow is **discrete at family boundaries**; inside the band it's continuous *CSS breathe* only (no re-pagination churn) |
| Let fill spread content into dead space on any wide screen | **Cap the fill** beyond the band (rule 3); a composed frame, never a ragged bar |
| Silently reshape every author's deck on every screen | Fill preserves the composition **inside the band** and is **bounded** to known families outside it — never continuous free drift (that's A, the north star, gated behind the clip fix) |
| Fork the fill logic per surface (player vs docs present vs playground) | One selection point in the shared transport kernel (`present-transport.mjs`); all stages consume it (HARD #1) |
| Ship the portrait clip as a silent content loss | The clip resolves via the ladder's **split or honest ring** — never a silent drop (`forms.md` §6) |
| Change exported bytes so the artifact and the view diverge | Fill is **viewer-only**; the landscape export never enters this path |

## 8. Red team

- **"You're just un-gating the fluid viewer and calling it a design."** Partly true, and said
  plainly: the *box* mechanism is reused. The genuinely new work is **landscape coverage +
  edge handling + the present/player default**, none of which the fluid viewer does. The
  value is completing a capability, not inventing one.
- **"Presenters rely on the exact composition; fill changes it."** Inside the band it does
  **not** (rule 2 — identical composition on ~16:9, bars removed). Outside the band the change
  is the *point* (a phone should not show a 16:9 strip). Author control is preserved where it
  matters and bounded where it changes.
- **"The portrait clip means B ships broken."** No — B ships the **band + landscape fill +
  edge cap** first (the strip fix), with the clip handled by the *already-shipping* build-time
  split for decks that opt in, and the live split sequenced after. A dense portrait slide is
  no worse than today (today it letterboxes into an illegible strip; B at least reflows it).
- **"Ultrawide is rare — why spend on Gap 2?"** Because pure fill without it looks broken, and
  the cap is cheap CSS (a max-aspect frame). It is what makes B *dominate* A rather than tie.

## 9. Phasing (each slice one branch → one PR, HARD #17; tree green throughout)

- **P0 — this doc.** ☐ The design + the owner-aligned direction (B).
- **P1 — landscape fill + band, viewer-only, opt-in first.** Un-gate `base.fluid-view.css`
  from phone-only; fire fill on landscape via the existing `?view`/toggle path; confirm the
  band case (16:10/4:3) breathes and ~16:9 is composition-identical. Landscape export
  byte-identical (golden diff). Visual review at 390/820/1440 **and** 4:3/21:9/portrait.
- **P2 — edge handling (Gap 2).** The band-cap / vertical-distribution rule for beyond-band
  wide aspects. Kills the ultrawide dead-band.
- **P3 — make fill the DEFAULT in present mode + the player** (not just opt-in), with a
  toggle back to the authored fixed look. This is the visible behavior change → visual-review
  gated, `CHANGELOG.md` `## Unreleased` entry (HARD #10) lands here.
- **P4 — portrait clip (Gap 1), live.** The bounded runtime split from
  `2026-06-25-...eventual-consistency.md`. Maker-checker on the partition path. Deck-opt-in
  build-time split covers the interim.
- **North star (separate, later) — Option A** (continuous fill past the band) once P4 makes
  the clip safe.

Per-feature demo deck + committed PDF (HARD #9) rides P1/P3. No CHANGELOG entry for this doc
alone (no user-visible behavior changes until P1+).

## 10. Verification bar

Per the Quality Bar and HARD RULE #23 — a claim names its surface and carries an artifact
from it:

- **Real surfaces, real aspects.** Drive the actual player + present stage at 16:9 / 16:10 /
  4:3 / 21:9 / portrait; confirm band-breathe, edge-cap, and portrait reflow on each. Emulation
  and CI green are **not** verification of the viewing behavior.
- **iOS re-fit** (rule 1's expected advantage) verified on a real device or marked
  **UNVERIFIED** — the sandbox cannot reach iOS Safari.
- **Export byte-identity** (golden diff) proving the landscape PDF/PPTX/PNG + canonical HTML
  are untouched — the safety guarantee this whole direction rests on.
- **No-regression on ~16:9** — a screen at the authored aspect renders composition-identical
  to today's letterbox (minus bars).

## 11. What this doc decides

1. On present mode + the HTML player, the deck **fills the viewport** instead of letterboxing
   a scaled fixed box — **Option B** (fill within a band, reflow at the edges).
2. This **completes the existing adaptive capability** (new box + coverage + edge polish), it
   does not add a parallel one; the placing machinery is reused wholesale.
3. **Static exports stay byte-identical** — viewer-only; not an export-sign-off change.
4. The fluid-box viewer's locked **opt-in / phone-only** scope is **amended** with prototype
   evidence; fill fires on landscape and (P3) becomes the default.
5. The two visible gaps — **portrait clip** and **ultrawide dead-band** — are the polish, and
   map onto the Fit Spine ladder + the specced live split; the ultrawide cap is B's own new
   work.
6. **Option A (pure continuous fill)** is the recorded **north star**, gated behind the live
   portrait-clip fix.

---

**Prototype evidence:** `.scratch/adaptive-proto/` (2026-07-20) — `examples/fluid-box.md`
driven through the real runtime at five screen shapes under letterbox vs fill; comparison
artifact rendered for the owner. Throwaway; no engine code changed.
