---
status: proposed
summary: >
  Whether Fuoco's focus hub should own "what is on screen and what is stale" for the preview, and what that would buy.
  Measured on the Studio build: the host patches the preview frame 24 ms after a keystroke, and the frame's last
  change lands at about 175 ms, so the "200 ms pipeline" is mostly the runtime's own 150 ms trailing debounce, not
  the engine. That prices three designs. Recommendation: A, a read-only render ledger in the hub (no behavior change,
  one place to ask "is this stale"), then C, a host-signalled settle that replaces the 150 ms wait for host-driven
  edits (about 130 ms off every edit, to be measured with the flash bench before it ships). B, moving render
  scheduling into the hub, buys the least for its risk. Nothing here needs a thread or a new frame boundary.
---

# Fuoco as the one owner of preview state (follow-up of #2822)

**Asked.** The owner wants to manage and distribute state through focus, decouple the stages and process in parallel.
After #2822 an edit passes through the editor, a pipeline, a debounce, the runtime pass and a sandboxed frame, and no
single place knows what is on screen and what is stale. This note names the axes, prices three designs against the
2026-10-22 baseline (`2026-10-22-preview-baseline-oct-8-vs-frame.md`), and recommends one. The owner picks; until then
nothing in the code changes. Follow-up file: `followups.d/2822-p1-fuoco-owns-preview-state.md`.

## How an edit travels today

Mapped from the code (Studio first; the Playground shares the scheduler, the engine and the runtime, and swaps the
renderer and the state holders):

| # | Stage | Where | Delay |
|---|---|---|---|
| 1 | CodeMirror `updateListener` reports to the hub and sets React `source` | `Editor.tsx:853-869` | none |
| 2 | `useMemo` chain: deck index, slides, current slide | `StudioShell.tsx:1674-1818` | one React render |
| 3 | `DeckPreview` asks its frame scheduler | `DeckPreview.tsx:758`, `frame-scheduler.ts:62` | one rAF, or 120 ms after a heavy render (full write, or over 50 ms) |
| 4 | Engine render, sanitize, then patch the frame body | `single-slide-render.ts:1375-2160` | engine time; patch at **24 ms** after the key (measured) |
| 5 | The runtime's mutation observer runs the content transforms, then waits | `lib/runtime/index.js:2062-2101` | **150 ms** trailing debounce (`DEBOUNCE_MS`) |
| 6 | Diagrams: draw host call into the sandboxed frame, sanitized answer | `preview-draw-host-impl`, `draw-host.ts:140` | about 20 ms per repaint |

Measured: first change in the preview frame **24 ms** after the key, last change about **175 ms** (6 keystrokes, 173-180
ms, Chromium, desktop, an 8-slide prose deck). The step from 24 to 175 ms is the runtime's debounce plus the transforms
it runs. The engine itself is not the long pole for a prose edit.

**Who holds "what is on screen / what is stale"**, today, in seven places: React `source` and `sourceEpoch`; the
scheduler closure's `dirty`/`inFlight`/`lastHeavy`; `DeckPreview` refs (`issuedRef`, `paintedRef`, `renderRef`);
module singletons in `single-slide-render.ts` (`deckMemo`, `sliceCache`, `sanitizeMemo`); expandos on the frame host
(`__latticeFrameSig`, `__latticeShownSlide`, ...); the frame's own `data-lattice-settle` markers; and, in the Playground,
`playground-sync`'s `renderedSource`/`index`. Fuoco owns the outline, caret, focus, navigation and split-page report, and
none of the render state.

## The axes

1. **Who owns "what text was last rendered, and is this view stale".** Today: no one. Each view answers for itself.
2. **Who owns the schedule.** Today: the frame scheduler per host, then the runtime's debounce inside the frame, two
   clocks in series.
3. **Where each stage may run.** Nothing runs off the main thread today. The preview frame is a same-origin srcdoc, so it
   shares the page's thread. The engine needs `window.LatticePlayground` and the sanitizer needs the DOM (DOMPurify). Only
   the draw-host frame is a separate realm, and the baseline note measured no gain from giving it its own process.

## Three designs

**A. A render ledger in the hub (report only).** Views report `rendered(seq, source)` to the hub the way the editor
reports its caret; the hub keeps `{ seq, renderedSeq, stale }` per view and any view can `useFocus` the staleness. No
stage changes order or timing.
- Buys: one place to ask "is the preview stale", which can replace `playground-sync`'s `renderedSource` closure and give the other holders one thing to read;
  makes the Playground and Studio agree by construction; the foundation for B and C.
- Costs: about 150 lines in `docs/src/lib/fuoco` plus two call sites; no frame boundary, no thread.
- Predicted effect on the flash bench: none (a refused claim of speed). Risk: low.

**B. The hub schedules the render.** The hub publishes each source change; one scheduler subscribes on the frame lane and
renders for every view that wants it, replacing the per-host schedulers and the 250 ms Playground `sourceVersion` bump.
- Buys: coalescing if a second view ever renders the same source; one place for backpressure. Neither surface has a
  second renderer of the same source today, so this is future value.
- Costs: moves the scheduler's `heavyRenderMs` rules and the watchdog into the hub, which is meant to know nothing about
  documents; touches both surfaces' hot paths; no speedup on a single-view edit, which is the common case.
- Predicted effect: 0-20 ms on a prose edit. Risk: medium (every keystroke path).

**C. Host-signalled settle.** Where the host patched the frame itself (the `in-place`-stamped swaps), it already knows
the DOM is final. After the patch it calls the runtime's pass once (the `__latticeTag` and `__latticeFit` hooks that
`patchSections` already calls), and the runtime skips its trailing wait for a burst the host marked. The 150 ms debounce
stays for the runtime's own mutations and for hosts that do not stamp (marp-vscode).
- Buys: the 24-to-175 ms span could fall to the work itself, up to about 130 ms off each edit. This is the only design
  that moves the number the owner feels. It is measurable with `npm run bench:flash` and the stage trace above.
- Costs: a runtime change (`lib/runtime/index.js`, bundled into exports: the exported bytes change, so it needs the
  owner's export sign-off and a before/after on both dark and light); the runtime's debounce exists to coalesce bursts
  (eight keys at 120 ms), so the host must coalesce on its side first, which the frame scheduler already does.
- Risk: medium-high (diagram hold, `swapMicrotaskPass` and the fit agent were all tuned around the 150 ms).

## Recommendation

**A, then C, in that order; not B.** A is cheap and unblocks both, and it answers the owner's literal question (one
place that knows what is stale). C is the one that makes edits faster, and it earns its own measurement round with the
export sign-off. B moves code without moving a number. Decoupling the stages for parallelism has no stage that is both
heavy and DOM-free today; the honest first parallel step is C's removal of a wait, not a thread.

**Default if no one answers:** nothing is built. The next session may start A, because it changes no behavior, and must
not start C without the owner.

## What was measured and what was not

Measured: the 24 ms and 175 ms points (Chromium, desktop, one prose deck, 6 keystrokes), and the call chain from reading
the code. Not measured: the engine's share inside the 24 ms, a diagram edit's trace, the phone profile, the Playground's
trace, and whether C leaves the diagram hold (`2026-10-22-preview-baseline-oct-8-vs-frame.md`) intact. Those are C's
first measurements.
