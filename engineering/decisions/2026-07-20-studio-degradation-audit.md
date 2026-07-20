---
status: in-progress
summary: >
  Field report: the Studio degrades monotonically — slower the more it's USED, slower the more it's
  REFRESHED. A three-lens trio (red team + Munger inversion + independent checker) reviewed the audit
  PLAN and inverted its founding axiom: the user runs an installed PWA on iOS, where the OS discards the
  tab under memory pressure and cold-reloads it — so "slower with use" and "slower after refresh" are ONE
  mechanism (in-session peak-memory growth → discard → cold reload), not two independent axes; and forced-
  GC/post-GC-retained-heap is the wrong metric (peak footprint drives discard). A corrected torture harness
  (docs/scripts/studio-torture.mjs) was built — PWA-faithful, idle-control-calibrated, Sen's-slope + Mann-
  Kendall verdict, heap-snapshot attribution — and CONFIRMED the in-session leak with numbers: every FULL-
  WRITE render (theme/mode/size change) retains ~400KB (peak ~1.2MB); Present ~100KB; SlideOverview ~68KB +
  ~1 listener/cycle; typing + idle are clean. Heap-diff attributes it to RETAINED DETACHED IFRAME REALMS —
  each srcdoc rewrite tears down the old DOM but keeps its JS global environment (theme CSS + engine-scaffold
  strings + thousands of V8 realm structures) alive. Next: retainer-path walk to name the pinning reference,
  then fix in the shared render kernel with before/after on the harness. In-progress.
---

# Studio degradation — comprehensive audit (torture-test + profiling)

**Date:** 2026-07-20 · **Status:** IN-PROGRESS
**Trigger:** field report — "the more it is USED the slower it gets; the more it is REFRESHED the slower it
gets. No amount of optimization will help because with use it will eventually get shitty. Things used and not
released, defective, loaded multiple times as different things." Request: a full comprehensive audit with
Playwright-simulated extensive use, expert profiling (memory/network/CPU), root-cause pinpointing not
guessing, a red-teamed / inverted / independently-checked plan, then execution. "The app must be tortured."

