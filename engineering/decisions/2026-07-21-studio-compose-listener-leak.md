---
status: proposed
summary: >
  A perf-torture run on the studio scenario surfaced a REAL, reproducible event-LISTENER leak on the
  compose (and insert) cycles — CONFIRMED (not a HeapProfiler artifact) and NAMED to its registration
  sites. The heap "RISING" verdict on those cycles was JIT WARMUP (the retained-heap slope decayed from
  +173 KB/cyc at k=15 to +58 KB/cyc at k=40 on compose, and went NEGATIVE on insert — a textbook plateau,
  growers all `code:system/*`). The signal that did NOT decay is `JSEventListeners`: +4.7/cyc on compose
  (+186 over 40), +2.0/cyc on insert (+225), z≈9, with the idle CONTROL dead flat (0/cyc) — so it is a
  real accumulation, not warmup and not an instrument artifact (JSEventListeners is a clean counter; the
  inspector is present in the flat control too). Naming it via the heap RETAINER walk FAILED — the handler
  closures rooted at `<DevTools console>` / `blink::ScriptStateProtectingContext` (inspector contamination
  of the retainer graph, the same class as the realm-retained-heap over-count). The RIGHT instrument for a
  listener leak — an in-page addEventListener/removeEventListener tally (no heap graph, no CDP) — named it:
  several sites register listeners and NEVER remove them, the two structural ones being (a)
  `dropdown-menu.js` adding `pointerdown`/`pointermove` to `document` (which never detaches → permanent),
  and (b) ProseMirror's `ensureHandlers` re-attaching the full editor event suite per toggle without
  tearing down the old view. Magnitude caveat: the tally counts add-CALLS (over-counts vs. live listeners —
  browser dedups identical, transient targets GC); the trustworthy net is the +4.7/cyc JSEventListeners.
  Fix is a docs-site change to shared Studio chrome (own branch + trio + 3-width verify); banked here.
---

# Studio compose/insert leaks event listeners (dropdown-menu on `document` + ProseMirror view teardown)

> **What it is.** Toggling the Studio's Compose ⇄ Markdown editor (and opening the add-slide gallery)
> registers event listeners it never removes — ~4.7 live listeners per compose toggle, sustained. The
> heap looks like it grows too, but that part is just JIT warmup; the **listeners** are the real leak.

Found by running `perf-torture` on the `studio` scenario. This doc banks the confirmed + named finding;
the fix is its own change (see below).

## Evidence

### Heap RISING was warmup — plateau confirmed (not a leak)
`--cycle idle,compose,insert --k 40 --snapshot`, contrasted with the k=15 run:

| cycle | retainedHeap sen k=15 | k=40 | reading |
|---|---|---|---|
| insert | +87 KB/cyc | **−8.9 KB/cyc (z=−1.13)** | slope went negative → fully plateaued |
| compose | +173 KB/cyc | **+58 KB/cyc** | decayed ~3× → warmup plateau in progress |

Growers were all `code:system/*` (`TrustedByteArray`/`FeedbackVector`/`BytecodeArray`/instruction streams)
— V8 compilation. No realm-class growth (the realm gate stayed silent — #1120's restyle holds on the
Studio, unlike the Playground).

### The real signal: JSEventListeners, sustained, control-flat
| cycle | listeners first→last (k=40) | sen/cyc | z |
|---|---|---|---|
| **compose** | 722 → 908 (+186) | **+4.7** | 9.2 |
| **insert** | 722 → 947 (+225) | **+2.0** | 8.9 |
| idle (control) | 725 → 725 (0) | 0 | — |

The flat control is why this is trustworthy: the CDP inspector is attached in *both* idle and compose, so
it isn't the source. Corroborated by `object:system / Context` (closure contexts) growing ~4.5/cyc on
compose — consistent with the listener count.

## Naming it — the wrong tool, then the right one

