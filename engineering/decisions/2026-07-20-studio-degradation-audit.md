---
status: in-progress
summary: >
  Field report: the Studio degrades monotonically — slower the more it's USED, slower the more it's
  REFRESHED. A three-lens trio (red team + Munger inversion + independent checker) reviewed the audit
  PLAN and inverted its founding axiom: the user runs an installed PWA on iOS, where the OS discards the
  tab under memory pressure and cold-reloads it — so "slower with use" and "slower after refresh" are ONE
  mechanism (in-session peak-memory growth → discard → cold reload), not two independent axes; and forced-
  GC/post-GC-retained-heap is the wrong metric (peak footprint drives discard). A corrected torture harness
  (tools/perf-torture/, was docs/scripts/studio-torture.mjs) was built — PWA-faithful, idle-control-calibrated, Sen's-slope + Mann-
  Kendall verdict, heap-snapshot attribution — and CONFIRMED the in-session leak with numbers: every FULL-
  WRITE render (theme/mode/size change) retains ~400KB (peak ~1.2MB); Present ~100KB; SlideOverview ~68KB +
  ~1 listener/cycle; typing + idle are clean. Heap-diff attributes it to RETAINED DETACHED IFRAME REALMS —
  each srcdoc rewrite tears down the old DOM but keeps its JS global environment (theme CSS + engine-scaffold
  strings + thousands of V8 realm structures) alive. Next: retainer-path walk to name the pinning reference,
  then fix in the shared render kernel with before/after on the harness. In-progress.
---

# Studio degradation — comprehensive audit (torture-test + profiling)

