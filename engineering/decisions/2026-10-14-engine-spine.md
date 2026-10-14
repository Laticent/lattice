---
status: proposed
summary: >
  The docs site loads the engine as one IIFE and the Studio's lint code as a separate Vite
  chunk, both in the page's own window, and 59% of the lint chunk is code the engine already
  carries. Proposal: build the engine, the lint core and each chart kernel as entries of ONE
  esbuild ESM build with code splitting, so shared modules land in shared chunks once. The
  engine then loads chart kernels a deck names before its synchronous render (the KaTeX
  pattern), and the Studio loads lint after first paint. The CLI, the export pipeline and
  the public runtime do not change.
---

# The engine spine — one ESM build for everything that runs in the page

Owner-approved direction, 2026-10-14 (the payload-diet session): "ESM engine, shared chunks";
charts "engine-only, KaTeX pattern"; the 36 bundled highlight.js grammars stay bundled.

## 1. What we measured (main `82c7247`, gzip level 6)

| Piece | Realm | gz | raw |
|---|---|---:|---:|
| Studio island JS (126 chunks) | page | 668KB | 1.89MB |
| of which `authoring-core.generated` (lint) | page | 176KB | 521KB |
| Engine `lattice-playground.js` (after the one-markdown-it fix) | page | 496KB | 1.43MB |
| Runtime `lattice-runtime.js` | each preview iframe | 383KB | 1.10MB |

- 71 modules, 505KB of the lint core's unminified 853KB (59%), are also in the engine. Both
  run in the page window, so the page parses them twice.
- The engine and the runtime share 243 modules, but they run in DIFFERENT windows (the page
  vs. a `srcdoc` iframe). Each window parses its own copy no matter how the files are cut, so
  sharing a file between them would save download bytes only, and the service worker already
  caches both. Out of scope.
- Chart kernels are 178KB gz of the engine; the map basemaps are 61KB of that. A deck with no
  chart uses none of it.

## 2. What already rules on this, and how the proposal stays clear of it

- **Jul 19, front 1b (chart lazy-split) — CUT.** It put `import()` inside the registry. The
  CLI and export consume the registry synchronously, so charts would export as bullets, and a
  late chart load ran `chart-family`'s `innerHTML` replace after `mastheadLift`. This proposal
  leaves the registry's Node path untouched: the CLI keeps its static `require`s. In the
  browser the loading happens ABOVE `render()`, at the `renderMarkdown` chokepoint, the way
  KaTeX, fence grammars and plugin data already do. Render stays synchronous and never sees a
  chart arrive late.
- **Jul 11, B⑤ (basemaps out of the runtime) — REVERTED.** The runtime is the only map
  renderer in Export-to-Marp decks. This proposal does not touch the runtime.
- **Jul 19, front 3 (lean preview runtime) — CUT.** Not touched.

## 3. The design

### 3.1 One build, several entries

A new build mode in `tools/build-playground.js` (same plugins, same defines) runs esbuild
with `format: 'esm', splitting: true` and these entries, written to
`docs/public/playground/esm/`, staged under `/playground/v/<hash>/esm/` like every other
engine asset:

| Entry | Source |
|---|---|
| `engine.js` | `lib/playground/index.js` (still sets `window.LatticePlayground`) |
| `authoring.js` | the same stdin entry `tools/build-authoring-core.js` uses today |
| `chart-<layout>.js` | one per chart kernel in `chart-registry.generated.js` |

esbuild puts every module two entries share into a chunk both import. That IS the spine:
no hand-made list of shared modules, nothing to keep in sync.

The IIFE build stays, unchanged in shape, for the consumers that need one file:
`tools/export-chart-svg.js` (`page.addScriptTag`) and anything outside the docs site. The
docs site stops serving it.

### 3.2 Charts on demand, in the browser only

- The browser build swaps `chart-registry.generated.js` for a registry whose `KERNELS`
  table starts empty and fills through `registerChartKernel(layout, kernel)`. `LAYOUTS`,
  `FIGURE_CLASSES` and `PLUGIN` stay static (they are small and the dispatcher reads them).
  The swap is an exact resolved-path match, like `pluginDataStubPlugin`.
- Each `chart-<layout>.js` entry imports its kernel and registers it.
- The engine API gains `chartsNeeded(markdown) -> string[]`: every LAYOUTS token that
  appears as a whole word anywhere in the source. Over-inclusion costs one small fetch;
  under-inclusion would draw a chart as bullets, so the scan errs wide.
- `renderMarkdown` awaits `ensureCharts(PG.chartsNeeded(source))` next to
  `ensureKatexProvider` and `ensurePluginData`.
- Node never sees any of this.

### 3.3 Lint after first paint

- A new `docs/src/lib/load-authoring.ts` is the only door: `loadAuthoring()` returns one
  promise for the `authoring.js` entry, imported from the engine's versioned URL.
- The seven existing `import('@/playground/authoring-core.generated.js')` calls switch to it.
- The five static importers (`plugin-admission.ts`, `architect.ts`, `pane-pages.ts`,
  `slide-notes.ts`, `PrintOptionsPanel.tsx`) move to the loader. Code that needs lint
  before it has loaded either awaits it or, for `setBoundaryPluginsOff`, records the setting
  and applies it on load.
- The modulepreload exception for `authoring-core.generated.js` goes away.
- Tests keep importing the module directly through a Vitest alias to the built file.

### 3.4 Loading the engine

`ensureEngine(url)` switches from injecting a classic `<script>` to
`import(/* @vite-ignore */ url)`, keeping its singleton promise and its contract (it resolves
once `window.LatticePlayground` is set). The prefetch helpers emit `modulepreload` for
`engine.js` and its static chunks rather than `prefetch` for one file.

### 3.5 Measuring it

`check-route-budget.mjs`'s `engineJsGz` already follows static imports from the boot
entries, so its `ENGINE_ENTRY` pattern gains `esm/engine.js`. The per-chart entries are
reached only through `import()` and stay out of the count, as lazy code should.

## 4. Open questions for the review

1. Does anything on first paint call into lint SYNCHRONOUSLY, so that an awaited load
   changes behavior, not just timing?
2. Is a whole-word scan of the source a safe superset of the charts a render will dispatch?
   Think front-matter `class:`, `_class` directives, theme or plugin defaults that add a
   layout class, and the Compose/split paths that render slices.
3. Does the service worker's cache-first rule for `/playground/v/<hash>/` cover a directory
   of chunks, and does stale-deploy recovery still work when a chunk 404s after a deploy?
4. Which e2e specs route or count `lattice-playground.js` and need to follow the move?
