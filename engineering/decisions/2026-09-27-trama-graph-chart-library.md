---
status: shipped
summary: Trama (`@laticent/trama`) is the graph-chart library. It holds the layout kernel and route solver the flowchart shipped in #2385, and the browser pipeline that measures, fits, lays out (in a worker while typing) and paints. It is a TypeScript npm workspace in docs/src/lib/trama/, shaped like Cadenza, with a boundary gate. It never sees Markdown or Lattice's CSS. A chart supplies an adapter (read the model, measure, paint), and the flowchart and the state chart are its first two adapters. It ships in two PRs: the first holds Trama with the flowchart moved onto it (byte-identical) and the state chart's hooks in the kernel; the second moves the state chart onto it (state chart v2) and deletes the old pass and its own dagre call.
---

# Trama: one library for graph charts (2026-09-27)

**Status: shipped.** State chart v2 is on Trama (§5, as built). The history: The owner chose the shape (a workspace package, not a folder
in `_chart-family`), the name and the slicing (one PR, three commits) on
2026-09-27, after #2385 merged. Later that day the owner split the slicing: commits 1
and 2 ship as one PR, and commit 3 (state chart v2) ships as its own PR from `main`
after that merges. This note is the plan that PR builds. Every
"now" below means `main` at 133ac54.

## 1. Why

Two charts in Lattice lay out a graph, and they share nothing.

