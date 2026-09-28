# Delivery styles and component scenes: each delivery its own character, each component its own gestures

**Status:** accepted (owner, 2026-09-27). The owner's answers to §10 are recorded there.
**Supersedes, if accepted:** the preset model of
[`2026-09-25-vetrina-delivery-presets.md`](2026-09-25-vetrina-delivery-presets.md) §3 (a preset
sets only budget and loudness) and §6.1's "one lever, focus" ruling. Salience (§4), timing
(§7.1) and the one-kernel-two-surfaces rule (§7.2) stay.

## 1. What went wrong

The owner played the Guide test deck under `restrained` on an iPhone and saw nothing move on the
line chart or the funnel. #2415 fixed it (66eff0e), and an independent checker then found that
fix had introduced two regressions of its own. That is the pattern of the last three rounds: each
fix to one delivery or one chart breaks another. It has three causes, and none of them is a
missing API.

**1. A delivery is a set of numbers, not a style.** `lib/core/resolve-delivery.mjs` says it in its
own comment: every moment FOCUSES, and the fields below that "are ALL the difference". Measured
from the source (`resolve-delivery.mjs:69–73`):

| | restrained | expressive | somber |
|---|---|---|---|
| moments a slide | 2 | 4 | 1 |
| rest fades to | 0.45 | 0.30 | 0.62 |
| crossfade | 200 ms | 160 ms | 600 ms |
| ink + cursor | none | the top moment only | none |

Expressive gets ink and a cursor on one moment. Apart from that, the three deliveries run the same
moves and differ in how many they get and how deep the fade is. Change a number for one and you
change what the shared code does for all three.

**2. A budget per slide is the wrong unit for a chart.** `restrained` allows two moments a slide. A
line chart's narration has twelve sentences, each naming a line or a point. The salience plan
picks two of them and the rest stay dark, so the chart looks dead. Every chart fix since has been
a rule for when the budget does not apply (the "walk", the "planned chart"), and each such rule
interacts with the others.

**3. The Guide guesses what a sentence names by matching its text back to the slide.** The chart
narrator in `lib/core/chart-narration.js` builds each sentence FROM the chart's data. That is the
same data the renderer stamps onto the SVG as `data-mark`, `data-series` and `data-label`. The
narrator knows exactly which bar or point each sentence is about, and then throws that away. The
Guide recovers it with text matchers: `findMarkTarget`, `findNamedTarget`, and now
`findTableRowTarget`, a regular expression over "SMB — Q3: 7.8%". The checker's first finding came
from exactly that: the new matcher found the chart's hidden screen-reader table before the drawn
line.

## 2. The model: four layers, each owned by one place

| Layer | Question | Owned by | Today |
|---|---|---|---|
| **Unit** | What parts of this component can a gesture point at? | the component's manifest (`handles`, extended) | stamped on the SVG, but no declaration says which part is which |
| **Binding** | Which unit does each sentence name? | the narrator, which already knows | thrown away, then guessed back from the text |
| **Scene** | What does each sentence DO in this component's story: introduce a series, visit a point, compare two? | the component's manifest (`scene`, new) | not modelled; the Guide special-cases charts in code |
| **Style** | How does THIS delivery express that act? | one file per delivery | three rows of numbers |

A gesture on screen is the product of all four: *this sentence* (binding) *visits* (scene) *the
Feb point of EMEA* (unit), *and restrained expresses a visit as a quiet focus with its month
label* (style). Each layer changes in one place. A new chart declares its units and its scene and
gets all three deliveries without a line of Guide code. A new delivery is one style file and
touches no component.

## 3. The acts: what a sentence does in a scene

Eight acts cover every narrator in `chart-narration.js`. They are **semantic**: they say what the
sentence does in the story, never how it looks.

| Act | The sentence… | Example (Guide test deck) |
|---|---|---|
| `frame` | says how to read the figure | "Each line tracks one measure across the axis." |
| `enter` | introduces a group: a series, a lane, a column, a section | "EMEA rose zero point eight overall." |
| `visit` | names one unit and its value | "Feb 2026, three point two." |
| `note` | adds a detail about the unit just visited | "The processor outage cost two weeks." |
| `compare` | sets two units against each other | "Platform rose seven, from twelve to nineteen." |
| `peak` | names an extreme: the highest, the lowest, the biggest drop | "January is lowest at month three." |
| `verdict` | states the takeaway the slide exists to make | the heading "Pipeline recovered after Feb." |
| `aside` | names nothing on the slide | "Thank you." |

Every component's **scene** also names its **key** beat: the one act the slide is about. Somber
uses the key, and so do a paused deck's resume and the thumbnail.

## 4. The three deliveries as characters

