---
status: shipped
supersedes: 2026-07-21-studio-compose-listener-leak.md
summary: >
  RETRACTION of the "confirmed + named" Studio compose/insert event-LISTENER leak
  (2026-07-21-studio-compose-listener-leak.md, #1139). The listener growth #1139 measured is a
  MEASUREMENT ARTIFACT of the profiler's own `?perf` overlay, not a leak in the Studio. The torture
  `studio` scenario drives `/studio?perf`; the `?perf` param mounts PerfOverlay, which dynamically
  imports `web-vitals`; web-vitals arms a `visibilitychange` listener on `document` per metric report
  (INP re-arms on every interaction) and — by design — never unsubscribes. Each compose cycle interacts,
  so ~1 web-vitals `visibilitychange` listener accrues per cycle. The DECISIVE control: re-run the exact
  compose cycle on the PRODUCTION surface `/studio` (overlay OFF, no web-vitals). Result — `JSEventListeners`
  688 → 688 over 30 cycles (Δ0, 0.00/cyc); `visibilitychange @ document` a flat 1. With `?perf` the same run
  climbs ~1/cyc, and a distinct-add-site tally attributes ~93% of the `visibilitychange` adds to
  `web-vitals.js` (a few via `PerfOverlay.tsx`) and exactly ONE to the app chunk (constant, live=1). #1139's
  two NAMED sites are exonerated: the Radix dropdown adds only a `keydown@document` (net-live constant 6, it
  removes on close); ComposeView already `destroy()`s the ProseMirror view on unmount (net-live 0 growth);
  the `cs-pill-btn` churn is on detached nodes that GC. The tool the naming leaned on (an add-CALL tally with
  no add-SITE attribution, run under `?perf`) could neither separate web-vitals from app code nor size the
  net-live effect. Incidental, unrelated real bug found en route: sonner@2.0.7 `useIsDocumentHidden` adds a
  `visibilitychange` listener to `document` but its cleanup targets `window` — a genuine per-toast leak in
  real use, but only 1 constant listener in this scenario and NOT the compose growth; reported for upstream,
  not fixed here. Net: there is NO production Studio compose/insert listener leak. Methodology fix folds into #32.
---

# The Studio compose/insert "listener leak" is a `?perf`-overlay (web-vitals) artifact — #1139 retracted

> **What it is.** #1139 banked a "confirmed, reproducible, named" event-listener leak on the Studio
> `compose`/`insert` cycles. Re-measured with a net-live tally **and a with/without-`?perf` control**, the
> growth is entirely the profiler's own perf overlay: `?perf` → PerfOverlay → `web-vitals`, which arms a
> `visibilitychange` listener per metric report and never removes it. Turn the overlay off — the surface a
> real user actually loads — and the compose cycle is **dead flat**. The named app sites (dropdown-menu,
> ProseMirror teardown) do not leak.

This is the same *class* of finding as the two that preceded it, one level up the stack: the heap "RISING"
in #1139 was JIT warmup (a real V8 effect the *measurement* surfaced), the Playground realm "leak"
(`2026-07-20-playground-theme-toggle-not-a-leak.md`) was a HeapProfiler over-count, and now the compose
*listener* "leak" is the **perf overlay instrumenting itself**. The instrument you switch on to read the
number is what moves the number.

## The decisive evidence — a with/without-`?perf` control

Same compose cycle (`scenarios/studio.mjs` `COMPOSE`), same build, same net-live tally, only the surface URL
differs. `?perf` is the ONLY thing that changes: it gates nothing the scenario drives (every selector it uses
— `data-demo="mode"`, `deck-switcher`, the editor toggles — is core Studio UI), it *only* mounts the overlay.

| surface | `JSEventListeners` over 30 compose cycles | `visibilitychange @ document` | verdict |
|---|---|---|---|
| `/studio?perf` (what #1139 measured) | 877 → ~899–918 (+0.7 … +2.0 / cyc) | grows 15 → 32 | "RISING" |
| **`/studio` (production, overlay OFF)** | **688 → 688 (Δ0, 0.00 / cyc)** | **1, constant** | **FLAT** |

The production surface adds **exactly one** `visibilitychange` listener over the whole run (the app's own,
constant) and its total live-listener count does not move. There is no compose/insert listener leak.

### The `/studio` result is a POSITIVE control, not a silent no-op
A flat number is only trustworthy if the cycle actually *ran* — a cycle that silently no-oped (a selector
timing out) would also read "flat." It didn't: the `/studio` run's net-live buckets are led by
**`mousedown`/`click @ button.cs-pill-btn (detached)` — 14 each**. Those are the per-slide ProseMirror
`SlideView` bar buttons; their presence proves the Compose editor **mounted** each cycle, and the
`(detached)` tag proves it **unmounted/tore down** each cycle (the buttons are on nodes GC will reclaim).
So the editor churned every cycle and `JSEventListeners` still held at 688 — the flat is a *measured*
teardown-works result, not an un-exercised path. (The tally swallows per-cycle throws, so this positive
bucket — not merely the absence of growth — is what rules out a false negative.)

### Attribution — where the `?perf` adds come from
The net-live tally records the **distinct add-site stack** for every `visibilitychange @ document`
registration (the upgrade #1139's tool lacked). Under `?perf`, over 20 compose cycles:

| add-site | adds | note |
|---|---|---|
| `web-vitals.js` (`C → j → o`) | 24 | the report path; INP re-arms per interaction |
| `web-vitals.js` via `PerfOverlay.tsx` | ~4 | LCP/CLS/INP sinks |
| app chunk (`StudioShell.*.js`) | **1** | constant, live=1 — the app's single listener |

~93% web-vitals, ~0% growth from the app. `web-vitals` is imported **only** inside `PerfOverlay.tsx`
(`import('web-vitals')`, dynamic), which mounts only when the overlay pref/`?perf` is on — the file's own
comment says "a normal page view pays nothing," and "web-vitals exposes no unsubscribe." Both are exactly why
this shows up under `?perf` and vanishes without it.

## Why #1139 reached the wrong conclusion

1. **It measured under `?perf`.** Every `studio` measurement runs `/studio?perf`, so the overlay's web-vitals
   (and its own render churn) rides along on *all* metrics. `listeners` is the most exposed — web-vitals'
   `visibilitychange`-per-interaction maps ~1:1 onto "per cycle."
2. **The add-CALL tally had no add-SITE attribution and over-counts by construction.** It bucketed by
   `type @ target` and counted *add-calls*, so it could neither separate web-vitals from app code nor tell
   net-live from churn. It then pattern-matched the busiest *app* buckets it could see — Radix's document
   pointer listeners and the ProseMirror suite — and named those, exactly the add-call over-count its own
   caveat warned about.
3. **It never ran the two controls that would have caught it** — the with/without-instrument (`?perf`) control,
   and the k-sweep on `JSEventListeners` it had already run on the heap. The listener slope DOES decay with k
   (2.05/cyc @k20 → 0.63/cyc @k40 under `?perf`) — the same warmup shape #1139 correctly flagged for the heap,
   here layered on top of the web-vitals accrual.

### On the numbers (reconciling the slopes and baselines)
The two studies disagree on absolutes, and that is expected — different instruments, not a contradiction:
- **Baselines differ by instrument, not by leak.** #1139's `?perf` compose baseline was 722 (the torture
  engine, idle-calibrated, its own warm-up); this study reads 877 on `?perf` and 688 on `/studio` (the
  standalone tally, one warm-up cycle + forced GC). Only the **slope** is comparable across instruments; the
  absolute count is an instrument fingerprint.
- **The slope disagreement is the warmup + web-vitals story, not a hidden leak.** #1139's +4.7/cyc (compose,
  `?perf`) sits above this study's +0.7…+2.0/cyc (compose, `?perf`) because the listener slope **decays with
  k** (2.05/cyc @k20 → 0.63/cyc @k40 here) — a warmup shape #1139 never sweep-tested for listeners — layered
  on the web-vitals ~1/interaction accrual. Both are `?perf`-contaminated; neither survives the move to
  `/studio`, where the slope is **0**. The production number is the only one that isn't instrument-shaped.

## The named sites, exonerated (net-live, production build)

- **dropdown-menu.tsx (Radix)** — the pointer listeners #1139 pinned on it (`pointerdown`/`pointermove @ document`)
  are actually `snapshot-cache.js`'s; the Radix dropdown adds only a `keydown @ document`, net-live **constant at 6**
  (Radix's DismissableLayer removes it on close). Nothing to fix; the wrapper is a pure passthrough.
- **ProseMirror `ensureHandlers` / ComposeView teardown** — ComposeView already calls `view.destroy()` in its
  effect cleanup (ComposeView.tsx), and the `editMode` ternary truly unmounts it on toggle-away, so the editor
  suite is torn down. Net-live growth from the editor across compose cycles: **0**.
- **`StudioShell` `ET.btn` button re-wiring** — high add-CALL count, but on recreated buttons; the tally shows
  them `(detached)`, i.e. GC-reclaimable churn, matching the pre-existing note in `SlideView` and
  `2026-07-20-studio-audit-instrument-fix.md`.

## Incidental real bug (NOT the compose leak): sonner@2.0.7

En route, the add-site attribution surfaced a genuine upstream bug — worth recording, not conflating with the
above. `sonner`'s per-toast `useIsDocumentHidden` hook (`node_modules/sonner/dist/index.*`, v2.0.7, the latest):

```js
document.addEventListener('visibilitychange', callback);
return () => window.removeEventListener('visibilitychange', callback);   // added to document, removed from WINDOW
```

The cleanup targets the wrong object, so each toast that mounts→unmounts leaks one no-op `visibilitychange`
listener on `document`. It is a real per-toast leak in normal use, but it contributes exactly **1 constant**
listener in this scenario (the Toaster stays mounted; toasts are infrequent) and is **not** the compose growth.
Reported for an upstream fix; not patched in-tree here (a `patch-package` postinstall pipeline isn't worth its
install/CI blast radius for a one-listener-per-toast bug that isn't the thing we were chasing). If we later add a
patch step for other reasons, this is a clean one-line candidate.

## Methodology takeaways (fold into #32)

- **The `studio` scenario measures a debug-instrumented surface.** `surfaces.studio.url = '/studio?perf'`
  drags the perf overlay (web-vitals + its render churn) into every measurement. A listener verdict on `studio`
  is **not trustworthy until re-run without `?perf`.** A caveat is now inline at that URL; a full switch to
  `/studio` (which shifts the calibrated `universalFloors`/baselines — the listener baseline alone drops 877→688)
  is a separate, deliberate re-calibration for #32, not a silent edit.
- **A listener leak needs a net-live tally with add-SITE attribution + an instrument control**, never an
  add-call count. The tool: patch `EventTarget.add/removeEventListener` via `evaluateOnNewDocument`, hold a
  `WeakRef` to each target, match removes, force GC, then count only listeners whose target is still alive —
  and record each bucket's **distinct add-site stacks**. This is the concrete shape of the `--listeners` mode
  proposed in #32; the throwaway harness that produced the numbers above is the starting point.

## Reproduction

```
# 1. build the docs so dist reflects production
cd docs && npm run build

# 2. the CONTROL that settles it — same compose cycle, overlay OFF vs ON
STUDIO_URL=/studio  node .scratch/listener-tally.mjs compose 30   # JSEventListeners 688→688 (Δ0); vc@document = 1 flat
STUDIO_URL=/studio?perf node .scratch/listener-tally.mjs compose 30   # climbs ~1/cyc; ~93% of vc adds root at web-vitals.js
```

The tally reports the `JSEventListeners` counter, a per-`(type@target)` net-live bucket list, the RAW
document add/remove call counts, and the distinct add-site stacks per bucket — the four views that,
together, separate a real leak from an instrument artifact.
