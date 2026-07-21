# perf-torture — a reusable memory/leak torture profiler

A CDP-driven harness that hammers a built web app with repeated "user does X once" cycles and tells
you, per action, whether memory / DOM nodes / listeners **rise monotonically** — and, with
`--snapshot`/`--retainers`, **walks the heap to name what holds a leaked object** (its GC-root chain).
It grew out of the Studio degradation audit
(`engineering/decisions/2026-07-20-studio-degradation-audit.md` +
`2026-07-20-studio-audit-instrument-fix.md`) and is split so the measurement engine is app-agnostic
and each app supplies a small **scenario**.

> Diagnostic, not a gate. It prints signals + a verdict; it never fails a build.

## Run it

```sh
# 1. build the site the scenario drives (studio → the docs site)
cd docs && npm run build && cd ..
# 2. torture it (CHROME_PATH must point at a Chromium)
npm run torture -- --scenario studio --cycle idle,compose,palette --k 40 --cpu 4
```

Flags: `--scenario <name>` (default `studio`) · `--mode within` (across-refresh mode is stubbed) ·
`--cycle a,b,c | all` · `--k <iterations>` · `--cpu <throttle×>` · `--snapshot` (per-constructor
heap diff) · `--retainers [--realm]` (walk the retainer path to the GC root) · `--tts` (voiced
read-aloud, needs `TORTURE_TTS_KEY`) · `--json` · `--out <dir>` / `--junit` (write report artifacts —
see below).

## Report artifacts (`--out <dir>`)

`--out <dir>` writes consumable, standard-ish artifacts (the run still prints to the console as well):

| file | format | what it's for |
|---|---|---|
| `report.json` | **owned**, `schemaVersion`-pinned | the source of truth — every number a consumer needs, incl. the raw per-cycle series |
| `report.md` | Markdown + Mermaid | human summary: a verdict, a table per cycle, and a `xychart` per RISING metric (renders natively on GitHub / the docs site) |
| `<cycle>.heapsnapshot` | **adopted** V8/DevTools | written under `--snapshot`/`--retainers`; open in Chrome DevTools ▸ Memory ▸ Load for a deep dive |
| `report.junit.xml` | JUnit XML (opt-in `--junit`) | a lossy CI-dashboard projection — one `<testcase>` per metric, a RISING metric is a `<failure>` |

We own the JSON + Markdown because no test framework models "per-action metric TREND + verdict +
retainer chain"; we adopt `.heapsnapshot` (the DevTools standard) and offer JUnit as a projection for
CI, never as the source of truth. `report.json` is the schema to consume programmatically; treat the
Markdown/JUnit as views of it.

```sh
npm run torture -- --scenario studio --cycle idle,compose --k 40 --snapshot --out .scratch/torture --junit
```

## Reading the verdict

Each metric is `first → last`, its **Sen's slope** (robust per-cycle growth), the noise **floor**,
the Mann-Kendall **z**, and `RISING`/`flat`. A metric is **RISING** only when MK `z ≥ 1.96` AND its
Sen slope clears `max(absolute floor, 4× the idle-control's own slope)`. The **idle** cycle runs
first as the control and calibrates those floors — memory series are strongly autocorrelated, so MK
alone false-positives (a trivial ~9KB/cyc idle drift scores z≈5.9); pairing it with a
control-calibrated Sen slope is what makes a `RISING` trustworthy.

The idle cycle is **always run first as the control** (even for a single-cycle run like
`--cycle compose`); a scenario with no `idle` cycle prints an `UNCALIBRATED` banner and the verdict
is weak (absolute floors only).

**Plateau vs leak:** a real warmup (JIT / caches) shows the same early rise as a leak but *decays*
as `--k` grows. Re-run at a higher `--k`; if the slope drops, it's a plateau, not a leak.

**Calibrate for YOUR app.** The universal heap/DOM floors are Studio-derived (a heavy app). A lighter
app that leaks a little can sit *below* them and read a false `flat` — set `scenario.universalFloors`
from your own idle-control noise. The tool warns when a scenario relies on the built-in defaults.

### What the retainer walk does — and doesn't
`--retainers` walks ONE final snapshot and names **who holds** the big / `retainerTarget`-matched
objects — it does **not** prove they grew. Establish growth first with `--snapshot` (a baseline→final
per-constructor diff), then use `--retainers` to name the holder. With no `retainerTarget` the default
targets big (≥200 KB) retained *strings*; supply `retainerTarget(name, self)` (matched against **every**
node type) to name a listener/closure/object leak instead.

### Limits (inherent — know them)
- **Retained heap can't tell a reclaimable detached realm from a pinned one — realm-class growth needs a
  no-CDP re-measure.** The verdict trends `JSHeapUsedSize` after `HeapProfiler.collectGarbage`, a V8 GC
  that does **not** force Blink's detached-context disposal. So a detached iframe *realm* stays counted
  across the CDP GC — which **may** mean a reclaimable over-count (a real idle GC frees it) **or** a
  genuinely pinned realm leak (a JS ref holds it forever); the two are **indistinguishable** from a heap
  dump. When `--snapshot` shows realm-binding scaffolding growing (`FunctionTemplateInfo` /
  `ObjectTemplateInfo` / `NativeContext` / `ScriptContext` — classes ordinary JS can't mint; the loud but
  ambiguous `AccessorPair`/closure-`Context`/`PropertyCell` growers are deliberately **not** triggers, so a
  real closure/accessor leak is never mislabeled "realm"), the tool prints a **`⚠ REALM-CLASS GROWTH`**
  banner and sets `realmUnconfirmed` in `report.json`. Decide it — don't dismiss OR believe it — without a
  heap client:
  ```js
  // COOP:same-origin + COEP:credentialless on the server so crossOriginIsolated → the API is exposed.
  const bytes = () => performance.measureUserAgentSpecificMemory().then(m => m.bytes); // own GC, no CDP; await it
  // baseline → drive the action N× → measure → idle ~30s → measure. Recovers on idle ⇒ reclaimable, not a leak.
  ```
  ⚠ Enabling COEP can BLOCK cross-origin subresources (fonts/images without CORP) — verify the page still
  loads fully under isolation, or you're measuring a broken page. `measureUserAgentSpecificMemory()` is
  async and UA-timed (may be throttled) — always `await`; "own GC" ≠ an instant synchronous collection.
  This is a real trap we hit: the Playground light/dark toggle read 361 KB/lap via `HeapProfiler` retained
  heap; the no-CDP measure showed ~16 KB/toggle, reclaimed on idle — **not** a leak
  (`engineering/decisions/2026-07-20-playground-theme-toggle-not-a-leak.md`).