Each delivery is a character with its own rules, not a louder or quieter copy of the others. The
cells are **Vetrina expressions**: the primitives that already exist (`focusContent`,
`gesture(kind)`, `point`) except `trace`, which is new (§7).

### `restrained`: the chair's pointer, off

A board member reads alone. The deck keeps pace with the voice and never performs.

- **Continuous, not budgeted.** Every sentence bound to a unit focuses it. A line chart with twelve
  sentences gets twelve quiet focuses. There is no moment budget. Restraint lives in the
  vocabulary, and the vocabulary is opacity only.
- **Never ink, never a cursor, never motion beyond a 200 ms crossfade.**

| Act | Expression |
|---|---|
| `frame` | the whole figure returns to full strength (a reset, so the eye sees the entire chart) |
| `enter` | focus the group (the line, the lane, the column); peers fade to 0.45 |
| `visit` | focus the unit and its own labels (its category tick, its value label). Inside an entered group, the group stays full and its other units fade to 0.30 |
| `note` | hold the current focus |
| `compare` | focus both units |
| `peak` | same as `visit` |
| `verdict` | focus the unit the verdict names; if it names none, reset |
| `aside` | hold |

### `expressive`: the presenter's hand

A sales room or a lesson. The hand leads the eye, and the top number gets the ink.

- **The cursor is on all the time** and travels to each unit (`point`), resting off the words
  (`gestureRest`).
- **Ink marks acts, not moments.** A `peak` is circled and a `compare` is bracketed, so the ink
  itself says what kind of sentence this is.

| Act | Expression |
|---|---|
| `frame` | the cursor enters; `bracket` (quiet) around the plot area |
| `enter` | `trace` the series path (a line, a slope); `bracket` a lane or a column; focus, peers to 0.30 |
| `visit` | the cursor points to the unit; `tap` (quiet); focus |
| `note` | the cursor holds; `wash` the unit's label |
| `compare` | `bracket` around both units |
| `peak` | `circle` (notable) |
| `verdict` | `underline` (notable) under the heading, or under the unit it names |
| `aside` | the cursor rests |

### `somber`: stillness

Bad news. Nothing moves that does not have to.

- **One gesture a slide, on the key beat, and only there.** The figure stays whole and still
  through every other sentence. It is not budgeted down from a walk: there never was a walk.
- **No cursor, no ink, no read-along.** The caption shows the line in one still ink.

| Act | Expression |
|---|---|
| the scene's **key** beat | focus the unit, the rest fades to 0.62 over 600 ms, held to the end of the slide |
| every other act | nothing |

**What this fixes.** "Nothing moved on the line under restrained" cannot happen, because
restrained has no budget. "Somber and restrained look the same" cannot happen, because somber
never walks. And a change to one delivery's file cannot move the other two, which §8 pins with a
test.

## 5. Binding: the narrator says what it names

Every narrator in `chart-narration.js` returns its sentences with a parallel `refs` array. Each
entry is `{ act, unit, id }`: `unit` is one of the manifest's declared units, `id` is the value
of the attribute the renderer stamped. For example:

- a `visit` of the point Feb 2026 in series 0 is `{act:'visit', unit:'point', id:{series:0, cat:'Feb 2026'}}`;
- the funnel's second stage is `{act:'visit', unit:'stage', id:{mark:1}}`.

The LTT track carries the refs beside each cue. The Studio and the exported player then resolve a
ref with one attribute selector, the same way on both surfaces. There is no text matching. Three
rules:

- **Authored captions still resolve by text.** A caption the author wrote has no refs, so the
  existing resolver tiers stay as the fallback, and anything they find counts as a `visit`. The
  author can pin one with `_focus:`.
- **A ref that resolves to nothing is a build error for generated narration**, gated by a test over
  the corpus, not a silent dark slide.
- **The text resolver never runs where refs exist.** That retires `findTableRowTarget`, the chart
  walk rules, and the planned-chart special case.

## 6. Scenes, one per component

Units come from the metadata each renderer already stamps (inventory, 2026-09-27). The beats
follow each narrator's real sentence order. **Gap** marks what has to be built before the scene
can run.

