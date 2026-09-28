---
status: in-progress
summary: A fresh design for how a narrated deck presents itself with no author in the room. One expression vocabulary (focus, highlight, underline, encircle, mark, point, trace, sweep, connect) defined once over one set of addressable units (word to paragraph, bullet, table row, column, cell and both headers, chart mark, series, axis, legend and figure), ten structural archetypes that every one of the 71 components maps onto, a gesture storyboard in every component manifest, and three delivery storyboards (restrained, expressive, somber) that choose expressions per act with intent. The live Guide adopts the engine's existing authored `_focus` grammar instead of a second vocabulary. Replaces the delivery-styles work in #2415, keeping its narration binding, its corpus gate and its score goldens.
companion:
  - ./2026-09-27-delivery-styles-and-component-scenes.md
  - ./2026-09-25-vetrina-delivery-presets.md
  - ./2026-06-16-focus-highlighting.md
  - ./2026-07-05-vetrina-walkthrough-library.md
---

# Guide storyboards: a deck that presents itself

**Status:** accepted (owner, 2026-09-27); the answers are recorded in §11.

## 1. The goal, in one paragraph

A deck is sent to a board member, a prospect or a team, and it plays itself. Nobody is in the
room to point. The narration says what matters; the slide has to show it: the number being read
lights up, the row being compared stands out, the line that moved is traced, the claim is
underlined. Done well, a viewer never notices a "feature"; they just follow. Done badly, it is
karaoke. The bar is the one the owner set: natural gestures a skilled presenter would make,
never gimmicky, different in character per room, and lean enough to run on a phone.

## 2. What #2415 taught (the lessons, measured)

| # | Lesson | Evidence | What this design does |
|---|---|---|---|
| L1 | **Guessing the target from the words breaks.** Every text matcher added a new failure. | The checker found a table-row matcher landing on a chart's hidden screen-reader table. | Keep #2415's binding: the narrator names the unit it reads (`narrateChartScript`), and extend binding beyond charts (§7). |
| L2 | **A delivery that is only numbers is not a character.** Budget 2 left most of a chart dark. | Owner: "not seeing anything in line and funnel". | A delivery is a storyboard: which expression each act gets (§6). No budgets. |
| L3 | **Two vocabularies drift.** The live Guide invented `.lat-guide-dim`; the engine already had `_focus` with row/col/cell/item/line/mark/series and spotlight/ring/fill/blur/pop. | `lib/transformers/focus.js`, `lib/base/base.focus.css` | One vocabulary. The Guide drives the same axes and looks an author writes (§4, §5). |
| L4 | **Opacity alone reads as nothing on a phone.** | Filmstrip: somber at 0.62 was invisible at iPhone size. | Focus is color plus recede, not recede alone (§4). |
| L5 | **Accent on an accent-colored mark changes nothing.** | 2026-09-25 note §6.1: indaco's first series IS the accent. | Content-aware ink: a chart mark focuses by weight and heading ink, a text run by the accent (§4). |
| L6 | **SVG paint does not animate between tokens.** | 2026-09-25 note §6.1: a `color-mix()` paint interpolated to pure yellow. | Paint switches in one step; opacity and ink carry the motion. |
| L7 | **The pointer's body is not centered on its point.** | #2415: the resting hand lay across a paragraph. | Keep #2415's tip-anchored clearance. |
| L8 | **A harness that feeds itself proves nothing.** | The player check injected its own bindings while the real export dropped them. | Every surface is verified from the real Studio export (§9). |
| L9 | **Galleries are not the corpus.** | 27 bindings missed on example decks the gallery gate never read. | Gates read every tracked deck. |
| L10 | **Changing font weight to emphasize moves the text.** | `base.focus.css` spotlight sets `font-weight: 600`. | Live expressions never change metrics: color, background, opacity, ink only. |

## 3. Units: everything a gesture can address

One address space, shared by the author's `_focus`, the narrator's binding and the Guide.

| Family | Units | How it is found | Exists today? |
|---|---|---|---|
| **Text** | heading, eyebrow, paragraph, sentence, phrase, word, number | DOM text ranges (`wordRangeIn`, `sentenceRange`) | yes (Guide kernel) |
| **List** | item, item's bullet (marker), item title, item body | `li`, `::marker` box (`markerBox`), manifest `handles` | yes |
| **Card** | card, card name | manifest `handles` | yes |
| **Table** | row, column, cell, column header, row header | `tr`, nth column, `td`, `thead th`, first cell | row/col/cell yes; headers as units: new |
| **Chart** | mark (bar, wedge, stage, cell, point, state), series (line, polygon), category (axis tick), axis (ticks + title), legend entry, value label, figure | `data-mark`, `data-series`, `data-mark-for`, `text.cart-cat`, `.chart-body` | marks/series yes; axis and legend as units: new |
| **Flow** | node, edge, lane, stage | `data-mark`, `data-id`, `data-edge` | nodes yes; edges need `data-from`/`data-to` |
| **Media** | figure, image, code line, formula | `figure`, `img`, code `line` axis | yes |