> **⚠️ CORRECTION (2026-07-20) — see `2026-07-20-studio-audit-instrument-fix.md`.** The harness
> used here drove the UI with UNDISPOSED puppeteer ElementHandles, which pinned the very nodes it
> measured and FABRICATED the loudest findings. The node-count, detached-DOM, and listener leaks
> below (compose +91, insert "+137 / catastrophic 32MB", pgvariant +64, and the detached-DOM
> evidence for "retained iframe realms") are **instrument artifacts** — clean re-audit shows nodes
> flat and listeners creeping 1–3/cyc. The `typing`/warmup heap rise is a **plateau**, not a leak.
> The one genuinely serious, sustained leak is **landing** (~2MB/cyc, unfixed). The theme-string
> retention (palette/fullwrite → Fix A / Fix #1) is real, but its magnitudes here ("~70×") came
> through the polluted instrument and are unproven. **Read the correction doc for the true picture;
> the method below is retained, the magnitudes and rankings are superseded.**

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

## The instrument — `tools/perf-torture/` (was `docs/scripts/studio-torture.mjs`)
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

---

# EXHAUSTIVE MATRIX (every feature × every surface) — 2026-07-20 update

The harness now tortures all three surfaces in the full Build layout, driving REAL UI for every
feature (each cycle asserts its action or throws — no silent no-ops). k=10, cpu 1, real prod dist,
idle-control-calibrated Sen's-slope + Mann-Kendall verdict. **The realm leak is NOT the only issue.**

| Cycle | Surface | Retained heap / cycle | Listeners / cycle | Verdict |
|---|---|---|---|---|
| idle (control) | studio | ~15 KB | 0 | flat ✓ |
| pgslide (scroll filmstrip) | playground | ~0 | 0 | flat ✓ |
| pgscroll | playground | ~1 KB | 0 | flat ✓ |
| overview | studio | ~69 KB | +1.2 | RISING |
| deckswitch | studio | ~76 KB | +8.5 | RISING |
| readaloud (captions-only) | studio | ~128 KB | +1 | RISING |
| slidenav | studio | ~129 KB | 0 | RISING |
| present | studio | ~145 KB | ~0 | RISING |
| typing (Build layout) | studio | ~260 KB | ~0 | RISING (clean in bare Write) |
| decksettings | studio | ~282 KB | +4.3 | RISING |
| pgvariant (component swap) | playground | ~304 KB | +64 | RISING |
| palette / mode flip | studio | ~438 KB | 0 | RISING |
| full-write render | studio | ~439 KB | 0 | RISING |
| compose (rich editor switch) | studio | ~508 KB | **+91** | RISING |
| **landing (hero tab-flip + palette)** | landing | **~1.47 MB** | 0 | RISING |
| **insert (add-slide gallery open/close)** | studio | **~32 MB** | **+137** | RISING (catastrophic) |

(slidesettings driving is inconsistent on the sample deck's first slide — Look tab hidden when the
`_class` isn't round-trippable; decksettings covers the settings-panel leak. deckswitch is best-effort.)

## THE UNIFIED ROOT CAUSE — retained detached preview/thumbnail iframe realms
Heap-diff attribution is consistent across every riser and definitive on the gallery (k=5, +159 MB):
the growers are **`lattice-engine scaffold` strings (+85 MB) and `lattice.min.css` theme strings
(+71 MB), Δcount +70 each = ~14 per gallery open** — one retained copy per thumbnail iframe, none
released on close. Same signature (scaffold+theme strings + V8 realm structures, 0/low detached DOM)
on fullwrite/palette/present/compose/landing. **Mechanism:** every preview/thumbnail iframe, after
its DOM is torn down, keeps its JS global environment alive — its ~560 KB theme CSS string, engine
scaffold, and ~10 listeners. So:
- **add-slide gallery** (~14 iframes/open, none disposed) → **~32 MB/open** — the dominant defect.
- **landing** hero Preview/Source tab flip remounts the hero iframe (×8 islands re-render) → ~1.47 MB/cyc.
- **every full render** (theme/mode/size/palette/present/compose-preview/pgvariant swap) retains its
  one realm → 100–500 KB each.
- **listener leaks** compound on mount/unmount surfaces (compose ProseMirror +91, gallery +138,
  pgvariant +64, deckswitch +8.5) — add-without-remove on those specific components.

The 2026-07-17 `dispose()` fix added teardown to DeckPreview unmount, but the retained theme/scaffold
STRINGS prove the realm is still pinned after dispose — a reference survives (candidates: the per-host
theme fetcher's CSS-string cache C1, `installVideoBridge(fr.contentWindow)`, the `fr.onload` closure,
or `scaleTargets`). **Fixing the realm-release at the single-slide-render kernel would fix the gallery,
landing, and every per-render leak at once** — the highest-leverage fix. The listener leaks are
separate per-component add/remove bugs (compose, gallery, picker, switcher).

## Clean (no leak) — the controls that validate the instrument
idle, plain typing in bare Write, playground filmstrip scroll (pgslide), playground editor/preview
scroll (pgscroll). These stay flat → the RISING verdicts are real, not instrument drift.

## Still open
- Retainer-path walk to name the exact reference pinning the detached `contentWindow` (the one fix
  that cascades). - Voiced TTS run (captions-only done; `--tts` + operator key wired). - Across-refresh
  A-axis (boot cost) — separate, recon-confirmed (4× parse, unbounded IDB). - slidesettings driving.

## RETAINER-PATH PINPOINT (2026-07-20) — the exact Map that holds the leak
The harness now walks the heap snapshot's reverse-edge graph from a leaked node to its GC root
(`--retainers`). On `fullwrite`, the leaked ~560 KB theme-CSS strings trace to:

```
(GC root, synthetic) → Window (top-level page)
   --__latticeRegisterKatex--> closure → engine singleton ("Za")
   --themes--> ThemeStore ("eo")  --byName--> Map  → [leaked theme CSS string]
```

**Root cause (heap side):** `lib/engine/themes.js` `ThemeStore.add(css)` extracts the `@theme <name>`
and does `byName.set(name, cssText)` with **NO eviction / no size bound**. The docs-side render path
registers themes under **per-render-varying names** (candidate: the derived/`extra` theme — C5's
"ALWAYS re-register", content-hash-named in Fabricate — and/or per-host base registration), so
`byName` grows ~0.67 entries/render × ~560 KB = ≈ the measured ~400 KB/cycle. The engine singleton
(a legit module global, pinned via `window.__latticeRegisterKatex`) keeps it alive forever. This is
the DOMINANT heap leak, and the gallery's 32 MB/open is the same mechanism × ~14 thumbnail registrations
(plus their un-disposed iframe realms).

## Ranked root causes → fixes (each with a harness before/after target)
1. **`ThemeStore.byName` unbounded (lib/engine/themes.js)** — the dominant heap leak. Fix options:
   dedup by content-hash (identical CSS under different names → one entry), LRU/size-bound `byName`,
   or unregister the ephemeral per-render theme after use. HARD RULE #1 shared kernel → full trio +
   the engine unit tests + a bench. **Highest leverage — cascades to fullwrite/palette/present/compose/
   pgvariant/landing/gallery.**
2. **Add-slide gallery (~32 MB/open)** — SlidePicker thumbnails' renderers/iframes not released on
   close (compounded by #1 × ~14). Fix: dispose on close / snapshot thumbnails / LRU-recycle live ones.
3. **Detached iframe realms** — retained `contentWindow`s (the realm-structure bulk). Walk a Window
   node's retainers next to name the exact pin (installVideoBridge / fr.onload / scaleTargets), then
   release on dispose.
4. **Per-host theme fetch (C1)** — module-level shared docs-side theme cache (also lowers peak memory).
5. **Listener leaks** — compose ProseMirror (+91/cyc), gallery (+137), pgvariant (+64), deckswitch
   (+8.5): per-component add/remove audits (separate from the heap mechanism).

## Status
Diagnosis EXHAUSTIVE (every feature × surface tortured; dominant leak pinpointed to an exact Map via
retainer path). Next phase = fixes, sequenced by leverage (#1 first), each proven with a before/after
on `studio-torture.mjs` and verified per blast radius (shared-kernel #1 gets the full trio).

## FIXES — execution log (one PR, trio after each)

### Fix A (C1): module-level shared theme cache — SHIPPED-pending-trio
`docs/src/lib/theme-fetch.ts`: hoisted the per-host `fetched`/`registering`/`latticeReady` caches to a
module-level `sharedState` Map keyed by `themeBase`, so every preview host of the same theme root shares
ONE fetch + ONE decoded/rewritten ~560 KB CSS string (was: each host allocated + retained its own).
Added rejection self-heal (drop the shared entry on a failed fetch so a host can retry — sharing must
not lose the per-host retry) + a test-only `__resetThemeFetcherCache()`.
**Before/after (harness, real prod dist, cpu 1):** add-slide gallery open/close retained heap
**~32 MB/open → ~0.6 MB/open (~50×)**. The per-host theme-CSS duplication WAS the bulk of the
catastrophic gallery leak. typecheck clean, 11 theme-fetch tests pass, lint clean. Trio in flight.
(Note: the gallery's +137 listeners/cycle is a SEPARATE leak — Fix for the listener leaks is next.)

### Scope correction (honesty, HARD RULE #23)
Deeper retainer analysis refined the diagnosis: `ThemeStore.byName` grows unboundedly only for
**Fabricate/gallery** (varying `@theme` names), NOT for fullwrite (same-name overwrite). The dominant
fullwrite/palette ~400 KB/cycle retained-heap growth roots at **browser-level V8 context handles**
("(Global handles)"/NativeContext) from rewriting the shared preview iframe's srcdoc in place —
`installVideoBridge` is confirmed NOT to pin the contentWindow. So the "realm-release" fix is NOT a
confirmed app-level leak; it needs **on-device confirmation** (does it accumulate + trigger iOS discard,
or collect after the GC window?) before any export-sensitive kernel change. Revised fix set: (A) shared
theme cache ✓, (B) listener leaks (compose/gallery/pgvariant/deckswitch), (C) gallery thumbnail
disposal, (D) byName eviction for Fabricate/gallery [export gate], (E-realm) deferred pending device.
