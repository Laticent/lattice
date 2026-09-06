---
status: in-progress
summary: state-chart adopts dagre for node placement and edge routing, reversing PR #27's explicit "no dagre, no force layout". Self-hosted with no external script — the player CSP (script-src sha256) and the .toString() serialization both make one impossible. Measured against ELK on all 13 shipped gallery machines: dagre keeps authored reading order 14/15 against ELK's 9/15, fits a 16:9 stage better on 12 of 15, lays out 2.5x faster, and costs 22 KB gzipped against ELK's 430 KB. The decisive constraint is synchronous API — the layout pass is serialized into the emulator bootstrap via .toString(), which a Promise cannot cross.
---

# state-chart adopts dagre for layout

## 1. What this reverses, and why that is not a slight

`state-chart`'s founding PR #27 rejected a layout engine by name:

> The numbering dissolves the layout-engine problem: state i renders at row i, so
> the kernel only routes edges between known grid positions — no dagre, no force
> layout.

That was right for the machine it shipped. Every state-chart in the tree is a
**chain** — one incoming edge, one outgoing edge, plus back-edges — and for a chain
"state i at row i" is not an approximation of good layout, it *is* good layout, at
zero dependency cost.

It stops being right at the first **branch**. A machine where Triage fans out to
three successors has no correct single-column rendering; the grammar can express
that machine today and the layout cannot show it. This note adopts dagre for that
case and keeps the numbered column for the chain case.

`2026-05-07-chart-family-proposals.md:449` sets the countervailing policy —
"stay in `diagram` blocks when the layout algorithm itself is the value" — and it
still holds for **sankey** and **mindmap**, where the algorithm *is* the artifact.
A state chart's value is the state vocabulary and the transition grammar; layout is
a means. That is the line this note draws.

## 2. There was no prior proposal

Worth recording, because the work started from a belief that one existed. A sweep
of all 507 decision docs, `design/`, `lib/`, `docs/src/`, `examples/`,
`changelog.d/`, plus all 2,073 issues and PRs, 3,334 issue comments and 468 review
comments found **nothing** proposing a graph layout library for our own components.
Every `dagre`/`elk` mention in the tree is about **Mermaid** laying out Mermaid's
graphs — chiefly `engineering/mermaid.md:561`'s export-only `layout: 'elk'` split.
`cytoscape` appears once, as a transitive dependency in the lockfile.

## 3. The bake-off

Both engines are **layered (Sugiyama)** algorithms — same family, same four phases.
The interesting differences are not algorithmic.

Run on the **13 real machines** extracted from `state-chart.gallery.md` and
`examples/state-chart.md`, plus 2 synthetic branching machines. Both engines got
byte-identical node boxes, so the box estimate cannot bias the comparison.

| metric | dagre | ELK | winner |
|---|---:|---:|---|
| edge bends (total) | 130 | 80 | ELK, −38% |
| edge length (total) | 8,786 px | 9,706 px | dagre, −10% |
| crossings | 0 | 0 | tie |
| authored order kept | **14/15** | 9/15 | **dagre** |
| mean 16:9 stage fit | **2.23** | 2.02 | **dagre** (12 wins / 3) |
| warmed layout, per machine | **2.33 ms** | 5.74 ms | **dagre**, 2.5× |
| bundle, min+gzip | **22 KB** | 430 KB | **dagre**, 20× |

Crossings tied at zero on every machine. At 3–7 states both engines solve crossing
minimization completely, so that metric does not discriminate here — do not cite it
as evidence either way.

### 3.1 Two results decide it

**Synchronous API.** `state-chart.transform.js:1524` serializes the whole layout
pass into the emulator's bootstrap script:

```js
const STATE_CHART_BROWSER_JS = '(' + installStateChartLayout.toString() + ')(document);';
```

It is invoked synchronously there and in `lib/runtime/index.js:1013`. ELK's API is
Promise-based, so adopting it means changing the PDF pre-render handshake across all
three render paths. That is an architectural change, not a tuning knob.