## 4. Expressions: what the Guide can do to a unit

Three layers, each with one job. A gesture is a combination.

**Content state** (changes the element itself; engine CSS, the same looks `_focus` renders; never
changes a box's size):

| Expression | What the viewer sees | Text | Table | Chart |
|---|---|---|---|---|
| **focus** | the unit takes the ink of emphasis, the rest recedes | text → accent color; peers dim | row/col/cell → accent text, others dim | mark → heading-ink edge and full strength (L5); peers dim |
| **highlight** | the unit takes a soft band behind it | accent-soft background, text in accent | row/col/cell fill (`list-fill`) | mark → soft halo band (a background rect), for marks under a label |
| **ring** | an outline around it, nothing dims | outline | the existing row/col/cell ring | outline stroke |
| **recede** | only the rest dims (the old Guide default) | — | — | — |

**Ink** (drawn over the slide by Vetrina; leaves when the act ends):

| Expression | Meaning | Targets |
|---|---|---|
| **underline** | "this is the claim" | a word, phrase, line, or a whole paragraph (one stroke per line) |
| **encircle** | "this one, among many" | any unit; a circle for a compact box, an ellipse for a wide one (new: aspect-fit) |
| **mark** (wash) | "these words" | a phrase inside a block |
| **bracket** | "this whole block" | a paragraph, card, table region, figure |
| **trace** | "follow this line" | a series (#2415) |
| **connect** | "from this to that" | two units: a drawn arrow between them (new) |
| **tap** | "this dot" | a small mark |

**Hand** (the cursor; Vetrina `point`): **point** (rest beside a unit, never on words: L7),
**sweep** (glide along an axis or across a row while it is read), **travel** (from one unit to
another during a comparison), **withdraw** (leave the slide to the reader).

## 5. Archetypes: every component is one of ten structures

A component inherits its archetype's units and key beat and overrides only what its own render
does differently. That keeps 71 manifests lean: 40 declare one line.

**Assigned from the render, not the name** (audited 2026-09-28: the first slide of every
component's own gallery, rendered and walked). The audit moved seven components the first draft
of this table had filed by name: `list-tabular`, `statute-stack`, `actors`, `authority-chain`,
`regulatory-update`, `kpi` and `stats` all render a list (`li`), not a table; `decision` and
`premise` render a list of reasons; `roadmap` renders a real `table`.

| Archetype | Components | Units it offers (`lib/core/gesture-archetypes.json`) |
|---|---|---|
| **statement** | title, closing, divider, topic, quote, big-number, content, citation-card, redline | heading, paragraph |
| **list** | list, agenda, checklist, cards-stack, q-and-a, inventory, stats, kpi, list-steps, cycle, actors, authority-chain, list-tabular, statute-stack, regulatory-update, decision, premise, policy-recommendation | item, title, heading |
| **grid** | cards-grid, team-profile, logo-wall, pricing, verdict-grid, matrix-2x2 | item, title, heading |
| **table** | table, glossary, obligation-matrix, matrix-grid, roadmap | row, column, cell, colheader, rowheader, heading |
| **compare** | split-compare, compare-prose, compare-code, split-panel | side, item, heading |
| **cartesian** | bar, stacked-bar, line, waterfall, slope, scatter, heatmap, gantt | mark, series, figure |
| **part** | piechart, funnel, progress, bullet, word-cloud | mark, figure |
| **field** | quadrant, radar, map | mark, figure |
| **flow** | flowchart, state-chart, journey, kanban, timeline-list, diagram | node, step, figure |
| **media** | image, video, code, math, contact, wifi, scene | figure, paragraph, heading |

What the audit found that a name would have hidden:

- **Grids are lists laid out in columns.** Every grid renders `li` cards, so `grid` and `list`
  share a selector; they differ in how a delivery gestures them (a card is encircled, an item is
  underlined: §6), which is why they stay two archetypes.
- **Compare components each draw their sides differently**: `.compare-left`/`.compare-right`,
  `.panel-left`/`.panel-right`, `compare-code`'s `.code-col`, and `compare-prose`'s two top-level
  items. The archetype names the first two; the other two override `side`.
- **Variants change structure.** `statute-stack lane` draws a table where the default draws a list,
  so statute-stack adds a `row` unit.
- **Some structures exist only in the browser.** A `diagram` is Mermaid, drawn client-side, so in
  the build it is a `pre`; its nodes are not addressable until Mermaid output is stamped (task
  "gaps", §12).
- **Eight more components override a unit**: big-number (`number`), quote (`quote`), redline
  (`change`: its insertions and deletions), image (`figure` is the `.lattice-bg`), math (`figure`
  is the formula), diagram, compare-code and compare-prose (`side`). The 22 charts and flows that
  #2415 gave a `scene` keep their named units (`stage`, `point`, `lane`...) as overrides.

## 6. The three deliveries, as storyboards

Each sentence of narration performs an **act** (#2415's vocabulary, kept): `frame` (how to read
it), `enter` (a group begins), `visit` (one unit and its value), `note` (a detail on it),
`compare` (two units), `peak` (an extreme), `verdict` (the slide's claim), `aside` (names
nothing). A delivery's storyboard says which expression each act gets. The component's storyboard
says which unit each act lands on.

### restrained: the careful reader's highlighter

For the boardroom and the board member reading the file alone. No cursor, no drawn ink: the slide
itself responds, the way a highlighter pen would. Every named unit is shown; nothing performs.

| Act | Expression |
|---|---|
| frame | nothing moves; the figure is whole |
| enter | focus the group (its text in the accent, the rest dims) |
| visit | focus the unit; a number read aloud in prose takes a highlight |
| note | hold |
| compare | focus both units, the rest dims |
| peak | highlight the unit (the one soft band on the slide) |
| verdict | underline-weight focus on the heading: the heading takes the accent color, nothing else |
| aside | hold |

### expressive: the presenter's hand

For a sales room, a lesson, a talk. The hand is on the slide; ink says what kind of sentence this is.

| Act | Expression |
|---|---|
| frame | the hand sweeps the axis (or the table's header) once |
| enter | trace a series; bracket a group; focus it |
| visit | the hand points at the unit; focus it |
| note | mark the unit's label |
| compare | connect the two units with an arrow; focus both |
| peak | encircle the unit; highlight it |
| verdict | underline the claim; the hand withdraws |
| aside | the hand rests |

### somber: stillness

For bad news. One gesture, on the key beat the component names; slow; no accent color at all (the
focus takes the heading's ink, not the brand accent); no hand, no drawn ink, no read-along.

| Act | Expression |
|---|---|
| the key beat | focus the unit in heading ink, the rest dims slowly (600 ms), held to the slide's end |
| everything else | nothing |

### The venue matrix (what an author picks)

| Room | Delivery | Captions |
|---|---|---|
| boardroom, live | restrained | off (a speaker is there) |
| a board member reads the file alone | restrained | on |
| sales room, prospect | expressive | on |
| lightning talk | expressive, `pace: brisk` | on |
| lunch-and-learn | expressive | off (the slide reads along) |
| bad news, a loss | somber | on, still |

## 7. The component storyboard, in the manifest

Every manifest has a `gesture` block. Lean by default: most name their archetype and nothing else.

```jsonc
"gesture": {
  "archetype": "part",                // inherits units + key from the archetype
  "units": {                          // only where this render differs; a same-named unit replaces
    "stage": { "select": "polygon.funnel-band[data-mark=\"{mark}\"]", "labels": "[data-mark-for=\"{mark}\"]" }
  },
  "key": "last"                       // the beat somber lands on, when it differs
}
```

- **One archetypes file**, `lib/core/gesture-archetypes.json`, not ten: the defaults are ten small
  objects and read best side by side. `beats` (act → unit) waits for step 4, which is the first
  thing that reads it.
- **One merge**, `mergeGesture` in `lib/core/scene-resolve.mjs`. The build and the gates call it
  through `lib/core/gesture.js`; the Guide calls it on lookup. The generated catalog ships the
  archetypes once plus each component's own block: shipping 71 merged copies cost the player's
  Guide 13.6 KB (50.5 KB to 64.1 KB, over §8's budget); shipping the parts costs 4.7 KB (55.2 KB).
- **Placeholders are the binding's ids.** Tables use matrix-grid's existing `{tr}`/`{td}`, 1-based
  as `:nth-child` counts. With the ids removed a selector matches every unit of its kind
  (`anySelector`), which is how peers are found. List, statement and media units carry no ordinal
  yet: `:nth-child({n})` counts siblings per parent, so on a two-column slide item 1 would be two
  items (checker, 2026-09-28). Step 3 adds an ordinal counted across the slide.
- **A binding plays only on the slide it was written for.** Every component now has a gesture, so
  "has a gesture" no longer says a binding belongs to a slide, and archetypes share unit names with
  narrators under other ids (a table's `row` is `{tr}`, a heatmap's is `{row}`). The test is that
  some ref RESOLVES on the slide, checked once per slide in `scene()`. A chart narrator that reads a
  prose slide as a board (kanban's docs, rendered as `content`) resolves nothing, and the whole slide
  reads its words, as before. The corpus gate skips such a slide only when its component names no
  units of its own; a chart whose narrator's units have all drifted from its manifest is reported.
- **Binding goes past charts** (step 3, built 2026-09-28). `bindingRefsFor` in
  `lib/transformers/prose-projection.mjs` records which heading, paragraph, list item or table row
  each span of a slide's narration came from, as ordinal refs (`{ i }`, the i-th unit of its kind
  across the slide). It searches the FINISHED text, the way `emphasisSpansFor` does: each element's
  spoken form is rebuilt with the walker's own helper (`renderListItems`, `tableRowSentences`) and
  located where a sentence can begin, longest first; a form said twice, or overlapping a longer one,
  stays unbound. So the text is byte-identical and no walker changed, and a walker that reorders (a
  KPI speaks its value first) binds nothing rather than something wrong. Measured over every tracked
  deck: 16,301 links (3,984 headings, 4,700 paragraphs, 6,643 items, 974 rows) covering 95.7% of the
  narration text. The units share names across archetypes (`heading`, `paragraph`, `item`, `row`;
  `STRUCTURE_UNITS` in `scene-resolve.mjs`, pinned equal to the archetypes), and `mergeGesture` lays
  them under every component's gesture, so a chart's heading and a closing slide's list resolve too;
  a name the component or its archetype defines keeps that definition (a heatmap's `row` is a
  rect). Cost, jsdom over the 4,118 corpus sections: 8.5 s of 31.7 s of projection, about 2 ms a
  slide, worst 72 ms; it runs when Present opens and on export, not per keystroke. **The Guide plays them**
  (step 4, built 2026-09-28): Present and the Studio's webpage export carry the projection's refs
  beside the chart narrator's, by the same identity test (the refs hold only while the projected
  text is the text read; a caption falls back to the words), and a slide no component claims plays
  as a `statement`. What recedes around a bound bullet, row or paragraph is the text path's own rule
  (`focusUnit`), so a bound sentence and a matched one look alike; a lone paragraph shows nothing.
  Two things moved, on purpose. Somber's one moment on a prose slide is the component's key (a
  list's first item) instead of `salience()`'s pick: the key is what §6 names and the goldens can
  pin. Expressive keeps its underline under words (`ctx.text`) and taps only marks, since the
  underline is what reads as a hand on text. The CLI export still carries no refs
  (`followups.d/2441-p2-cli-export-carries-bindings.md`). Each slide's resolved parts are cached
  per section the first time a sentence is read (§8's plan); a re-rendered section is a new plan.
  **Score goldens per archetype** (`test/fixtures/delivery-scores/archetypes/`): the archetype's
  first component by name whose gallery binds a slide, through its chart narrator or else the
  projection, all three deliveries side by side.
- **Gates** (`test/unit/core/scene-binding.test.js`): every one of the 71 manifests declares a
  gesture, over an archetype the schema's enum and the defaults both name; every slide of every
  component's own gallery draws its archetype's primary unit or one of its own units (a variant may
  draw only its own: roadmap's horizons, statute-stack lane's rows); every unit a manifest declares
  for itself draws on at least one gallery slide; and every bound sentence in every tracked deck
  resolves. The prose gate resolves every one of the 16,301 prose links through the section's OWN
  component's gesture, as the Guide does, back to an element that holds its words: its first word
  and at least half of them, or, for an element of three words or fewer (an item "Q1", a formula),
  its first token and two thirds of all of them, so "Q1" cannot pass for "Q2". Shifting every
  ordinal by one makes it report 16,162 failures. Filing `list` under `table` fails it. The one blind spot is `statement`, whose primary
  is a heading, which every slide has: a component misfiled AS a statement passes. `gesture` is not schema-required, so a component an
  author writes in the Studio still validates without one.

## 8. Lean and fast

- **Resolve once per slide, not per sentence.** When a slide mounts, the Guide resolves every
  bound sentence's unit and peers into a small plan (element lists), so a cue is a class swap.
- **One frame per beat.** Classes only; no layout reads during play except the hand's resting
  place, computed once per unit and cached.
- **Nothing changes size** (L10). Color, background, opacity, outline, ink.
- **Bundle budget.** The player's Guide stays under 60 KB (49 KB with #2415); Vetrina's ink adds
  11 KB gzipped and ships only when the deck is `expressive` (§11 Fork 3).
- **Reduced motion.** Content state still applies; ink and sweeps become still marks; the hand
  jumps instead of gliding.

## 9. Verification (what "done" means)

| Claim | Surface | Artifact |
|---|---|---|
| each delivery reads as its own character | the real Studio, WebKit at iPhone 15 Pro and desktop Chromium | a storyboard sheet per delivery: one frame per act, per archetype (10 archetypes x 3 deliveries) |
| a sent deck plays the same | the real Studio webpage export, played offline | the export test and its filmstrip |
| every sentence lands | every tracked deck | the corpus gate |
| no regression slips | node | score goldens: one per archetype, all three deliveries side by side |
| real phone | an iPhone | the owner's check (UNVERIFIED until then) |

## 10. From #2415: what is kept, what is not

**Kept (moved or cherry-picked):** the narration binding (`narrateChartScript`, `Said`, `compose`);
`lib/core/scene-resolve.mjs`; the corpus gate over every deck; the score goldens; Vetrina `trace`;
the tip-anchored pointer clearance; the share-export binding pass-through; the example deck
`examples/delivery-scenes.md` (as the storyboard deck).

**Not kept:** the three style files (replaced by storyboards over the full vocabulary); the
opacity-only `focusParts` look (replaced by the `_focus` looks); the director's budget plan and
chart walk (no budgets).

**#2415's own items** (the Guide in the exported player, lexicon regions and months, chart details
read with their item, the leave beat, the resting-cursor fix) are independent of all this and
already reviewed (§11 Fork 1).

## 11. Forks for the owner

1. **What happens to #2415.** Recommended: strip it back to its original items (export Guide,
   lexicon, detail order, leave beat, cursor fix) and merge it; this design starts as a new PR from
   `main`. Alternative: close #2415 and carry everything into the new PR.
2. **Focus changes text color** (and dims the rest). The 2026-09-26 round ruled "one lever,
   opacity" after a recolor attempt read weakly on charts. This design brings color back with the
   two lessons that sank it (L5, L6): content-aware ink and no animated paint. Recommended.
3. **Ship Vetrina's ink in the exported player** for `expressive` (+11 KB gzipped). The owner said
   "not yet" on 2026-09-27; but the goal here is a deck that presents with nobody in the room,
   which is the sent file. Recommended now.
4. **Bind prose, lists and tables** through the projection (§7), so no slide is found by its words.
   Recommended; it is the largest piece of work after the vocabulary.
5. **Somber uses no accent color** (heading ink only). Recommended: color is emphasis, and somber
   refuses emphasis beyond the one focus.

**Owner's answers (2026-09-27):**

1. #2415: **closed; this PR carries all of it**, the original items included.
2. Focus: **color and dim, mindful of AA.** So: a focused text run must hold WCAG AA (4.5:1, or
   3:1 at large size) against its own background on every shipped theme in light and dark; where
   the accent fails, the focus takes the theme's AA-passing accent text or the heading ink. A
   receded run stays at or above 3:1, so context is dimmer, never unreadable. Both are gated by a
   contrast test over every theme and mode (§9).
3. Vetrina in the export: **not yet.** The sent file plays content state (focus, highlight, ring)
   and no ink or hand; §6's expressive ink is Studio-only until then.
4. Binding: **everything.** Prose, lists and tables are bound through the projection (§7).
5. Somber without accent color: not asked separately; taken as recommended with Fork 2.

## 12. Order of work (each a commit; one PR)

1. The vocabulary in the engine: `focus`, `highlight`, `ring` as live classes in `base.focus.css`
   shared with `_focus`; Vetrina `encircle` (ellipse fit) and `connect`.
2. Archetypes and the manifest `gesture` block, with the 71-manifest gate.
3. Binding for prose, lists and tables via the projection.
4. The three delivery storyboards and the per-slide plan; score goldens per archetype.
5. The Studio and the player run the plan; Vetrina in the expressive export.
6. The storyboard deck and the storyboard sheets (30), sent for sign-off.
