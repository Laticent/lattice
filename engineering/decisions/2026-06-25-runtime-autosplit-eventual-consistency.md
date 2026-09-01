---
status: proposed
summary: Locks the future architecture for runtime (live) auto-split — the one move the Fit Spine flatly rejected. The rejection held only against UNBOUNDED live re-pagination; a BOUNDED form is sound and is adopted as the chosen direction (not yet built): split fires only in the portrait viewing family (never the landscape export artifact), references address LOGICAL slides (run-ids, never physical page numbers), and the count/anchor/rail values that depend on not-yet-computed splits render as RESERVED-SPACE placeholders filled by an eventual-consistency pass in main-thread idle time. The existing pure kernel (resplitDoc) is already measurement-fed and reused verbatim; the live DOM is just another measurer. Build-time auto-split (Option A) stays the shipping path for now; this doc is the spec the runtime work (Option B) is built against, tracked by a cut issue.
---

# Runtime auto-split via eventual consistency — Option B, locked

**Date:** 2026-06-25 · **Status:** Accepted in principle — **not yet built**;
Option A (build-time / emulator) remains the shipping path · **Decision owner:**
maintainer · **Supersedes-in-part:** the flat "live runtime re-pagination is
rejected" stance of `2026-06-22-the-fit-spine.md` §3/§4/§5/§9 — narrowed, see §6.

This doc decides *what the runtime auto-split system is* so that when it is built
it has one obvious shape and one reason to exist. It does **not** ship code. It
records the architecture we are committing to, and the bounded scope that makes
the spine's original objection no longer apply.

---

## 0. The decision in one paragraph

We keep **build-time auto-split (Option A)** — the emulator's measure→split→
re-measure loop over `lib/core/auto-split.js` — as the only shipping path **for
now**. We **lock Option B**, *runtime* auto-split, as the chosen future
architecture: the same pure kernel, driven by the **live DOM** as its measurer,
gated to the **portrait viewing family**, addressing slides by **logical run-id**
(never physical page number), with every value that depends on a not-yet-computed
split rendered as a **reserved-space placeholder** and reconciled by an
**eventual-consistency** pass in main-thread idle time. The user sees the visible
slide immediately; correctness lands a few frames later and the gap is
imperceptible.

---

## 1. Why the spine rejected this — and why the rejection was too broad

The Fit Spine (§3, §4 inversion, §5 "Stays rejected", §9.3) rejects **live
runtime re-pagination** outright. The stated reason (§3, §4): *"re-breaking and
re-numbering slides as a phone rotates is churn and a navigation/anchor
maintenance nightmare."*

That reason is correct **about the thing it describes** — *unbounded* live
re-pagination, where every resize re-breaks the whole deck and physical page
numbers (the thing links and "see slide N" point at) churn underneath the
reader. The Munger inversion in §4 nailed the real failure mode: **physical-page
instability**, not the splitting compute.

But the rejection was written as a property of *re-pagination itself*, when it is
actually a property of **two implementation choices** that re-pagination does not
require:

1. **Re-paginating on every box change** (including landscape, including resize
   churn), rather than only where a split can ever be needed.
2. **Addressing slides by physical page number**, so a split invalidates every
   reference downstream of it.

Remove those two choices and the nightmare the spine forbade cannot occur. That
is Option B.

---

## 2. The three moves that make it bounded

### 2.1 Gate to the portrait viewing family — the landscape artifact is untouched

Split fires **only** in the portrait family (`portrait` · `square` · `story` ·
`mobile` = `PORTRAIT_SIZES`), reusing the existing predicate
(`orientationFor(geom).name !== 'landscape'`) rather than a new list. In a
landscape / 4K box, moves 1–2 (collapse, shed) resolve overflow before split is
reached — exactly as the spine's §3 already states for the build-time pass.

The consequence that dissolves the spine's biggest worry: **the canonical
exported artifact is landscape and never enters this path.** There is no
export-vs-runtime divergence to manage, because the artifact of record does not
split, and a portrait *view* is already a different layout by design (it has
different type and reflow — `data-orientation`, spine §2.2). We are not breaking a
determinism contract; we are rendering a view that was always allowed to differ.

### 2.2 Logical addressing — a split can never invalidate a reference

