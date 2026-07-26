---
status: shipped
summary: SVG chart labels wrap into <tspan> lines sized in viewBox units (a shared emitter reusing the legend's line-breaker, plus a build-time de-collision pass for scatter labels), and every diagram chart now animates — the radar's shape was never addressable, and gantt and state-chart had no <svg> at all so chart motion skipped them silently.
---

# SVG charts: labels that wrap, and every chart that builds

**Status:** ACCEPTED · landed 2026-07-26

Two defects with one shape. Chart labels ran off their viewBox because SVG
`<text>` does not wrap, and two of the chart-family members never animated at
all because chart motion can only see marks inside an `<svg>` and they had
none. Both are now closed: labels wrap in-SVG in viewBox units, and every chart
the family treats as a diagram builds under `motion-on`.

---

## 1. What was actually broken

Reproduced before any code changed, rendering the real emulator → PDF → raster:

| Symptom | Evidence |
|---|---|
| A long funnel stage name is **clipped** at the viewBox edge | "…Procurement Qualification Review" cut at x=0 |
| Two quadrant dots plotted close together **overprint** each other and the corner label | dot names printed straight through "QUICK WINS" |
| Radar's series shape **never animates** | `.radar-poly` carried no addressable attribute; `chartToScene` saw only the axis labels |
| `ROLE_BY_CLASS['radar-area']` is **dead code** | no renderer has ever emitted `.radar-area` — the radar emits `.radar-poly` |
| Radar's **left rim label clips**, invisibly | measured: "Cost predictability" runs to x = −96 in a 0…595 viewBox |
| gantt and state-chart are **skipped entirely** by motion | neither produced an `<svg>` for `chartToScene` to read |

The last one is worth dwelling on: `chartToScene` returns `null` when a section
has no `<svg>`, and a `null` scene means the poster stays up. So the failure was
silent — the charts looked fine and simply never moved.

## 2. Why `<tspan>` and not `<foreignObject>`

`foreignObject` + HTML/CSS wraps natively, which makes it the obvious candidate.
It loses on three counts, and the third is decisive:

1. It is not "fully SVG", which was the stated direction.
2. It is unreliable in the Chromium→PDF export path the engine depends on.
3. **A `foreignObject` label is an HTML `<div>`.** `chartToScene` grants the
   `label` role to `<text>` nodes (`chart-anima.ts`), so a `foreignObject` label
   would be invisible to the motion system — it would defeat the very goal that
   motivated the work.

So labels are broken into `<tspan>` lines inside a single `<text>`. Staying
inside one `<text>` is what keeps a wrapped label **one** addressable motion
target and **one** `[data-mark]` popover target.

## 3. Reuse, not a second wrapper

The SVG-native legend had already solved this for key rows:
`svg-legend.js wrapLabelToLines` breaks a label to a character budget and emits
one `<tspan>` per line. The new `_chart-family/svg-label.js` **imports** that
line-breaker rather than growing a second one (HARD RULE #15), and adds the
parts the diagram side needs: vertical alignment, an optical box, and the
placement pass below.

**Everything is viewBox user units.** That is what makes the result
resolution-independent: the same vector drawn at 1280×720 and at 8K is the same
shape scaled, so a label keeps its proportion to the geometry and stays sharp.
Verified by rendering one PDF at 36dpi (480×270) and 600dpi (8000×4500) — the
line breaks are identical by construction (they are baked once, at build time)
and the 8K text is crisp vector.

**No font metrics.** A pure kernel has no DOM and no font tables, so width is
estimated as `chars × 0.6 × fontSize` — the legend's tuned, deliberately
conservative advance. The budget therefore breaks EARLY. A label may wrap one
word sooner than a perfect measurer would; it never overruns its box. Erring the
other way puts us back to clipping, which is the defect being removed.

**Who owns the font size.** Whoever declares it. Where CSS already sets a fixed
size (funnel, radar, quadrant) the kernel mirrors that number to break lines and
does not emit a competing attribute; `test/unit/components/svg-label-css-mirror.test.js`
reads the real stylesheets and fails if a kernel constant and its CSS
declaration disagree, so the mirror cannot silently drift. Where the chart is new (gantt) the kernel owns and
emits the size, exactly as the legend does — `chart-family.css` deliberately
sets no `font-size` on `.chart-key-label` for the same reason.

## 4. Wrapping is not enough — placement is its own problem

Wrapping fixes a label that is too WIDE. It does nothing for two labels that
land on the same spot, which is a *placement* problem: on a scatter chart two
nearby points carry two labels that overprint no matter how narrow each is.

`deCollideLabels` is a deterministic build-time pass. Three things it gets right,
each learned by getting it wrong first:

- **Direction is not a hint.** Each label moves along the direction that carries
  it AWAY from the mark it names. An earlier cut picked whichever direction
  needed less travel, which cheerfully dropped labels onto their own dots.
  The opposite direction is a FALLBACK, used only when the preferred one cannot
  clear within `maxShift`.
- **Structural labels are fixed obstacles.** A quadrant corner name labels the
  quadrant, not a data point, so it holds its place and data labels move around
  it.
- **Placement must know the block height.** The quadrant's above/below choice
  assumed a single line, so a wrapped 3-line name on a top-row dot was placed
  above and had nowhere to go — it started inside the corner label's band. No
  amount of nudging rescues a placement that was wrong to begin with. Labels are
  measured first, then placed toward the plot's interior.

Where nothing fits, the label ellipsizes on its own mark. A visibly truncated
name that is unambiguously attached to the right mark beats a complete name
printed across its neighbor — and the popover and speaker note carry the full
text either way.

## 5. Radar: animate without hijacking the popover

The radar's polygons had to become animatable, but they could NOT take a
`data-mark`: the radar's `data-mark` namespace belongs to its **axis labels**,
which `chart-interact.js` keys each axis's detail template by. A mark on a
polygon would shift that map and open the wrong popover.

So the polygons declare `data-anima-role` only, and `chartToScene` now collects
`[data-mark], [data-anima-role]`, partitioning by role so labels still follow the
build. The shape animates; the popover's index map is untouched.

The radar also needed geometry: landscape reserved room only on the right (the
key rail), so left rim labels painted out of frame. Landscape now pads the left,
and the vertical pad for top/bottom labels is applied by growing the composed
viewBox — **not** by inflating the `diagramHeight` handed to `buildSvgLegend`,
which also sets the key's font size and would have silently shrunk the legend
against every other keyed chart.

## 6. gantt and state-chart: two different SVG-ifications

These are not the same problem and did not get the same answer.

**gantt** was percentage-positioned HTML with no measurement dependency, so it
became a straightforward baked SVG: same axis math, new coordinate space. Two
things had to be carried across rather than dropped — the container-query
portrait reflow became a portrait GEOMETRY (`GANTT_GEOM_TALL`), since a baked
viewBox cannot reflow; and the canonical chart fill became an inline
`<linearGradient>` per semantic slot, because SVG `fill` cannot take a CSS
gradient. Identical stops, so a bar did not change color.

**state-chart** could not be baked, and this is the interesting one. It lays its
nodes out as HTML **on purpose**: a string transform cannot measure text, so the
browser sizes each node to its real content, whatever the label, script or font.
That is the entire reason `installStateChartLayout` exists — it replaced a
`charPx` glyph-guessing approach that could not withstand arbitrary content.

Emitting SVG nodes at build time would have reverted that decision. So instead,
the measuring pass now **paints** the nodes into the overlay it already drew the
edges into, using the boxes it has already measured. Labels wrap by measurement
too: each word is briefly probed for its rendered top edge and grouped into the
lines the browser actually produced, so an SVG label breaks exactly where the
HTML one did.

The HTML column stays in the layout — it is the measuring harness, and the
inter-node gap math reads it — hidden with `visibility:hidden`, **not**
`display:none`, because the boxes must keep occupying space for the next
re-measure on resize or font load. If the pass never runs, the HTML nodes are
still what you see, so this degrades to the previous rendering rather than to
nothing.

`state-chart inline` is untouched and stays HTML: it is a compact row list, not
a node-and-edge diagram, and has no overlay to paint into. It is popover-only by
nature, and the matrix says so.

## 7. An honest role map, gated

`ROLE_BY_CLASS` is a fallback for charts that predate `data-anima-role`. An
entry for a class nothing emits is not a harmless placeholder — it reads as
working support while the feature is silently absent, which is exactly what
`'radar-area'` did. The map is now gated against the kernels' own source
(`chart-anima.test.ts`), so a dead key fails the suite.

## 8. Verification

Real surfaces, per HARD RULE #23:

- **Motion** — the shipped Playground at `localhost:4321/playground`, not a
  harness. Opacity telemetry across the build: radar min 0.11 (6 marks
  mid-build), gantt min 0.41, state-chart min 0.74, all settling to 1. Before
  this change gantt and state-chart produced no scene at all.
- **Labels** — the real emulator → PDF → raster, for funnel / radar / quadrant /
  gantt / state-chart (tb, lr, curved, inline).
- **Resolution** — one PDF rasterized at 480×270 and 8000×4500.

## 9. What this does NOT claim

- Wrapping plus de-collision **reduces** crowding on a dense scatter; it does not
  make overlap impossible. Past `maxShift` a label stays put and accepts the
  overlap, deliberately, because a label dragged far from its own dot reads as
  labelling something else.
- The kernel's mirrored font sizes track the CSS **defaults**, and the mirror is
  gated (`test/unit/components/svg-label-css-mirror.test.js` reads the real
  stylesheets). What the gate cannot see is a THEME that re-points
  `--radar-axis-label-size` or `--quadrant-axis-size` at runtime. Raising the
  painted size does not change the character budget — it makes each character
  wider, so the label OVERRUNS; only the headroom between the estimated advance
  and the real one absorbs it, which runs out around a 20% increase. (Lowering
  the size wraps early, which is harmless.) A theme that wants materially larger
  chart labels should take ownership of the size in the kernel instead.
- Wrapping is ESTIMATED, not measured, for the baked charts. The advances are
  calibrated against the shipped faces (0.46 mixed-case body, 0.62–0.65
  uppercase + tracked, 0.72 tracked mono) with margin on top, but a script whose
  glyphs are much wider per character — CJK in particular, where the advance is
  ~1.0 and `wrapLabelToLines` has no word boundaries to break on — will still
  overrun. The state-chart, which measures in the browser, is immune to this by
  construction; the baked charts are not.
- `state-chart inline` and the HTML "charts" (kanban, progress, timeline-list,
  roadmap, journey) are not diagrams and are out of scope.
- **Accessibility changed shape for the two charts that were SVG-ified**, and
  this is worth stating plainly. The gantt's lanes and the state-chart's states
  used to be real HTML text a screen reader walked; they are now inside an
  `<svg role="img">`, whose subtree is presentational. Both therefore emit an
  enumerated `<desc>` — the gantt lists every lane with its tasks, spans and
  statuses; the state-chart lists every state (with start/end and status) AND
  every transition, which the old `<ol>` never exposed. That is the same
  technique the keyed charts already use for their legend. It is a genuine
  change of representation, not a strict improvement: the content is available
  and richer, but it is one flat description rather than a navigable list, and
  the text is no longer selectable or findable in the page.

  The rest of the SVG chart family was already `aria-hidden` with no description
  at all, so the family is now MORE accessible than it was — but the two charts
  that moved gave up structure to get there.

## 10. What adversarial review changed

Three lenses (red team, Munger inversion, independent checker) ran against the
finished branch. They found defects the gates could not, and the design is
different because of them. The ones worth remembering:

- **The collision boxes were measured for the wrong baseline.** `wrapSvgLabel`
  computed a label's box from the *alphabetic* baseline while the label was
  painted with `dominant-baseline="hanging"` or `"middle"` — so the pass routed
  labels around a phantom box and item names printed straight through
  "STRATEGIC BETS" in this branch's own demo deck. The emitter now OWNS
  `dominant-baseline` (callers declare it as an option instead of hand-writing
  the attribute) and derives the box from it, so the box it guards and the
  glyphs it paints cannot disagree.
- **The state-chart's popover was dead.** `visibility:hidden` also removes a
  subtree from HIT-TESTING, and the overlay is `pointer-events:none`, so
  `elementFromPoint` found nothing carrying a mark. The painted rects now take
  `pointer-events: auto`. Verified on the real Playground: 4/4 on-screen states
  hit-testable.
- **A wrapped label broke the popover's TITLE resolution.** The consumer
  identified "this element is itself the label" as *"has no child elements"* —
  true for a flat `<text>`, false for a wrapped one — so every radar popover
  silently fell through to reading the legend and titled itself with a SERIES
  name. Emitter and consumer were each individually correct; the seam was not.
- **Fixing a dead role-map entry the obvious way produced seven more.** Adding
  `radar-poly`, `gantt-bar`, `state-node-shape` and friends looked like the fix,
  but every one of those classes co-emits an authoritative `data-anima-role`,
  which `roleForNode` reads first — so none could ever be consulted.
  *Unreachable is indistinguishable from absent.* The class map is retired
  entirely and replaced by a stronger gate on the emitters: every geometry mark
  a kernel makes addressable must declare what it is.
- **The advance constants were guessed.** They are now MEASURED against the
  shipped faces in a real browser (0.46 mixed-case body, 0.62–0.65 uppercase +
  tracked, 0.72 tracked mono), which is what stopped the corner labels wrapping
  text that comfortably fit.
- **An attempted fix was worse than the defect.** Stripping `data-mark` from the
  measuring column to de-duplicate the mark set broke on the SECOND `draw()` —
  which re-runs on font load and resize — because it then read a null mark and
  painted rects with none at all. The duplicate is tolerated at the consumer
  instead (`liftVec` filters to SVG siblings), which also keeps the marks
  present if the layout pass never runs.

The gates were green for every one of these.
