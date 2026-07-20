---
status: proposed
summary: >
  Finish the adaptive capability that already ships — make the deck FILL the viewport in
  present mode and the HTML player instead of letterboxing a fixed box into it. Today those
  surfaces hand the layouts the pinned authored box and scale the whole thing with fitScale,
  so any screen that isn't the authored aspect gets bars (the "widescreen movie on an HD
  screen" strip); the one place the box is unpinned — the fluid-box viewer — is opt-in AND
  phone-only, so the landscape strip (16:9 deck on a 16:10 laptop / 4:3 projector / 21:9
  ultrawide) is the piece nobody built. Direction (owner-aligned): fill, Option B end-state —
  fill within a tolerance band, reflow at the edges. HARDENED by the HARD RULE #25 adversarial
  trio (§12), which corrected the first draft's overclaims: fill is PER-SURFACE new work (the
  box is decided in ≥3 places incl. a CSP-hashed, golden-pinned player), NOT a one-point reuse;
  the wide-side "band" needs a NEW boundary families.js lacks (wide is [1.05,∞] — 21:9 and 16:9
  are one family); the player .html IS an exported artifact whose bytes change when fill is its
  default; and the honest first ship is OPT-IN landscape fill (≈ Option C's mechanism, near-free,
  honors the locked "don't silently reshape shared decks" principle), PROMOTED to default only
  after the edge cap + honest overflow ring are built and reviewed. Canonical exports
  (PDF/PPTX/PNG + the canonical export HTML) stay byte-identical throughout.
builds-on: 2026-06-22-the-fit-spine.md, 2026-06-21-fluid-box-viewer-design.md, 2026-06-25-runtime-autosplit-eventual-consistency.md, 2026-07-07-html-lattice-player.md
---

# Adaptive viewport fill — the deck fills present mode + the player, it never letterboxes

**Date:** 2026-07-20 · **Status:** Proposed (direction owner-aligned; hardened by the
adversarial trio — §12; not yet built) · **Decision owner:** Sharmarke

This doc decides *what "adaptive" finishes as* on the two interactive surfaces a human
actually watches — **present mode and the HTML player** — so the build that follows has one
obvious shape. It does not ship code. It is the design PR that precedes the build slices.

