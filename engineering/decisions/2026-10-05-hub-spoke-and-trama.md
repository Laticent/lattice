---
status: blocked
# blocked on the owner's pick: stay (recommended), share one paint helper, or migrate.
summary: Hub-spoke should stay off Trama, the graph-chart library, pending the owner's pick, because Trama would give it nothing it lacks. Measured on the demo deck, its label estimate already matches the real face within 1% (except under `mode: sketch`, a separate fix). Its layout costs 1–12 ms per chart at build time and nothing in the browser. Trama's elbow router cannot draw a radial spoke. A migration would trade a static SVG the linter can predict for a browser pass that draws after the fonts load. Recommendation: stay, with three named triggers for revisiting.
---

# Hub-spoke and Trama: stay, or adopt the pipeline? (2026-10-05)

**Status: blocked on the owner's pick (§5).** The question came from #2396's
continuation brief: #2403 made Trama "the graph-chart library"
([`2026-09-27-trama-graph-chart-library.md`](2026-09-27-trama-graph-chart-library.md)),
and hub-spoke (#2396) draws nodes and edges without it. Every number below was measured
on `main` at 300579e against `examples/hub-spoke.md` (8 charts) and
`hub-spoke.gallery.md` (10 charts).

## 1. The answer

**Recommendation: stay.** Nothing is duplicated today, and each thing Trama offers
either is not needed here or would make hub-spoke worse. The table below says why, one
row per thing.

| What Trama gives | What hub-spoke has today | Measured | Verdict |
|---|---|---|---|
| **Placement**: dagre, plus the reading-order grid | Closed-form radial placement (`positions()`, cones per satellite count) | No dagre call anywhere in hub-spoke | Nothing to share. A hub with spokes is not a ranked graph |
| **Routing**: `solveRoutes`, orthogonal elbows that avoid boxes | Straight, filled, constant-width bands from hub to disc (`neckPath`) | — | Wrong look. Trama's README: "routes every line as an elbow". A radial spoke is never an elbow |
| **Measure in the real fonts** | `HS.textWidth`, an estimate billed at 0.6 em a character for `--font-label` (monospace) | 125 labels in Chromium: real ÷ estimate = 0.989 on average, **1.003 at worst** | Not needed in the default face. Under `mode: sketch` the estimate runs short (§3), and fixing the estimate is cheaper |
| **Fit and type floor** (up to 4 rounds of fit) | A fixed viewBox per orientation (544 × 200 on landscape, the piechart's height), so a name prints at pie-key size | — | Not needed. The type size is set by design, not by searching |
| **Layout cache, worker, newest-wins queue** | None. Layout runs in the engine's build transform | Node, 200 runs each, warm: **1.0–1.3 ms** a chart for most, **10–11.5 ms** for `sized` and the 12-satellite chart; 22.9 ms for the demo deck's 8 charts | Not needed. The worst chart fits inside one 16 ms frame |
| **Browser draw** (install, wait for fonts, flush) | Static `<svg>` in the HTML the engine emits | **0 ms in the browser.** Trama's demo deck, cold, after the §9 amendment: 273 ms of layout for 7 charts, the last drawn at **571 ms** | A loss. Hub-spoke paints with the first frame |

## 2. What a migration would cost

1. **The linter would stop predicting the picture.** The geometry is a pure Node
   function today, so `lib/core/hub-spoke-model.js`'s `crowding()` predicts every
   slide whose floor the solver breaks (`meta.bad`), and
   `test/unit/components/hub-spoke.test.js` fails any seed whose `meta.bad` has no
   crowding lint. A browser pass would move
   placement after the fonts load, and no lint could promise what that pass draws.
2. **Every static surface would need a bootstrap.** Export-to-Marp and any reader of the
   raw HTML get the finished SVG today. A Trama chart needs the
   pipeline shipped as a `<script>` and a flush before capture.
3. **The adapter would still be ~1,300 lines.** Placement, the neck floors, the label
   placer and the tiered layout are all radial-specific. Trama would take over only
   the measure → paint loop around them, which hub-spoke does not have.

## 3. What the measurement found that is not about Trama

In `mode: sketch` the label face is the proportional hand face. `textWidth` bills it
at 0.66 em, and that rate runs short for bold digits and symbols. Over 129 labels the
real width averages 0.901 of the estimate, but `8%` paints 1.233× and the hub's
`$120M` 1.126× (10.5 user units over). On the demo deck's `sized` and 12-satellite
slides the hub value reaches the disc's edge. Hub-spoke shipped this in #2396, and it
is off the path of this decision, so it is logged in
`followups.d/2396-p2-sketch-hub-value-reaches-disc-edge.md`. The fix belongs in the
estimate: a separate rate for the hand face's digits and symbols. A browser
measurement is not needed for it.

## 4. When to revisit

Reopen this if any of these become true. Each is a point where Trama's kernel would
start to pay for itself:

- **Satellites link to each other** (a mesh, not a star). Then placement is a graph
  problem and dagre plus `solveRoutes` is the right tool.
- **A connector must bend around a disc**, for example a tier that crosses another
  branch. That needs routing. Then use `K.route(model, sizes, positions)`, which
  routes around fixed positions with no dagre, while hub-spoke keeps its own placement.
- **The label face becomes proportional by default.** Then the estimate stops being
  exact, and measuring in the real font is worth a browser pass.

## 5. The owner's options

| Option | Cost | Buys | Risk |
|---|---|---|---|
| **A. Stay (recommended)** | This note | One less moving part. The static SVG and the lint-predictable geometry stay | A future graph chart that does need Trama has to recognize the triggers in §4 |
| B. Share Trama's arrowhead helper | About 10 lines, plus a `require('@laticent/trama')` from a Node transform | One triangle path instead of two (`_chart-family/arrowhead.js` has hub-spoke as its only caller) | Ties a build-time chart to a browser library's paint layer for one path string |
| C. Migrate onto the pipeline | An adapter, a bootstrap in every export, rewritten lint contracts. A multi-PR, shared-kernel change (adversarial trio, HARD RULE #25) | Nothing measured in §1 | Drawn ~0.5 s later on a cold load, and the linter loses its prediction |
