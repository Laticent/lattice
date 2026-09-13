# Continuation — the chart design language, after PR #2148

**Read `finish-coherence.md` and `style-catalog.md` in this folder first.** This
file is the queue, not the record.

## Where PR #2148 leaves it

**In the engine:** the mark contract on 5 of 21 members (`data-hue`,
`data-encodes`, `data-paint` → one family slot table), the `funnel` /
`timeline-list` one-hue collapse, the `--chart-cat-N-body` token, the a11y
spectrum's paired dark arm, the `map` basemap border, the `state-chart` id fix,
and seven measurement tools.

**NOT in the engine — prototype only** (published artifact; the working copy was
in gitignored `.scratch/`, so treat the artifact as the source of truth):

- the three finishes themselves (`pigment` · `etching` · `tone`)
- base status tokens removed from the chart path; status takes categorical slots
  by order of first appearance
- `gantt` milestones + legend swatches brought into the mark contract
- the text-bearing level at 56%, up from 42% once the status palette left

## The queue, in the order it de-risks the rest

### 1. Bake the chart CLASSIFICATION into the manifest

Today a member's class is inferred at runtime from a hand-written `MARKS` table
in the prototype, and every time that table was wrong the render was wrong:
`funnel` was declared text-bearing and is not (0 of 5 bands carry text, measured
by overlap), and `cell-filled` carried no slot attribute so six categories
collapsed to one. **A class that is inferred is a class that can be inferred
wrongly.** It belongs in `<member>.manifest.json`, declared, testable, and
checkable by a gate.

The six classes, measured (three named by the user, three found afterward):

| class | members | what a finish may do |
|---|---|---|
| filled, no text | bar · stacked-bar · piechart · funnel · scatter · quadrant | body is the finish's to set |
| filled, carries text | gantt · progress · matrix-grid · kanban · journey | body capped; the finish picks a level inside the cap |
| filled, layered | radar | flat alpha; never a gradient — it reads as a fourth colour where two polygons cross |
| **fill IS the datum** | map | the finish scales the BAND; it may not set the level |
| **no fill at all** | roadmap · timeline-list · line · slope | edge + type only; a fill-shaped finish cannot reach them |
| **fill is a texture** | any member on an a11y palette | never repaint; reach it through `fill-opacity` and the edge |

**Derive text-bearing GEOMETRICALLY, not from a list.** `spend-rules.md` §7's
list was written by reading and is wrong beyond the `funnel` entry already
corrected. The overlap probe is in `tools/chart-finish-coherence.mjs`.

### 2. Opacity vs gradient for `pigment` — and the inconsistency that prompted it

The user's read: opacity and gradient use is inconsistent between charts, and
`pigment` may be better served by opacity than by gradients. Measured support:
the body-shape split was **6 gradient / 15 flat**, and it follows *which kernel a
member was built on* — traced to one commit (`7ab03b4`, #2080) that landed seven
Cartesian members at once — not any design rule. The finish work already drove
gradient bodies to 0 in the prototype.

Open question to answer with a render, not an argument: does `pigment` read
better as a flat body at full strength, or as an alpha of the hue? Alpha
composites over whatever is behind it, which is the same property that makes
`layered` hard; flat does not. **Test both on the same eleven charts and look.**

### 3. Per-finish consistency is the acceptance test

*"Pigment charts consistent across pigment charts, etch with etch, tonal with
tonal."* That is measurable and already instrumented — `tools/chart-finish-coherence.mjs`
plus the inspection report. Last measured spread of body depth across the family:

| finish | spread | off-spec members |
|---|---|---|
| `etching` | **1.5×** | none |
| `tone` | 3.0× | radar (layered), gantt (edge width) |
| `pigment` | 3.6× | gantt · progress · map · matrix-grid · radar |

`etching` is the proof it can be done. Treat 1.5× as the target for all three.

### 4. Border width and colour consistency

The user suspects inconsistency here and suspects it may be downstream of the
opacity/gradient split. The channel audit (`tools/` — see the audit script in the
artifact) found border colour coming from **three tiers**: `cat-N-ink`,
`--state-*-ink`, and `--cat-on-mark` (a TEXT ink doing an edge's job, on `map`).
Two are fixed in the prototype. Re-run the audit after §2 to see what survives.

### 5. Define which controls make sense

`frame:` (`none` · `ground` · `ruled`) and `rule:` were carried over from the
round-2 design. The user's position: grounding and rule **do not** obviously make
sense as chart controls. Decide what the register actually offers before shipping
it — a control nobody can name the use for is a control that will be set wrong.

### 6. Jank and defect audit

Not yet run against the chart family. `engineering/jank.md` + `npm run check:jank`
ask the question every fit gate does not: does the layout MOVE as content grows?
Charts have fixed axes, legends and value labels that an author's longer heading
can reach.

## Defects found in the last session's own instruments — read before trusting a number

Four, and each one made a claim look better than it was:

1. **The coherence harness read one theme under four names.** It set
   `stage.dataset.theme`; the prototype switches theme by injecting a stylesheet
   and re-rendering. Fixed — it now drives the real controls and reads the
   control vocabulary off the page.
2. **`<pattern>` a11y textures were counted as gradient bodies** — five false
   positives on every accessibility palette.
3. **"First match" was wrong three separate times**: a label paired with the
   first mark it overlapped rather than the largest; a member sampled at its
   TRACK rather than its mark; a status slot taken in the wrong order. Prefer
   max-overlap and explicit filters over `.find()`.
4. **A chained `str.replace` config edit silently no-opped** for three tuning
   rounds while the unchanged numbers were read as real.

**The rule that would have caught all four: make a measurement name its subject.**
"gantt 2.47:1" located nothing; "Per-team weighting, 2.47:1" located the bug
immediately.