> **Scope fence (corrected — see §6.1).** This targets the **interactive viewing surfaces**
> (present mode, the HTML player's Present view, and the docs-site present/playground stages).
> **PDF / PPTX / PNG and the *canonical* export HTML stay byte-for-byte unchanged.** The one
> honest exception the trio surfaced: the **self-contained `.html` player is itself an exported
> artifact** (golden-pinned, `sha256`-CSP-hashed); when fill becomes its *default* (P3), its
> bytes change → **that phase re-blesses the player golden + CSP and is export-sign-off-gated**,
> not merely visual-review. Everything before P3 is opt-in and leaves every exported byte
> untouched.

---

## 0. The decision in one paragraph

Today present mode and the player hand the component layouts the **pinned authored box**
(e.g. 1280×720) and then scale that whole finished box into the viewport with `fitScale`
(`lib/core/present-transport.mjs:31`) — a uniform `min(vw/sw, vh/sh)`, so every screen that
is not the authored aspect gets **letterbox/pillarbox bars**. The direction: in present mode
and the player the section box is **sized to the viewport** (fill), and the adaptive
machinery that already ships re-places the content into it. To keep the author's composition
recognizable, fill operates **within a tolerance band** and **caps beyond it** (Option B).
**But — corrected by the trio — this is not a one-line reuse and not free to default:** the
box is selected independently in ≥3 surfaces, the wide-side band needs a boundary `families.js`
does not have, and default-on reshapes shared landscape decks (the exact harm a prior locked
decision prevented). So the **shippable path is opt-in landscape fill first** (Option C's
mechanism, near-free) → build the edge cap + honest overflow ring → **then** promote to default
(Option B) behind review. The *destination* is B; the *first step* is C's mechanism.

---

## 1. The problem — the strip, made visible

A slide is authored at a fixed shape; that shape is baked into a fixed px box
(`lib/engine/css.js` `scaffold()` emits `div.lattice > section { width:1280px; height:720px }`).
Present mode and the player keep that box and **scale it as a unit** to fit the viewport
(`lib/export/player-core.mjs:341` pins `1280×720` + `transform:scale(var(--lp-fit-present))`,
centered in a `place-items:center` stage; factor from `fitScale`). The leftover is bars — the
*"widescreen movie on an HD screen"* strip.

A throwaway prototype (`.scratch/adaptive-proto/`, 2026-07-20) drove the **real engine** —
`examples/fluid-box.md` through the actual runtime at five screen shapes — and the strip is
worst exactly where intuition says: a **vertical** screen is ~half dead bar; **4:3** loses a
fat top-and-bottom band; **21:9** gets thick side pillars. Only a ~16:9 screen is clean today.
Screenshots retained in `.scratch/adaptive-proto/shots/`. *Evidence weight, stated honestly:
five screenshots the owner viewed. Strong enough to pick a direction; **not** strong enough on
its own to overturn a prior locked composition-fidelity decision (see §6).*

## 2. The reframe — this is the missing half of the capability we already have

"Auto-adaptive" is two layers. The engine already owns one and not the other:

| Layer | What it does | Where it stands today |
|---|---|---|
| **The placing** — how content re-flows when the box changes shape | collapse 4-across → 1-col (`@container` reflow), the portrait `--fs-*` type scale, the `families.js` classifier | **Ships.** It is what makes the prototype's fill shots reflow at all — the *box-derived* parts need nothing new |
| **The box** — what shape box the viewing surface hands that machinery | present/player hand the **pinned** authored box, then `fitScale` scales it (letterbox). The **only** unpinned-to-viewport path is the fluid-box viewer — **opt-in AND phone-only** | **The gap.** Landscape screens never get a matching box |

So the engine already knows *how to re-place content when the box changes* — for the parts
that **re-derive from the box every frame** (CSS `@container`, `cqi`). This work supplies the
box. **The trap the first draft fell into:** framing *everything* as box-agnostic reuse. It
isn't — several consumers **cached the authored box** and are not box-agnostic. §2.2 is that
ledger.

### 2.1 Reused-vs-new ledger (corrected)

| Piece | Verdict | Note |
|---|---|---|
| Reflow layouts to the box (collapse) | **Reused** | `@container (aspect-ratio…)` fires off the measured box; genuinely free |
| `families.js` classifier | **Reused, but insufficient on the wide side** | portrait boundaries `[0.5,0.9,1.05]` ship; there is **no upper wide boundary** (`wide = [1.05,∞]`) — the ultrawide cap needs a **new** one (§4, §5 Gap 2) |
| Portrait type scale + `--_sec-1cqi` re-stamp on resize | **Reused** | `patchSectionGeometry()` re-stamps on resize (`runtime/index.js:1432,1448`) |
| Fluid box (`100dvw×100dvh`) | **Reused, ungate on landscape** | `base.fluid-view.css` exists; gated phone-only + opt-in today. **NB (§4.1): it is a vertical-scroll reading model, not present mode** |
| Build-time autosplit | **Reused, but calibrated to the AUTHORED box** | `auto-split.js` (opt-in `autosplit: on`, landscape no-op). It partitions for the authored aspect — it does **not** know the fill box (§7) |
| **Select the fill box in present/player** | **New — PER SURFACE, not one point** | the box is decided in ≥3 places (§2.2); each is a separate change |
| **Fire fill on landscape** | **New** | `initFluidView` defaults fluid only when `innerHeight > innerWidth` (`runtime/index.js:1809`) |
| **A new upper wide boundary + edge cap + wide-but-tall vertical distribution** | **New** | `families.js` has no `wide` ceiling; `injectOrientationStyle` early-returns for aspect > 1.05 (`runtime/index.js:1346`) so wide-but-tall is unhandled |
| **Honest overflow ring / floor at runtime** | **New (cheap half of the ladder)** | today the watcher only warns; the ring must land before default-on |
| **Live split for the portrait clip** | **New (specced)** | `2026-06-25-…eventual-consistency.md`; the hard part |

### 2.2 What assumed the authored box (the not-box-agnostic ledger)

The box is **not** selected in one place, and three consumers cached the authored aspect:

- **`present-transport.mjs` is DOM-free and selects no box.** It exports `fitScale` — a scalar
  `min(vw/sw,vh/sh)` (`:31-33`). It cannot own the box; naming it "the one selection point" (the
  first draft did) is wrong.
- **The player Present view** hard-codes `width:1280px!important;height:720px!important;
  transform:scale(…)` (`lib/export/player-core.mjs:341-342`) inside a script that is
  **`sha256`-CSP-pinned** and whose CSS strings are asserted byte-for-byte
  (`test/unit/export/html-player.test.js`). Filling it = rewrite that script, re-bless the CSP
  hash + the exact-string tests + the golden.
- **The docs present stage** (`docs/src/…/presenter-window.js`, `PresentOverlay.tsx:511`) keeps
  every section at natural 1280 and **scales a wrapper** on a hard-coded `16/9`, precisely
  because the runtime *owns* the sections and wipes a per-section scale. Fill *requires* resizing
  the section — the thing this surface documents it cannot do without fighting the runtime.
- **Build-time autosplit** and the **server-side `data-orientation` stamp** are computed against
  the authored box (§7).

**Corrected invariant (HARD #1):** the box has one owner — a **DOM-level box-selector** (the
section-sizing rule keyed off `data-lattice-view`), **not** the DOM-free `fitScale`. The build
must **converge** those ≥3 hard-coded boxes onto that one selector, and add fill as a *mode* of
it — otherwise "one owner" is satisfied on paper while three surfaces keep private constants.

## 3. The options, scored — and why the first ship is C's mechanism

The direction fork is **how far the deck drifts from the authored look to fill the screen**.
The first draft scored B a clear winner; the trio's re-derivation (§12) narrowed that to noise.

| Criterion (weight) | A · Pure fill | B · Band + reflow | C · Opt-in fill |
|---|:--:|:--:|:--:|
| Solves the goal — fills, kills the strip (30%) | 10 | 8 | 5 |
| Boardroom quality **on proven (P1) renders** (20%) | 5 | 5 | 5 |
| Author control / fidelity + honors the lock (15%) | 3 | 6 | 9 |
| Feasibility now — real per-surface cost (15%) | 3 | 5 | 9 |
| Risk & reversibility — incl. player golden/CSP (10%) | 4 | 5 | 9 |
| Architectural fit (10%) | 8 | 8 | 7 |
| **Weighted total (hardened)** | **6.05** | **6.35** | **6.75** |

The re-score (Feasibility B 7→5, Risk B 7→5, Quality scored on *proven* P1 renders where B has
no cap yet so it equals A/C) **inverts the ranking to C on the numbers.** This is not "C beats
B" as an end-state — it is the trio's real lesson: **B's win in the first draft was borrowed from
unbuilt polish, and C's mechanism is the honest first step *toward* B.**

**Resolution (the plan §9 encodes): fill is the destination (B end-state); the first ship is
opt-in landscape fill (C's mechanism, near-free — the fluid toggle already exists and already
defaults fluid in portrait); default-on (B) is earned after the edge cap + overflow ring land
and are reviewed.** C and B stop being rivals — C is P1–P2 of B. A remains the north star,
enforced by a test (§7), not a sentence.

## 4. What "fill" is, precisely (corrected)

1. **The box is the viewport — via a present-preserving fill box.** On present mode + the player
   Present view the section is *resized* to the stage (one slide, horizontal nav preserved), not
   the `base.fluid-view.css` box. Resizing (vs `transform:scale` of a fixed box) re-resolves
   `cqi`/`container-type:size` normally, which is the point — **and it sidesteps the iOS
   `zoom`-vs-`container-type` bug** that forced the player to *scale* rather than *resize* a fixed
   box (`2026-07-02-preview-scale-zoom.md`; the box was scaled-not-resized for composition
   fidelity, `player-core.mjs:357`). *(Expected advantage; **UNVERIFIED** on real iOS — the shipped
   fluid viewer's resize was verified only headless, HARD RULE #23.)*

2. **Inside the band: breathe.** When the viewport aspect is within a tolerance band of the
   authored aspect, the layout keeps its composition and `cqi` gaps/paddings grow to use the box.
   **The band is a NEW numeric range, not the `families.js` `wide` family** — that family is
   `[1.05,∞]`, so it would call 21:9 and 16:9 identical. **"Pixel-identical minus bars" holds ONLY
   at the exact authored aspect, and is a blocking gate, not a claim** (§10): fill-resize and
   letterbox-scale diverge on any raw-px dimension (a 1px hairline scales under letterbox, stays
   1px under resize), so the promise forces every layout dimension onto `cqi` first. Every *other*
   in-band aspect **breathes = changes** — the presenter guarantee is *"the family you rehearse is
   the family you present,"* never identical pixels.

3. **At the edges: reflow (portrait) or cap (wide).** A **portrait** viewport crosses a real
   `families.js` boundary → the existing row→column reflow fires. A **wide-but-not-authored**
   viewport (4:3, 21:9) stays in `wide` and crosses **no** boundary — so fill must (a) add a **new
   upper wide boundary** to cap the fill with a designed symmetric frame past ~1.9 aspect, and (b)
   add **vertical-distribution CSS for wide-but-tall boxes**, because `injectOrientationStyle`
   returns early for any aspect > 1.05 (`runtime/index.js:1346`) and today provides no
   centering/scale for them. This is all **new work** — not "existing reflow fires."

### 4.1 present mode ≠ the fluid vertical-scroll viewer

`base.fluid-view.css` makes `body{scroll-snap-type:y mandatory}` with every slide a stacked snap
stop — a **vertical-scroll-all-slides** reading model. Present mode and the player Present view
are **one-slide, horizontal-nav**. Un-gating the fluid CSS on landscape delivers *the fluid
viewer on landscape*, **not** "present mode fills." The build must therefore either (a) treat P1
as "the fluid viewer now works landscape too" (a real, useful, near-free win — and honest about
what it is), and (b) build a **separate present-preserving fill box** for the one-slide surfaces
in P2. The first draft conflated the two under "fill"; they are different surfaces.

## 5. The two gaps — and the ring that must come first

- **Gap 1 · portrait clip = silent content loss.** A dense slide reflows to one column but is now
  taller than the screen and the last card is cut (`base.fluid-view.css:45-50` documents this
  overflow/clip as a known limit). Today the phone reader sees the **whole** slide (tiny
  letterbox — complete). Fill makes it **legible-but-truncated** — a *new* failure mode, and a
  **silent content loss** that `forms.md` §6 forbids. So "no worse than today" is **false**, and
  the fix splits: the **honest overflow ring / floor** (the cheap half of Fit-Spine move 3/4)
  must land in **P1**, before any default-on; the **live split** (`2026-06-25`) is P4.
- **Gap 2 · ultrawide dead-band.** Pure fill anchors content top with an empty region below. Fix =
  the new upper wide boundary + cap/vertical-distribution (§4 rule 3). This is the one gap B has
  that A does not solve — and it needs machinery `families.js` lacks today.

## 6. Relationship to prior decisions (what this builds on, and what it amends)

- **Builds on `2026-06-22-the-fit-spine.md`** — reuses collapse→shed→split→floor verbatim; adds
  no shrink move. Fill is the *box* argument to the Frame function; the ladder is unchanged.
- **Builds on `2026-06-25-…eventual-consistency.md`** — the live portrait-clip fix (P4) is its
  bounded runtime split. This doc gives that spec a consumer.
- **Amends `2026-06-21-fluid-box-viewer-design.md` — and this needs an explicit owner sign-off,
  not a fold-in.** That doc **locked** two clauses: **§4b** "opt-in only… the shared HTML does
  **not** silently reshape an author's deck," and **§5** "**wide screens keep the authored
  fixed-shape presentation even in fluid mode**." Making fill the landscape default (P3) reverses
  **both** for the primary presentation surfaces (laptops and projectors are landscape). That is a
  reversal of a composition-fidelity invariant on the main surface, on prototype evidence — it is
  **owner-signed decision territory, recorded as its own line**, not "amends 4b." Until P3 it is
  **not** reversed: P1–P2 stay opt-in, honoring the lock.

### 6.1 The player `.html` is an exported artifact

The self-contained player (`player-core.mjs`, emitted by `lattice-emulator.js` after raster) is
**golden-pinned and `sha256`-CSP-hashed** — a file the author exports and emails. Changing its
*default* to fill (P3) changes its bytes and breaks its golden + CSP tests. Per the Quality Bar,
altering the **HTML export pipeline's bytes is an export-sign-off change**. P3 is therefore
export-sign-off-gated (render dark + light, send for inspection), not merely visual-review.
P1–P2 are opt-in and leave the shipped bytes untouched.

## 7. Munger inversion — design the failure, then forbid it (expanded by the trio)

| To GUARANTEE this becomes a mess, we would… | …so the rule is |
|---|---|
| Name the DOM-free `fitScale` as "the one box owner" while 3 surfaces keep private `1280×720`/`16/9` constants | **One box owner = a DOM-level `data-lattice-view` selector; P1/P2 CONVERGE the player, docs-filmstrip, and fluid boxes onto it.** A surface keeping a private constant after is a HARD #1 violation |
| Let build-time autosplit (count frozen for the AUTHORED box) act as the fill clip fix | **Autosplit is calibrated to the authored box; fill must not silently re-aspect a build-split deck.** Interim clip story is the honest ring, not build-split |
| Stamp `data-orientation` (build) and `data-family` (runtime) against DIFFERENT boxes and let a geometry-baked transform (funnel viewBox) diverge | **One box per slide for stamping; a geometry-baked transform that read the build stamp is re-run or frozen when fill changes the runtime box** |
| Enable fill on an aspect whose edge defect is fixed in a LATER phase (ultrawide before the cap; portrait clip before the ring) | **No phase enables a fill regime whose edge defect is unfixed. P1 gates fill to band + `wide`/`square`, no ultrawide fill until P2's cap; P3 blocked until portrait has the ring or live split** (HARD #18) |
| Flip the default so a rehearsed deck reshapes on stage and shared links reshape on a colleague's screen | **Authored look is the default for a shared link + a fresh session; the viewer's fill choice persists per-deck. Rehearsal guarantee = "same family," not "same pixels"** |
| Re-classify family every frame on a `dvh`/drag-resizing box, oscillating `data-family` at a boundary | **Family classification under fill is HYSTERETIC: a boundary crossing commits only after the box settles (debounced) + needs margin to reverse; continuous resize drives CSS breathe only, never a per-frame re-stamp** |
| Keep `injectOrientationStyle`'s one-shot style across a rotation (it early-returns on the existing node; only the fluid toggle clears it) | **Clear `#lattice-orientation` on ANY aspect-band crossing, not just the toggle** (`runtime/index.js:1342,1791`) |
| Apply the fluid `flex-grow:0` sparse rule (authored for TALL boxes) on a wide box, fighting multi-column fill | **Scope `flex-grow:0` to portrait families** (`base.fluid-view.css:57-61`) |
| Record "Option A gated behind the clip fix" as prose anyone can loosen | **The band is a TEST: reflow lands only on a `families.js` family (no interpolated aspect); the box aspect handed to layouts is clamped; continuous fill (A) is unreachable until a PR citing the landed clip fix removes the clamp** |
| Ship the player-view fill as a bytes change without re-blessing its golden/CSP | **P3 re-blesses the player golden + `sha256` CSP and is export-sign-off-gated** (§6.1) |

## 8. Red team — the surviving objections, answered

- **"'Mostly reuse / one selection point' is false."** Accepted; corrected in §2.2 + §7. Fill is
  per-surface work including a CSP-hashed, golden-pinned player. Feasibility re-scored (§3).
- **"'Export byte-identical' breaks for the player."** Accepted; §6.1 splits the fence — canonical
  exports byte-identical; player `.html` default-fill (P3) is a bytes change, export-sign-off-gated.
- **"The band is vaporware above 1.05."** Accepted; §4 rule 2/3 redefine the band as a new range +
  a new upper wide boundary `families.js` must gain.
- **"`base.fluid-view.css` is a different reading model, not present mode."** Accepted; §4.1
  separates the surfaces and re-scopes P1.
- **"Default-on reshapes shared landscape decks — the locked harm."** Accepted; §6 makes P3 an
  owner-signed reversal and keeps P1–P2 opt-in; shared links default to the authored look.
- **"Deferring the clip to P4 ships silent content loss by default at P3."** Accepted; §5 moves the
  honest ring to P1 and gates P3 behind it.
- **"Re-scored, C ties/beats B."** Accepted as the *sequencing* lesson, not a direction change
  (§3): ship C's mechanism first, promote to B.
- **Not conceded:** the *direction* (kill the letterbox / fill). All three lenses affirm it; only
  the feasibility, safety, and sequencing claims changed.

## 9. Phasing (re-sequenced; each one branch → one PR, HARD #17; green + no broken window each step)

- **P0 — this doc (hardened).** ☐ The design + the corrected, owner-aligned direction.
- **P1 — opt-in landscape fill + the honest overflow ring** *(≈ Option C's mechanism, near-free)*.
  Un-gate `base.fluid-view.css` from phone-only so the **fluid viewer works landscape** (stated as
  such — §4.1); fill the band (`wide`/`square`), **no ultrawide fill yet**; land the runtime
  overflow **ring/floor** so a dense slide never silently clips. Opt-in only; **every exported byte
  untouched** (golden diff proves it). Visual review at 390/820/1440 + 4:3/21:9/portrait.
- **P2 — the present-preserving fill box + the wide edge cap.** Build the resize-the-section,
  keep-one-slide-nav box for present mode + the player Present view; **converge** the player-CSP,
  docs-filmstrip, and fluid boxes onto one `data-lattice-view` selector (§2.2/§7); add the **new
  upper wide boundary** + cap + wide-but-tall vertical distribution (Gap 2). Still opt-in.
- **P3 — promote fill to DEFAULT on present/player.** Gated behind: ring (P1) + edge cap (P2)
  landed and reviewed + the **owner-signed §5 reversal** (§6). Player `.html` bytes change →
  **golden + CSP re-bless, export-sign-off** (§6.1). `CHANGELOG.md` `## Unreleased` entry (HARD #10).
- **P4 — live portrait split (Gap 1).** The bounded runtime split (`2026-06-25`). Maker-checker on
  the partition path.
- **North star (separate, later) — Option A** (continuous fill past the band) once P4 makes the
  clip safe and the band-clamp test (§7) is deliberately lifted.

Per-feature demo deck + committed PDF (HARD #9) rides P1/P3. No CHANGELOG entry for this doc alone.

## 10. Verification bar (expanded by the trio)

Per the Quality Bar + HARD RULE #23 — a claim names its surface and carries an artifact from it:

- **Real surfaces, real aspects.** Drive the actual player + present stage at 16:9 / 16:10 / 4:3 /
  21:9 / portrait; confirm band-breathe, edge-cap, portrait reflow. Emulation / CI-green are not
  verification of viewing behavior.
- **"Identical at the authored aspect" is a BLOCKING pixel-diff gate:** same slide under
  letterbox-scale vs fill-resize at exactly 16:9 → empty diff (forces raw-px dims onto `cqi`).
- **No silent content loss:** a dense portrait slide shows the honest ring/floor, never a clipped
  card (`forms.md` §6).
- **Resize thrash trace:** a window-drag + mobile-URL-bar toggle shows **zero sustained rAF churn**
  and no `data-family` oscillation at a boundary (hysteresis, §7).
- **iOS re-fit** verified on a real device or marked **UNVERIFIED** — the sandbox can't reach iOS.
- **Canonical export byte-identity** (golden diff) through P1–P2; **player golden + CSP re-bless**
  acknowledged at P3.

## 11. What this doc decides

1. On present mode + the HTML player, the deck **fills the viewport** instead of letterboxing a
   scaled fixed box — the **Option B end-state**.
2. This **completes the existing adaptive capability** but is **not** a one-line reuse: fill is
   **per-surface new work** (§2.2), the wide-side band needs a **new boundary** (§4), and default-on
   touches the **player's exported bytes** (§6.1).
3. The **shippable path is opt-in landscape fill first** (Option C's mechanism, near-free), edge cap
   + overflow ring next, **then** promote to default (§3, §9). C and B are not rivals — C is B's P1–P2.
4. **Canonical exports stay byte-identical** through P1–P2; **P3 is export-sign-off-gated** for the
   player `.html`.
5. The fluid-box viewer's locked **§4b opt-in** and **§5 wide-screens-keep-authored-shape** are
   reversed **only at P3**, as an **owner-signed** decision — P1–P2 honor the lock.
6. The **portrait clip is silent content loss** and gets the **honest ring in P1**; the live split
   is P4. The **ultrawide cap** needs a new `families.js` boundary (P2).
7. **Option A (continuous fill)** is the recorded **north star**, gated behind the live clip fix by
   a **band-clamp test**, not a sentence.

## 12. Adversarial trio (2026-07-20) — the HARD RULE #25 obligation, and what it changed

This decision governs the *default* behavior of the main presentation surfaces (high blast radius)
and is genuinely novel, so it got the full trio — applied to the recommendation that would ship.

- **Independent checker** — verified every file:line citation and all four prior-decision
  cross-references as accurate; caught the **ultrawide/`wide`-family contradiction** (D1/D2): the
  band cannot be the `[1.05,∞]` `wide` family and also exclude 21:9. → §4 rewritten.
- **Munger inversion** — surfaced what the first §7 missed: the **"one owner is architecturally
  false"** finding (the box lives in ≥4 places, not `present-transport.mjs`), the
  **build-time-autosplit / two-stamp double-adaptation** collision, the **broken intermediate
  tree**, **family-boundary hysteresis**, and the **prose-not-test north-star gate**. → §2.2, §7,
  §9 rewritten.
- **Red team** — refuted the central claims: **"mostly reuse"** (per-surface rewrites incl. a
  CSP-hashed, golden-pinned player), **"viewer-only / export byte-identical"** (the player *is* an
  export artifact), **"the band reuses `families.js`"** (no upper wide boundary), **"P1 makes
  present mode fill"** (`base.fluid-view.css` is a vertical-scroll viewer), and showed the
  **scorecard rewarded unbuilt polish** — re-derived, B and C are within noise. → §3 re-scored, §6.1
  added, scope fence corrected, phasing re-sequenced to ship opt-in first.

**Net effect:** the *direction* (fill, kill the letterbox) survived all three lenses unchanged; the
*plan* changed materially — from "mostly-reuse, viewer-only, default-on B on prototype evidence" to
"per-surface new work, opt-in landscape fill first (C's mechanism), default-on B earned behind the
edge cap + overflow ring + an owner-signed reversal + a player export-sign-off." Recording what the
trio changed is the HARD RULE #25 obligation for work of this blast radius.

---

**Prototype evidence:** `.scratch/adaptive-proto/` (2026-07-20) — `examples/fluid-box.md` driven
through the real runtime at five screen shapes under letterbox vs fill; comparison artifact
rendered for the owner. Throwaway; no engine code changed.