References resolve to the **logical slide** — the **run-id** the kernel already
mints — never to a physical page number. This is not new machinery: `auto-split.js`
already drops the engine `id=` on continuation copies and groups a split set under
one stable run-id (the original slide's id; `runIdOf`, lines 62–69), and
`applyRails` stamps k-of-N only once the converged deck is known. That *is*
logical addressing; Option B extends it from the rail to all cross-references.

With logical addressing, splitting is a pure **display** concern. A link that
named a logical slide is still valid after that slide splits into three — it
points at the run, and the run still exists. The §4 "anchor maintenance
nightmare" was a nightmare of *physical* anchors; logical anchors have nothing to
maintain.

### 2.3 Placeholders + eventual consistency — the only genuinely hard part, dissolved

The one thing virtualized rendering (only the visible slide mounted) makes
*harder*: you cannot know how many sub-slides slide 12 produces until you have
measured it, so the **total count**, **"see slide N" display numbers**, and the
**k-of-N rail** are unknown for slides not yet visited.

Resolution: **render them as reserved-space placeholders now; compute the
logical→physical map progressively; fill the placeholders in place.** The reader
never waits on the math. A link briefly shows "slide —" before "slide 14"; the
rail shows its slot before its count. This is eventual consistency, and it is the
*correct* model precisely because the thing being deferred (a display number) is
cosmetic, while the thing that is immediate (the logical reference) is correct
from frame one.

---

## 3. The kernel is already runtime-shaped — reuse, don't rebuild (HARD #1)

`resplitDoc` (`lib/core/auto-split.js`) **does not measure anything**. It takes
overflow ratios in (`scrollHeight/clientHeight` per slide) and splits. The
emulator produces those ratios with a headless render; the runtime produces the
*same input shape* by reading `el.scrollHeight / el.clientHeight` on the mounted
slide. So Option B adds **no new splitting algorithm** — it points the existing
measurement-fed loop at a live element. One pure kernel, two measurers
(headless / live), per HARD #1. This is the whole reason the kernel was written
pure and measurement-fed in P4.

**Shared surface, consumed by every path:**

| Path | Measurer | Status |
|---|---|---|
| Emulator / export (Option A) | headless render in `lattice-emulator.js` | shipped |
| VS Code preview | live DOM, idle-time | Option B |
| Published HTML | live DOM, idle-time | Option B |
| Drawing board | live DOM (injected runtime) | Option B — free, no DB-specific code |
| Playground | live DOM | Option B |

The drawing board and playground inject the runtime into their preview iframe, so
runtime auto-split lands there with no surface-specific code.

---

## 4. The one footgun, and the two guards

The fill must **never reflow the slide currently being measured**, or you get a
feedback loop: *fill → reflow → re-overflow → re-split*.

- **Reserve final space.** Placeholders occupy their settled size up front — a
  fixed-width numeric slot (`tabular-nums` / a min-width box for the rail) — so a
  digit count arriving moves nothing around it.
- **Fill off the measure path.** The measure loop only *reads* geometry; the fill
  only *writes* into reserved slots. A write can never invalidate a measurement
  that is already committed.

With both, the fill is layout-neutral and the loop converges.

## 4.1 Why there is no Web Worker here (named so it stays rejected)

A tempting framing is "do the math in a background worker." **A Web Worker has no
DOM** — no `getBoundingClientRect`, no `scrollHeight`, no node mutation — so it
can neither measure layout nor rewrite references. Measurement is **main-thread by
physics**. The "background" in eventual consistency is `requestIdleCallback` /
chunked main-thread work, not a second thread. The reconciliation (renumber,
remap) is trivial pure data and does not need a worker anyway. **Worker-based
measurement is rejected** as physically impossible; recording it so it is not
re-proposed.

---

## 5. Scope — what Option B is and is not

**In scope (when built):**
- Live split of the visible slide in the portrait family, via `resplitDoc` on
  live-DOM ratios.
- Logical (run-id) addressing for all cross-references, total count, and rail.
- Reserved-space placeholders + an idle-time eventual-consistency fill.
- One shared kernel across emulator, VS Code preview, published HTML, drawing
  board, playground.

**Out of scope / unchanged:**
- The **landscape export artifact** — never splits; remains the single source of
  physical truth.
- The **build-time pass (Option A)** — stays the shipping path; Option B does not
  remove it (a no-JS static export still needs build-time split).
- **Shrink-to-fit** — still does not exist (spine §3 floor is untouched).
- **Collapse / shed** — still continuous Frame CSS; Option B only changes *split*.

**Non-goals:** re-paginating on every resize (we split once per logical slide on
first measure, not on fluid churn); physical-page anchors (retired by §2.2).

---

## 6. What this changes in the spine

The Fit Spine's "Live runtime re-pagination — **rejected**" (§3, §4, §5 "Stays
rejected", §9.3) is **narrowed, not reversed**:

- **Still rejected:** *unbounded* live re-pagination — re-breaking the whole deck
  on every box change, and any physical-page addressing.
- **Accepted in principle (this doc):** *bounded* live split — portrait family
  only, logical addressing, eventual-consistency placeholders, landscape artifact
  untouched, one shared kernel.

The spine's §5 entry is annotated with a pointer here. No spine *behavior* changes
today: Option A remains what ships, and `auto-split.js`'s "build-time only" comment
stays accurate until Option B is implemented.

---

## 7. Open questions (carried to the tracking issue, not blocking this decision)

1. **Reference inventory:** does anything in the runtime/nav today address a slide
   by *physical page number*? If yes, that retirement is Option B's first slice.
   (Grep of `lib/runtime`, nav, and any "see slide" / `#`-anchor emission.)
2. **Scroll-anchor preservation:** when the visible slide splits while it is on
   screen, the reader's position must stay put (anchor to the run-id top, not the
   physical index).