## Method — plan, then adversarial trio ON THE PLAN, then execute
Three read-only recon agents inventoried the persistence, in-session-leak, and duplicate-work surfaces; a
draft plan was written; then a full trio (red team + Munger inversion + independent checker) reviewed the
PLAN ITSELF before any execution (HARD RULE #25). The trio materially reshaped it — see below.

## What the trio changed (the plan's founding axiom was false on the device)
1. **Coupled, not independent.** v1 assumed "a hard refresh resets the heap, so the two symptoms can't share
   a cause." But the user runs an **installed PWA on iOS/WebKit**, where the OS **discards the tab under
   memory pressure and cold-reloads it** (jetsam). That reload IS the "slow refresh" — *caused by* in-session
   growth. Both symptoms are plausibly ONE mechanism. The audit must find that coupling, not assume it away.
2. **Wrong metric.** Forcing GC before every sample and reading post-GC `JSHeapUsedSize` erases the **peak
   (un-GC'd) + off-heap iframe/GPU memory** that actually triggers discard. "Retained flat → clean" is a
   false all-clear. The corrected harness tracks peak + retained + heapTotal + Documents/Frames.
3. **Isolation test skipped a store + over-invested.** The "decisive" clear-and-reboot test omitted the
   **service-worker Cache Storage** (a confirmed 2026-07-17 accumulator with SWR cost every refresh), and
   built a permanent harness before capturing one real on-device datapoint.

Independent checker confirmed every code-verified defect is real and validated the corrected metrics; store
enumeration is complete (localStorage `lattice-studio-*`/`lattice-docs-*`/`lattice-db-*`/`lattice-file`/
`lattice-asset*`, IDB `lattice-workbench`, SW Cache Storage — all cleared by `studio/governance.ts`;
`lattice-drawing-board` IDB is the frozen surface, out of scope). Remaining checker corrections for the
not-yet-built arms: drop the headless discard repro (device-only, #23); mark the bfcache arm UNVERIFIED (an
active CDP client blocks bfcache eligibility → `goBack()` = cold reload); separate alloc-tracking from timing
runs; use IDB `count()`/`usageDetails` not the quantized `storage.estimate()` top-line.

## The instrument — `docs/scripts/studio-torture.mjs`
Drives the REAL prod `docs/dist` via Puppeteer + CDP. Per-cycle: double-GC retained heap, peak heap
(sampled during the action), heapTotal, Nodes/JSEventListeners/Documents/Frames (these DO aggregate across
same-origin engine srcdoc iframes — verified: Nodes 909 vs top-doc 420, Documents 8), in-page probes
(`iframe.live`/`.cm-editor`/theme-registry/preview styleSheets). **Verdict discipline:** the `idle` cycle is
the CONTROL and calibrates the noise floor; a metric is **RISING** only if Mann-Kendall z≥1.96 AND **Sen's
slope** > max(absolute floor, 4× idle-control drift) — this defeats the autocorrelation false-positive the
idle control itself exposed (idle's ~16KB/cyc drift scores z≈5.9 but is correctly judged flat). Root-cause
attribution via `HeapProfiler` snapshot diff aggregated by V8 constructor + detached-DOM bytes.

## CONFIRMED findings — in-session axis (real prod `docs/dist`, cpu 1, k=12–20)
| Interaction | Retained heap / cycle | Verdict |
|---|---|---|
| idle (control) | ~16 KB | flat ✓ |
| typing (patch fast-path) | ~16 KB | flat ✓ — the frame is reused; clean |
| Present open/close | ~100 KB | RISING |
| SlideOverview open/close | ~68 KB **+ ~1.2 listeners/cyc** | RISING |
| palette / mode flip | ~400 KB (peak ~1.1 MB) | RISING |
| **full-write render (theme/mode/size)** | **~400 KB (peak ~1.2 MB)** | **RISING — dominant** |
| mixed realistic session | ~417 KB + listeners | RISING (compounds) |

**Attribution (heap-diff, fullwrite ×15):** retained growth = the `lattice-engine scaffold` string (+2.44 MB),
the `lattice.min.css` theme string (+1 MB), and **thousands of V8 realm structures** (`FunctionTemplateInfo`
+1673, `AccessorInfo` +7800, `AccessorPair` +13584, `PropertyCell` +35010, `DescriptorArray` +6594,
`PrototypeInfo`) — with **0 detached DOM nodes and a flat live-document count (4)**. That fingerprint is
**retained DETACHED IFRAME REALMS**: each full srcdoc rewrite discards the old document's DOM but keeps its
whole JS global environment alive (something pins the prior `contentWindow`), so every prior render's ~560 KB
theme + scaffold + prototype world leaks. ~400 KB per full write.

**Why this explains both symptoms:** typing (the common action) is clean; the leak is on *render-config*
changes (theme/mode/size/present/overview) — exactly what a design-tweaking session does constantly. The
peak-memory climb is the discard trigger the inversion predicted → cold reload experienced as slow refresh.

## Also confirmed by recon (code-verified, quantify + fix)
- **A1** `loadDeckList()` (full markdown tokenize of every deck) runs **4×** on the synchronous boot path
  (`StudioShell.tsx:264,271,273,280`) — redundant boot cost that grows with deck count.
- **A2** IndexedDB `lattice-workbench` asset shelf: **no cap/eviction ever**; `listAssets`=`getAll()` whole
  store into memory; content-hash-named ⇒ every Fabricate generation is a new record; PDFs base64.
- **C1** ~560 KB theme CSS fetched/decoded/regex-rewritten **per host** (no shared docs-side cache).
- **C3** Mermaid/KaTeX referenced under **two URLs** (vendored vs jsdelivr) ⇒ double download + dup cache.
- (Full ranked hypothesis table + measurements: the working plan.)

## Next
1. **Retainer-path walk** to name the exact reference pinning the old `contentWindow` (candidates:
   `installVideoBridge(fr.contentWindow)`, the `fr.onload` closure, engine per-realm registration,
   `scaleTargets`) — `single-slide-render.ts`.
2. Confirm linear-not-plateau at k≥100 (Hamed-Rao autocorrelation-corrected trend).
3. Fix the realm leak in the shared render kernel (HARD RULE #1) → maker-checker/trio (blast radius);
   before/after on the harness (#19). Then the cheap verified wins (A1, C1, C3).
4. Build the across-refresh + 3-arm isolation arm (incl. Cache Storage) — though the within-session leak
   above already explains both symptoms via the discard coupling.
5. On-device Phase 0 (device-only, #23): a persisted boot-log to distinguish a user reload from an OS
   discard-reload, and confirm the coupling on real iOS.

## Non-goals / scope
The export-sensitive shared runtime (`lib/runtime`) stays out unless evidence points there (2026-07-17
disproved the runtime-oscillation theory; touching it changes export bytes). The harness is a DIAGNOSTIC
(on-demand), not a blocking CI gate (wall-clock/memory bands would flake the merge train), mirroring the
#19 `bench:check` precedent.