| Component | Units (from the render) | Beats in narration order | Key | Gap |
|---|---|---|---|---|
| bar | `bar` = `rect[data-mark]`, label `[data-mark-for]` | frame → visit bar ×N (→ note) | the largest bar's visit | — |
| stacked-bar | `category` (segments sharing a category), `segment` = `rect.sbar-seg[data-mark]` | frame → enter category → visit segment ×k (→ note) | the largest category | category grouping is only in `data-label` ("cat · series"); stamp `data-cat` |
| waterfall | `step` = `.waterfall-bar[data-mark]` | frame → visit step ×N | the largest move (`peak`) | — |
| piechart | `wedge` = `path.wedge[data-mark]` | frame → visit wedge ×N | the largest wedge | — |
| funnel | `stage` = `polygon.funnel-band[data-mark]`, labels `[data-mark-for]` | frame → visit stage ×N (→ note) | the last stage | the narrator names no biggest drop; add a `peak` sentence or keep the last stage |
| line | `series` = `path.line-path[data-series]`; `point` = `circle.line-dot[data-series][data-label]`; `category` = `text.cart-cat` | frame → per series: enter series → visit point ×N (→ note) | the series whose move is largest | `rect.line-hit[data-mark]` only where a point has detail; the point is addressed by series + category, which is enough |
| slope / dumbbell | `entity` = `polyline.slope-line` / `line.slope-bar[data-mark]` | frame (the column pair) → compare entity ×N (→ note) | the largest move | — |
| scatter | `point` = `circle[data-mark]`, `trend` = `line.scatter-trend` | frame → visit point ×N | the outlier the narrator names | no `data-value` on points; not needed for a ref |
| heatmap | `row`, `cell` = `rect.heatmap-cell[data-mark]` (index = row × cols + col) | frame → peak column → per row: enter row → peak high → peak low → note | the shared peak column | the row is only in `data-label`; stamp `data-row` / `data-col`. The hidden screen-reader table must never be a target |
| map | `region` = path `[data-mark]` (several paths share a row) | frame → visit region ×N | the largest region | — |
| bullet | `measure` = `rect.bullet-measure[data-mark]`, target `[data-marker]` | frame → verdict (the tally) → compare measure vs target ×N | the tally | — |
| radar | `series` = `polygon.radar-poly[data-series]`, `axis` = axis label `[data-mark]` | frame → (scale) → enter series ×S (→ note) | the first series | dots carry no axis index; stamp `data-axis` if a scene ever visits a vertex |
| radar quadrant | `sector` = `path.radar-sector[data-group]` | frame → visit sector ×N → peak group | the top group | — |
| quadrant | `point` = `circle[data-mark]`, `cell` = `rect.quadrant-tint[data-cell]` | frame → axes → enter cell ×4 (counts) → visit point ×N | the cell with most items | — |
| gantt | `lane`, `task` = `rect.gantt-bar[data-mark]`, `milestone` = `polygon.gantt-milestone` | frame → enter lane ×L → visit task ×N (→ note) | the first milestone | lanes carry `data-label` only; stamp `data-lane` on tasks |
| word-cloud | `word` = `text.wc-word[data-rank]` | frame → peak (the leader) → visit tier | the leader | no `data-mark`; use `data-rank` as the id |
| progress | `row` = `.progress-row[data-label]` | visit row ×N | the row furthest behind | — |
| timeline-list | `event` = `.timeline-item` | visit event ×N | the last event | `data-label` holds the date; id by index |
| kanban | `column` = `.kanban-column`, `card` = `.kanban-card` | enter column ×C → visit card ×N | the fullest column | — |
| roadmap (horizons) | `horizon` = `.horizon-head`, `bet` = `li[data-label]` | enter horizon → visit bet ×N | the first horizon | the default table variant has no narrator; it runs as a table (below) |
| matrix-grid | `row`, `cell` = `span.cell` | frame (axes) → enter row → visit cell ×N | — | stamp `data-row` / `data-col` |
| journey | `section` = `li.journey-stage`, `task` = `li.journey-task` | (mood scale) → enter section → visit task ×N → peak low → peak high | the lowest task | — |
| state-chart | `state` = `.state-node[data-mark]` | shape → visit state ×N ("From X…") | the start state | transitions carry no ids; a transition is spoken as its source state |
| flowchart | `node` = `.fc-node[data-mark]`, `edge` = `g.fc-edge-group[data-edge]` | **no narrator today** | — | needs a narrator, and edges need `data-from` / `data-to` |
| diagram (Mermaid) | `node`, `edge`, `message` in Mermaid's own DOM | frame → per the Mermaid reading | — | **Lattice stamps nothing.** Verify Mermaid's ids survive, then stamp `data-mark` from the parsed source |
| table | `row` = `tbody > tr`, `column` = header `th`, `cell` | frame (the header) → visit row ×N | — | no narrator binds rows; the slide's text is read. Add a table narrator that emits row refs |
| kpi / stats | `stat` = list item | visit stat ×N | the first stat | no narrator; bind through `handles` |
| matrix-2x2, verdict-grid, cycle, list-steps, list-tabular | `item` = list item | visit item ×N | the first item | no narrator; bind through `handles` |

