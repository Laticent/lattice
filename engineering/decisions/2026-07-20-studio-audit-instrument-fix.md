---
status: shipped
summary: >
  Correction to the 2026-07-20 Studio degradation audit. The torture harness drove the UI with
  UNDISPOSED puppeteer ElementHandles (waitForSelector / page.$ / page.$$). Each is a reference in the
  DevTools remote-object group; when the node it points at later DETACHES (an editor toggled off, a
  dialog/menu closed), the handle PINS the detached node so GC can't reclaim it and it stays counted in
  Performance.getMetrics Nodes / JSEventListeners. Held once per cycle, this FABRICATED per-cycle
  "leaks" that were the instrument observing the app, not the app leaking. Proven by a controlled A/B
  (same build, same compose toggles, only variable = holding a handle): CLEAN −1.9 nodes/cyc / −0.3
  listeners/cyc / 2 detached vs POLLUTE +513 nodes/cyc / +17 listeners/cyc / 3574 detached — reproducing
  the original audit's compose numbers almost exactly. After disposing every handle and re-auditing
  clean: the dramatic node/detached-DOM/listener leaks (compose +91, insert "+137 / catastrophic 32MB",
  pgvariant +64, the whole "retained detached iframe realm" NODE evidence) are ARTIFACTS. What survives:
  a retainedHeap rise — but `typing` (a near-no-op) shows it too and it DECAYS ~3× from k=10→k=40, i.e.
  warmup PLATEAU, not leak. The one REAL, sustained growth is on THEME/PALETTE/MODE change: ~1.3MB/cyc,
  heap climbing to ~94MB over 40 cycles, with DOM nodes/frames/documents FLAT — the isolating clean test
  pins it precisely: the hero tab-flip ALONE (DeckPreview remount) is ZERO-growth (dispose() works), and
  it is the PALETTE TOGGLE that drives it. Fingerprint = srcdoc-realm churn: a theme change rewrites every
  live preview's srcdoc, keeping the same iframe element (frames flat) but replacing its document/realm,
  and the detached realms accumulate at the V8 level (the retainer walk bottoms out at browser
  NativeContext / Global handles, NOT an app Map/closure — so it is realm churn, not a fixable app-Map
  leak). Fix A (merged) cut PEAK duplication but not this per-toggle churn; the mitigation is to swap theme
  CSS in place instead of rewriting srcdoc per theme change (a render-pipeline change, not a one-line
  bound). Fix B (compose listener abort) targets a NON-leak — kept only as teardown hygiene, not a perf win.
---

# Studio degradation audit — instrument correction (the harness was fabricating leaks)

**This supersedes the leak *magnitudes and rankings* in `2026-07-20-studio-degradation-audit.md`.**
That audit's method (PWA-faithful posture, idle-control-calibrated Sen's slope + Mann-Kendall,
heap-snapshot attribution) was sound, and it caught real signal. But its instrument had an
observer-pollution bug that fabricated the loudest findings, and those fake findings dominated the
narrative — sending Fix B at a leak that does not exist while the one genuinely serious leak (landing)
was understated and buried.

## The bug — undisposed observer handles pin what they observe

Puppeteer's `page.waitForSelector` / `page.$` / `page.$$` each return an `ElementHandle` — a live
reference held in the page's DevTools remote-object group until it is `dispose()`d or the execution
context is torn down. The harness never disposed them. Two classes of site did damage:

- **Readiness waits on transient nodes** — `await page.waitForSelector('.ProseMirror')` and
  `'.cm-content'` in the compose cycle, `'Insert Blank'` in the insert cycle. Each returns a handle to
  *this cycle's* editor / gallery button. The next toggle DETACHES that node — but the undisposed handle
  keeps it (and its whole subtree, and every listener on it) alive and counted.
- **Existence checks / index clicks** — `page.$(sel)` truthiness checks and `page.$$(sel)[i].click()`
  on menu items / options that unmount when the menu closes.

