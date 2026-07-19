---
status: in-progress
summary: >
  Cold first-load and refresh of the docs Playground/Studio were still ~7.5s (LCP/FCP)
  despite the July perf program — because that program MASKED cold LCP with a static shell
  and optimized the WARM typing path, while leaving the actual cold work untouched. The
  screenshot that triggered this was a shell-UNCOVERED cold path (a non-boot built-in deck),
  so the mask didn't apply and the real cost showed. Deep analysis + a fresh adversarial trio
  (HARD RULE #25) found the biggest single passenger is highlight.js's FULL 192-language build
  — ~1.05MB raw / ~64% of the 1.65MB preview bundle — of which 90%+ is exotic grammars a deck
  never uses. SLICE 1 (SHIPPED): a preview-only esbuild alias swaps it for the 37-language
  `common` build → preview bundle 1.65MB→733KB raw (−56%) / 509KB→249KB gz (−51%), export path
  unchanged, zero visual regression on shipping decks (verified). The trio KILLED the other three
  proposed fronts (chart lazy-split breaks the sync render()/export contract; live CSS prune was
  already owner-rejected and would run css-tree on the cold path; lean runtime repeats the reverted
  map-basemap trap). The biggest UNTOUCHED lever — deferring React+CodeMirror editor hydration —
  is queued as slice 2. Owner direction: REAL work-reduction only, no more masking.
---

# Preview bundle — halve cold load by shipping highlight.js `common`, not the full build

**Date:** 2026-07-19 · **Status:** slice 1 SHIPPED; program open
**Trigger:** live PERFORMANCE overlay on the Studio showed **LCP 7651ms / FCP 7559ms**
(both red) with **TTFB 33ms** (green) and **TOTAL REBUILD 5074ms / FRAME REBUILD 2714ms**
on a real deck. Owner: *"multiple rounds of performance improvements yet this is my
experience… insufferable on first load and refresh. I suspect the issue is how we designed
the system — multiple large things loaded instead of small fragments of what is acutely
needed. Load what is needed, load everything else in the background."*

This continues `2026-07-11-preview-performance-diagnosis.md` (the July program, A–D) and
the `2026-07-15-*` render-loop notes. **Read that diagnosis first** — this doc is the
cold-start sequel it explicitly deferred.

---

## 1. Why the prior rounds didn't fix the felt problem

The July program did two real things and one thing that *looks* like a fix but isn't:

- **Optimized the WARM typing path** (patch path → ~2ms edits; memoized `cssFor` → RENDER
  141→9ms; frame-aligned render loop). Genuine, and it holds.
- **MASKED cold LCP** with an SSG instant-shell + returning-visitor snapshot — it paints a
  *static* first slide over a still-booting app, so the LCP *needle* reads ~370–700ms on the
  covered cohorts. **It does not make the app interactive sooner, and it has holes.**

The screenshot is the **Studio** showing a **non-boot built-in deck** (`Board · Q3 2026`).
The shell's replay gates on `snap.deckId === bootId` + matching palette/mode, so a non-boot
deck **falls through to a raw cold boot** — the mask doesn't apply, and the real ~7.5s shows.
This is why the numbers were never *felt*: the prior wins were warm-path + a mask with
uncovered cohorts (playground newcomer, dark-mode newcomer, any non-boot deck, hard reload).

**The cold critical path, measured / evidenced (in order of cost):**

1. **Download + parse the 509KB-gz engine bundle** `lattice-playground.js` — **64% of it is
   highlight.js's full 192-language build** (`lib/engine/index.js:39` `require('highlight.js')`,
   bundled eagerly by `tools/build-playground.js`).
2. **Hydrate the React 19 + full CodeMirror editor island** (9 language packs, autocomplete,
   lint) — the diagnosis's own named LCP/TTI gate; **untouched by any front to date.**
3. **First render** ("TOTAL REBUILD 5074ms") — dominated by **FRAME 2714ms = re-parsing 563KB
   of unscoped CSS + the runtime inside the iframe.** O(1) in slide count (the 19 slides are a
   red herring); masked on covered surfaces, real on uncovered ones.