**Size, at two different scales.** dagre tree-shakes to 64,009 B raw / 22,423 B
gzipped — `lodash-es` reduces to the ~34 functions it calls. ELK cannot tree-shake
at all (transpiled Java in one blob): 1,460,238 B raw / 440,069 B gzipped. Against
`lattice-runtime.min.js`'s current 183,056 B gzipped that is **+12% for dagre and
+240% for ELK**.

The per-export number is worse than the bundle number and matters more. The
serialized pass is **53,929 B raw / 17,945 B gzipped today**, embedded in every
export. dagre roughly doubles it; ELK takes it to ~458 KB gzipped **per exported
file** — a cost the recipient pays on every open, not once from cache.

*(Treat the bundle deltas as upper bounds: they are the libraries measured in
isolation, not a rebuild with either engine wired in.)*

### 3.2 What the numbers got wrong, and only rendering caught

Two conclusions drawn from the metrics were **false**, and both were corrected by
drawing the layouts:

- **"ELK's 38% fewer bends means cleaner routing" — wrong.** On `branch-wide`, dagre
  fans three edges out of Triage as separately traceable diagonals; ELK's orthogonal
  router collapses them into a horizontal bus where three edges share nearly one
  line. Fewer bends, harder to read. A bend count cannot see whether edges are
  *distinguishable*, which is the property that matters on a slide.
- **"9/15 order preserved" understates ELK's failure.** On the 3-state `inline`
  machine ELK places **Connected (2) above Connecting (1)** — the start state is not
  first and the machine reads backwards. As a metric that is one row; on a state
  chart it is disqualifying.

This is HARD RULE #23 doing its job: the numbers were a claim, the renderings were
the evidence, and they disagreed.

### 3.3 What neither engine fixes

The tall-machine problem survives. A 6-state chain lays out 154×564 (dagre) or
195×588 (ELK) — both narrow slivers on a 16:9 stage. Auto-layout does **not**
address this; it is separate work, and the "stage fit 2.23 vs 2.02" comparison
must not be read as solving it. Both are poor in absolute terms.

**Self-transitions are excluded from every number above.** Neither engine routes a
self-loop natively, and most shipped machines have one — so the hand-rolled router
does not fully go away under either choice. This was not priced in the original
framing and is the largest remaining unknown.

## 4. Numbering supplements the layout; it is not replaced

The first framing of this — "dagre drops the author's numbering as the layout" — was
too broad and is corrected here.

**Unchanged:** the authoring contract (`=> 4` still cites the index) and the visible
index badge, already painted into the SVG at each node's measured position
(`state-chart.transform.js:786`). The reader still sees "4" on the node.

**Changed:** only the positional guarantee that state *i* sits at row *i*.

And narrower than that. Measured, dagre's own crossing minimization *already*
produces authored numeric order on the branching machines; it diverges only **within
a rank**, when avoiding a crossing requires it. Constructed case (`1=>4`, `2=>3`):

```
 y=22:   1:Draft   2:Queued
 y=126:  4:Held    3:Shipped     <- dagre flipped 3/4 to kill the crossing
```

Node **insertion order does not steer this** — the branching graph laid out
byte-identically with nodes inserted forward and reversed. Forcing numeric order
where dagre disagrees needs invisible constraint edges, which is a real technique
and additional complexity. Not adopted here; recorded as the lever if within-rank
order proves to matter.

### 4.1 The hybrid strategy

Keep the numbered column for chains — so the 11 committed gallery slides stay
byte-identical and the forcing function survives where it holds — and fall to dagre
only when the graph actually branches.

## 5. Layout is orthogonal to presentation