A detached node pinned by a remote-object handle **cannot be GC'd**, so it persists in
`Performance.getMetrics` `Nodes` and `JSEventListeners` *and* in heap snapshots — exactly the metrics
the audit trended. Held once per cycle, it manufactures a perfectly linear, Mann-Kendall-significant
"leak" out of nothing.

### Controlled proof (the smoking gun)

Same `dist`, same 12 compose↔markdown toggles, driven two ways — the **only** difference is whether we
retain one `ElementHandle` per cycle:

| compose↔markdown ×12 | nodes/cyc | listeners/cyc | detached DOM |
|---|---|---|---|
| **CLEAN** (drive via in-page evaluate; hold nothing) | **−1.9** | **−0.3** | 2 |
| **POLLUTE** (hold 1 handle/cycle, = the harness bug) | **+513** | **+17** | **3574** |

The polluted column reproduces the original audit's compose row (+523 nodes/cyc, +20 listeners/cyc
residual, ~310 detached/cyc) almost exactly. Causation is proven by construction: a handle to a node
that later detaches obviously pins it. (Reusable driver: `docs/.scratch/name-editor-retainer.mjs`,
which also does a reverse-edge retainer walk — with handles held, the leaked nodes trace to
`(Global handles) / DevTools console`, i.e. the profiler itself; with handles disposed, only 2 unrelated
detached nodes remain.)

## The fix — dispose everything; drive transient targets via evaluate

`tools/perf-torture/` (was `docs/scripts/studio-torture.mjs`):
- `clickSel` now disposes its handle after clicking; new `settle()` waits for a selector then disposes
  (readiness without pinning).
- Existence checks → `exists()` (in-page `evaluate`, returns a boolean — no DOM handle escapes).
- Index clicks → `clickIn()` / `clickNth()` / `countSel()` (in-page). `clickIf` rewritten in-page.
- The per-session `waitForSelector(surf.ready)` disposes too.

Readiness now uses `waitForFunction` (its handle is a boolean, never a DOM node) or `settle` (disposes).
An `OBSERVER-POLLUTION GUARD` note by `clickSel` documents the invariant so the bug can't silently
return.

## Clean re-audit (fixed harness, within-session, cpu 1)

| cycle | ORIGINAL (polluted) | CLEAN nodes | CLEAN listeners | CLEAN retainedHeap | verdict |
|---|---|---|---|---|---|
| idle (control) | flat | flat | flat | flat | control |
| pgscroll (control) | clean | flat | flat | flat | control |
| typing | "clean" | flat | flat | +243→**+83**KB/cyc (k10→k40) | **PLATEAU (benign warmup)** |
| compose | ~508KB **+91 listeners** | **FLAT** | **+1.7/cyc** | +283KB/cyc | listeners ARTIFACT; heap ~plateau |
| insert | ~32MB **+137**, "catastrophic" | **FLAT** | **+2.8/cyc** | +131KB/cyc | ARTIFACT |
| pgvariant | +64 listeners | flat | **+1/cyc** | +295KB/cyc | listeners ARTIFACT |
| decksettings | +4.3 listeners | +9/cyc | +3.5/cyc | +241KB/cyc | small; likely warmup |
| palette | ~438KB | flat | flat | +437→**+346**KB/cyc | real-ish (theme re-register) |
| fullwrite | ~439KB "dominant" | flat | flat | +459KB/cyc | real-ish (theme re-register) |
| **landing** | ~1.47MB | **flat** | **flat** | **+1.4→+2.1MB/cyc (grew)** | **REAL LEAK** |

Two independent controls (idle, pgscroll) stay flat, so the instrument is still *sensitive* — the fix
removed the artifact, not the signal (nodes went flat on compose while retainedHeap still moved).

## The corrected leak profile

1. **Node-count, detached-DOM, and listener "leaks" → ARTIFACT.** The scary numbers (compose +91,
   insert "+137 / 32MB", pgvariant +64) were the harness pinning its own observations. Clean: nodes
   flat, listeners creep 1–3/cyc (EditorView/CodeMirror internals, not app buttons). The
   "unified root cause — retained detached iframe realms" was over-attributed: its detached-DOM
   evidence was the artifact.
