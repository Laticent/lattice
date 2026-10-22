---
origin: 2855
priority: P3
recorded: 2026-10-22
area: docs
severity: low
swimlane: docs/route-budget.json (studio chartKernelGz, chartKernelsGz)
source: https://github.com/Laticent/lattice/pull/2855
---

# Load the callout layer only for decks that use `@callout`

#2855 put `lib/components/chart/_chart-family/callout-layer.js` (11.9KB gzipped) in the closure of every chart kernel, so any deck with a chart downloads it, with or without callouts. The owner raised three Studio ceilings to ship that (D1 A). This item gives the bytes back to decks that never write a callout. Do it when the Studio route gets tight again; it is not urgent.

why now   — the kernels already load on demand (`docs/src/lib/ensure-charts.ts`), so the only waste left is this one shared file in decks with no callout. Measured: the largest kernel is 85.7KB gzipped and the shared layer is 11.9KB of the 10.9KB overage on the combined total.
where     — the 19 transforms import the layer directly; put a hook between them and it. `ensure-charts.ts` fills the hook in the browser when the deck text contains `@callout`; Node, the CLI and `lib/runtime` fill it with `require`. The render stays synchronous (it must), so the layer has to be loaded before `renderMarkdown`, as KaTeX is.
done when — a deck with no `@callout` loads no layer chunk and renders byte for byte as before; a deck with one renders identically to today; a failed layer load throws `ChunkLoadError` (a chart quietly drawn without its callouts is a confident wrong answer); `chartKernelGz` and `chartKernelsGz` drop by about 12KB and the ceilings come back down with `route-budget:rebaseline`.
evidence  — `diff -r` of every tracked deck before and after, the five callout demo decks at five shapes, and the route-budget table before and after, same machine.
verify    — the engine, the runtime and the CLI agree (HARD RULE #1). Touches the shared kernel, so it earns maker-checker (#25). Cost: about a day. The gain reaches only decks with no callouts, and a callout deck pays the same bytes plus one request.
