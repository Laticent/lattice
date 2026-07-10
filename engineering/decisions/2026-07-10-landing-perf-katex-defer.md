---
status: in-progress
summary: Landing-page + Studio live-preview latency investigation. Four real sequential-fetch/hydration bugs found and shipped across the landing page, Specimen pages, the Playground, and Studio's cold-load module graph (engine-bundle prefetch was idle-deferred; theme CSS fetch was serialized behind the engine load in three separate render bridges; Studio's client:only island had zero modulepreload hints for its ~45-chunk dependency graph). A red-team/inversion/independent-checker audit disproved an initial Studio LCP diagnosis (an 8.5s Lighthouse-mobile number was measuring a first-run-only welcome banner returning users never see) before landing on the real, measured fix (median time-to-mount 1823ms → 1496ms under simulated 40ms RTT). A fifth finding — KaTeX contributes ~78.5KB gzip (13.5% of the 582.6KB playground bundle) unconditionally, even to decks with no math — is confirmed and quantified but NOT implemented: deferring it safely requires touching 7 independent `PG.render()` call sites with no shared choke point, which is bigger than the shared-Mermaid-pattern win it first looked like. Logged here per HARD RULE #18 rather than rushed.
---

# Landing-page / Studio render-latency investigation

**Date:** 2026-07-10
**Status:** in-progress — four fixes shipped (landing page, Specimen pages,
Playground, Studio module-graph preload), one real finding logged (KaTeX
defer, not implemented).

## 1. What triggered this

A routine check-in on `npm run bench` (is the perf benchmark / Marp parity
test still in the repo?) surfaced that `test/benchmark/baseline.json` is
machine-relative and the committed baseline was blessed on a different,
faster machine than this session's cloud sandbox — re-running `bench:check`
on the SAME commit the baseline was blessed on, in this sandbox, reproduced
~134ms not the committed ~107ms for the stress corpus. The real HEAD-vs-base
delta measured on one machine was ~3-5%, within noise — **not a real
regression**. See `test/benchmark/baseline.json`'s own note
("machine-relative... a ratchet, not an absolute") and
`engineering/workflow.md` §Performance.

That side-quest surfaced a real, separate complaint: noticeable (1-2s)
rendering delay on the docs site's Studio and landing page. This doc covers
that investigation.

## 2. Confirmed and shipped: two sequential-fetch bugs on the landing page