2. **`typing` heap rise → PLATEAU.** It decays ~3× from k=10 to k=40 — lazy JIT / module / cache
   warmup that levels off, not an unbounded leak. (`typing` was already called a control; that it shows
   the *same* early heap rise as everything else is the tell that the rise is warmup, not per-action.)
3. **`palette` / `fullwrite` heap rise → REAL (theme re-registration).** ~350–460KB/cyc, only modest
   decay. This is the theme-CSS-string / registry retention that **Fix A (module-level shared theme
   cache)** and **Fix #1 (ThemeStore.byName bounding)** target — so those two fixes address a *real*
   leak, and their retainer walk (>200KB theme strings) can't be a handle artifact. Their headline
   MAGNITUDES ("~70×", "catastrophic 32MB") came through the polluted instrument and should be treated
   as unproven pending a clean before/after; the *direction* (dedup one 560KB copy instead of N) is sound.
4. **THEME/PALETTE/MODE change → the one clearly REAL, sustained growth (~1.3MB/cyc).** Isolated with a
   clean two-arm test on landing: the hero Preview/Source tab-flip ALONE (a `DeckPreview` remount) is
   **zero-growth** — `dispose()` works, nodes/frames/heap all flat over 12 flips — so the hero iframe does
   NOT leak. Adding the **palette toggle** to the same loop makes heap climb ~1.3MB/cyc (13.6MB→29.4MB
   over 12) while **DOM nodes/frames/documents stay flat** (frames pinned at 12). That fingerprint is
   **srcdoc-realm churn**: a theme/palette/mode change re-renders every live preview through the frame
   scheduler → `renderInto` rewrites the iframe's `srcdoc`, keeping the same `<iframe>` element (frame
   count flat) but replacing its document + JS realm; the detached realms accumulate at the V8 level. The
   retainer walk on them bottoms out at browser `NativeContext` / `(Global handles)` — **not** an app
   `Map`/closure — so this is realm churn, not a fixable app-Map delete. The big retained theme strings do
   trace to the engine `_cssCache` `Map`, but that cache is BOUNDED (`add()` clears it; `byName` is keyed
   by theme name and overwrites), so it is not itself unbounded. **Fix A (merged) cut the PEAK duplication
   (one shared 560KB copy instead of N) but did not stop the per-toggle realm churn.** Mitigation (not yet
   built): on a theme/mode change, swap the theme `<style>` inside the existing srcdoc in place (postMessage
   / direct DOM) instead of rewriting the whole srcdoc — avoids minting a new realm per toggle. This is the
   real "degrades the more it's used" mechanism (and, per the audit's iOS inversion, the peak-memory driver
   of tab discard); it is a render-pipeline change, **not yet fixed**.

## Consequences

- **Fix B (compose SlideView listener abort) targets a non-leak.** Kept as cheap, correct teardown
  hygiene (explicit listener lifecycle rather than relying on GC's weak-handle behavior), with an
  honest comment; **not** shipped as the "~4.4× / +91-listeners" perf win it was sold as (HARD RULE #19
  evidence, #23 honesty). The `fmtAc` per-rebuild refinement was trialed and **dropped** — the red-team
  measured Chromium GCs churned detached listeners even on a live controller, so it fixed nothing.
- **The merged `2026-07-20-studio-degradation-audit.md` gets a correction pointer** to this doc; its
  magnitudes/rankings are superseded, its method retained.
- **Next real target: the landing hero-iframe realm leak (~2MB/cyc).** Separate work, separate blast
  radius (landing/hero iframe lifecycle) — to be prioritized with the human, not bundled here.

## Lesson (for every future profiling harness)

Automated profiling MUST NOT hold references to what it measures. Dispose every `ElementHandle`
immediately, or drive entirely through in-page `evaluate` returning primitives. An undisposed handle
turns the profiler into a retainer — and a retainer that fires once per cycle is indistinguishable, in
the metrics, from a per-cycle app leak. Two independent, do-nothing controls (idle + a pure-scroll
cycle) are what let us tell "the instrument is sensitive" from "the instrument is lying."