3. **Idle budget / debounce:** the cadence of the progressive measurement pass so
   it never competes with interaction.
4. **First-paint placeholder policy:** which values render as placeholders vs.
   are cheap enough to compute eagerly for the visible slide alone.
5. **Persona-2 emailed-link reader:** confirm it receives the per-device
   build-time export (Option A), so Option B is purely an *interactive-surface*
   enhancement, never the artifact path.

These are implementation questions; none reopen the architecture decided above.

---

## Amendment 1 (2026-09-01) — §7 answered by measurement, and the two costs §5 does not name

Written before any Option B code, against the tree at `bde789e`. **The
architecture in §0–§6 is unchanged.** Three of §7's five questions turned out
cheaper than the issue assumed; two costs that §5 does not name turned out to be
where the work actually is.

### §7.1 Reference inventory — answered, and the anticipated first slice is not needed

The issue says "if yes, that retirement is Option B's first slice." The answer is
**no**, measured:

- Every `data-lattice-slide` occurrence in code in `lib/runtime/index.js` (3) and
  `lib/export/player-core.mjs` (15) is a **CSS or query selector**
  (`section[data-lattice-slide]`). Not one reads the attribute's *value*.
- One place in `lib/core` does read the value:
  `author-deferral-probe.js:128` (`Number(s.getAttribute('data-lattice-slide'))`).
  It is a **diagnostic label** — "deck script deferred work on slide N", surfaced
  through `lint-core` — not an address anything resolves, so it cannot be
  invalidated in the sense §7.1 asks about. What it would do under a live split is
  report a stale NUMBER in a lint message. Named rather than waved past, because
  the first draft of this amendment said the value is read nowhere, and it is read
  once.
- The player's transport indexes a live `querySelectorAll` array rebuilt on load
  (`player-core.mjs:1753`). There is **no `location.hash` restore, no deep link,
  no persisted index** — so no external reference can be invalidated by a split.
- Run-id addressing **already exists and is already stamped**: `runIdOf`,
  `stampRun`, `data-split-run` (`lib/core/auto-split.js:148-167`), carried onto
  every continuation.

The one genuine physical-page value is **`data-lattice-pagination`** — stamped at
PARSE time (`lib/engine/slides.js:206`) and painted through
`content: attr(data-lattice-pagination)` (`lib/engine/css.js:228`). That is one
attribute on one element, which is the placeholder candidate §4 describes.

**So there is no physical addressing to retire.** The first slice is not a
migration; §7.1 costs a re-stamp.

### §7.5 Persona-2 — confirmed

The emulator writes `outHtml` *after* the split loop converges and again after the
`applyRails` / `applyRelationshipSignals` / `fitBerth` re-render
(`lattice-emulator.js:3230-3268`). The emailed artifact is post-split by
construction. Option B is purely an interactive-surface enhancement and never the
artifact path, exactly as §5 says.

### §7.3 Idle budget — prefer the runtime's existing cadence over `requestIdleCallback`

§4.1 names `requestIdleCallback` as the mechanism. `lib/runtime/index.js` **does
not use `requestIdleCallback` anywhere.** Its established cadence is a 150 ms
trailing debounce (`scheduleRun`), a rAF post-mutation coalescer, and a backstop
timer with a max wait — three coordinated schedulers whose interaction is already
carefully commented. Adding a fourth primitive to that file is how an interaction
budget stops being analysable. **Reuse `scheduleRun`'s debounce.** §4.1's real
content — that the work is main-thread by physics and a Worker cannot measure
layout — is unaffected and stays.