- **Heap retainer walk (`--retainers`) FAILED to name it.** The accumulating handler closures
  (`onClick`/`onSelect`/`onClose`/…) rooted at `<DevTools console>` and
  `blink::ScriptStateProtectingContext` — the **inspector** retaining console/evaluated refs, so the
  nearest-root BFS lands on the inspector, not the app holder. Same contamination class as the
  realm-retained-heap over-count (`2026-07-20-playground-theme-toggle-not-a-leak.md`), one level deeper.
  *(Meta: the retainer report should flag `DevTools console` / `ScriptStateProtectingContext` roots as
  inspector artifacts — folds into the #32 no-CDP follow-up.)*
- **An in-page add/removeEventListener tally NAMED it** (patched via `evaluateOnNewDocument` before load;
  no heap graph, no CDP). Sites that register-without-removing over 20 compose cycles:

  | net (add-calls, 20 cyc) | listener @ target | site |
  |---|---|---|
  | +200 (10/cyc) | **`pointerdown`+`pointermove` @ `document`** | **`dropdown-menu.js` (`HTMLDocument.h`)** |
  | +20/type (1/cyc) | ProseMirror suite @ editable `div` (`keydown`/`beforeinput`/`focus`/`paste`/`blur`/`composition`/`dragstart`) | `ensureHandlers` — `index.js` (ProseMirror) |
  | +420 / +280 (21 / 14/cyc) | `mousedown`+`click` @ `button.cs-pill-btn` / `.cs-sc-cap` | `StudioShell.js` `ET.btn` |
  | +20–40 | `cs-fmt-btn` wiring, `scroll`, `mouseleave`/`mousemove` | `ET.syncFormat`, `op.listenForScroll`, `new Xp` |

**Magnitude caveat (important):** the tally counts add-CALLS, which over-states live impact — the browser
dedups identical `(target,type,listener)` and listeners on recreated buttons/divs detach and GC. So "420
adds" ≠ 420 leaked live listeners. The trustworthy net-live number stays **+4.7/cyc (JSEventListeners)**.
The tally's value is *localizing the sites*, not sizing the leak.

## The two structural leaks to fix (the rest is churn that GCs)

1. **`dropdown-menu.js` adds `pointerdown`/`pointermove` to `document` and never removes them.** `document`
   never detaches, so these are permanent net-live growth — the clearest real contributor. A Radix
   dropdown/popover attaches outside-click/pointer listeners on open and must remove them on close.
2. **ProseMirror `ensureHandlers` re-attaches the editor event suite per compose toggle** without tearing
   down the old view — the old `EditorView`'s handlers persist (its `destroy()` likely isn't called on
   toggle-away). The compose ⇄ markdown switch should destroy the outgoing view.

The `StudioShell` `ET.btn` button re-wiring is high add-CALL count but is likely on recreated buttons
(detached-DOM churn that GCs — the run showed only ~43 KB / 226 detached nodes over 20 cycles); audit it,
but it is not the primary net-live leak.

## Reproduction

- **Confirm:** `npm run torture -- --scenario studio --cycle idle,compose,insert --k 40 --snapshot` →
  `listeners` RISING on compose/insert, idle flat; heap RISING but decaying (warmup).
- **Name:** `evaluateOnNewDocument` patch on `EventTarget.prototype.add/removeEventListener` tallying
  `(type @ target)` net + first add-site; drive the `studio` scenario's `compose` cycle ×20 after a
  warm-up reset; report net-positive keys. (Throwaway harness; the method belongs in the perf-torture
  toolkit — a candidate `--listeners` mode.)

## Fix scope (own PR — not folded here)

A docs-site change to **shared Studio chrome** (`docs/src` — the dropdown-menu primitive + the ProseMirror
compose integration), so: its own branch/PR, the maker-checker/trio per blast radius, and a re-run of the
compose listener tally as the proof (net → ~0 on the fixed sites) plus a 3-width visual check that the
editor toggle + dropdowns still behave. Banked here per HARD RULE #18 (found while exercising the tool,
off the path of the tool work).
