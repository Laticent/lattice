# perf-torture — a reusable memory/leak torture profiler

A CDP-driven harness that hammers a built web app with repeated "user does X once" cycles and tells
you, per action, whether memory / DOM nodes / listeners **rise monotonically** — and, when they do,
**names the exact reference pinning the leak**. It grew out of the Studio degradation audit
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
read-aloud, needs `TORTURE_TTS_KEY`) · `--json`.

## Reading the verdict

Each metric is `first → last`, its **Sen's slope** (robust per-cycle growth), the noise **floor**,
the Mann-Kendall **z**, and `RISING`/`flat`. A metric is **RISING** only when MK `z ≥ 1.96` AND its
Sen slope clears `max(absolute floor, 4× the idle-control's own slope)`. The **idle** cycle runs
first as the control and calibrates those floors — memory series are strongly autocorrelated, so MK
alone false-positives (a trivial ~9KB/cyc idle drift scores z≈5.9); pairing it with a
control-calibrated Sen slope is what makes a `RISING` trustworthy.

**Plateau vs leak:** a real warmup (JIT / caches) shows the same early rise as a leak but *decays*
as `--k` grows. Re-run at a higher `--k`; if the slope drops, it's a plateau, not a leak.

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
    idle:     async (page) => { await wait(page, 900); },              // CONTROL — must stay flat
    edit:     async (page) => { await clickSel(page, '.edit'); /* … assert … */ },
    navigate: async (page) => { /* … */ },
  },
  probes: (page) => page.evaluate(() => ({ myWidgets: document.querySelectorAll('.widget').length })),
  probeFloors: { myWidgets: 0.4 },       // noise floor for each probe key
  retainerTarget: (name, self) => self >= 200000 && /MyBigThing/.test(name),  // --retainers
};
```

The engine trends your `probes` alongside the universal metrics (heap / nodes / listeners /
documents / frames) and rates them against `probeFloors`.