**Refresh** specifically: content-hashed assets are immutably cached, so download ≈ 0 — what
repeats is **JS parse + React/CodeMirror re-hydration + the iframe's 563KB CSS reparse.** Byte
reduction helps the parse third; hydration and CSS reparse are separate levers.

## 2. The finding — what's actually in the 1.65MB preview bundle

Measured via an esbuild metafile (`tools/build-playground.js` entry = `lib/playground/index.js`):

| Passenger | Size (min-in-bundle) | Share | Acutely needed? |
|---|---|---|---|
| **highlight.js — FULL 192 languages** | **1,054.7 KB** | **~64%** | ~52KB-gz (`common`, 37 langs) |
| chart-family kernels | 262 KB | ~16% | 0 for a no-chart deck |
| markdown-it + `entities` tables | ~151 KB (`entities` alone 82KB) | ~9% | most |
| qrcode | 22.8 KB | ~1% | 0 unless qr/wifi/contact/video |
| everything else (engine/core/transformers/forms) | < 7 KB each | — | yes |

Mermaid (the library), DOMPurify, KaTeX, and d3/function-plot are **already** correctly out of
this bundle (lazy / stubbed). **Nothing inside the bundle is lazy** — zero `import()`, the
registry statically requires all 16 transformers. The single dominant, near-useless passenger
is the exotic half of highlight.js: `1c.js` 156KB, `mathematica.js` 121KB, `isbl.js` 82KB,
`gml.js` 60KB, `sqf.js` (Arma) 42KB, … the top ~10 exotic grammars alone are ~560KB.

## 3. The proposal, and what the adversarial trio did to it (HARD RULE #25)

A first design proposed four fronts: (1a) hljs→common, (1b) lazy-split chart kernels,
(2) demand-scope the CSS per used component on the cold path, (3) a lean preview-only runtime.
Red team + Munger inversion + independent checker, run in parallel against the real code,
**killed three of the four** — the record, because a rejection with its reason is worth as much
as the shipped slice:

| Front | Verdict | Reason (evidence) |
|---|---|---|
| **1a. hljs full→`common`** | ✅ **SHIP** | −253KB gz *inside the full bundle* (checker built both variants). Red team + checker independently confirmed every language in every shipping deck (`test/integration/baseline-decks/`, `examples/`, `lib/components/**/*.docs.md`) resolves in `common` → zero visual regression; a miss degrades to monochrome via the existing `hljs.getLanguage()` guard (`lib/engine/index.js:145`). **Must be a preview-scoped alias, not a source edit** — the require is on the CLI/PDF-export path. |
| **1b. chart lazy-split** | ❌ **CUT** | The registry (`lib/transformers/registry.js:153`) is **synchronous** and consumed synchronously by the CLI/export (`lattice-emulator.js`, no `await`). A dynamic `import()` → charts render as **raw `<ul>` bullets in exported PDFs**; a late load also runs `chart-family`'s destructive `innerHTML` replace *after* `mastheadLift`, destroying the masthead cell (`chart-family.js:26-31`); plus a live-edit flash. Only safe as a browser-only pre-pass with eager export — not worth it; chart code isn't the FCP gate. |
| **2. live CSS demand-scope** | ❌ **KILL as framed** | Already owner-rejected in the July diagnosis (§B①/§C, "Do NOT build per-component dynamic loading"). Running `player-prune.js` at cold render needs css-tree (448KB) + a rendered DOM + a 2× computed-style gate → plausibly makes cold FCP **worse**. Components aren't self-contained (112 `section.<name>` rules live in BASE tiers). `2c` (drop KaTeX/hljs-theme from the base sheet) hits `dist/lattice.css`, which `lattice-emulator.js` inlines for export → **export regression**. If ever revisited: build-time `out.css` prune via native CSSOM, never touching `dist/lattice.css`. Narrow remaining surface (rare 585ms write-regime + shell-uncovered cold render). |
| **3. lean preview runtime** | ❌ **CUT** | "Engine-baked hosts don't need the runtime" is **false** — `imageAdaptive`, `settleFonts`, `probeSectionOverflow`, and the cqi geometry fallback are browser-measure-only and needed on baked DOM (`lib/runtime/index.js`, `registry.js:89-95`). Repeats the reverted map-basemap trap (B⑤). Already prefetched off the critical path; the shell paints before it lands → ~0 felt payoff. |