dagre returns coordinates and draws nothing, so every visual axis stays ours and
stays tokenized (HARD RULE #3). Verified on rendered output, not asserted:

- **Label space is real.** Passing a label `width`/`height` grows the canvas
  120 → 140 → 280 → 470 px as label width goes 0 → 70 → 210 → 400. Labels are boxes
  in the layout, so they cannot overlap nodes. Three converging labeled edges
  produced **zero** overlapping label boxes.
- **dagre returns the reserved box**, not just a point — which is what makes a real
  background rect possible. The halo we ship today (`paint-order: stroke` against
  `--state-label-bg`) cannot know its own extent.
- **`labelpos: l|c|r` + `labeloffset`** work symmetrically. For `'l'` the label
  appears pinned because dagre translates the graph to origin and the *node* moves
  instead; the label-to-node delta grows −35 → −55 → −85 as expected.
- **Arrow ink decouples from edge ink.** `fill="context-stroke"` inherits the line
  color; an explicit fill overrides it; stroked/open arrowheads work. All three
  confirmed on a real Chromium render.

Everything asked for — label background, font, size, per-edge color, arrow color,
per-edge weight, arrow shape — is already token-driven today via `--state-edge`,
`--state-edge-back`, `--state-label-bg`, `--font-label` and per-`data-dir` widths.
dagre neither adds nor removes any of it.

### 5.1 The one real coupling

**A label box must be measured in the font that will render it.** dagre trusts the
width it is handed. Rendering 15px serif into a box reserved for 11px mono overflows.

This is not hypothetical. `makeLabelW` already reads `--font-label` from live CSS,
and its docblock records the regression that taught it: it used to read
`--font-mono`, and when the label-voice sweep moved the CSS rule the two silently
diverged — under `sketch` the packer allotted JetBrains Mono clearance for labels
rendered in a wider hand sans, seating two edge labels close enough to touch. The
existing measurement is the fix and carries over unchanged.

### 5.2 Clearance follows where the label sits, and the two axes differ

**A label drawn BESIDE the line spends the axis it sits on, not the axis the edge
runs along.** Once the labels moved off the line (below a horizontal run on `lr`,
right of a vertical run on `tb`), the clearance rule that fed dagre kept charging
both axes for both dimensions:

```js
// before — symmetric, and wrong on one axis
const rankClear = (lr ? metrics.maxW : labelH) + G.arrow + G.gap * 2;
```

On `tb` that adds the label's stacked HEIGHT to the vertical rank gap, for a label
that now occupies no vertical space between the ranks at all. Vertical is the
scarce axis on a 16:9 stage, so it was spending the expensive one on nothing:

```js
// after — each axis charged for the dimension the label actually puts on it
const rankClear = lr
  ? metrics.maxW + G.arrow + G.gap * 2
  : Math.max(G.arrow + G.gap * 2, labelH);
const crossClear = (lr ? labelH : metrics.maxW) + G.labelOff + G.gap;
```

`max`, not a bare arrow clearance: the label is CENTERED on the edge midpoint, so a
two-line label still has to fit between the ranks or it spills onto the node below.

**The wrap budget follows the same asymmetry**, and it has to, or the fix half
undoes itself. Wrapping converts width into HEIGHT — more lines, and a centered
multi-line label raises `labelH` back into the rank gap through the `max`. On `tb`
the label runs out into the cross axis, which is the axis a 16:9 stage has to
spare, so `tb` now wraps late (`G.gapFloorLr * 5`) where `lr` still wraps to its
own run (`G.gapFloorLr * 2.4`).

**A correction, left visible rather than tidied away.** The width above read
`215.8` when this section was written, and the commit message of the change still
says so. An independent checker could not reproduce it: the spec the test pins
produces `201.8`, on both sides of the change. `317.5 -> 264.9` and the
`1.012 -> 0.575` gap ratio both reproduce exactly; the width was carried over from
an earlier harness. "Unchanged" was true; the number was not. In a record whose
whole value is that its claims were measured, an unreproducible measurement is the
expensive kind of error, so it is corrected here and named rather than silently
edited.

**Measured**, on the four-state `tb` machine the test pins: the rank gap falls from
**1.01x** the node height to **0.57x**, canvas 317.5 → 264.9 tall at unchanged
width 201.8. The fit spine spends the freed height scaling the whole figure up, so
the visible result is a bigger, more legible diagram in the same envelope rather
than a shorter one — see `examples/state-chart.md` p5 and
`examples/state-chart-branching.md` p5 before/after.

**The test for this took four attempts, and the first three were the F5 failure
again** (§9.1: six tests that regex-matched source text and passed with all four
defects present). Comparing CANVAS HEIGHT across two specs — labeled vs bare, wide
label vs narrow — passes under both rules, because changing a label also moves
`metrics.maxW`, hence `nodesep`, hence the responsive stretch: the height
difference is real but not attributable. What discriminates is measuring the RANK
GAP itself off the painted rects and normalizing by the node height read from the
same output, which survives the fit scale. Verified red by reverting `rankClear`
alone and re-running.

## 6. Self-hosted: no external script, ever

**The requirement is already the contract, and on two paths it is structurally
impossible to break.**

`engineering/decisions/2026-09-03-self-hosted-runtime-deps.md` (shipped) is the
governing record: the three CDN constants are deleted, every host passes a vendored
URL, and `''` means "omit the tag" rather than "fall back". The gate is
`test/unit/docs/no-cdn-runtime.test.js` — a `BARRED_HOSTS` list (jsdelivr, unpkg,
cdnjs, code.jquery, esm.sh, fonts.googleapis, fonts.gstatic) scanned over
`docs/src/**`, with a >100-file floor so it cannot pass vacuously.
`docs/src/lib/single-slide-render.asset-gating.test.ts:85` carries a second arm for
the preview frame.

**The gate's scope is `docs/src/**` on purpose.** `tools/` is deliberately unscanned,
because build-time fetch with a committed, provenance-carrying output is the *wanted*
shape — `tools/build-basemap.js:41` holds a live jsdelivr URL and passes correctly.

Two mechanisms make an external script impossible for this component regardless:

- **The player CSP.** `lib/export/player-core.mjs:2394` emits
  `default-src 'none'; script-src 'sha256-<jsHash>'`. Only the one inline script whose
  digest matches executes.
- **The serialization itself.** `STATE_CHART_BROWSER_JS` is a *string* in the exported
  document, with no module scope and no loader. Measured: dagre bundles to a
  **63,705 B IIFE**, and the IIFE plus the stringified installer totals **64,321 B raw
  / 22,655 B gzipped**, evaluates under `eval`, and lays out correctly with zero imports.

### 6.1 An npm dependency, not a vendored file

`dagre-d3-es` (MIT, 7.0.14) and `lodash-es` (MIT) are **transitive-only via mermaid**
today (`npm ls dagre-d3-es` → `mermaid@11.14.0 → dagre-d3-es@7.0.14`). Both are
promoted to **`dependencies`, not `devDependencies`** — `tools/build-emulator.js:61`
sets `packages: 'external'`, so the CLI resolves them from the consumer's install;
a devDependency would ship a missing module to every consumer (the failure
`checkAjvBoundary` exists to catch).

No committed vendor file is needed, and that is not a shortcut. `build-runtime.js` and
`build-playground.js` both esbuild with `bundle: true` and no externals, so a bare
import is **inlined** — the pattern roughjs, katex, highlight.js and dompurify already
ship under. `mermaid-v11.min.js` is committed for a narrow, documented reason
(`2026-04-30-mermaid-theming.md:93-118`): it loads through a `<script src>` that a
fresh clone or worktree must resolve *without* `npm install`. dagre loads through
neither, so the exception does not apply.

### 6.2 The license obligation — the part that is easy to miss

Once dagre is inlined into `dist/lattice-runtime.min.js`, the **marp kit redistributes
it**, and MIT requires the permission notice to travel with the copy.
`tools/build-marp-kit.js` `thirdPartyLicenses()` assembles
`dist/marp-kit/THIRD-PARTY-LICENSES.txt` by reading a **hand-maintained** set —
today `MIT-mermaid.txt`, `MIT-katex.txt`, `OFL-1.1.txt`, `LGPL-3.0-lamejs.txt`.
Nothing regenerates that register from what the bundle actually contains.

So this work owes `assets/licenses/MIT-dagre-d3-es.txt` and
`assets/licenses/MIT-lodash-es.txt` plus their `thirdPartyLicenses()` entries.
**Neither package carries an inline `@license` header**, so esbuild's
`legalComments: 'inline'` will not carry the notice for us — measured: the only
copyright string in `dist/lattice-runtime.js` is SlideWright's own.

Also to update: the prose dependency list at `engineering/architecture.md:453`, a
`changelog.d/` fragment (HARD RULE #10), and `npm run build:check` after the lockfile
regenerates, so `checkLockfileOptionalPeers` sees the new subtree.

### 6.3 Bundle weight lands on an EAGER path

`2026-09-03-self-hosted-runtime-deps.md:153` warns that Mermaid "must never drift onto
an eager path". dagre is not Mermaid-sized, but the asymmetry matters: Mermaid is
injected per-slide only when a diagram exists, whereas dagre inlines into
`dist/lattice-runtime.min.js`, which `sync-playground-assets.mjs` stages and the
landing page loads. +22 KB gzipped is paid by every reader, including on decks with no
state chart. Acceptable at this size; it would not be at ELK's 430 KB.

## 7. Method note

Chrome's CLI `--screenshot` **silently dropped all but the first drawing element**
in small SVG files here (a three-rect file rendered one rect; `--virtual-time-budget`
did not help). It made a working `context-stroke` marker look unsupported. Rasterize
through puppeteer, not the Chrome CLI. The large sheets were unaffected — verified by
re-rendering and diffing (4.77% differing pixels, all antialiasing from the 2× scale).

## 9. What shipped, and what verified it

Built on `claude/mermaid-layout-state-charts-1bn5hd`. The hybrid rule holds: a
chain keeps `state i at row i`, and **every machine in the six shipped galleries
has byte-identical node geometry** — verified by dumping node rects and viewBoxes
from real headless Chromium before and after, re-run after every subsequent fix,
not reasoned about.

**Adoption is a property of the LAYOUT, not the grammar**, and that distinction
was arrived at by measurement rather than taste. "Some state has two successors"
sounds like the right question, but a SKIP edge (`1 => 2` beside `1 => 5`)
satisfies it while dagre still ranks the machine linearly — switching to it
re-laid out every shipped gallery for no visual gain, and was reverted. The test
is two nodes sharing a rank, excluding the synthetic exit (a sink every terminal
converges on) and disconnected nodes (dagre parks every one of them in rank 0).

**Edge length is responsive**: the rank gap stretches so a `tb` machine fills the
stage's height and an `lr` machine fills its width, floored at label clearance and
only ever stretched upward. Solved from two samples, because the gap is one term
of `extent = fixed + nRanks * ranksep` and a naive ratio moved an lr machine from
86% to 88% of the width. The target aspect is read from the figure VIEWPORT: the
pass pins the scale box, so reading it from that box fed draw()'s own output back
in and walked a tb machine from 46% to 24% across re-draws.

**Labels sit off the line** — below on `lr`, right on `tb` — at the polyline's
arc-length midpoint. Event text takes `\n` and `<br>`, and wraps itself when still
too wide, never mid-word.

### 9.1 What a checker found that the tests did not

An independent checker (HARD RULE #25) found four confirmed defects in the first
layout commit. Recorded because three are instructive:

| | defect | why nothing caught it |
|---|---|---|
| F1 | the canvas pad was `G.gap` (5) while the start marker is painted `markerGap + startR` (46) beyond the first node | dagre's bounds hold nodes and edges; the markers are drawn by the other router. Every re-ranked figure put the start disc at `cy = -35` and **the engine's own CONTENT CLIPPED gate fired on a shipped PDF** |
| F2 | `curved` never reached `edgeDagre`, so a fan-out silently rendered as the default | no gate compares a modifier's output to its absence |
| F3 | routes keyed by endpoint PAIR in a multigraph, collapsing duplicate transitions onto one line | dagre had the distinct routes; the code discarded them |
| F4 | adoption fired on machines with no branch | see the exclusions above |

**F5 is the one worth keeping.** The six tests written with that commit
regex-matched the pass's own SOURCE TEXT (`assert.match(src, /if \(!branching\)
return null;/)`). All six passed with all four defects present, because none of
the four changes a source string. They are replaced by a behavioral suite that
drives the real closure against a fake DOM and asserts coordinates — each test
fails on the defect it names.

One more surfaced while fixing those: pinning the scale box BEFORE painting
reflows the hidden measuring column, moving the very label rects `nodeShape`
reads, while `n.mx`/`n.my` still describe the pre-pin layout. Every node's text
sat ~20px above its box on a machine whose column had wrapped a label.

### 9.2 Verification matrix

| surface | result |
|---|---|
| CLI PDF, light + dark | branching, chains, self-loops, tints all correct; no CONTENT CLIPPED on any shipped deck |
| distributable `.html` export | dagre inlined, global installed, machine re-ranked in a real browser |
| PPTX / PNG export | render clean |
| docs site preview iframe (real dev server) | renders `viewBox 0 0 970.4 253.4` — identical to the CLI — nothing at negative coordinates, no page errors |
| tilt guard, real browser (`.html` export) | geometry frozen under a live `matrix3d` transform and restored after; zero page errors — and the run found the non-convergent layout in §9.3 |
| layout convergence, real browser | all figures of all four state-chart decks stable across six successive draws |
| docs **Playground**, branching deck typed in | re-ranked: the three fan-out targets land at one rank (x ≈ 421/426/430) across three rows (y 5/112/219); dagre reachable in the frame; nothing at negative coordinates; no page errors |
| six shipped galleries | byte-identical node geometry |

The Playground row was UNVERIFIED for a while and is worth recording HOW it was
closed, because two attempts failed for reasons that were not the code's. Typing
the deck let the editor's auto-indent and list-continuation mangle the markdown
(`1. A` became `1. A2.`), and `?c=<component>&view=edit` only loads a component's
gallery deck — every one of which is a chain. What worked is CDP `Input.insertText`,
which inserts verbatim and bypasses key handling.

**A false alarm on the way, recorded because the next person will hit it:** the
first reading said the Studio did NOT re-rank. It does. dagre CENTERS nodes in a
rank, so their left edges differ by node width — comparing the `x` ATTRIBUTE finds
no two equal and reports a column. Compare rank coordinates, not box origins.

### 9.3 Driving the tilt path found a layout that never converged

The tilt row above was the last UNVERIFIED one, and closing it turned up a defect
nothing else had — which is the argument for closing such rows rather than
reasoning about them.

**Two harnesses failed before one worked, both in the vacuous direction.** The
first tilted the figure and dispatched a `resize` event. Nothing moved — and
nothing moved on a build with the guard DELETED either, which is the tell: a CSS
transform does not change the observed content box, so the `ResizeObserver` that
owns the redraw never fired, and the harness was reporting the absence of a redraw
as the presence of a guard. The second re-evaluates the pass's own `<script>` text
in the page, which is the same `drawAll()` the observer calls.

With a redraw actually firing, the guard holds: across all five figures of
`examples/state-chart-branching.md` in a real headless Chromium, geometry is
unchanged while a live `matrix3d` transform is on the figure, and unchanged again
once it settles back. Zero page errors.

**And the fifth figure moved on every redraw, tilt or no tilt.** It alternated
between `viewBox 1167.4 x 168.1` and `1073.5 x 154.7`, period two, forever — so a
live preview, a resize, or `fonts.ready` made the chart visibly jump between two
sizes. The measured label metrics were identical every round (`maxW 112.199`,
`maxLines 2`) and `want` was constant, which ruled out the feedback loop this code
already guards: `want` is read from the figure VIEWPORT precisely so the layout
cannot chase its own output.

The residual path was the SIZE PIN. On a re-ranked machine the tail of `draw()`
pins the scale box to the drawing, and the hidden measuring column lays out inside
that box — so the pin left over from the previous draw constrained the node rects
the next draw measured. Narrower boxes, wrapped labels, a different layout. The fix
is one line of symmetry: the pin comes off before measuring, next to the fit
transform that was already being reset there for exactly the same reason.

**It was changing what we ship.** The PDF path draws twice (`fonts.ready` fires a
second `drawAll`), so the committed decks carried the fed-back layout: on the
ten-step pipeline of `examples/state-chart-stress.md`, "In Progress" and "Code
Review" wrapped to two lines under a pin that had squeezed their boxes. Three
pages across two decks changed when the pin came off, all of them for the better.

The regression test models the coupling in the fake DOM — a scale box whose pinned
width squeezes the node rects — and was verified red by reverting the two
`removeProperty` calls. It needs a GENUINE fan-out to bite: with a skip edge
instead, dagre ranks the machine linearly, the adoption test declines, no pin is
ever set, and the test certifies nothing. The first draft had exactly that shape.

### 9.4 What the adversarial trio found, and what it cost to check

Three agents drove the diff independently — a red team, a Munger inversion and a
checker. Nine defects between them, seven fixed here, and the two that were not
are named below rather than filed away.

**The expensive one nobody's tests could see.** The browser pass reads its tints
back OUT of the DOM, and the DOM is not the parser: `renderHtmlNode` interpolates
the author's label markup verbatim, and `fig.querySelectorAll('.state-node')` is a
descendant search, so an author's raw inline HTML can hand the pass a node the
parser never saw. `data-tint` went into a `style="…"` attribute unescaped, and a
crafted value closed the attribute and put a live `onerror` into `svg.innerHTML`.
That is HARD RULE #22's post-sanitize injection, on a same-origin preview frame,
and in a distributed `.html` export it bakes into every copy the recipient opens.

The tint suite had a "security arm" — ten payloads, all green, all of them driving
`parseStateChart`, which is the one path that was never vulnerable. Worse, three of
its four injection payloads are refused by *incidental* structure (a space, or a
third slash) rather than by the grammar the arm names, so a loosened
`TINT_TOKEN_RE` would have passed it. The fix re-validates at the DOM boundary and
escapes at the sink; the new arm drives the pass with a hostile DOM and goes red on
all fourteen payloads against the pre-fix build. **No #22 gate can see this sink** —
they scope to `lib/runtime`, `docs/src` and the export roots, and this is
`lib/components`.

**The one a green census hid.** `.state-edge-arrow` reads `--edge-tint`, declared
on `.state-edge-group` — and `startMarker` emits an arrowhead into
`<g class="state-marker">`, outside every group. `fill` fell to the SVG initial, so
every start arrowhead painted `rgb(0,0,0)` instead of `rgb(26,26,26)`: every
machine, every path, chains included, and invisible against a dark canvas. The
commit that introduced it reported "all 52 edges across the gallery paint identical
stroke, dash and arrow fill" — a census of `.state-edge-group` descendants, which
is precisely the set that could not fail. §9.1's lesson, in a new costume.

**The one that made a typo destructive.** An inline declaration beats the
stylesheet, so `--edge-tint: var(--typo)` could not fall back to the section
default — it made the property invalid and every reader fell to its own initial:
`stroke: none` erased the transition, the state lost its border, and its gradient
stops painted it solid black. Five surfaces promised the opposite in so many words.
Each inline value now carries `var(--token, var(--default))`.

**The one whose test fed the wrong input.** `TRANSITION_RE` was
`/^\s*([^=]*?)\s*=>\s*(\d+|self)\s*$/` — three quantifiers dividing one
whitespace run, cubic on a NON-match. 4 000 spaces cost 8 272ms failing and 0.06ms
matching, and a nested bullet whose inline code is only spaces reaches it from
ordinary authoring. The linearity suite this branch added fed a MATCHING input,
which never backtracks. Pre-existing, but two lines from the code the ReDoS commit
rewrote and squarely inside what its changelog claims, so it is fixed here: the
ambiguity is gone (`m[1].trim()` already did that work) and the new arms measure
the failing path at 500/2 000 rather than 8 000/32 000 — at the larger sizes a
defective build takes about an hour, so the test would hang rather than fail.

**The gate that could no longer tell a clip from scaffolding.** `check:chart-fit`
reported four clips on the branching demo deck. Every offender was a
`visibility: hidden` `<li>` — the measuring column, which overflows the scale box
once a re-ranked machine pins that box to the drawing. Nothing visible is cut. The
gate's own comment says it measures "the painted marks", and `getClientRects()` is
non-empty for a hidden element while `getBoundingClientRect` ignores an ancestor's
clip, so it was counting scaffolding. It now skips `visibility: hidden`. Two
measurements back that: the full fixture is unchanged (85 slides / 88 pairs / 33
viewBoxes, identical counts), and a control that makes those same `<li>` boxes
VISIBLE still fires all four reports — so the filter separates painted from
not-painted rather than defanging the arm.

**Two found and NOT fixed, named rather than filed:**

- **A label can graze a node on a diagonal run.** The clearance floor is an
  axis-aligned guarantee; a diagonal edge takes its label at the arc-length
  midpoint plus a fixed perpendicular offset, which the floor does not bound. Two
  labels in the shipped decks touch a node bbox by 1.6px and 3.3px, with no glyph
  collision. The code comment claimed the floor prevents this "ever"; that claim is
  corrected in place. The real fix — place the label on the longest axis-aligned
  segment of the route — is a placement change owing its own visual review.
- **Nothing names a typo'd `:::token`.** The docblock, the docs and the manifest
  all said "`lint:deck` is where a typo gets named"; `lib/authoring/lint-core.js`
  has no `:::` handling at all. HARD RULE #29 was cited to justify the omission and
  then neither half happened. The claim is corrected to say plainly that a typo is
  silent. Building the warning needs a decision this component cannot make alone:
  which token list is authoritative for a rule that must stay fs-free (HARD RULE
  #7).

**And one claim the trio made that did not hold.** Two of the three reported the
layout as stable across redraws and could not reproduce §9.3's oscillation. Both
drove it with `window.resize` — which is the same vacuous method §9.3 records
failing: a CSS transform does not change the observed content box, and neither does
a synthetic resize event on a fixed viewport, so the `ResizeObserver` that owns the
redraw never fires. Re-evaluating the pass's own `<script>` does fire it, and the
oscillation reproduces every time. Worth recording because the harness, not the
finding, is what differed.

## 8. Open

- Self-loop routing stays hand-rolled. Scope it before implementation.
- Within-rank order: adopt constraint edges, or accept dagre's crossing-minimal order?
- The tall-machine stage-fit problem is **partly** addressed: the responsive rank
  gap makes a `tb` machine fill the stage height, but a narrow machine still
  leaves the width unused. That is inherent to a vertical stack on a 16:9 stage
  and wants its own note.
- **Found, not caused (off-path, logged not fixed):** on the `lr` build-pipeline
  slide of `examples/state-chart.md` the final marker is clipped at the right
  edge. Verified pre-existing — zero differing pixels in that region across this
  change.
- **Found, not caused (HARD RULE #18, off-path — logged, not fixed here):** roughjs is
  inlined into `dist/lattice-runtime.js` and appears nowhere in
  `dist/marp-kit/THIRD-PARTY-LICENSES.txt`, and its notice does not survive in the
  bundle either — the only copyright string in the built runtime is SlideWright's own.
  The same hand-maintained register that this work must add two entries to is already
  missing one. Worth its own issue: the register should be derived from bundle
  contents, not hand-kept.
