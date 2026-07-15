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

## Off-path, logged not done (#18)
- The frozen Drawing Board / Workbench still carry the 220ms-style debounce in their own
  controllers — untouched (frozen; awaiting the phased removal in 2026-07-03).
- Converging the two frame loops (DeckPreview + Playground) into a shared helper — declined
  now on purpose (decoupling); revisit only if they need to move together.