**The trio's biggest positive finding:** the largest *untouched* lever is **item 2 above — the
React + CodeMirror editor hydration.** Nothing proposed touches it, and it gates both cold
time-to-interactive and refresh. That is slice 2 (below), and it needs its own design pass —
it's an unproven hypothesis touching the Studio's core island, not a mechanical dep swap.

## 4. What shipped (slice 1)

A preview-only esbuild alias in `tools/build-playground.js`, beside the KaTeX-stub precedent:

```js
alias: {
  katex: '…/lib/engine/katex-browser-stub.js',
  'highlight.js': '…/node_modules/highlight.js/lib/common.js', // preview bundle only
}
```

**Scoped to the preview bundle by construction.** `lib/engine/index.js` still
`require('highlight.js')` (the full build) for the Node CLI/PDF/PPTX export path, so exported
artifacts highlight every language and **no export bytes change → no export sign-off gate.**
Only the browser preview trades exotic-language color for the bytes. (Nice side effect: this
aligns the code with its own comment at `lib/engine/index.js:132`, which already *claims* the
singleton ships `common`.)

**Measured (same machine, before→after):**

| | raw | gz |
|---|---|---|
| before | 1,651,635 B | 508,885 B |
| after | 732,826 B | 248,703 B |
| **delta** | **−897 KB (−56%)** | **−254 KB (−51%)** |

**Verification (HARD RULE #23 — real artifact from the named surface):**
- End-to-end through the **actual built bundle** in jsdom: `window.LatticePlayground` boots,
  `render()` of a `python` fence still emits `class="hljs-…"` spans and a `<code>` block. ✓
- `common` build highlights python/typescript (spans), `registerLanguage('mermaid')` succeeds,
  `getLanguage('mathematica')` → `undefined` (graceful monochrome, no throw). ✓
- Built artifact contains python/js/ts/yaml/bash/sql/json/markdown; mathematica/isbl/1c/armasm
  gone. ✓
- Gates: `playground:check` (no stale output), `biome check` (1104 files clean), **3879/3879
  unit tests pass.** ✓
- **Not verified from here (#23):** real iOS Safari cold-load wall-clock; the felt LCP/FCP
  improvement wants a `npm run perf` Lighthouse-mobile artifact on the deployed build. The
  bundle-size delta is the durable, reproducible evidence; the browser wall-clock is the
  follow-up measurement.

**Why not `npm run bench` (HARD RULE #19):** this is a *preview-bundle-size* change, not an
engine-render change. The Node engine path keeps the full build and is byte-for-byte unchanged,
so `bench`/`baseline.json` measure an untouched path by design. The reproducible same-machine
before/after IS the bundle-size table above (the axis the diagnosis §C established for bundle
work, distinct from the engine bench).

## 5. Open — the program from here (owner direction: REAL reduction, no more masking)

1. **Slice 2 — defer/code-split the React + CodeMirror editor hydration.** The biggest untouched
   cold-TTI + refresh lever (§3). Needs a focused design pass (does deferring CodeMirror break the
   SSG shell-dismissal timing, which depends on first render?). Highest leverage; unproven.
2. **Cheap, orthogonal:** an `entities/lib/decode`-only path (~15–25KB gz); move asset delivery to
   Cloudflare Pages (brotli + `immutable`, which GitHub Pages can't set — compounds slice 1 on
   every refresh for near-zero eng).
3. **Explicitly parked (do not re-open without new evidence):** live per-component CSS prune,
   chart lazy-split, lean runtime — see the trio verdicts in §3.

**"Load the rest in the background"** (the owner's model) is honest for hljs — idle-prefetching
the full grammars would let a Playground user pasting an exotic language get color on the *next*
render — but the trio noted it does NOT retro-heal an already-painted slide and can contend with
typing, so it's a minor optional add, not the strategy. The strategy is: **less on the critical
path.** Slice 1 removes 254KB-gz of it; slice 2 goes after the hydration cost behind it.
