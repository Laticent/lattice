# Gotchas — Memory profiling (perf-torture / CDP)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## A CDP/DevTools memory profile shows a "leak" that vanishes off-inspector

- **Symptom** — `perf-torture` (or any HeapProfiler-based measure) reports a rising
  retained heap — often realm scaffolding (`NativeContext` / `FunctionTemplateInfo`)
  — that a real user's browser never actually accumulates. (The Playground
  light/dark toggle read **361 KB/lap** this way; the truth was ~16 KB/toggle.)
- **Cause** — the verdict trends `JSHeapUsedSize` after `HeapProfiler.collectGarbage`,
  a V8 GC that does **not** force Blink's detached-context disposal. A detached iframe
  REALM stays counted across the CDP GC even though a real idle GC reclaims it. The
  retainer walk bottoming out at native `V8PerContextData` / `gin::ContextHolder`
  Global handles does **not** distinguish "pinned forever" from "detached, awaiting
  reclamation." Tell: retainedHeap RISING while `documents`/`frames` are flat.
- **Mitigation** — re-measure WITHOUT a heap client:
  `performance.measureUserAgentSpecificMemory()` (own GC; needs COOP:same-origin +
  COEP:credentialless → `crossOriginIsolated`). baseline → drive N× → measure →
  idle ~30 s → measure; recovers on idle ⇒ reclaimable, not a leak. perf-torture flags
  realm-class growth `⚠ … UNCONFIRMED` and points here (`tools/perf-torture/README.md`
  §Limits; the realm-class gate in `engine.mjs` `realmClassGrowth`).
- **Triggered by** — any theme/mode change or navigation that rewrites an iframe
  `srcdoc` (mints a fresh realm), measured under CDP.
- **Removable when** — never; it's inherent to HeapProfiler vs. real GC. Confirm off-CDP.
- **Commits** — `3d59f1dc` (retraction), `af37dd64` (gate). Deep dive:
  `engineering/decisions/2026-07-20-playground-theme-toggle-not-a-leak.md`.

## A heap retainer walk names `<DevTools console>` / `ScriptStateProtectingContext` as the holder

- **Symptom** — `--retainers` (or a DevTools retainer path) reports the holder of a
  leaked object as `<DevTools console>` or `blink::ScriptStateProtectingContext`, not
  an app structure — so you can't name the real culprit.
- **Cause** — the inspector retains console-logged / `evaluate`-returned references, so
  a nearest-GC-root BFS lands on the inspector's own refs when they outrank the real
  app holder. The retainer graph is inspector-contaminated for *naming*.
- **Mitigation** — use the right tool for the leak class. For a LISTENER leak, don't
  walk the heap: patch `EventTarget.prototype.add/removeEventListener` via
  `page.evaluateOnNewDocument`, tally net `(type @ target)` + first add-site, drive the
  cycle, report net-positive keys. (Magnitude caveat: add-*calls* over-count vs. live
  listeners — the browser dedups identical, transient targets GC; trust the
  `JSEventListeners` counter for size.)
- **Triggered by** — any Puppeteer/CDP-driven heap-snapshot retainer walk.
- **Removable when** — never while measuring through an attached inspector.
- **Commits** — `6a6b8c28`. Deep dive:
  `engineering/decisions/2026-07-21-studio-compose-listener-leak.md`.

## perf-torture says `RISING` but memory isn't leaking (JIT warmup)

- **Symptom** — a cycle's `retainedHeap`/`peakHeap`/`heapTotal` reads `RISING` at low
  `--k`, but it's not a real leak.
- **Cause** — V8 JIT warmup: the growers are `code:system/*`
  (`FeedbackVector` / `BytecodeArray` / `TrustedByteArray` / instruction streams),
  which accumulate as hot paths tier up and then plateau.
- **Mitigation** — confirm at `--k 40`: a warmup's Sen slope **decays** (often goes
  negative) vs. k=15 → plateau, not a leak. Trust the non-`code` signals
  (`JSEventListeners`, `nodes`) judged against the flat idle control, not the raw heap.
- **Triggered by** — any short (`--k ≤ ~15`) run over a JIT-heavy path (editor toggles,
  full re-renders).
- **Removable when** — never; inherent to short-run heap measurement.
- **Commits** — `6a6b8c28`. Example:
  `engineering/decisions/2026-07-21-studio-compose-listener-leak.md` (compose/insert).
