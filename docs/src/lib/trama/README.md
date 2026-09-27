# Trama

**Graph charts for slides: boxes placed by dagre, lines drawn by one solver, painted
in the deck's own fonts.**

Trama lays out a graph (shapes, nested groups, labelled lines) and routes every line as
an elbow that never runs through a box or along another line. It prices everything else
in one order: crossings first, then side middles and symmetry, then turns, then length.
Around that kernel sits a browser pipeline that measures a chart in the fonts it will be
drawn in, fits it to its box, lays it out (in a worker while an author types), and paints
it through a chart **adapter**.

It has **no dependencies**. dagre is passed in, never imported, and nothing in Trama
knows about Markdown, a grammar or a stylesheet: an adapter reads its own model and paints
its own markup. The design contract is
[`engineering/decisions/2026-09-27-trama-graph-chart-library.md`](../../../../engineering/decisions/2026-09-27-trama-graph-chart-library.md).
**See it run:** the [`/trama` demo](https://lattice.style/trama) drives this kernel live: type
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
is painted. Each round of the fit paints as it lands (a chart can take three), so a key
shows after one layout, and the last round's drawing is the one that stays. The first draw, and every draw without the flag, stays synchronous, so a page
being captured to PDF never captures a drawing in flight.
