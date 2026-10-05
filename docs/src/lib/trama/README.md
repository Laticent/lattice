# Trama

**Graph charts for slides: boxes placed by dagre or round a center, lines drawn by one
solver, painted in the deck's own fonts.**

Trama lays out a graph (shapes, nested groups, labelled lines) and routes every line as
an elbow that never runs through a box or along another line. It prices everything else
in one order: crossings first, then side middles and symmetry, then turns, then length.
Around that kernel sits a browser pipeline that measures a chart in the fonts it will be
drawn in, fits it to its box, lays it out (in a worker while an author types), and paints
it through a chart **adapter**.

A second kernel, the **radial kernel**, arranges circles round a center instead: one ring
or two, straight bands, and every label placed where it touches nothing. It needs no dagre
and no browser, so a chart runs it inside its own render (`@laticent/trama/radial`; see
[The radial kernel](#the-radial-kernel)).

It has **no dependencies**. dagre is passed in, never imported, and nothing in Trama
knows about Markdown, a grammar or a stylesheet: an adapter reads its own model and paints
its own markup. The design contract is
[`engineering/decisions/2026-09-27-trama-graph-chart-library.md`](../../../../engineering/decisions/2026-09-27-trama-graph-chart-library.md).
**See it run:** the [`/trama` demo](https://lattice.style/trama) drives the graph kernel live: type
rows, flip the direction, wrap a chain, drag a box and watch `route()` weave the lines again.
**Not yet on npm:** no workflow publishes the workspace libraries today
(`followups.d/2360-p3-publish-workspace-libraries.md`).

## 60-second start

```ts
import { graphLayoutKernel } from '@laticent/trama';

const K = graphLayoutKernel();
const geo = K.layout(
  {
    shapes: [{ id: 'a', name: 'Order' }, { id: 'b', name: 'Pick', shape: 'diamond' }, { id: 'c', name: 'Ship' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'in stock' }],
  },
  { a: { w: 96, h: 42 }, b: { w: 120, h: 70 }, c: { w: 96, h: 42 } }, // measured sizes
  { stage: { w: 1072, h: 440 }, labelSizes: { 1: { w: 70, h: 16 } } },
  globalThis.__latticeDagre, // your dagre build: { layout, Graph }
);
// geo.nodes, geo.groups, geo.routes[i].points, geo.routes[i].labelAt, geo.quality
```

`layout()` tries both directions unless `opts.dir` pins one, and keeps whichever sets the
type larger on `opts.stage`. Same input, same output: there is no randomness, and results
are cached per kernel.

### The reading-order grid, and routing fixed boxes

- **`opts.wrap: true`** also tries laying the shapes out in authored order on one or
  more lines, every line running the same way, the way a state machine's chain reads.
  The kernel finds the candidate that sets the type largest, then takes the simplest
  candidate (fewest lines, then the stage's own direction) within 12% of it. So a
  wrapped layout wins only when every simpler one sets the type more than 12% smaller; a graph that branches keeps dagre's layout
  unless the grid beats it by that margin. The grid needs **no dagre**: pass `null` and a
  chain still lays out. `geo.lines` says how many lines it chose. Groups are never gridded.
  It is cheap: every candidate is first sized from its boxes alone (a ceiling on its type,
  since lines only add size), dagre's layout is routed only when its ceiling could still
  win, and the pick is often proven from the others' ceilings after routing one grid. A
  clean chain costs one routing pass, whether or not dagre is loaded.
  A graph that branches keeps dagre's layout when it is clean and at least 0.8 scale: a
  legible fan-out keeps its shape, and the grid only rescues a layout dagre has shrunk.
  Both graph charts ask for `wrap`.
- **`K.route(model, sizes, positions, opts)`** routes lines between boxes you have already
  placed (each shape's centre), with the same solver and never-rules, for a chart whose
  positions an axis fixes. No dagre. The positions set the boxes' places RELATIVE to each
  other: the drawing comes back moved so its top-left sits at the margin, so read the
  offset from any one box (`positions.a.x - geo.nodes.a.cx`). A shape with two or more
  self-loops gets room for them and can shift a few units. Positions must be finite
  numbers.
- Shape kinds **`start`** and **`end`** (a filled dot; a ring around a dot) are ordinary
  small boxes to the kernel; the pipeline's `outline` draws them. On the grid they hug the
  shape they lead into or out of.
- **`K.isChain(model)`** says whether a graph lays out on the grid with no dagre: no groups,
  two or more shapes, no two shapes on one rank. A host can ask it before loading dagre.

## The radial kernel

A second kernel, `radialLayoutKernel()`, arranges circles round a center: one ring
(`solveStar`) or two, each inner node's children fanned on the outer ring (`twoRings`).
Bands join the circles straight, and `placeLabels` puts every label where it touches no
circle, band, other label or stage edge, and counts what it cannot place in `unresolved`.
Like the graph kernel it knows nothing of what it lays out: a chart passes what its marks
mean as numbers (`halo`, the extra radius round a flagged node; `floor(i)`, the band length
a node needs; `centerAt`/`centerCeil`, how large the center may grow). Hub-spoke is its
first adapter. It needs no dagre and no browser, so it runs inside the engine's render
wherever that runs (the CLI, the build, the Studio's in-browser engine), never on the
pipeline below.

**Which parts are general.** The paint paths, the collision tests, `placeLabels`, `leader`
and `ring` are general. `solveStar` and `twoRings` are hub-spoke's solver lifted whole, and
their constants are calibrated to the envelope hub-spoke's linter certifies, so changing
them changes hub-spoke's output. A second radial chart that does not fit them gets a solver
designed from both charts rather than another flag.

```ts
import { radialLayoutKernel } from '@laticent/trama';

const R = radialLayoutKernel();
const n = 5;
const { T, Rh, bad } = R.solveStar({
  n, W: 544, half: 96, pad: 4, tall: false, cone: R.conesFor(n, false)[0], minNeck: 24,
  rs0: 18, rsMin: 9, labelW: Array(n).fill(60), halo: Array(n).fill(0), floor: () => 24,
  radiiAt: (rs) => Array.from({ length: n }, () => ({ r: rs, clamped: false })),
  centerAt: (rs) => rs * 2, centerCeil: (r) => Math.max(...r) * 3,
});
// T.pts[i] is node i's center, T.r[i] its radius, Rh the center's radius; bad is empty when every floor held.
const band = R.bandPath(0, 0, Rh, T.pts[0][0], T.pts[0][1], T.r[0], 10); // SVG path data
```

Paint helpers return path data only (`circlePath`, `annulusPath`, `bandPath`, `bandHeads`);
the chart owns every class, color and attribute. The design and the measurements behind
running it at build time are
[`2026-10-05-trama-radial-layout.md`](../../../../engineering/decisions/2026-10-05-trama-radial-layout.md).

## The pipeline and adapters

In a browser, `installGraphPass(document, graphLayoutKernel, myAdapter)` draws every
figure the adapter selects, and redraws it when its inputs change. An adapter is a
function returning:

| Member | What it does |
|---|---|
| `selector`, `figure`, `attr` | which figures to draw, and the data-attribute prefix (`'fc'` gives `data-fc-drawn`) |
| `parts(fig)` | the scale box, the measuring harness, the `<svg>` and the port the chart is fitted into |
| `readModel(fig)` | parse **and sanitize** the model: it came from the page |
| `signature(fig, harness)` | the inputs, besides size and fonts, that change the drawing |
| `measure(model, ctx)` | sizes from the harness, and the kernel's input |
| `paint(model, measured, geo, ctx)` | the SVG's painted children, as markup |

The context carries the unit scale and the helpers an adapter paints with: `rectL`,
`textLines`, `outline`, `grow`, `toOutline`, `cut`, `rounded`, `head`, `r1`, `esc`, and two
whole painters both charts use: `lines(geo, edges, kindOf, { cls, radius, labelFont })` (every
routed line, ends on the outlines, cut under labels and titles, with heads and labels) and
`groups(list, geo, titleFont, cls)` (the group boxes and their titles).

Without dagre the pipeline still draws a chart that wraps, on the grid; one that needs dagre
keeps its tiles, marked `data-<attr>-nolayout`.

**Serialization is the contract.** The kernel, the pipeline and every adapter may each be
shipped as `fn.toString()` source (in a page's bootstrap script, or to build the worker),
so each one closes over nothing: they reach one another only as arguments. The
flowchart's adapter, `lib/components/chart/flowchart/flowchart.layout.js`, is the worked
example; the state chart's, `lib/components/chart/state-chart/state-chart.layout.js`, adds
markers to the kernel's input and asks for the grid (`wrap`).

## When it draws

A chart is measured in its own fonts, so the pipeline lays nothing out while
`document.fonts.status` is `loading`. The adapter's harness shows meanwhile, and one
waiter per document draws every chart when the page's faces have loaded. A face that
never loads cannot strand a chart: the waiter also draws at a 2 s deadline (the bound
`settleFonts` gives the runtime's boot sweep), and draws again when the faces do land.
On a cold load of a 7-chart deck this took the flowchart from 32 layouts and 21 paints
to 13 and 7.

A host that captures the page calls `document.__latticeGraphFlush`: one function per
chart kind (keyed by `attr`), each drawing its charts at once, fonts or not, and doing
nothing for a chart already drawn with the same inputs. The CLI export calls every entry
after it has loaded the page's fonts, so no PDF can capture a chart still waiting.

A chart's first draw has no remembered scale to start its fit from, so it starts at 1 and
solves the fit and the type floor as one fixed point (up to 4 rounds, each a layout).
From the third round the next guess is the secant step through the last two rounds, which
lands a chart the fit shrinks hard in 4 layouts instead of 7 or more. A chart that
settles in two rounds draws exactly as before.

## Live layout

When the host document's `<html>` carries `data-lattice-live-layout` (a preview someone
types into), a redraw of a chart already drawn at that position runs in a worker built
from the kernel's source plus the page's `lattice-dagre` script. The figure keeps its last
drawing, marked `data-<attr>-pending`, until the answer arrives, and only the newest edit
is painted. Each round of the fit paints as it lands (a chart can take several), so a key
shows after one layout, and the last round's drawing is the one that stays. The first draw, and every draw without the flag, stays synchronous, so a page
being captured to PDF never captures a drawing in flight.

**Sticky wrap.** A chart that asks for `wrap` remembers the wrap its last full search
chose (the line count and direction), per chart position like the fit. A live redraw lays
out that one grid (`wrap: false`, `grid`, `dir`, `grow: false`), which gives the same
drawing the search would when the search keeps it, without the bounds passes, dagre's
ceiling or a second routing. So a chart's rows hold while an author types, unless an edit
leaves the pinned grid unable to hold the shapes (then that key searches), or the author
changes the chart's direction (a pin holds only for the direction it was chosen under).
Once the author pauses (300 ms after a live redraw's last round lands), the full search runs once and the chart
takes its choice, so the drawing at rest is the one every export makes; when the content
now wants other rows, that is the one reflow, at the pause. A pinned grid that can no
longer hold the shapes falls back to the search. A chart whose search picked dagre's
layout pins that (`lines: 0` and its direction), and a live redraw lays out dagre in that
direction with `wrap: false`; half-typed text often parses as such a chart, and a chart
with groups always is one. The pause search runs in a second worker, so a key typed while
it runs never queues behind it (a worker cannot cancel a job already running, and a
search a newer key made stale is dropped by its token).

**The drawing at rest is a function of the text and the stage.** That search is the SETTLE:
it fits from a cold start (k 1), as a paste, a reload or an export does, and paints only its
last round, so its early rounds never flash a chart at the wrong type floor. Before it, a
live redraw started its fit from the scale it remembered, and a fit started elsewhere could
settle on another fixed point: the same text drew four ways depending on how it was typed.
Now paste, reload, key by key and bursts at 50, 120 and 600 ms a key give one drawing on
every chart measured, and the CLI export draws the same viewBox. A different chart at the
same position (the next slide's) fits from a cold start too.

**With no worker, the same settle.** A host that blocks blob workers, a worker that died
mid-session, and the moment before dagre's script loads all draw a live redraw in place,
from the fit the chart remembers. That redraw schedules the same settle: 300 ms after it,
the chart fits again from a cold start on the page's thread, so the drawing at rest matches
the export there too. A keystroke never pays for the cold fit, and a newer draw at that
position drops the pending settle by its token.
