---
status: shipped
summary: Trama has a third way to arrange boxes, a radial layout (`radialLayoutKernel`), and hub-spoke is its first adapter. The owner decided on 2026-10-05 that every node-and-line chart runs on Trama, and that Trama stays blind to what it lays out. So the generic geometry moves out of hub-spoke.transform.js into Trama: radial placement, straight connectors between circles, a two-ring arrangement and the collision-free label placer. Hub-spoke keeps everything that carries meaning. It all runs at build time; Trama's browser pipeline is not involved. All 3,636 hub-spoke outputs hash identical before and after (#2512).
---

# Trama learns a radial layout; hub-spoke becomes its first adapter (2026-10-05)

**Status: shipped in #2512.** The owner decided the direction on 2026-10-05, asked for a
prototype first, then the build. Both landed in the same PR as this note.

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
an adapter that hands Trama sized circles and paints the result. The kernel is
`docs/src/lib/trama/radial.ts`; `hub-spoke.transform.js` went from 1,336 lines to 811.

## 2. Two halves of Trama, and why hub-spoke stays off the browser pipeline

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
| **The filled arrowhead** on a band, tip set back off the circle it points at | `arrowsFor`'s math and `_chart-family/arrowhead.js` (hub-spoke was its only caller; deleted). The pipeline's own `head()` in `pipeline.ts` stays separate: it rounds to one decimal and orders its points differently, so merging the two would change every flowchart's bytes |

| Stays in hub-spoke (it carries meaning) | Why |
|---|---|
| Reading the slide; the hub's text fit; the hub ceiling and the hub : satellite ratio | Shared with the linter through `lib/core/hub-spoke-model.js` (HARD RULE #7). Hub-spoke passes Trama the resulting radii |
| Text sizes (`HS.textWidth`, `labelBlock`) | Measuring is the adapter's job in Trama's contract, as `measure()` is for the flowchart |
| Band widths per flow class, neck floors, halos, the sized-disc scale | They encode data. Hub-spoke passes them to Trama as plain numbers |
| The retry policy (narrower names, compact labels, the label column, the key band) | Which fallback reads best is an editorial choice for this chart |
| All SVG paint, `describe()`, the detail payload, colors as tokens | Trama returns geometry and never sees a class name or a token |

**The contract, as built.** `solveStar(spec)` takes the node count, the stage, label widths,
`halo[i]`, `floor(i)` and three sizing callbacks (`radiiAt`, `centerAt`, `centerCeil`), and
returns centers, radii, the center's radius and the floors it broke. `twoRings(spec)` takes
child counts, radii, halos and floors per node and returns a `geometry` function and a
`search` over ring proportions and a ladder of center sizes. Hub-spoke keeps its retry
policy around both. The kernel's broken-floor code for a short outer band is `outer-neck`;
hub-spoke translates every code the kernel reports through one table (`FLOOR_WORDS`,
`outer-neck` to its own `twig`), and an unknown code throws, so a renamed code in Trama fails
hub-spoke's tests instead of quietly changing its `meta.bad`. Like the existing kernel
factory, the new code closes over nothing, so it could still be serialized into a browser
worker later.

**General primitives, one adapter's solvers.** Not everything that moved is equally
general, and the README says so. The paint paths, the collision tests, `placeLabels`,
`leader` and `ring` are general. `solveStar` and `twoRings` are hub-spoke's solver lifted
whole: the cone table, the three-node Y, the 0.5 shrink step and the spacing constants are
calibrated to the envelope hub-spoke's linter certifies (`crowding()` in
`lib/core/hub-spoke-model.js`), so changing them changes hub-spoke's bytes. A cycle diagram
would not fit them: it has no center, wants a node at 12 o'clock and even angles, curved
arcs between neighbors and labels inside its nodes. When a second radial chart arrives, it
gets a solver designed from both charts
(`followups.d/2512-p3-second-radial-chart-redesigns-the-solvers.md`), not a flag on this one.

