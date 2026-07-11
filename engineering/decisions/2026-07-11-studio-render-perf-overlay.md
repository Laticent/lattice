---
status: shipped
summary: The Studio gains a live performance overlay, toggleable under Workspace → General → Diagnostics. The existing PerfOverlay (Web Vitals + runtime FPS/MEM/CPU) grows a third RENDER group that times each edit→preview pipeline stage — engine (PG.render), sanitize (DOMPurify), frame (srcdoc parse/layout), fit (scaleFrame), and the total edit→paint span — plus the source workload size. Timing is a handful of performance.now() deltas in single-slide-render.ts (piggybacking the existing fit read, no added reflow), published through a tiny dependency-free bus (render-metrics.js) the overlay subscribes to only while shown, so overlay-off surfaces pay nothing. The Studio switch drives the shared cross-surface pref (perf-overlay-prefs.js), NOT a new StudioSettings field. Option 2 — per-transform decomposition threaded through lib/engine — plus the three then-deferred metrics (overflow count, deck-context chart/mermaid/math chips, coalesce ratio) were logged as the next rung in the first PR and BUILT in the follow-up PR (see §7).
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

## 7. The next rung — BUILT in the follow-up PR

This section logged what the first PR (#906) deliberately deferred. The follow-up
PR then built all of it; each item is marked below with what shipped, so this
record stays true to the code (HARD RULE #6 / #18).

- **Option 2 — per-transform decomposition. BUILT.** RENDER (`engineMs`) now
  drills into parse / transforms / assemble / css / other buckets + a
  per-transform timing map, collected opt-in via `opts.stats` threaded through
  the engine kernel (`lib/engine`, `lib/transformers`) and the playground wrapper
  — gated so it runs only while the overlay is subscribed, and byte-identical for
  CLI/export/overlay-off. Reconciles to the raw `engineMs` (the `other` bucket
  carries the docs-side math-prescan / cold-KaTeX cost).
- **Overflow count. BUILT.** The deck-context panel reports how many previewed
  slides trip the Fit Spine ring, read from the live same-origin frame
  (`section.overflow`) after it settles and patched onto the recorded sample
  without re-timing the render — no export-path `overflow-probe.js` needed.
- **Active-transform presence. BUILT (as deck-context chips).** Rather than a raw
  fired-transform count (which counts transformers, not the components an author
  reasons about — dropped as misleading during the build), the panel shows the
  heavy content that drove the cost: chart-layout and Mermaid counts (from the
  engine HTML string) and whether the source triggers KaTeX (the engine's own
  math gate). Item 1's per-transform map already answers "which transform was
  slow" by name.
- **Coalesce ratio. BUILT.** A COALESCE row reports how many edits the 140ms
  preview debounce folded into one render. This DID touch the `DeckPreview.tsx`
  debounce boundary (the earlier PR left it untouched): DeckPreview now counts
  changes since the last committed paint and stamps the total on the live host,
  which `renderInto` consumes synchronously — so the count is bound to that
  render, not a shared global.

### Verified on / known limitations

- **Verification surface (HARD RULE #23):** the RENDER breakdown, deck-context
  chips, and COALESCE are LIVE-editing behaviors — they only populate while the
  real Studio re-renders. They were exercised in the actual Studio Playground
  (static docs build + real editor typing), not merely a unit harness; the static
  build is the *host*, the real edit→preview loop is the surface driven. The
  responsive detail popover/sheet on real iOS Safari remains UNVERIFIED from this
  sandbox.
- **Known limitations, logged (HARD RULE #18), not fixed in this PR:** (a)
  `engineMs` brackets a first-render cold KaTeX network fetch and EMA-smears it
  across the next few renders — a pre-existing `engineMs` definition from #906,
  not introduced here; the `other` bucket at least surfaces it. (b) The
  `parse`/`assemble` split books the markdown-it instance *construction* under
  `assemble`, not `parse`. (c) The breakdown is empty for the render that
  preceded the overlay being enabled and permanently empty on a static
  never-re-rendering surface (it self-heals on the next Studio edit). (d) The
  COALESCE count can be mis-stamped between two renders of the SAME host during a
  cold engine load, and is dropped for edits coalesced while a host is inactive —
  both cold-window/hidden-tab edge cases on a debug-only metric.

## 8. Relationship to the benchmark (HARD RULE #19)

This overlay is a live, in-browser, real-device *diagnostic* — it is **not** a
substitute for `npm run bench` / `test/benchmark/baseline.json`, which remain the
reproducible, same-machine before/after record any perf *claim* must cite. The
overlay tells a developer what their current edit costs on their machine; the
benchmark is the durable ratcheted evidence. This change is instrumentation, not
a perf optimization, so it ships no `## Performance` numbers.

## 9. Making the numbers legible — tappable detail (follow-up)

Fourteen terse rows of numbers + coloured dots is a readout only its author can
parse ("CLS 0.004", "CPU≈ 11%", "FRAME 813ms" mean nothing without a legend, and
there is no room to inline one). The fix is progressive disclosure, and it forced
a small architecture decision the human chose: **rewrite the vanilla-JS overlay
as a React island** so it can use the shadcn primitives, rather than bolt a
second UI tech onto the script.

- **Interaction (human pick):** one trigger → device-appropriate surface. Tap (or
  hover, on a fine pointer) a row → a shadcn **Popover** anchored to it on
  tablet/desktop (≥640px); on phones (<640px) the same tap opens a bottom
  **Sheet**, where an anchored popover would clip against the screen edge. A hover
  tooltip was rejected outright — it dies on touch. Both surfaces render the SAME
  body (`MetricDetail.tsx` + `useMediaQuery`).
- **Content:** every row — vitals and CPU≈ included, not just RENDER — explains
  *what it measures*, *why it matters*, a good/OK/poor budget scale with the
  current zone highlighted, the numeric thresholds, and (for render metrics) the
  raw value behind the EMA.
- **One registry:** `docs/src/components/site/perf-metrics.ts` is the single source
  for every metric's label, formatter, unit, budget bands + rating, and its plain
  words — so a row's colour and its explanation can never drift apart. It powers
  both the compact rows and the detail cards.
- **The island** (`PerfOverlay.tsx`) preserves the prior contract: off by default,
  renders nothing (and starts no loops) until the shared pref is on, lazy
  web-vitals, all runtime loops torn down on unmount, drag + position persistence,
  a module-level singleton claim for duplicate includes, and a `createPortal` to
  `document.body` so `position:fixed` is viewport-relative regardless of a
  transformed ancestor. `PerfOverlay.astro` is now a thin `client:only` mount.
- **On-brand, one system.** The compact panel wears the SAME shadcn `popover`
  surface tokens as the detail cards (border, radius, shadow, foreground), so
  it's theme-aware — a navy card in dark, a white card in light — matching the
  Studio instead of a fixed black HUD, and the panel + detail read as one system.
- **All React / all TypeScript.** The overlay UI is React end-to-end; the two
  shared helpers it needs — the on/off pref (`perf-overlay-prefs.ts`) and the
  telemetry bus (`render-metrics.ts`) — are plain framework-agnostic TS modules
  (a store + an event bus), because non-React callers use them too: the render
  path (`single-slide-render.ts`) records into the bus, and the frozen Drawing
  Board reads the pref. They're libraries, not components — the correct shape for
  shared state in an all-React app, not a vanilla/React hybrid.
- **Verified** on the real Studio at 390 / 820 / 1440px in light AND dark (HARD
  RULE #23): popover on desktop + tablet, bottom sheet on mobile, panel + detail
  sharing one on-brand surface, live values and correct rating zones.
