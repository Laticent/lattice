---
status: shipped
summary: The Studio gains a live performance overlay, toggleable under Workspace → General → Diagnostics. The existing PerfOverlay (Web Vitals + runtime FPS/MEM/CPU) grows a third RENDER group that times each edit→preview pipeline stage — engine (PG.render), sanitize (DOMPurify), frame (srcdoc parse/layout), fit (scaleFrame), and the total edit→paint span — plus the source workload size. Timing is a handful of performance.now() deltas in single-slide-render.ts (piggybacking the existing fit read, no added reflow), published through a tiny dependency-free bus (render-metrics.js) the overlay subscribes to only while shown, so overlay-off surfaces pay nothing. The Studio switch drives the shared cross-surface pref (perf-overlay-prefs.js), NOT a new StudioSettings field. Option 2 — per-transform decomposition via performance.mark inside lib/engine — plus three deferred metrics (overflow count, active-transform count, coalesce ratio) are logged here as the next rung, not built.
---

# Studio render-performance overlay — live per-stage pipeline timing

**Date:** 2026-07-11
**Status:** shipped (option 1 — whole-stage timing at the orchestrator).
**Related:** `docs/src/lib/single-slide-render.ts` (the instrumented render
orchestrator), `docs/src/playground/render-metrics.js` (the telemetry bus, new),
`docs/src/components/site/PerfOverlay.astro` (the overlay, extended),
`docs/src/playground/perf-overlay-prefs.js` (the shared on/off pref, reused),
`docs/src/components/studio/WorkspaceSheet.tsx` (the Studio toggle),
`engineering/decisions/2026-06-15-docs-perf-gating-policy.md` (the overlay's GA
gate + real-device rationale), `engineering/decisions/2026-06-29-studio-render-debounce.md`
(the 140ms preview debounce these numbers explain), `test/benchmark/engine-bench.mjs`
(the offline whole-render benchmark this complements, HARD RULE #19).

---

## 1. The ask

"Show how each critical and major area is performing, in a dedicated real-time
overlay, enabled from the Studio's workspace general settings." The question
that had to be answered first was *what to measure* — the overlay is only as
good as the metric set behind it.

## 2. What already existed (so we extended, not rebuilt — HARD RULE #15)

`PerfOverlay.astro` was already a working, draggable, lazy overlay mounted on
the Studio route (via `ResourceHints.astro`). It showed two groups:

- **WEB VITALS** (one-shot, page load): LCP / CLS / INP / FCP / TTFB from
  Google's `web-vitals`.
- **RUNTIME** (continuous): FPS (rAF), MEM (`performance.memory`), CPU≈ (Long
  Tasks main-thread-busy proxy).

Its on/off state lives in `perf-overlay-prefs.js` — a global, cross-surface
localStorage flag with a `?perf` URL param, already wired to a Drawing Board
toggle. **The Studio simply had no switch for it**, and the overlay knew nothing
about Lattice's own render pipeline.

So two gaps, not a greenfield build: (a) surface the existing toggle in the
Studio; (b) add the Lattice-specific render metrics that did not exist anywhere.

## 3. The metric taxonomy

Ranked by signal-to-cost. Only Tier 1 is genuinely new work; the rest already
existed or is near-free context.

### Tier 1 — render pipeline latency (NEW, the point of this change)

Mapped to the real edit→preview path in `single-slide-render.ts`:

| Row | Sample key | Measures | Budget (good / needs-work / poor) |
|---|---|---|---|
| RENDER | `engineMs` | `PG.render()` — markdown parse + the 15-transform registry + CSS/geometry | `<50` / `<100` / `≥100` ms |
| TOTAL | `totalMs` | `renderInto` entry → iframe `onload` (the edit→paint whole) | `<100` / `<200` / `≥200` ms |
| FRAME | `frameMs` | `srcdoc` assignment → iframe `onload` (browser parse/layout of the frame) | `<16` / `<50` / `≥50` ms |
| FIT | `fitMs` | `scaleFrame()` — the fit read + transform | `<8` / `<16` / `≥16` ms |
| SANITIZE | `sanitizeMs` | `sanitizeSlideHtml()` / DOMPurify preview-frame pass | `<5` / `<15` / `≥15` ms |

Budgets are anchored to observed numbers: a warm `PG.render` is ~38 ms (the
number the 140 ms preview debounce exists to hide), and 16 ms is the 60fps
frame budget.

### Tier 2 — deck workload context (NEW, near-free)

- **SRC** (`srcBytes`) — source length; the workload size that correlates with
  render cost. Shown with a neutral dot (no budget).
- `slides` (section count) is recorded in the sample but **not shown** — the
  Studio's inline preview renders a *single* sampled slide, so it is ~1 and
  uninformative here. It is carried in the payload so a future multi-slide
  surface (the `deck-preview.js` filmstrip, not instrumented today) can light it
  up without a bus change.

### Tier 3 — runtime health + Tier 4 — Web Vitals (REUSED as-is)

The existing RUNTIME (FPS/MEM/CPU≈) and WEB VITALS (esp. INP — the honest
typing-latency measure) groups are untouched. Long tasks matter here precisely
because `PG.render` is synchronous: a slow render *is* a long task that janks
typing.

## 4. Architecture — a tiny bus, not a coupling

`render-metrics.js` is a dependency-free SSOT modeled on `perf-overlay-prefs.js`:
the render path `import`s `recordRenderSample()`; the overlay `import`s
`onRenderSample()` / `latestRenderSample()`. Neither imports the other.

- **Smoothing:** timing fields are EMA-smoothed (α 0.3) so a fast typist's
  ~7 renders/sec read steadily; counts stay raw; the unsmoothed sample is
  preserved on `.raw`.
- **Off = free:** `recordRenderSample` early-returns before smoothing/fan-out
  when no listener is registered (the overlay-off common case). The only
  always-on cost is the caller's own `performance.now()` deltas — nanoseconds.
- **Live only while mounted:** the overlay subscribes in `mount()` and
  unsubscribes in `unmount()`, exactly like the existing runtime loops.

## 5. Overhead — why this is a non-issue

`performance.now()` is a ~tens-of-nanoseconds clock read; ~8 per render is
<0.003% of a 38 ms render. The two traps we explicitly avoided:

1. **Forced reflow.** Instrumentation never reads layout itself — FIT is timed
   *around* the `host.clientWidth` read that `scaleFrame` already does, adding
   zero reflow.
2. **Overlay repaint jank.** Render samples arrive at most ~7/sec (already
   debounced upstream), so the overlay repaints a few text nodes per render with
   no extra rAF — and it observes the very FPS/INP it reports, so we kept its
   own writes minimal.

## 6. The Studio toggle

A "Performance overlay" switch under Workspace → General → **Diagnostics**
(`WorkspaceSheet.tsx`), mirroring the existing `dedup` `role="switch"` pattern.
It is wired to `setPerfOverlayEnabled` — the **shared cross-surface pref**, NOT a
new `StudioSettings` field — deliberately: one flag already governs every surface
and honors `?perf`, and duplicating it into `StudioSettings` would create two
sources of truth. The switch subscribes to `onPerfOverlayEnabledChange` so it
tracks a flip made from the overlay's × button or the URL param. The whole group
is gated on `PERF_OVERLAY_AVAILABLE` (the GA gate).

## 7. What was deliberately NOT built (the next rung)

Logged here so it is tracked, not lost (HARD RULE #18 — off-path defects/gaps
get recorded, not silently pulled into this diff or ignored):

- **Option 2 — per-transform decomposition.** Break RENDER (`engineMs`) into
  markdown-parse / each component-transform family / geometry, via
  `performance.mark`/`measure` calls *inside* the engine kernel (`lib/engine`,
  `lib/transformers`). Runtime cost is still trivial (marks are as cheap as
  `now()`), but it means instrumenting the shared render kernel (HARD RULE #1
  blast radius) — warranted only once the whole-render number points somewhere
  specific. Do it behind a flag, with maker-checker.
- **Overflow count.** How many slides trip the Fit Spine red-ring. Not on the
  live single-slide path — overflow is measured at export time (the emulator's
  `measureOverflow` + `resplitDoc` loop), so surfacing it live would mean running
  `overflow-probe.js` in the preview frame. Deferred.
- **Active-transform count.** How many of the 15 registry transforms fired, and
  chart/mermaid/math presence — high explanatory value ("*why* was that render
  slow"), but needs the engine to *report* what it did (option-2-adjacent).
- **Coalesce ratio.** Keystrokes collapsed per actual render — lives at the
  `DeckPreview.tsx` debounce boundary, which this change deliberately left
  untouched to keep the blast radius to the orchestrator + overlay + settings.

## 8. Relationship to the benchmark (HARD RULE #19)

This overlay is a live, in-browser, real-device *diagnostic* — it is **not** a
substitute for `npm run bench` / `test/benchmark/baseline.json`, which remain the
reproducible, same-machine before/after record any perf *claim* must cite. The
overlay tells a developer what their current edit costs on their machine; the
benchmark is the durable ratcheted evidence. This change is instrumentation, not
a perf optimization, so it ships no `## Performance` numbers.