**The scene is declared in the component's manifest**, beside `handles`, so it lives with the
component's other contracts. `tools/build-guide-handles.js`, which already projects `handles` into
`guide-handles.generated.ts` for the Guide, projects `scene` the same way. A narrated chart
without a `scene` fails `build:check`.

## 7. What Vetrina has, and the one thing it needs

**Everything in §4 except one move exists today** (`docs/src/lib/vetrina/stage.ts`): `circle`,
`underline`, `wash`, `bracket`, `tap`, the cursor's `point`, and `gestureRest`. Each takes an SVG
element or a text range. `focusContent` in `guide-kernel.ts` does the fade.

**Missing: `trace`,** a stroke drawn along a path. Every Vetrina stroke is built from rectangles,
and nothing reads path geometry. Expressive's `enter` for a line or a slope needs it. It would be
built as an overlay clone of the path with `stroke-dashoffset` animating to 0, in `--vt-accent`,
cleared on the next act. It is a new entry on `SANCTIONED_GESTURES` (`tools/check-ownership.js`),
added with its meaning.

**The exported player needs Vetrina for expressive.** Today it ships only the focus director.
Measured: `createStage` bundles to 35,350 bytes minified (11,347 gzipped). It would ship only in
an `expressive` export. `restrained` and `somber` need nothing beyond what the player already has.

## 8. The regression net: a score per component per delivery

A **score** is the executed script for one slide under one delivery, one line per sentence:
sentence → act → resolved unit → expression. For example:
`"Feb 2026, three point two." → visit → circle.line-dot[s0][Feb 2026] → focus, peers 0.30`.

- A pure function, `score(slide, narration, delivery)`, computes it in the kernel, the same code
  both surfaces run.
- **A scene deck, `examples/delivery-scenes.md`**, has one slide per component in §6. Its scores
  under all three deliveries are committed as golden files. A change to one delivery's style
  diffs only that delivery's goldens. A change to one component's scene diffs only that
  component's rows. Any unexpected diff is a failing test, before anyone plays anything.
- **A filmstrip per delivery** is the human check: the scene deck played on the real Studio (desktop
  and WebKit iPhone 15 Pro) and in the exported player, one still per act, sent for review. That
  is the visual gate (QUALITY BAR, HARD RULE #23), and the scores are the machine gate.

## 9. Order of work

Each step is one commit and stands on its own.

1. **Binding.** Add `refs` to every narrator, carry them in the LTT, and resolve them by
   selector. Gate: every generated sentence that names a unit resolves on the corpus.
2. **Scenes.** Add the `scene` manifest field, the schema, the projection and the
   `build:check` gate, plus the stamp gaps in §6 (`data-cat`, `data-row`/`data-col`, `data-lane`).
3. **Styles.** Add `lib/core/delivery-styles/{restrained,expressive,somber}.mjs`, one pure map
   from act to expression each, and replace `DELIVERY_PRESETS`' budget and floor. Add the score
   function and the goldens.
4. **Vetrina `trace`**, and Vetrina in the expressive export.
5. **The scene deck and the filmstrips** (HARD RULE #9), sent for sign-off.
6. **The gaps with no narrator:** table, flowchart, Mermaid, and the CSS-only components.

## 10. Forks for the owner

1. **Retire the moment budget** (2 / 4 / 1 were the owner's numbers). Restrained walks every bound
   sentence, and somber gestures only the key beat. Recommended.
2. **Expressive draws ink on every act** that has an expression in §4, not only on the top moment.
   That reverses §6.1's "ink only on expressive's top moment". Recommended, because the ink is how
   expressive differs from the other two.
3. **Ship Vetrina in the expressive export** (+11 KB gzipped, expressive only). Recommended;
   otherwise a sent expressive deck looks like restrained.
4. **#2415.** Fix the checker's two findings and merge it (the export, the lexicon, detail order,
   the leave beat), then do this work as a new PR from `main`. Recommended over holding, because
   none of #2415's other items depend on the budget and this design replaces only the director's
   policy.

**Owner's answers (2026-09-27):**

1. Budget: **retired.**
2. Expressive: **ink on every act.**
3. Vetrina in the export: **not yet.** An exported expressive deck plays with focus only until a
   later PR, so it looks close to restrained. Step 4 builds `trace` for the Studio only.
4. #2415: **held.** This work lands on the same branch and merges with it.

## 11. Not verified yet

- Whether Mermaid's rendered SVG keeps ids a ref can address (§6, diagram). Rendering one
  `diagram` slide settles it before step 6.
- The inventory read each narrator's sentence ORDER from its assembly code, not every branch.
  Step 1's corpus gate is what proves every bound sentence resolves.
- No filmstrip exists yet: §4 is a specification, not a verified look.