### §7.4 Placeholder policy — the dependent values are four, and three are already pure functions

`data-lattice-pagination` (the printed number), the k-of-N rail (`applyRails`),
the relationship signal (`applyRelationshipSignals`), and the player's own
`lp-count`. The middle two are already exported pure functions on the assembled
document. The policy is small; it is the *application* that is not (see Cost B).

### §7.2 Scroll anchor — falls out of Cost B, not answerable before it

---

### Cost A — the verdict builder is NOT a shared kernel, and §0 says it is

§0: *"The existing pure kernel (`resplitDoc`) is already measurement-fed and reused
verbatim; the live DOM is just another measurer."* True of `resplitDoc`. **False of
what feeds it.**

`resplitDoc` consumes `{ slide, ratio, canSplit, splitRatio }`. The code that turns
a probe reading into that verdict is **165 lines inside `lattice-emulator.js`'s
`measureOverflow` `page.evaluate` (lines 3054–3218)**, and the string `splitRatio`
appears **nowhere in `lib/`**. What *is* shared is `probeSectionOverflow`
(`lib/core/overflow-probe.js`), which returns an *extent* — not a verdict.

Those 165 lines are not boilerplate. They are the `canSplit` gate on vertical
overflow, the collection-relative `splitRatio` that makes the loop converge instead
of re-cutting a slide a tall non-list block keeps over the box, the carousel
branch, and the width-overflow carve-out — each with a recorded defect behind it.
Re-deriving them in the runtime is precisely the HARD RULE #1 violation Option B
exists to prevent.

