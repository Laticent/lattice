---
status: in-progress
summary: Landing-page live-preview latency investigation. Two real sequential-fetch bugs found and shipped (engine-bundle prefetch was idle-deferred; theme CSS fetch was serialized behind the engine load) — Hero preview content-loaded time measured via real iframe.onload dropped from ~1.2-1.4s to ~0.9s on the production build. A third finding — KaTeX contributes ~78.5KB gzip (13.5% of the 582.6KB playground bundle) unconditionally, even to decks with no math — is confirmed and quantified but NOT implemented: deferring it safely requires touching 7 independent `PG.render()` call sites with no shared choke point, which is bigger than the shared-Mermaid-pattern win it first looked like. Logged here per HARD RULE #18 rather than rushed.
---

# Landing-page / Studio render-latency investigation

**Date:** 2026-07-10
**Status:** in-progress — two fixes shipped, one real finding logged (not
implemented), a broader red-team/inversion/checker audit still running at
time of writing.

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
handful of chunks and the mount time drops to ~500ms. NOT fixed — would
require code-splitting rarely-used Studio features (TTS settings, tours,
ArchitectChat, ExportOptionsPanel) out of the initial bundle. Scoped to the
red-team audit's build-tooling lane; no implementation decision made yet.

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

## 5. Open — red-team / Munger-inversion / independent-checker audit

A broader adversarial audit (5 parallel red-team lanes — engine hot paths,
docs bundle/hydration, build/CI tooling, component-transform sweep, Studio
live-preview path — each finding then inverted and independently verified)
was still running at the time of writing. Early, not-yet-verified signal:
multiple lanes independently flagged that `mapSections()` — the shared
depth-aware `<section>` walker used across the transformer registry, not
just the QR-card-specific `walkSections()` bug found earlier in this
session — has the same naive char-by-char scan pattern, run 3x per render.
If confirmed by the inversion/verify stage, this is a more central and
higher-value fix than the QR-card-only bug. Results to be folded into this
doc or filed as GitHub issues once the audit completes.
