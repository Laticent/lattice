---
kind: library
name: Trama
order: 5
promise: Diagrams that lay themselves out, with lines routed around every box.
intro: Hand Trama a list of boxes and arrows and it gives back a finished drawing — every box placed, every line routed at right angles so it never cuts through a box or runs along another line. It also checks its own work and counts any flaw it couldn't avoid.
group: Drawing and parsing
inLattice: Draws the flowchart, state chart and hub-and-spoke slides.
useWhen: Your app draws boxes joined by arrows — a flowchart, a workflow editor, a state machine — and the lines have to stay clean when someone adds a box or drags one.
mark: /trama-mark.svg
facts:
  - { k: Package, v: '@laticent/trama' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: Anywhere JavaScript runs }
  - { k: Dependencies, v: None (bring dagre for branching graphs) }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/trama/README.md
    note: The model, every option, the radial kernel and the browser pipeline.
  - label: The types
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/trama/types.ts
    note: The model, the options, the geometry it returns and the ten quality counts.
  - label: A worked adapter
    href: https://github.com/Laticent/lattice/blob/main/lib/components/chart/flowchart/flowchart.layout.js
    note: How Lattice's flowchart reads, measures and paints through Trama.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-27-trama-graph-chart-library.md
    note: The design note, and the ranking every line is routed by.
---

## The problem

Take a checkout flowchart: *Order placed → In stock? → Pick & pack → Ship*, with a "no" branch out to *Back-order* that loops back. Any app that draws something like this has to decide two things: where each box goes, and what path each line takes.

Placing boxes is a solved problem — open-source layout tools do it well. **Drawing the lines well is the hard part:**

- **Straight lines from center to center** cut through any box in the way, and two lines between nearby boxes land on top of each other.
- **The curves a layout tool returns** are routed one line at a time, so they cross when they don't need to, and look hand-drawn rather than engineered.
- **Fixing collisions by hand doesn't survive an edit.** Add one box and every line needs redoing.
- **Fitting a fixed space is its own problem.** Lay out first and shrink to fit, and a long chain of boxes shrinks its text until nobody can read it.

## The idea

- **One solver for every line.** Trama routes all the lines *together*, as elbows — straight horizontal and vertical runs. A line doesn't pass through a box or share a run with another line, unless no clean path exists, and then Trama counts the flaw. Among the paths left, it prefers, in order: fewer crossings, lines meeting a box at the middle of a side, fewer turns, then shorter.
- **It grades itself.** Every result carries ten quality counts — lines through boxes, labels that collide, boxes that overlap, and so on. A clean drawing scores zero on all ten, so a program can tell a clean diagram from a messy one without a person looking.
- **It fits the space you have.** Tell it the size of the area — a slide, a card, a panel — and it tries the drawing both across and down and keeps whichever leaves the text larger. It can also wrap a long chain onto several rows, in reading order.
- **Bring your own positions.** When a user drags a box, or a chart axis fixes where boxes sit, `route()` redraws only the lines, by the same rules.
- **A second shape: radial.** A separate solver arranges circles on one or two rings around a center, joins them with straight bands, and places every label where it touches nothing.

Placing the boxes of a *branching* graph is the job of **dagre**, a widely used open-source layout library. Trama doesn't bundle it — you pass it in — and a simple chain needs no dagre at all.

## How to use it

Install the package:

```sh
npm install @laticent/trama
```

> Trama publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/trama`.

A three-box chain. It needs no dagre, because a chain lays out on a reading-order grid:

```ts
import { graphLayoutKernel } from '@laticent/trama';

const K = graphLayoutKernel();
const model = {
  shapes: [{ id: 'a', name: 'Order' }, { id: 'b', name: 'Pack' }, { id: 'c', name: 'Ship' }],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'paid' }],
};
// The size of each box, as you measured it in your own fonts.
const sizes = { a: { w: 96, h: 42 }, b: { w: 96, h: 42 }, c: { w: 96, h: 42 } };

const geo = K.layout(model, sizes, { stage: { w: 1072, h: 440 }, wrap: true, labelSizes: { 1: { w: 40, h: 16 } } }, null);
geo.nodes.a;            // where box "a" goes
geo.routes[0].points;   // the elbow path of the first line
geo.quality;            // ten flaw counts — all 0 here

// The user dragged the boxes? Route the lines only:
const moved = K.route(model, sizes, { a: { x: 0, y: 0 }, b: { x: 300, y: 150 }, c: { x: 0, y: 300 } });
```

For a graph that branches, pass dagre as the last argument: `{ layout: dagre.layout, Graph: dagre.graphlib.Graph }`.

| Call | What it gives you |
| --- | --- |
| `graphLayoutKernel()` | The layout solver. The same input always gives the same drawing |
| `K.layout(model, sizes, opts, dagre)` | Places every box and routes every line |
| `K.route(model, sizes, positions)` | Routes the lines between boxes you placed |
| `K.isChain(model)` | Whether this graph needs dagre at all, so you can skip loading it |
| `radialLayoutKernel()` | Circles around a center, with labels that touch nothing |

## Where else it fits

Trama is pure — numbers in, geometry out — so it runs in the browser, in a worker or on a server:

- **Workflow and process editors** — approval flows, build pipelines, no-code automation: lay out once, then re-route when someone drags a box.
- **State machine viewers** in developer tools, with long chains wrapped into rows.
- **Architecture and dependency diagrams**, with nested groups drawn as boxes behind their members.
- **Hub-and-spoke views** — a product and its integrations, a team and its partners — through the radial solver.
- **Diagrams rendered at build time**, on a server, with no browser involved.

## How Lattice uses it

Lattice draws three of its slide types with Trama. The **flowchart** and the **state chart** each supply a small adapter — read the slide, measure the boxes, paint the SVG — and Trama does the layout in between, live in the Studio (Lattice's editor) and the Playground (the try-it page on this site). For a PDF, the export runs Trama inside the page, so the capture never catches a half-drawn chart. The **hub-and-spoke** chart uses the radial solver.

## What it doesn't do

- **It doesn't read diagram text or draw pictures.** It starts from measured boxes and returns positions and paths. Parsing "A → B" and styling the final SVG are yours.
- **Branching graphs need dagre**, passed in. Without it, only chains and graphs with fixed positions lay out.
- **The browser helper doesn't sanitize.** If you use its optional page pipeline, your adapter must escape anything that comes from users.
- **The radial solver is tuned to one chart.** Its spacing is calibrated for Lattice's hub-and-spoke slide; a different radial chart may need its own solver.