## 4. How the build was proven

- **Byte-identical output.** Before the move, a script hashed 3,636 hub-spoke outputs:
  every figure from `examples/hub-spoke.md` and `hub-spoke.gallery.md` in the monospace
  and the sketch face, and seeds 1–600 of `hub-spoke.test.js`'s fuzz generator on all
  three stages in both faces (each hash covers the SVG and the layout `meta`). A prototype
  in JavaScript matched all 3,636 first; the TypeScript kernel, built through esbuild into
  `dist/`, matched all 3,636 after. The one field that changed is a new `crowded` flag on
  branch label items, the kernel's name for the extra lanes `branch` used to switch on;
  the comparison strips it.
- **No chart nouns in the kernel's code.** `test/unit/trama/radial.test.js` splits every
  identifier in `radial.ts`'s code into words and fails on any of hub-spoke's nouns (hub,
  spoke, branch, leaf, twig, flow, status, alarm, satellite). Injecting `hubCount` makes it
  fail. It checks words, not policy: a constant tuned for hub-spoke passes it, which is what
  the paragraph on solvers in §3 is for.
- **Serialization.** `test/unit/trama/serialization.test.js` rebuilds `radialLayoutKernel`
  from the built `dist/` source and checks it reaches no bundler helper.
- **`checkTramaBoundary`** passes: the radial code imports nothing.
- **Verification tier 2**, the adversarial trio (HARD RULE #25), because it changes a
  shared library. The checker re-proved the identity with its own harness (1,200 models over
  every stage, both faces, tiered, keyed, sized and flow cases, plus the real decks through
  the engine with the old transform swapped in): all identical. The red team found none either,
  over 6,000 more fuzz seeds, 480 adversarial models, 72 forced broken-floor cases and
  bundled, minified and browser-target builds. What the trio did change:
  - **A lazy, narrow require.** A top-level `require('@laticent/trama')` stopped the whole
    engine loading wherever Trama does not resolve, and the barrel's CommonJS build carried
    the graph kernel and the pipeline into hub-spoke's code package (+63%). Hub-spoke now
    requires `@laticent/trama/radial`, a second entry built by `tools/build-trama-lib.js`, on
    its first slide: the engine loads without Trama, and the package grows 2% (110,752 to
    113,087 bytes). Publishing the main package now needs Trama shipped with it, recorded on
    `followups.d/2360-p3-publish-workspace-libraries.md`.
  - **Floor codes cross one table** (`FLOOR_WORDS`, §3), so Trama's words never leak into
    `meta.bad` unannounced.
  - **The kernel refuses bad input** (a NaN size, a column with one edge, a zero-length
    band) instead of reporting it placed.
  - **The word guard reads tokens with TypeScript's scanner** after the red team slipped
    six spellings past a regex (`HUB_R`, `hubs`, a `//` inside a string).
  - **A stale-build check**: the radial tests fail when a Trama source is newer than
    `dist/`, since engine callers load the uncommitted build.
  - **The general/one-adapter split** in §3 and the README, from the inversion lens.

## 5. What this does not do

- It does not put hub-spoke on Trama's browser pipeline (§2).
- It does not change how a hub-spoke chart looks: every output is byte-identical.
- It does not unify the arrowhead with the pipeline's (§3); that waits for a change
  that already moves flowchart bytes (`followups.d/2512-p4-one-arrowhead-for-trama.md`).
- It does not make `solveStar` or `twoRings` general (§3).
- It does not fix the `mode: sketch` text estimate. That is
  `followups.d/2396-p2-sketch-hub-value-reaches-disc-edge.md`, found while measuring
  this note: bold digits and symbols in the hand face print up to 1.233× their estimate,
  and the hub's `$120M` reaches the disc edge. Fix it before or after the move, not in it,
  so the byte-identical check stays meaningful.
