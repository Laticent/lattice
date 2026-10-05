---
status: proposed
summary: Trama gains a third way to arrange boxes, a radial layout, and hub-spoke becomes its first adapter. The owner decided on 2026-10-05 that every node-and-line chart runs on Trama, and that Trama stays blind to what it lays out. So the generic geometry moves out of hub-spoke.transform.js into Trama: radial placement, straight connectors between circles, a two-ring arrangement and the collision-free label placer. Hub-spoke keeps everything that carries meaning. It all runs at build time; Trama's browser pipeline is not involved. Acceptance is every hub-spoke chart byte-identical before and after. The build ships in its own PR from main with the adversarial trio.
---

# Trama learns a radial layout; hub-spoke becomes its first adapter (2026-10-05)

**Status: proposed.** The owner decided the direction on 2026-10-05 (PR #2512). The
build is not started; it is tracked in `followups.d/2512-p1-build-trama-radial-layout.md`.

## 1. The decision

#2403 made Trama the graph-chart library
([`2026-09-27-trama-graph-chart-library.md`](2026-09-27-trama-graph-chart-library.md)),
and hub-spoke (#2396) shipped beside it with its own geometry. The owner set two rules:

1. **Every chart made of nodes and lines runs on Trama.**
2. **Trama does not know what it lays out.** It knows *how* to arrange boxes, never what
   they mean. This is already true: Trama has no idea what a flowchart is. It knows two
   arrangements (dagre's ranked rows and the reading-order grid), and a flowchart is an
   adapter that hands it boxes and paints what comes back.

So Trama gets a **third arrangement, radial**: one node in the center, the rest spread
around it, joined by straight connectors. Hub-spoke stops owning that geometry and becomes
an adapter that hands Trama sized circles and paints the result.

## 2. Two halves of Trama, and why this stays at build time

Trama has a **kernel** (sizes in, positions out, no browser) and a **pipeline** (the
browser half that measures in real fonts, fits the chart to its box and repaints while
typing). The kernel already runs at build time: `state-chart.adoption.js` calls it from
Node. The radial layout lives in the kernel half, and hub-spoke does not adopt the
pipeline. Measured on `main` at 300579e, the pipeline would buy hub-spoke nothing:

| | Hub-spoke today | With Trama's pipeline |
|---|---|---|
| Label width, real ÷ estimate (125 labels, Chromium) | 0.989 mean, **1.003 worst**: `--font-label` is monospace, so the estimate is exact | Measured in the real font |
| Layout cost | 1.0–1.3 ms a chart; 10–11.5 ms for `sized` and the 12-satellite chart; 22.9 ms for the demo deck's 8 (Node, warm) | Trama's demo deck, cold: 273 ms for 7 charts (§9 of the Trama note) |
| First draw | **0 ms in the browser**: static SVG in the first frame | Last chart drawn at 571 ms, cold |
| Lint | `crowding()` in `lib/core/hub-spoke-model.js` predicts every slide the solver cannot keep clean, and `test/unit/components/hub-spoke.test.js` fails any seed whose `meta.bad` has no crowding lint | No lint can promise what a browser pass draws |

## 3. What moves into Trama, and what stays

The test for each piece: does it need to know it is drawing a hub, a flow or a status?
If not, it is geometry and it moves.

| Moves into Trama (generic) | From `hub-spoke.transform.js` |
|---|---|
| **Radial placement**: n satellites on an ellipse at a given spread, spaced by arc length, with a clear cone at 12 and 6 o'clock and the special shapes for one, two and three satellites | `positions`, `ellipseWing`, `arcParam`, `baseCone`, `conesFor` |
| **Two-ring arrangement**: inner ring around the center, each outer ring fanned around its inner node | the geometry half of `layoutTiered` (its ring and wing search) |
| **Straight connectors between circles**: a constant-width band, its minimum visible length, and where an arrowhead's tip sits | `neckPath`, the tip and length math in `arrowsFor`, `headLen` |
| **Collision geometry**: rectangle against circle, band and rectangle, with a cheap bounding-box reject | `rectHitsCircle`, `rectHitsSeg`, `rectHitsRect`, `segDist`, `obstacleBox`, `obstacleHits` |
| **Label placement**: place each label box where it touches no node, connector, other label or stage edge, by priority, with leaders when it must; report what it cannot place as `unresolved` | `placeLabels`, `scorePlaced`, `leaderGeom`, `leaderBlocked` |
| **One arrowhead shape**, exported, used by Trama's own paint helpers and by the radial connectors | replaces `_chart-family/arrowhead.js` (hub-spoke is its only caller) and the inline arrowhead in `pipeline.ts` |

| Stays in hub-spoke (it carries meaning) | Why |
|---|---|
| Reading the slide; the hub's text fit; the hub ceiling and the hub : satellite ratio | Shared with the linter through `lib/core/hub-spoke-model.js` (HARD RULE #7). Hub-spoke passes Trama the resulting radii |
| Text sizes (`HS.textWidth`, `labelBlock`) | Measuring is the adapter's job in Trama's contract, as `measure()` is for the flowchart |
| Band widths per flow class, neck floors, halos, the sized-disc scale | They encode data. Hub-spoke passes them to Trama as plain numbers |
| The retry policy (narrower names, compact labels, the label column, the key band) | Which fallback reads best is an editorial choice for this chart |
| All SVG paint, `describe()`, the detail payload, colors as tokens | Trama returns geometry and never sees a class name or a token |

**Trama's contract stays the same shape.** The radial layout takes `{ center: {r}, nodes:
[{id, r}], edges: [{from, to, w}] }`, plus stage, spread and floors as numbers, and returns
centers, connector paths and placed labels. Like the existing kernel factory, the new
code closes over nothing, so it could still be serialized into a browser worker later.

## 4. How the build is proven

- **Byte-identical output.** Before the move, hash every hub-spoke `<svg>` from
  `examples/hub-spoke.md`, `hub-spoke.gallery.md` and the seeded fuzz in
  `hub-spoke.test.js`, in both normal and `mode: sketch`. After the move, every hash must
  match. The existing comments about V8 rounding (`ellipseWing`, the `placeLabels` sort
  key) are the known traps: esbuild must not reorder that arithmetic.
- **The serialization test** Trama already runs covers the new exports from `dist/`.
- **`checkTramaBoundary`** still passes: the radial code imports nothing outside Trama.
- **Verification tier 2**, the adversarial trio (HARD RULE #25), because it changes a
  shared library.
- **One PR from `main`** (HARD RULE #17), in commits: collision geometry and the label
  placer; radial placement, two rings and connectors; hub-spoke onto them, deleting the
  moved code and `_chart-family/arrowhead.js`.

## 5. What this does not do

- It does not put hub-spoke on Trama's browser pipeline (§2).
- It does not change how a hub-spoke chart looks. Byte-identical is the bar.
- It does not fix the `mode: sketch` text estimate. That is
  `followups.d/2396-p2-sketch-hub-value-reaches-disc-edge.md`, found while measuring
  this note: bold digits and symbols in the hand face print up to 1.233× their estimate,
  and the hub's `$120M` reaches the disc edge. Fix it before or after the move, not in it,
  so the byte-identical check stays meaningful.