- **`peakHeap` is duration-sensitive** — it's a max over 60 ms polls, so a slower cycle gets more polls
  and a higher observed max at the same true memory. Trust `retainedHeap`/`nodes` for the verdict.
- **Cycles must be state-neutral** — a cycle that opens without closing (or appends without removing)
  produces a real monotonic climb that is *accumulating UI state*, not a leak, yet reads `RISING`.
  Assert the return-to-start (studio's `insert` asserts the dialog closed + rail count unchanged).
- **Probes race the render** — a probe fires after 2×GC but the cycle ends on a fixed `wait()`, not an
  idle-settle; too short a final wait captures a mid-transition count. Tune per cycle.

## Two hard-won rules baked in

1. **Never pollute your own measurement.** Every `waitForSelector`/`page.$` returns an ElementHandle
   in the DevTools remote-object group; if you don't dispose it and the node later detaches, the
   handle *pins* it — GC can't reclaim it and it stays counted, fabricating a per-cycle "leak" that
   is the instrument watching itself (a held-handle A/B turned a flat toggle into +513 nodes/cyc).
   So the engine exports `clickSel` / `settle` / `exists` / `clickIn` / `clickNth` / `countSel` /
   `clickTabByText` — all dispose or return primitives. **Scenarios MUST use these**, never raw
   `page.$`/`waitForSelector`.
2. **Every cycle asserts its action** (or throws), so a no-op selector can't read as a clean "flat".

## Write a scenario

A scenario is one file, `scenarios/<name>.mjs`, default-exporting an object (see `scenarios/studio.mjs`
and the `Scenario` typedef in `engine.mjs`):

```js
import { clickSel, settle, exists, clickIn, wait } from '../engine.mjs';

export default {
  name: 'myapp',
  distDir: '/abs/path/to/built/site',   // must exist
  defaultCycles: ['idle', 'edit', 'navigate'],   // idle first = the control
  surfaces: {
    app: { url: '/app', ready: '.editor', settle: 1500,
           setup: async (page) => { /* one-time per-surface dial-in */ } },
  },
  cycleSurface: { /* cycle → surface key; default = first surface */ },
  cycles: {
    idle:     async (page) => { await wait(page, 900); },   // CONTROL — must stay flat; always run first
    edit:     async (page) => { await clickSel(page, '.edit'); /* …do X… then assert it returned to start… */ },
    navigate: async (page) => { /* … */ },
  },
  // Calibrate to YOUR app (from its idle-control noise) — don't inherit Studio's heavy-app floors.
  universalFloors: { retainedHeap: 8000, peakHeap: 12000, nodes: 0.4, listeners: 0.4 },
  probes: (page) => page.evaluate(() => ({ myWidgets: document.querySelectorAll('.widget').length })),
  probeFloors: { myWidgets: 0.4 },       // a probe key MUST appear here to be trended
  retainerTarget: (name, self) => /MyLeakyThing/.test(name),  // --retainers; matched against every node type
};
```

Rules that matter: **use only the exported helpers** (never raw `page.$`/`waitForSelector` — the CLI
statically lints for this and warns); **every cycle asserts its action** so a no-op can't read as
"flat"; **every cycle is state-neutral** (returns to its start); the engine trends your `probes`
alongside the universal metrics (heap / nodes / listeners / documents / frames) against `probeFloors`.

## Engine exports for a second driver (autonomous crawl — WIP)

The engine also exports the seam an autonomous `explore`/`replay` driver reuses instead of duplicating
(`2026-07-20-autonomous-torture-profiler.md`; the driver itself is not built yet):

- **Measurement seam** — `sample` · `peakDuring` · `analyze` · `controlSlopesFrom` · `serve` ·
  `UNIVERSAL_KEYS` · `UNIVERSAL_FLOOR`: the same measurement the scenario runner uses, so a second driver
  computes an identical, calibrated verdict.
- **Autonomous-driving primitives** — `enumerateInteractables(page, {selector?, max?})` returns visible
  clickable controls as plain **descriptors** (`{selector, stable, role, label, rect}`) with a
  **verified-unique** selector (never an `ElementHandle` — observer-safe); `resolveAndClick(page, descriptor)`
  re-resolves the selector, **re-checks role+label** as a staleness heuristic, then `el.click()`s —
  returning `{ok, reason?}`, never a handle.
  - **Known boundaries (Slice-3 watches):** both query the **top document only** — controls inside
    same-origin srcdoc iframes (Studio/Playground preview realms) are not discovered. The role+label
    re-check is a **heuristic, not identity** — a duplicate/recycled label can mis-resolve and a volatile
    label ("Slide 3 of 12") can false-abort. `el.click()` fires a synthetic click only (no focus/pointer/
    keyboard), and `a[href]` is not navigation-gated — the driver's scope lever owns that.