Verified via Playwright driving the real production build (`astro build` +
`astro preview`), using the browser's own `iframe.onload` event as ground
truth (not a synthetic proxy — HARD RULE #23).

**Bug 1 — `docs/src/lib/prefetch-engine.ts`'s eager warm was idle-deferred.**
`warmEngine()`'s `'eager'` branch queued its `rel=prefetch` link injection
behind `requestIdleCallback` (up to a 3s timeout) or a 1200ms `setTimeout`
fallback. Since `rel=prefetch` is already a low-priority hint (no LCP risk),
this deferral bought no real safety while forfeiting the one thing eager mode
exists for — a network head start on the 554KB engine bundle. In practice the
prefetch link consistently lost the race against `DeckPreview`'s own
`ensureEngine()` script injection, so it was never actually warming anything
within the real page-load window. Fixed: fire `injectPrefetch()` immediately.

**Bug 2 — `DeckPreview.tsx`'s paint step serialized two independent fetches.**
`paint()` awaited `whenReady()` (the engine bundle load) BEFORE calling
`render()`, which internally fetches theme CSS via `theme-fetch.ts`. Those
are two independent network round-trips that don't depend on each other —
`theme-fetch.ts`'s `fetch()` is pure, no engine dependency — but were
serialized behind the 554KB engine bundle. Fixed: added `prefetchTheme()` to
the single-slide renderer (`docs/src/lib/single-slide-render.ts`), which
fires the theme + preview-font fetches in parallel with `whenReady()`;
`DeckPreview.tsx`'s paint now calls both at once.

**Measured result** (3 trials each, production build, real browser):
baseline ~1223-1355ms → fixed ~879-921ms. **~30% real reduction**, shipped in
the commit that also fixed this doc's originating branch.

**Known gap, not yet fixed:** `docs/src/components/landing/FieldCardsLive.tsx`
and `RestyleShowcase.tsx` both call `createSingleSlideRenderer()` DIRECTLY
(bypassing `DeckPreview.tsx`), so they likely carry the same
whenReady-then-render sequential pattern Bug 2 fixed. Flagged for the
red-team audit (§4) to confirm and, if confirmed, fix — same shape as the
shipped fix, low risk.

## 3. Studio's dev-mode cold-mount (~1.1-1.4s dev / ~500ms prod)

`docs/src/pages/studio.astro` mounts `StudioShell` via `client:only="react"`
— zero SSR, and a large eager dependency tree (CodeMirror, Radix UI, cmdk,
fuse.js, all of Cadenza/Vetrina/TTS/tours) pulled in on first mount. In dev,
Vite serves ~180 separate unbundled module requests before the app can mount
(confirmed via a network-request trace). In production this collapses to a
handful of chunks and the mount time drops to ~500ms. Code-splitting
rarely-used Studio features (TTS settings, tours, ArchitectChat,
ExportOptionsPanel) out of the initial bundle remains unaddressed — see §6
for what WAS addressed (module-graph preloading, a different lever than
code-splitting).

## 3b. Studio LCP — a diagnosis the adversarial review disproved

A follow-up session ran Lighthouse (mobile: 4× CPU throttle, Slow-4G,
`throttlingMethod: simulate`) against `/studio/` and got Performance
0.47-0.50, LCP ~8.5s (desktop: 1.3-1.8s). The LCP element was plain
onboarding text ("New here? This is a sample deck…"), 95% "Render Delay."
The initial diagnosis: `client:only` + no loading skeleton, proposed fix:
reuse the landing page's `.live-host:not(.is-live)::after` CSS shimmer
(`landing.css:305-345`) on Studio's `DeckPreview` call sites.

**A red-team + Munger-inversion + independent-checker review (30 agents, 24
raw findings, 23 confirmed/partially-confirmed) dismantled this before any
code shipped:**

- The "mostly idle CPU, so it's not hydration cost" argument compared two
  incompatible Lighthouse timelines under `throttlingMethod: simulate`
  (`diagnostics.totalTaskTime` is raw/unthrottled; `long-tasks` timestamps
  are Lantern-simulated) — invalid either way.
- **The flagged LCP element was never `DeckPreview` at all.** It's a
  first-run-only welcome banner (`StudioShell.tsx:1953-1962`) gated on
  `welcomeOpen = !onboarded`, and `onboarded` reads `localStorage`.
  Lighthouse always runs a fresh profile, so it **always** hits the
  newcomer state — confirmed directly in a real browser (seeded
  `localStorage`, banner count 0 on reload) that returning users never see
  this element. The whole 8.5s number was measuring a page state real users
  essentially never encounter.
- The proposed fix wouldn't have worked even on its own terms: it targeted
  the wrong element (`DeckPreview`, not the banner), and even applied, a
  `content: ""` + `linear-gradient` pseudo-element is structurally
  ineligible to be a Chrome LCP candidate at all (only `url()` images/text/
  video qualify) — it could not have moved the metric it was built to fix.
- This repo's own `engineering/decisions/2026-06-15-docs-perf-gating-policy.md`
  already documents this exact mobile profile as noisy enough to flap red
  with no code change, moving verdicts to a nightly base-vs-HEAD relative
  comparison for exactly this reason — treating one ad hoc `lhci` run as
  ground truth (in either direction) repeats the mistake that policy exists
  to prevent.

**Decision: did not ship the skeleton fix.** See §6 for what shipped
instead, grounded in the user's original real complaint (1-2s, not the
newcomer-banner artifact's 8.5s) and a real unthrottled network trace rather
than another Lighthouse absolute reading.

## 3c. Playground had the same serialized-fetch bug as the landing page

Following up on §2's landing-page fix, the Playground's own engine bridge
(`docs/src/lib/playground-engine.ts`'s `createEngineBridge`) had the
identical theme-CSS-behind-engine-bundle serialization, via a 60ms
`ready()` poll rather than a promise chain. Fixed the same way: a
`prefetchTheme()` on the bridge, called alongside the idle-triggered
`ensure()` in `PlaygroundApp.tsx`. Verified via a real-browser Playwright
network trace (theme CSS and engine bundle firing at the same timestamp)
and an independent-checker pass (confirmed no other `createEngineBridge`
call site had the same unfixed pattern; flagged the frozen Drawing Board as
having the same underlying pattern, logged as
[#870](https://github.com/SlideWright/lattice/issues/870) per HARD RULE #18
since it's out of scope while frozen). Shipped in PR #869.

## 4. KaTeX bundle-weight finding — confirmed, quantified, NOT implemented

The user's instinct ("components with transformers should load dynamically,
on use") is already proven correct and already shipped for ONE dependency:
Mermaid. `docs/src/pages/index.astro`'s `needsMermaid = (s) =>
/```mermaid/.test(s)` pre-scans a deck's raw markdown and only injects the
Mermaid `<script>` into that slide's iframe when it's actually used — Mermaid
never enters the core `lattice-playground.js` bundle. Confirmed working
in production today.

**KaTeX does not get this treatment.** `lib/engine/math.js:20` does
`katex = require('katex')` unconditionally at module load; `lib/engine/
index.js:165` calls `installMath()` on every engine instance unless a caller
passes `math: false` (nothing in the docs site does). Since esbuild bundles
statically (`tools/build-playground.js`: `bundle: true, format: 'iife'`),
KaTeX's full weight ships in every render of every deck.

**Quantified via a controlled A/B build** (stub `math.js`'s `require('katex')`
to `null`, rebuild, gzip-diff against the committed bundle, then restore):

| | gzip size |
|---|---|
| WITHOUT katex | 504,096 bytes |
| WITH katex (committed) | 582,596 bytes |
| **delta** | **78,500 bytes (13.5%)** |

**Why this isn't a quick copy of the Mermaid fix.** Mermaid defers cleanly
because Mermaid rendering is a POST-render DOM pass — `render()` emits inert
placeholder markup, and the separately-loaded `mermaid.js` script (running
inside the already-displayed iframe) finds and converts `.mermaid` divs
asynchronously, after first paint. KaTeX's current integration has no
equivalent: `renderMath()` is called INLINE, synchronously, from within a
markdown-it rule during the single-pass parse, and its output — the
rendered HTML/MathML — is embedded directly into `render()`'s synchronous
return value. There is no "render placeholder now, upgrade later" step
already built for math, and building one is a real correctness risk: the
CLI/PDF-export path has NO browser DOM to progressively enhance in a static
PDF, so a post-render-upgrade design would make math render differently
between the browser preview (placeholder → upgrade) and the export path
(always fully rendered up front) — a genuine parity violation of HARD RULE
#1 ("render paths share one source of truth"), not just a UX quirk.

The safe design keeps `render()` fully synchronous everywhere (Node/CLI
untouched, still eager `require('katex')` — no network cost server-side) and
instead gates the BROWSER path: pre-scan a deck's markdown for math syntax
(mirroring `needsMermaid`), and if found, `await` loading a KaTeX provider
bundle BEFORE calling the still-synchronous `render()` — an async gate at the
orchestration layer, not inside the engine.

**Why this is bigger than it first looked: no shared choke point.** Unlike
`ensureEngine()` (the ONE shared gate every docs surface already calls before
touching `PG.render()`), `PG.render()` itself is called directly and
independently in at least 7 places, with no common wrapper:

- `docs/src/lib/single-slide-render.ts`
- `docs/src/lib/playground-engine.ts` (Studio)
- `docs/src/playground/drawing-board-render.js` (2 call sites)
- `docs/src/playground/theme-studio.js`
- `docs/src/playground/component-studio.js`
- `docs/src/components/studio/share-export.ts` (3 call sites)

Deferring KaTeX safely means adding the same pre-scan-and-gate to ALL of
them consistently — missing one means a math deck silently renders broken
or plain-text math on that one surface, exactly the cross-path inconsistency
HARD RULE #1 exists to prevent. That, plus the new build tooling required
(a separate `lattice-katex.js` provider bundle + a `math.js` fallback-provider
check), makes this a real multi-file shared-kernel change — maker-checker
territory, not a copy-paste of the Mermaid pattern into one file.

**Decision: logged, not implemented this session** (HARD RULE #18 — off the
path of the originating landing-page fix, real but not urgent, tracked
rather than rushed or silently dropped). Revisit as its own properly-scoped
piece of work: build the katex-provider bundle + `math.js` fallback once,
then wire the pre-scan gate into all 7 call sites (or refactor them onto a
shared render wrapper first, which would also pay for itself by giving
future engine-loading changes ONE choke point instead of 7).

## 5. Closed — red-team / Munger-inversion / independent-checker audit (14 findings)

The broader adversarial audit referenced above (5 parallel red-team lanes —
engine hot paths, docs bundle/hydration, build/CI tooling, component-
transform sweep, Studio live-preview path — each finding inverted and
independently verified) completed: 22 raw findings, 14 confirmed, all 14
implemented and shipped in PR #868, including the `mapSections()`
char-by-char scan fix flagged here (rewritten to `indexOf`-jumping, ~4x
faster, byte-identical output verified against real decks), the
`compare-code`/`journey` transform de-duplication onto shared kernels, the
`chart-family.js` depth-matching extraction, the `lib/runtime` redundant-
MutationObserver consolidation (verified via real-browser Playwright), and
the `build.js` background-step parallelization (§ Changed above, ~24%
faster). See PR #868 for the full list and each fix's verification.

## 6. Studio module-graph preloading — the fix that replaced the skeleton

Grounded in §3b's finding that the 8.5s Lighthouse number was a newcomer-
banner artifact, and in the user's ORIGINAL real complaint (1-2s, on
refresh — much closer to what a real connection would show), a real
unthrottled Playwright trace of a cold `/studio/` load found something
legitimate: even on localhost (near-zero RTT) the ~45-chunk dependency
graph resolves across ~6 sequential network "waves" (t≈21/40/108/116/
171/197ms), one per BFS depth-level, because `client:only`'s dynamic
`import()` hides the graph from Vite's static analysis — confirmed this
isn't `client:only`-specific: Workbench and Playground (`client:load`) get
zero automatic `modulepreload` either, and Astro has no built-in mechanism
for preloading an island's transitive dependency chunks.

**Fix:** `docs/astro.config.mjs`'s `chunkGraphPlugin` (a Vite plugin scoped
to the `client` environment) emits `dist/chunk-graph.json` from Rollup's own
`OutputChunk.imports`/`dynamicImports`/`viteMetadata.importedCss` in
`writeBundle` — sidesteps Astro's own `manifest: false` override for the
SSR/prerender build and its internal `.vite/manifest.json` (which it
deletes after use and only covers CSS). `docs/scripts/inject-modulepreload.mjs`
reads that graph after `astro build`, resolves each of Studio/Workbench/
Playground's island entry chunk's full TRANSITIVE STATIC-import set (BFS,
never following `dynamicImports` — those stay intentionally lazy, e.g.
Fabricate's `React.lazy` tab), and injects `<link rel="modulepreload">` for
the flattened set into the built page's `<head>`. The graph file is an
internal artifact, deleted once consumed — never ships. Wired into both
`npm run build` and `perf-collect.mjs`'s build (so the nightly perf watch
measures the same build a real deploy ships).

**Verified:**
- Real-browser trace: request scheduling collapsed from ~6 sequential waves
  to one parallel burst (46 requests starting within the same 20ms window).
- A/B measurement, same build, simulated 40ms-RTT connection (5 runs each):
  median time-to-mount **1823ms → 1496ms (~18% faster)**.
- All 43/19/27 injected chunk references for studio/workbench/playground
  verified to exist on disk; only the 3 intended pages touched; the other
  78 built pages unaffected.
- 14 new unit tests for the pure resolution/injection logic
  (`docs/scripts/inject-modulepreload.test.mjs`): transitive-import walking,
  diamond-dependency dedup, cycle safety, `dynamicImports` exclusion, CSS
  collection, idempotent re-injection, and graceful handling of a missing
  page/`</head>`.
- Full real-browser functional check on the finished build: Studio mounts,
  zero new console errors, live deck-preview iframe renders content.
- Root `npm test` (3157/3157) and docs `vitest` (1052/1052, incl. the new
  suite) pass; `npm run lint`, `typecheck`, and `build:check` all clean.

**Off-path finding, logged not fixed:** the srcdoc preview's `@font-face`
references 404 at `/<page>/fonts/*.woff2` instead of the hashed asset path
across all three app surfaces (pre-existing, confirmed present in traces
from earlier in this same investigation, unrelated to the module-graph
work) — filed as [#876](https://github.com/SlideWright/lattice/issues/876).

## 6b. Second adversarial pass — against the SHIPPED diff, not just the plan

The §6 fix above went through only a single independent-checker pass before
first landing (maker-checker tier), which caught 2 real bugs (entry chunk
excluded from its own preload set; missing-entry match silently skipped
instead of failing the build). Asked directly whether the full red-team +
Munger-inversion trio had run against the actual shipped code (not just the
earlier abandoned diagnosis), the honest answer was no — build-pipeline
work this novel warranted it per HARD RULE #25's own language, and a single
checker pass had under-invested relative to that bar. Ran the full trio a
second time, now against the real diff already open in PR #877 (5 lanes +
inversion, 20 findings, all 20 confirmed or partially confirmed, 0
refuted). Two were real and fixed before merge:

- **The blanket `dynamicImports` exclusion wasn't exhaustive.** Editor.tsx's
  `loadLintCore()` dynamically imports `authoring-core.generated.js` (the
  lint-kernel) for CodeMirror's `linter()` extension — which fires
  automatically shortly after every real Studio mount whenever build-time
  `lintVocab` resolves (true in every production load: `useRealLint =
  !!lintVocab?.names`, and `studio.astro` always passes a real one), not
  gated by user action like Fabricate's lazy tab. This ~78KB-source chunk
  got zero preload benefit despite loading unconditionally. Fixed: added an
  `eagerDynamicImportSuffixes` allowlist per `ENTRIES` item — dynamic-import
  targets matching an allowlisted suffix are walked (their own static
  closure merged in) despite being reached via `import()`, while every
  OTHER dynamic import (the actual conditional ones) stays excluded. A
  fixed-point loop handles an allowlisted chunk being reached only via a
  second-level dynamic import.
- **No end-to-end regression coverage for the two bugs the FIRST checker
  pass fixed**, and no structural guard against the pipeline (`chunkGraphPlugin`
  → `chunk-graph.json` → injector → built HTML) silently degrading on a
  future Astro/Vite/Rollup upgrade rather than failing loudly. Fixed:
  extracted `main()`'s per-entry logic into a testable `processEntry()` that
  now also does an end-to-end integrity check — every injected href must
  resolve to a real file in `dist/` — throwing (not returning a partial
  result) on either failure mode. 9 new tests cover the throw-on-missing-
  entry path, the integrity-check throw path, the eager-dynamic-import
  allowlist (including the fixed-point/second-level case), and a defensive
  `</head>`-occurrence-count guard added alongside (also independently
  found: a bare `.replace('</head>', …)` only touches the first match,
  safe today only because these 3 pages' dynamic content stays out of
  `<head>` — now asserts exactly one match rather than assuming it).

The remaining 18 findings were genuine but lower-severity/informational
(the `applyToEnvironment` Vite API being `@experimental`; `environment.name`
vs. the more idiomatic `environment.config.consumer` — both noted in a code
comment, not worth their own change; a chain of confirmations that
`astro build` always empties `dist/` first, so stale `chunk-graph.json`
isn't a real risk; the headline 18%-faster number being simulated, not
real-device, measurement — flagged per HARD RULE #23 and now called out
explicitly in the CHANGELOG entry pointing at the nightly perf-regression
watch as the ongoing real-world check). None blocked merge; see PR #877's
review thread for the full 20-finding breakdown.