**So slice 1 is: extract the verdict builder into a browser-safe shared kernel
beside `overflow-probe.js`, and have the emulator inject it the way it already
injects `PROBE_SRC`.** It is independently valuable, independently testable, and a
provable no-op for the export path (the emulator's own corpus renders unchanged).
It is also the same move `2026-09-01-manifest-driven-chart-dispatch.md` just made
for chart dispatch, and for the same reason.

### Cost B — `resplitDoc` rewrites a document STRING; the runtime is a DOM

`resplitDoc(docHtml, overflow, capacityMap) -> { html, changed }`. `applyRails` and
`applyRelationshipSignals` are the same shape. §5 says "live split of the visible
slide … via `resplitDoc` on live-DOM ratios" and stops there — but applying a
string transform to a live document means **serialize → transform → re-parse**,
which destroys node identity across the split.

Node identity is load-bearing at runtime in ways the export path never sees: Anima
motion targets, `data-mark` popover state, the chart-family adapter's WeakMap
rebuild-guard (`lib/transformers/chart-family.js`, whose own comment records what a
wholesale `innerHTML` replacement costs), focus, and the reader's scroll position —
which is §7.2. **The slide that splits is the slide the reader is looking at**,
which is the worst possible place to lose identity.

Two resolutions, and this is the fork:

- **B1 — string round-trip scoped to one run.** Serialize only the affected run,
  transform, re-parse, replace those sections. Reuses all three pure functions
  verbatim; cheapest to build; confines identity loss to the splitting slide.
- **B2 — a DOM applicator beside the string one**, with the *decision* (where to
  cut, into how many parts) staying in the shared kernel and only the *application*
  differing. This is the `applyToHtml` / `applyToDom` dual-adapter shape
  `lib/transformers/registry.js` already uses across every render path, so it is
  not a second implementation in the sense HARD RULE #1 forbids. More work; no
  identity loss.

B2 matches the precedent the repo already set. B1 ships sooner. **Not decided here.**

### What this amendment changes

Nothing in §0–§6. It re-orders the build: **slice 1 is Cost A** (extract the
verdict builder), not §7.1's reference retirement, which measurement showed is not
needed. Cost B is a design fork for the decision owner before any runtime code.

---

## Amendment 2 (2026-09-01) — Cost B resolved by measurement: B2

Amendment 1 left B1 (string round-trip) vs B2 (DOM applicator) open. Prototyped
both against the real kernel in real Chromium and measured. **B2.**

### The rig

A portrait (`size: story`) probe deck rendered by the emulator with `--no-split`,
driven in headless Chromium with `lib/core/auto-split.js` bundled for the browser
(113 KB, itself a number Option B owes `npm run bench`). Node identity is measured
with an expando (`el.__pid`) **and** a live event listener — both are properties of
the node OBJECT, so both survive a node being MOVED and neither survives
serialize → re-parse. That is precisely the distinction between B1 and B2.

B1 was measured in its **strongest** form, not the naive one: run the kernel on the
serialized document, then splice in only the sections the split produced and leave
every other node alone.

### The numbers

| | slides | nodes | identity kept | listeners still firing |
|---|---|---|---|---|
| **B1** (round-trip, best form) | 3 → 5 | 145 | **94 (64.8 %)** | 2 of 5 |
| **B2** (DOM applicator) | 3 → 5 | 126 | **122 (96.8 %)** | 3 of 5 |

B1's 51 lost nodes are **the entire splitting run** — the slide the reader is
looking at, and nowhere else once B1 is written carefully. B2's 4 are the section
and list shells the split genuinely creates; every node that existed before the
split still exists after it, and every pre-existing slide's listener still fires.

### The finding that actually decides it

**B1 cannot be scoped without building most of B2 anyway.** `resplitDoc` renumbers
`data-lattice-slide` on every section *downstream* of the split, so "replace only
what changed" replaces the whole tail of the deck. To avoid that, B1 has to patch
the renumber as an attribute write on the surviving nodes — which is the DOM-side
machinery B2 is made of. B1's advantage was that it reuses the pure functions
verbatim; it does not, quite, and what it saves is smaller than it looks.

And B1 cannot meet the issue's own acceptance check. #506 requires *"scroll
position is preserved when the on-screen slide splits."* B1 destroys the on-screen
slide's nodes, so there is no anchor left inside it to preserve a position against.

### So §7.2 (scroll anchor) is answered too

Under B2 the reader's anchor node survives the split by construction — it is the
same node, moved. The anchor is "the node you were looking at", not a run-id
lookup, and no reconciliation pass is needed for it.

### What is NOT verified

- **Scroll preservation itself.** Both runs measured `scroll 0 → 0`: the probe deck
  at that viewport does not scroll, so the arm proved nothing. It has to be
  re-measured on a surface that actually scrolls (the playground, or the player's
  Read·Slides view) before the acceptance check can be signed off.
- **The measurer.** The verdict was SUPPLIED to the kernel in this rig, not
  measured — deliberately, because what was under test is how a split is applied.
  Finding the overflow is Cost A, and this rig re-confirmed Cost A on the way past:
  the shared probe returns `overV: null` on the very slide the export itself marked
  `overflow clip-marked`, because on the exported sidecar the clipping cell already
  contains the spill. A runtime measurer is more than `probeSectionOverflow`.

### Consequence for the build order

Unchanged: **slice 1 is still Cost A** (extract the verdict builder into a shared
browser-safe kernel). Slice 2 is the B2 applicator, with the cut decision staying in
`resplitDoc` and only the application differing — the `applyToHtml` / `applyToDom`
shape `lib/transformers/registry.js` already uses on every render path.

---

## Amendment 3 (2026-09-01) — slice 1 shipped: `lib/core/split-verdict.js`

Cost A is closed. `buildSplitVerdict` now lives in `lib/core/split-verdict.js`
beside the probe it consumes, exported both as a function and as
`SPLIT_VERDICT_SRC` for `.toString()` injection — the same idiom
`overflow-probe.js` uses for `PROBE_SRC`. `lattice-emulator.js`'s `measureOverflow`
`page.evaluate` went from 165 lines to 24 and now injects three lib-owned functions
instead of holding one of them itself. The runtime can reach the same decision
without re-deriving it, which was the whole point.

**Evidence it changed nothing.** Every deck below rendered through the emulator
before and after the extraction, comparing the exported `.html` sidecar byte for
byte — all identical:

| deck | pages, no-split → split | branch exercised |
|---|---|---|
| `examples/portrait-prose-deboost.md` | 9 → 20 | vertical |
| `.scratch` portrait probe | 3 → 5 | vertical |
| `list-steps` @ `size: square` probe | 1 → 9 | inline-flow / horizontal |
| `compare-table` portrait probe | 1 → 6 | paginator carousel |
| 4 portrait decks that fit | unchanged | the no-verdict path |

`test/unit/core/split-verdict.test.js` adds the branch tests the logic could never
have while it lived inside a `page.evaluate`: the legibility floor, both carousel
branches, the ordinary vertical case, the headroom veto, the inline-flow carve-out
with its `<table>` counter-case, the two-page floor, and that the injected copy
behaves like the imported one.

**NOT covered, and named so it is not mistaken for covered:** the *structural*
carousel branch (`cover-code`) has unit coverage but no end-to-end deck — a
`compare-code` probe at `size: story` would not overflow however much code it was
given, so no before/after render exercises it. Its unit test is the only guard.
