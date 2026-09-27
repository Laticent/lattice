---
status: in-progress
summary: Trama (`@laticent/trama`) is the graph-chart library. It holds the layout kernel and route solver the flowchart shipped in #2385, and the browser pipeline that measures, fits, lays out (in a worker while typing) and paints. It is a TypeScript npm workspace in docs/src/lib/trama/, shaped like Cadenza, with a boundary gate. It never sees Markdown or Lattice's CSS. A chart supplies an adapter (read the model, measure, paint), and the flowchart and the state chart are its first two adapters. It ships in one PR of three commits: Trama with the flowchart moved onto it, byte-identical; the state chart's hooks in the kernel; the state chart moved onto it (state chart v2), with the old pass and its own dagre call deleted.
---

# Trama: one library for graph charts (2026-09-27)

**Status: in progress.** The owner chose the shape (a workspace package, not a folder
in `_chart-family`), the name and the slicing (one PR, three commits) on
2026-09-27, after #2385 merged. This note is the plan that PR builds. Every
"now" below means `main` at 133ac54.

## 1. Why

Two charts in Lattice lay out a graph, and they share nothing.

| | Flowchart (#2385) | State chart (v1) |
|---|---|---|
| Places boxes | dagre, through `graphLayoutKernel()` in `lib/components/chart/_chart-family/graph-layout.js` | its own `dagrePositions` in `state-chart.transform.js:2241-2463`, only when the machine branches; otherwise its grid or a CSS column |
| Draws lines | `solveRoutes`, one cost over every line | dagre's own polylines, curved, or its column router |
| While typing | layout cache, one draw per keystroke, a worker in the Studio | no cache, no worker |
| Checks its model | `sanitizeModel` (HARD RULE #22) | none (`followups.d/2385-p2-state-chart-pass-census.md`) |

`dagre.layout` is called in three places: the flowchart's kernel, the state
chart's `dagrePositions`, and the state chart's Node-side `machineBranches`
(`state-chart.adoption.js:98`). Every later graph chart would add a fourth
copy. The owner asked for one library, with no duplication, held to a higher
standard than a folder of scripts.

## 2. What Trama is, and what it is not

**Trama lays out and draws graphs, given measured boxes.** Three parts:

1. **The kernel.** The layout and route solver from `graph-layout.js`: dagre
   placement, the title band, `solveRoutes`, the cache, the direction skip,
   the quality counts. Pure: numbers in, geometry out. dagre is passed in,
   never imported.
2. **The pipeline.** The browser half, lifted out of `flowchart.layout.js`. It
   reads a figure, asks the adapter to measure, solves the fit and the type
   floor in one draw, lays out (in a worker when the host asks for live layout),
   asks the adapter to paint, and writes the SVG. It owns the redraw signature,
   the per-chart fit memory, the newest-wins queue, the old drawing held while a
   layout is in flight, and the observers.
3. **Paint helpers.** Geometry to SVG path data: rounded elbows, arrowheads,
   lines cut under labels, outlines for the box kinds, the line end moved onto
   an outline. They return strings; the class names and data attributes come
   from the adapter.

**Trama knows nothing of Markdown, Lattice's grammar, tokens or CSS classes.**
The flowchart grammar (`lib/core/flowchart-grammar.js`) stays in Lattice. So do
the component's harness markup, its styles and its sanitizer. A chart is an
**adapter**: a function that returns

```ts
interface GraphAdapter {
  selector: string;                 // which figures this chart draws
  attr: string;                     // the data-attribute prefix, e.g. 'fc' → data-fc-drawn
  parts(fig): Parts | null;         // the scale box, the harness, the svg, the port
  readModel(fig): Model | null;     // parse AND sanitize; null skips the figure
  measure(ctx): Measured;           // sizes from the harness, and the kernel's input
  paint(geo, measured, ctx): string;// SVG markup, painted children only
}
```

**Serialization is the hard contract.** The CLI export ships the pipeline as
source in a bootstrap `<script>`, and the Studio worker is built from the
kernel's source. So the kernel factory, the pipeline and every adapter factory
each close over nothing, exactly as `graphLayoutKernel` does now, and they are
passed to one another as arguments:
`installGraphPass(doc, kernelFactory, adapterFactory, opts)`. A test runs each
through `new Function(fn.toString())` from the built `dist/`, not the source,
because the bundler's output is what ships.

## 3. The package

The shape Cadenza settled (`2026-07-08-library-shape-cadenza-vetrina.md`):

- `docs/src/lib/trama/`, an npm workspace named `@laticent/trama`, listed in the
  root `package.json` `workspaces`. TypeScript source, `strict`.
- `exports`: `types` and `import` → source for the docs toolchain;
  `require` → `dist/index.cjs` for the engine. `sideEffects: false`.
- `tools/build-trama-lib.js`: esbuild (the house bundler) to `dist/index.cjs` and
  `dist/index.mjs`, `tsc --emitDeclarationOnly` for types, `--check` for
  freshness. Registered in `tools/build.js` like Cadenza.
  **The esbuild target stays modern enough that no helper is injected** (no
  `__spreadValues` or similar outside a function), because an injected helper
  is a free variable that breaks serialization. The serialization test above
  is what catches a change here.
- `checkTramaBoundary` in `tools/check-ownership.js`: every import resolves
  inside the folder. Trama has no dependencies; dagre arrives as an argument.
- `README.md` with a 60-second start, like Cadenza's.
- Engine callers `require('@laticent/trama')`: `lib/runtime/index.js`, the
  emulator's bootstrap, both chart components, and the bench.

**What moves and what stays.** `graph-layout.js` moves into Trama and is deleted
from `_chart-family`. The generic half of `flowchart.layout.js` moves; the
flowchart adapter (harness selectors, `sanitizeModel`, notes as extra nodes,
spacing presets, paint markup) stays in `lib/components/chart/flowchart/`. The
state chart's `state-chart.transform.js` loses its browser pass and becomes a
build-time transform plus an adapter.

## 4. The kernel's new hooks (for the state chart)

The state chart has four things the kernel lacks. §14 of the flowchart note
names them; none was built in #2385.

1. **Start and end markers.** A start dot and an end bullseye become node kinds
   (`start`, `end`), small fixed sizes and never labelled. The router treats them
   as boxes. The grammar words `start` / `end` in a state's span create them.
2. **Ordinal badges.** Paint-only. The adapter measures the badge into the node's
   size, so the kernel needs nothing but the bigger box.
3. **The wrapping chain.** A machine with no branches reads best as a chain that
   wraps into rows. It becomes a kernel **candidate**: for a graph that is a
   single path, the kernel also lays it out as a reading-order grid, and the fit
   keeps whichever sets the type larger, as it already does for `lr` against
   `tb`. The grid needs no dagre, so a chain-only machine still ships without
   the dagre script (`machineBranches` keeps that meaning and reads the same
   predicate from Trama instead of restating it).
4. **A fixed-positions router.** `route(boxes, edges, opts)`: `solveRoutes`
   without dagre, for a chart whose positions are fixed by an axis. Nothing uses
   it in this PR. It is exposed because it is the grid candidate's router too.
   Gantt's dependency arrows (parsed today, never drawn) are its first outside
   user, as a later follow-up.

## 5. What the state chart looks like after (state chart v2)

- **The grammar.** The flowchart's, as §14 of the flowchart note decided: a line
  names its target (`-approve-> Approved`), not `` `event => 3` ``; `:::token`
  tints become slots or status words. A codemod migrates the repo: 64 slides in
  20 files, 458 transitions, and 25 tints by hand. Every migrated slide is
  re-rendered, light and dark, and looked at.
- **The lines.** Elbows from the router, with rounded corners, instead of dagre's
  curves. This is the visible change, and it is the point: v1's curves cross
  boxes and each other, and v2's do not (the router's never-rules).
- **Kept:** the inline chips variant (untouched: it is not a graph), numbered
  badges, start and end markers, status words, the `data-anima-role` hooks the
  motion system reads, and narration. The narrator reads the model, so it is
  unchanged in substance and moves to the new model shape.
- **Gained:** the layout cache, one draw per keystroke, the Studio worker, and a
  sanitized model (closes the P2 census follow-up).

## 6. The three commits

1. **`feat(trama): the graph-chart library; the flowchart moves onto it`.**
   Package, build, gate, README; the kernel and pipeline moved; the flowchart
   as the first adapter. **Byte-identical** is the bar: every flowchart in the
   demo deck, the gallery and the typing deck paints the same SVG markup before
   and after (a hash per figure), the unit suites pass unchanged, and the
   flowchart bench tier's counts are unchanged.
2. **`feat(trama): start, end, the wrapping chain and a fixed-positions router`.**
   The four hooks, with unit tests, and quality counts at zero with the new kinds
   in the fuzz corpora. The flowchart is unaffected, pinned by the same hashes.
3. **`feat(state-chart): v2 on Trama`.** The adapter, the codemod, the 64
   slides, `dagrePositions` and the v1 pass deleted, the adoption gate reading
   Trama, the sanitizer and census rows, docs, and the demo deck.

## 7. How it is verified

- **Trama (commit 1).** Byte-identical flowchart output, as above. The
  serialization test on the built `dist/`. The boundary gate. The Studio typing
  measurement re-run, with the same numbers as #2385.
- **State chart v2 (commit 3).** Every state-chart slide rendered light and dark
  and reviewed; quality counts on every one; the bench, before and after; the
  Studio typing measurement on a large state chart.
- **Review tier: the adversarial trio** (HARD RULE #25) on the finished PR: a
  new public library, a shared kernel and a codemod over 64 slides.

## 8. What this does not do

- It does not publish Trama to npm. No workspace library is published yet
  (`followups.d/2360-p3-publish-workspace-libraries.md`).
- It does not move the flowchart grammar into Trama. The grammar is Lattice
  authoring; Trama starts at measured boxes.
- It does not change what a flowchart looks like.
- It does not draw gantt dependencies. It exposes the router they will need.