| | Flowchart (#2385) | State chart (v1) |
|---|---|---|
| Places boxes | dagre, through `graphLayoutKernel()` in `lib/components/chart/_chart-family/graph-layout.js` | its own `dagrePositions` in `state-chart.transform.js:2241-2463`, only when the machine branches; otherwise its grid or a CSS column |
| Draws lines | `solveRoutes`, one cost over every line | dagre's own polylines, curved, or its column router |
| While typing | layout cache, one draw per keystroke, a worker in the Studio | no cache, no worker |
| Checks its model | `sanitizeModel` (HARD RULE #22) | none (v2 closed that followup, `2385-p2-state-chart-pass-census`: its adapter has its own `sanitizeModel`) |

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

## 4. The kernel's new hooks (for the state chart) — built in commit 2

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

**As built.** `layoutOnce` takes its boxes from dagre, from `opts.grid` (a line
count), or from `opts.positions` (each shape's centre). The last two use a
nine-method stand-in for graphlib's `Graph`, so they need no dagre. Everything after
placement, the solver included, is unchanged. `opts.wrap` adds the grid candidates
in `layoutFresh` under v1's rule and constant (`WRAP_GAIN` 1.12): the simplest
candidate wins, fewest lines and then the stage's own direction, unless a more-wrapped
one sets the type 12% larger. A graph is a chain when no two shapes share a rank,
ranking only its forward lines in authored order, so back edges and skips keep a chain
a chain. A graph that branches keeps dagre's layout as its one-line candidate. Each
grid candidate is bounded by its boxes first, and only those that could still be
picked are routed. `route(model, sizes, positions, opts)` is the fixed-positions entry.
The start and end kinds are drawn by the pipeline's `outline`, and lines end on them as
on a circle. Without `wrap` nothing changed: the flowchart's 21 figures still paint
byte-identical SVG, and its bench counts are unchanged (35 calls, 16 hits, 25 routed,
8 bounded). `test/unit/trama/kernel-hooks.test.js` holds the grid, the no-dagre path
and the router to the never-rules.

## 5. What the state chart looks like after (state chart v2)

The owner settled the open questions on 2026-09-27.

- **The grammar.** The flowchart's, as §14 of the flowchart note decided: a line
  names its target (`-approve-> Approved`), not `` `event => 3` ``; `:::token`
  tints become slots or status words. A codemod migrates the repo: 69 slides in
  21 files (counted 2026-09-27; §14 counted 64 in 20), 441 transitions, and 26
  tints by hand. Every migrated slide is re-rendered, light and dark, and looked
  at.
- **The lines.** Elbows from the router instead of v1's own routes. This is the
  visible change, and it is the point: v1's lines cross boxes and each other, and
  v2's cannot (the router's never-rules).
- **Line labels sit ON their line** (the owner's call), cut into it, as the
  flowchart's do, so the router's label seating and its quality counts cover
  them. v1 set them beside the line.
- **Numbered badges stay on by default** (the owner's call): each state shows its
  position in the list, which is the machine's reading order. A span word turns
  them off. Transitions no longer target the numbers; they name the state.
- **`curved` stays** (the owner's call), as generously rounded corners on the
  router's elbows: the same soft look, with the router's guarantees. It is a paint
  setting, so the flowchart can take the word too. 4 slides use it.
- **A blockquote is hidden detail, in both charts: the house style** (the owner's
  call). A `>` under a shape or a state is a description the slide never shows: it
  appears when the shape is hovered or tapped in Present, Practice and Preview, and
  it is narrated and folded into the speaker notes. It needs no tag; hidden is what
  a blockquote means. This replaces two things: the state chart's prose bullets
  (a bullet under a state now makes a group, as in the flowchart; the codemod turns
  the existing ones into blockquotes), and the flowchart's visible note cards on a
  dotted tether, which retire. Both charts use the chart family's existing detail
  substrate (`data-mark` plus an inert `<template class="chart-detail">`), not a new
  one.
- **Kept:** the inline chips variant (untouched: it is not a graph), start and end
  markers, status words, the `data-anima-role` hooks the motion system reads, and
  narration. The narrator reads the model, so it is unchanged in substance and
  moves to the new model shape.
- **Gained:** the layout cache, one draw per keystroke, the Studio worker, and a
  sanitized model (closes the P2 census follow-up).

**As built (state chart v2).** The pieces, and where each decision above landed:

- **One parse.** `parseStateMachine` in `lib/core/state-graph-facts.js` runs the flowchart
  grammar with the lead words `start` and `end`, numbers the states in list order and
  stamps their roles through `inferRoles`. The transform and the narrator both call it, so
  the picture and the voice read one machine (HARD RULE #1). The narrator's own Markdown
  port of the v1 grammar is deleted. The grammar now folds a status word's case, the chart
  family's rule, for both charts.
- **The adapter.** `lib/components/chart/state-chart/state-chart.layout.js`: sanitize the
  model, add the markers (an entry dot before the first state with a line to the start
  state; one end ring after the last, with a line from every end state), measure the
  harness (tiles with their badges, labels, composite titles) and paint the tiles in the
  chart family's gradient with the status accent. Lines and composite boxes go through two
  new Trama painters, `ctx.lines` and `ctx.groups`, which the flowchart now paints with
  too: its figures without a blockquote paint byte-identical SVG before and after.
- **The grid holds markers in place.** A start marker hugs the far side of its grid column
  and an end marker the near side, so the dot sits beside its state, not a column's width
  away.
- **Hard faults before type in the wrap pick.** The grid candidates now compete on type
  only among those with the fewest hard faults (a line through a box, an overlap), as the
  direction choice already ranked them; when every grid the floor kept has one, dagre's
  layout (already routed) joins the pick. Found on the 36-state stress fixture, where a
  grid set the type 4 times larger with 55 lines through boxes.
- **No dagre, still a drawing.** The pipeline no longer bails when dagre is absent: a chart
  that wraps lays out on the grid, and anything that needs dagre keeps its tiles, marked
  `data-<prefix>-nolayout`. `graphLayoutKernel().isChain(model)` is the predicate, and the
  export's gate (`state-chart.adoption.js`) asks it of each figure's model as the adapter
  builds it, so the gate and the drawing call the same code.
- **Four router rules the state chart's review found**, each held on both charts:
  - *A join is a never-rule.* One line's corner or end lying on an unrelated line, or a run
    lying ON it, read as a transition that is not there (a 6-unit overlap on the stress
    deck's incident machine). The solver's `sharesRun` now refuses it and `sharedRuns`
    counts it. On the 1,000-chart fuzz corpus, `main` left 132 joins on 40 charts; none
    remain, and crossings rose from 10 to 39 (clean X's). The ratchet in
    `graph-layout.test.js` moved with that justification.
  - *A labeled self-loop stands clear of its box.* A single loop reserved no room, so a
    `tb` loop's label was seated half over its own state and painted under it.
  - *Markers do not grow and sit in line.* The end ring was grown for its fan-in like a
    shape, so lines ended on an invisible 40-unit box; and dagre left a start dot a few
    units off its state's axis, which the router drew as a hook. A marker now keeps its
    size and moves across the flow into line with its one state when that spot is free.
  - *A wrapped line holds two real states.* A three-state chain with its markers wrapped
    into a second line of one state and the ring.
- **The key is shared.** Both charts build their key with
  `lib/components/chart/_chart-family/graph-key.js`, and words that paint the same tone
  share one entry (the state chart's v1 legend rule, now the flowchart's too).
- **Codemod.** 62 slides in 18 decks migrated mechanically (432 transitions), each verified
  by re-parsing the result with the real grammar (same states, statuses, roles, transitions
  and details), plus the 5 fenced examples, which regenerate from the manifest. The 22
  `:::` tints moved by hand: a pass tint on a transition became the heavy main path, a
  fail tint `:dashed`, a tint on a state its status. The tint deck became
  `examples/state-chart-paint.md`. Explicit label breaks (`\n`, `<br>`) are gone: a label
  sits on its line, and 2 labels lost their break.
- **Lint.** `findFlowchartIssues` reads state-chart slides with the same grammar (so a
  near-duplicate target name is named), and names the retired v1 spellings
  (`state-chart-v1-transition`, `state-chart-v1-tint`) with their fix.
- **Wrapping is Trama's, not the state chart's (owner, 2026-09-27: "Trama should support
  wrapping and do it efficiently").** Both charts ask for `wrap`. Three rules make it
  cheap and safe:
  - *Cheap.* Every candidate is sized from its boxes first, a ceiling on its type (lines
    only add size). dagre's layout is routed only when its ceiling could still win, and
    the pick is often proven from the others' ceilings after routing one grid. Same
    answers on 1,916 recorded calls; the state chart's stress deck went from 77 routing
    passes to 30 (1,152 to 533 ms).
  - *A legible fan keeps its shape.* A branching graph whose dagre layout is clean and at
    least 0.8 scale (`WRAP_BELOW`) keeps it. Measured on the flowchart demo, the grid
    "won" two fans at 0.94 and 1.05 and read worse; the charts it rescues sat at 0.35
    to 0.64. It changed one state-chart slide, for the better (the long-labels slide in
    `state-chart-branching`).
  - *Reading order is the author's.* A chain row (`A => B => C`) now lists its shapes in
    that order; before, every shape leading a row came first, so a chain written on one
    row wrapped out of order. A single connection never moves its target, and a chart
    with no chain row keeps its order exactly. Two flowchart demo slides written with
    chain rows changed their dagre tie-breaks (Checkout, Release train).
  - *Sticky while typing* (owner, 2026-09-28: "make things faster without jank"). A live
    redraw lays out the wrap the last full search chose, instead of searching again; laid
    out directly, that grid is byte-identical to the search's pick on every recorded call
    (20 of 20). Rows hold while typing (an edit the pinned grid cannot hold, or a
    direction change, searches at once), and a key shows sooner (real Studio, same
    machine: an 11-state state chart 280–325 -> 158–202 ms, the flowchart of it 230–241 ->
    193–214 ms). The full search runs 300 ms after a live redraw's last round lands, and the chart takes its
    choice, so the drawing at rest matches the export; content that wants other rows
    reflows then, once (the owner chose this over keeping the rows until reload). Tried
    and dropped on the way, measured: a smaller router budget while typing (drafts cost
    crossings and the refine was itself a jump, and it made the flowchart settle 2.5x
    later), and a flowchart-sized state tile (0.7x -> 0.9x, but typing got no faster).
  - *The pin covers dagre too, and the pause search has its own worker* (owner,
    2026-09-28: "no jank, no tech debt, no broken windows"). A per-key timeline on the real
    Studio found the tail: half-typed text (`- -f`) parses as a chart whose search picks
    dagre, so it had no pin and every key searched again (3-4 rounds of 100-400 ms), and a
    key typed during the pause search queued behind it. A dagre pick is now pinned
    (`lines: 0`), byte-identical pinned on every recorded call (11 of 11; grids 28 of 28),
    and the pause search runs in a second worker. At 600 ms a key: an 11-state chart's key
    lands in 150 / 214 ms (median / p90; was 178 / 417), a composite chart's in 242 / 423
    ms (was 366 / 500), and no chart state goes unpainted.
  - *The drawing at rest is a function of the text and the stage.* The pause search is
    now the SETTLE: it fits from a cold start (k 1), as a paste or an export does, and
    paints only its last round. A live redraw had started its fit from the scale it
    remembered and could settle on another fixed point, so every typed path drew a
    different width than a paste, on a 5-state chart too. Measured on the real Studio:
    paste, reload, key by key and bursts at 50 / 120 / 600 ms a key (each also nudged)
    now give one drawing on three charts (30 of 30), and the CLI export's viewBox matches
    each. This closes `2385-p3-live-layout-not-deterministic`.

## 6. The three commits, in two PRs

Commits 1 and 2 are the first PR. Commit 3 is the second PR, cut from `main` once
the first merges, so the codemod over 69 slides gets its own review.

1. **`feat(trama): the graph-chart library; the flowchart moves onto it`.**
   Package, build, gate, README; the kernel and pipeline moved; the flowchart
   as the first adapter. **Byte-identical** is the bar: every flowchart in the
   demo deck, the gallery and the typing deck paints the same SVG markup before
   and after (a hash per figure), the unit suites pass unchanged, and the
   flowchart bench tier's counts are unchanged.
2. **`feat(trama): start, end, the wrapping chain and a fixed-positions router`.**
   The four hooks, with unit tests, and quality counts at zero with the new kinds
   in the fuzz corpora. The flowchart is unaffected, pinned by the same hashes.
3. **`feat(state-chart): v2 on Trama`.** The adapter, the codemod, the 69
   slides, `dagrePositions` and the v1 pass deleted, the adoption gate reading
   Trama, the sanitizer and census rows, docs, and the demo deck. The
   blockquote-as-detail house style lands here for both charts, with `curved`
   available to the flowchart; the flowchart's note cards retire, so the flowchart
   demo deck changes in this commit too.

## 7. How it is verified

- **Trama (commit 1).** Byte-identical flowchart output, as above. The
  serialization test on the built `dist/`. The boundary gate. The Studio typing
  measurement re-run, with the same numbers as #2385.
- **State chart v2 (commit 3).** Every state-chart slide rendered light and dark
  and reviewed; quality counts on every one; the bench, before and after; the
  Studio typing measurement on a large state chart.
- **Review tier.** The first PR gets maker-checker: it moves code and adds hooks,
  pinned by byte-identical output. The second PR gets the adversarial trio (HARD
  RULE #25): a codemod over 69 slides and a new house style for both charts.

## 8. What this does not do

- It does not publish Trama to npm. No workspace library is published yet
  (`followups.d/2360-p3-publish-workspace-libraries.md`).
- It does not move the flowchart grammar into Trama. The grammar is Lattice
  authoring; Trama starts at measured boxes.
- It does not change what a flowchart looks like.
- It does not draw gantt dependencies. It exposes the router they will need.

## 9. Amendment: the pipeline draws once, after the fonts load

Added after #2403 merged (`followups.d/2403-p2-trama-cold-load-passes.md`, now closed).

**What changed.** The pipeline lays nothing out while `document.fonts.status` is
`loading`. One waiter per document draws when the faces land, or at a 2 s deadline
if one never does, and again when it finally lands. A capturing host calls
`document.__latticeGraphFlush` (one entry per chart kind) to draw at once; the CLI
export does so after each font settle, so no PDF depends on promise order. The fit
and type-floor fixed point runs up to 4 rounds, and from the third round its guess
is the secant step through the last two.

**Why.** On a cold load every chart was drawn at install, again at
`DOMContentLoaded`, and again at `fonts.ready`, and the first two were measured in
fallback fonts and thrown away. Measured in Chromium, 8 cold loads each, 7 charts
per deck, medians:

| | layouts | paints | layout ms | last chart drawn |
|---|---|---|---|---|
| typing deck, before → after | 32 → 13 | 21 → 7 | 804 → 405 | 1,288 → 744 ms |
| demo deck, before → after | 28 → 10 | 21 → 7 | 585 → 273 | 1,013 → 571 ms |

**The secant step is what keeps the type floor.** The typing deck's 17-shape chart
asks for a floor lift of 1, 1.63, 1.90, 2.05, 2.13 and on towards 2.25, each step
about 0.57 of the one before. The old cold load got there by accident: its
fallback-font draws left a remembered scale behind for the real one. Drawn once
from 1 and stopped at 3 rounds, it painted its smallest text at 10.2 px against the
11 px floor. With the secant step it settles in 4 rounds at 11.0 px.

**What it changes on the page.** Every chart that settles in two rounds draws the
same bytes as the old pipeline did when it drew in the page's own fonts (13 of 14
figures across the two decks, hashed per figure). Against the old COLD load,
three demo-deck charts move by under 1% of their fit (a scale of 0.9829 becomes
0.9834, for example), because the old result depended on which fallback draws had
run first; the typing deck's big chart moves from a fit of 0.4461 to 0.4440.
