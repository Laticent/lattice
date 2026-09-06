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
| docs **Playground**, branching deck typed in | re-ranked: the three fan-out targets land at one rank (x ≈ 421/426/430) across three rows (y 5/112/219); dagre reachable in the frame; nothing at negative coordinates; no page errors |
| six shipped galleries | byte-identical node geometry |

The Playground row was UNVERIFIED for a while and is worth recording HOW it was
closed, because two attempts failed for reasons that were not the code's. Typing
the deck let the editor's auto-indent and list-continuation mangle the markdown
(`1. A` became `1. A2.`), and `?c=<component>&view=edit` only loads a component's
gallery deck — every one of which is a chain. What worked is CDP `Input.insertText`,
which inserts verbatim and bypasses key handling.

**A false alarm on the way, recorded because the next person will hit it:** the
first reading said the Studio did NOT re-rank. It does. dagre CENTRES nodes in a
rank, so their left edges differ by node width — comparing the `x` ATTRIBUTE finds
no two equal and reports a column. Compare rank coordinates, not box origins.

**Still UNVERIFIED:** the **Drawing Board tilt** path. `draw()`'s
`getComputedStyle(fig).transform !== 'none'` early return now leaves the size pin
in place, which reads correctly but was not driven.

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
