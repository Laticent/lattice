---
status: in-progress
summary: Bring the single-slide frame-aligned render loop (#1007) to the Playground filmstrip, and DECOUPLE the Playground from the dead Drawing Board while there. Two workstreams on one branch. (1) The Playground's 220ms trailing debounce becomes a Playground-OWNED adaptive frame loop (createFrameScheduler) — a deliberate duplicate of the DeckPreview loop, not a shared kernel, so the Playground can evolve free of the Studio/DB lineage; renderDeck already reports patched, threaded through playground-engine → render(). (2) The Playground's ONLY drawing-board-* import (chart-interact) is renamed off the prefix per the 2026-07-03 studio-succession code-ownership boundary, so the Playground imports zero drawing-board-* modules and the frozen surfaces are a clean git rm. The iframe is NOT the bottleneck: one persistent iframe + per-section patch + in-iframe virtualization, whose reparse cost is already bypassed on the typing hot path.
---

# Playground: frame-aligned live render + decouple from the dead Drawing Board

**Date:** 2026-07-15 · **Status:** in-progress
**Follows:** `2026-07-15-frame-aligned-preview-render.md` (#1007, the single-slide loop)
**Trigger:** "let's tackle the playground. iframe is an issue for us?" + "drawing board
is dead. let's take this opportunity to decouple the playground from it and do it
safely. having duplicate code is fine."

## Is the iframe an issue? No — not for this work.

The Playground preview is **one persistent iframe** (not one-per-slide), with per-
`<section>` patching (`patchSections`) and in-iframe FIT + `content-visibility`
virtualization for big decks. The iframe is deliberate and load-bearing:

- **Style isolation** — the engine emits bare element selectors (`section{}`, `li{}`,
  `h1{}`) plus a ~560KB theme sheet; in the main document those restyle the docs app's
  own chrome (this bit the SSR-shell work). The iframe is a hard boundary.
- **Runtime host** — the FIT agent, charts, Mermaid, and the scaling all run inside it.
- **Fixed slide-box + CSS-transform scaling** — the slide renders at its intrinsic box
  and the frame element is transform-scaled to fit, sidestepping a Safari `foreignObject`
  scaling bug.
- **Security (#22)** — the untrusted-HTML boundary.

Its one real cost — reparsing that sheet + reloading the runtime on a **full srcdoc
write** (~485ms at 4×) — is **already bypassed on the hot path**: a warm edit patches only
the changed `<section>` nodes (~2ms). So the frame-aligned loop sits *on top of* the
existing patch path, exactly like the single-slide version. Replacing the iframe (Shadow
DOM) would forfeit the isolation *and* the Safari fix while **not** removing the reparse —
a bad trade. The iframe stays.

## Workstream 1 — the adaptive frame loop (Playground-owned)

`PlaygroundApp.tsx` scheduled edits with a fixed **220ms trailing debounce**
(`scheduleRender`). Replaced with a **Playground-owned** adaptive frame scheduler
(`docs/src/components/playground/frame-scheduler.ts` + unit test): an edit marks the
preview dirty and schedules ONE render on the next animation frame; a burst collapses to a
single render of the latest state. **Adaptive** — a cheap patch (typing, sig unchanged)
reschedules next-frame-instant; a heavy full write (theme/mode/size change) coalesces on a
short trailing timer so it can't strobe the iframe. In-flight **backpressure** (never
overlap two renders on the one iframe) + a watchdog (a hung engine/theme load can't wedge
the loop). `renderDeck` already returns `patched`; threaded through `playground-engine.ts`
(`RenderResult.patched`) → `render()` (`return { heavy: !r.patched }`) → the scheduler.

`freshRender` (deck swaps) cancels a pending scheduled frame (as it did the debounce);
`render()`'s collapsed-pane defer and engine-not-ready retry are unchanged.

**Duplicate, not shared (owner-directed).** The scheduler is a deliberate copy of the
DeckPreview loop, not a shared kernel. The Playground is being separated from the
Studio/Drawing-Board preview lineage so it can evolve independently; the owner accepted
the duplication as the price of that independence. (The two loops are ~60 lines of the
same state machine; if they ever need to converge, a shared helper is the later move — but
coupling them now would re-entangle exactly what this work separates.)

## Workstream 2 — decouple from the `drawing-board-` namespace

Per the **2026-07-03 studio-succession** code-ownership boundary: *engine cores stay
shared; site infra shared with SURVIVING surfaces (Playground, landing) stays shared; the
Studio-only cluster moves… renamed off the `drawing-board-` prefix… the dependency arrow
flips, so removal day is `git rm`.*

Mapping the Playground's real coupling to the dead Drawing Board: its **only**
`drawing-board-*` import is `createChartInteract` from `drawing-board-chart-interact.js`
(generic parent-hosted chart interaction, shared by the surviving Playground and the frozen
present/practice). `deck-preview.js` is **live shared infra** (the current Studio's
export/presenter import it) — *not* Drawing-Board code, so it stays shared and is untouched.

So the decouple is one clean rename: `drawing-board-chart-interact.js` →
`chart-interact.js`, all importers updated (Playground live; the frozen surfaces import from
the new name until they're deleted). **Result: the Playground imports zero `drawing-board-*`
modules.**

## Evidence (HARD RULE #19 / #23)

Measured on the **real built `/playground`** (`docs/dist`, `astro build`), headless Chrome,
median of 15 keystrokes in Edit mode. The Playground doesn't feed `__latticeRenderMetrics`,
so the probe stamps `t0` at the real capture-phase `keydown` and polls the preview iframe's
`.lattice` textContent each `rAF` for the first change (the render landing) — robust to the
node replacement a full write causes.

**keydown→paint by device:**

| Device (CPU throttle) | Old — 220ms debounce | New — adaptive loop | Speedup |
|---|---|---|---|
| **Desktop** (1×) | **237ms** | **30ms** | **~8×** |
| **Mid-tier mobile** (4×) | **296ms** | **117ms** | **~2.5×** |

Same story as the single-slide loop (#1007): the old fixed 220ms wall dominated on fast
hardware — desktop *felt as laggy as a phone* — while the new numbers track the real work
(CodeMirror + engine + section-patch) and scale with the device. Responsiveness only; the
per-render engine/FRAME cost is unchanged. The probe is a one-off (scratchpad, not committed);
durable coverage is `frame-scheduler.test.ts` (coalescing, backpressure, adaptive heavy-timer,
cancel, reject-unwedge) + the existing Playground suite (27 tests, unchanged).

## Maker-checker (HARD RULE — render-path change + cross-cutting rename)

An independent checker traced the scheduler state machine (lost-update-free, wedge-free,
no stale closure — all confirmed), the `patched` thread (truthful: `patched=false` ⟺ full
`srcdoc` write ⟺ heavy), the read/Explore-mode source selection (ref-read at commit → no
stale-source render), and the rename (every live importer updated; `deck-preview.js`
correctly left shared; the Playground imports zero `drawing-board-*` modules). One
should-fix and two nits:

- **should-fix (fixed) — engine-not-ready retry lost its single-timer invariant.** The
  startup retry (`timerRef = setTimeout(() => render(fresh), 60)`) re-armed without
  clearing. Previously safe because the old `scheduleRender` shared `timerRef` and cleared
  it; now the scheduler is a separate concurrency domain, so a keystroke during engine load
  would orphan the prior retry and let N timers fire concurrent renders when the engine
  readied (flash/thrash + a possible `previewState` mismatch). Fixed: `clearTimeout` before
  each re-arm, restoring one pending retry. (Startup-only, self-healing, but a real
  regression — closed.)
- **off-path, logged (#18) — a stale path reference.** `lib/components/chart/_chart-family/
  mark-detail.js` has a JSDoc comment pointing at the old `drawing-board-chart-interact.js`
  path. It sits in `lib/` (bundled into `lattice-runtime.js` / `lattice-emulator.js`), so
  editing even a one-word comment trips the stale-`dist` gate and would force a full engine
  bundle regeneration into this docs PR — disproportionate (#17/#18). Left as a tracked
  follow-up; the rename is complete for every LIVE reference (imports, CSS `@import`).
- **accepted nits.** (1) The direct `render()` calls outside the scheduler (`onExpand`,
  `freshRender`, the palette/mode `MutationObserver`) bypass the in-flight guard. The
  maker-checker traced these benign; the later adversarial trio (below) sharpened the
  `MutationObserver` one into a real should-fix and it was **routed through the scheduler**;
  the other two are logged as pre-existing residuals there. (2) The 4s watchdog could clear
  `inFlight` under a legitimately slow cold render → a rare concurrent render; it's the
  documented unwedge tradeoff, kept generous (now unit-tested).

## Adversarial trio (HARD RULE #25 — owner-requested)

Red team + Munger inversion + a fresh independent checker, against the post-maker-checker
diff. The checker returned "mergeable — low risk" (single-timer fix correct + complete,
state machine wedge-free, rename clean). The red team and Munger converged on two real
gaps, both folded:

- **should-fix (fixed) — the copy dropped the sibling's wall-clock heavy backstop.** The
  single-slide DeckPreview marks a render heavy on `writePath==='write'` **OR** `elapsed >
  HEAVY_RENDER_MS` (50ms); the Playground copy shipped only the `!patched` half. That
  backstop is not decorative: a filmstrip patch is **not** the ~2ms single-slide patch —
  `patchSections` ends every patch with `__latticeFit()`, an **O(N-section)** reflow the
  `deck-preview.js` header itself calls "a layout storm on large decks." Without the
  backstop, a 50-slide deck would run that storm every frame while typing. Fixed: added
  `heavyRenderMs` (default 50) to `frame-scheduler.ts` — a render that TOOK too long now
  coalesces the next, exactly like the sibling (+ unit tests for the backstop and the
  watchdog).
- **should-fix (fixed) — palette/mode observer bypassed the in-flight guard.** The red team
  showed the direct `render(false)` from the `data-palette`/`-mode` MutationObserver shares
  the same `previewState` object as an in-flight scheduler edit render, so a palette flip
  mid-typing could run a second `renderInto` concurrently and mutate `frameSig`/`lastSections`
  out from under the in-flight patch (mangled filmstrip). Fixed by routing the observer
  through `scheduleRender()` (the same fix the single-slide sibling took in #1007) — the
  scheduler now serializes it with edits.
- **accepted / logged (pre-existing).** The OTHER direct renders — `freshRender` (deck swap)
  and `onExpand` — still bypass the guard, but `freshRender` reassigns `previewState` to a
  FRESH object (so no shared-state corruption; at worst a brief self-healing wrong-frame),
  and `onExpand` fires only on a deliberate pane expand (not mid-typing). Both pre-date this
  change; a full render-serialization mutex would fix them but is disproportionate risk for
  the residual. Startup timer/scheduler cross-domain overlap (red-team #2) is a narrow,
  startup-only cosmetic flash, mitigated by the single-timer fix. Logged, not fixed.
- **Munger — the architecture note (acknowledged, deferred).** The scheduler is
  dependency-free, so it COULD be shared with DeckPreview (a thin `render` adapter — already
  how both call it) without re-coupling the Playground to anything; "duplicate for
  independence" is weaker than framed. True. But the owner directed duplication; the drift it
  warned of (the missing backstop) is now closed, and converging the two loops is logged as a
  follow-up (below) rather than reversed here.

**UNVERIFIED (HARD RULE #23):** the big-deck (50-slide) real-surface burst — the exact case
the backstop protects — was **not** captured from the sandbox (the Playground's seed/view
flow and the textContent render-signal resisted headless automation). The backstop is proven
at the **unit level** (`frame-scheduler.test.ts`) and the small-deck real-surface latency
(below) IS measured; the big-deck main-thread/coalescing numbers on the real surface remain to
be driven on a real device.

## Off-path, logged not done (#18)
- The frozen Drawing Board / Workbench still carry the 220ms-style debounce in their own
  controllers — untouched (frozen; awaiting the phased removal in 2026-07-03).
- Converging the two frame loops (DeckPreview + Playground) into a shared helper — declined
  now on purpose (decoupling); revisit only if they need to move together.
