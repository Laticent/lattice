# The mark contract — how a mark declares its colour

**Status:** plan, revision 2, pre-implementation. Revision 1 was written, put to
the adversarial trio (HARD RULE #25) and **found unshippable** — three hard
breaks, each verified against the tree. This revision carries the corrections
and three forks that are the repo owner's call, marked as such.

Read `scoring.md` for the measurement that forced this and `spend-rules.md` for
what a finish is then allowed to do.

---

## 1. The problem

`tools/chart-language-census.js` over the rendered gallery: the family keys its
marks five different ways, and **6 of 21 members carry no slot attribute at
all**. A finish written against `[data-cat]` reaches 5 members.

The cheap fix is barred, because the attributes do not mean the same thing:
stamping `data-cat` on a gantt bar would call a STATUS a category, and on a
radar polygon a SERIES.

**Two corrections to revision 1's table, both from the trio:**

- **`data-mark` is not a slot.** It is the per-figure mark INDEX for the
  popover, reveal and Anima layers, with live readers in
  `docs/src/playground/chart-interact.js:92`, `docs/src/lib/chart-anima.ts:236`,
  `lib/components/chart/_chart-family/mark-detail.js:47` and a dozen more, and
  a test pinning it (`docs/src/lib/chart-anima.test.ts:384`). It is also
  numerically different: `map.transform.js:216` computes the hue as
  `(i % 6) + 1` while `data-mark` is the unbounded row index `i`, so on a
  7-region highlight map they disagree. Revision 1 filed eight members under
  `data-mark` and called commit 2 "renaming, not inventing". For **funnel,
  piechart, map and state-chart** there is no slot value in the DOM at all.
- **`timeline-list` and `kanban` were misread in both directions.** Their
  `data-s` is on the `.chart-status` pill, which is chrome, not on the mark.

## 2. What a mark declares

### 2a. The names

Revision 1 used `data-slot`, `data-fill` and `data-register`. Three of those
collide with vocabulary this repo has already spent:

| revision 1 | already means | scale |
|---|---|---|
| `data-slot` | a component's authored content regions | **69 of 69** manifests carry a `slots` block; 171 shadcn uses in `docs/src` |
| `data-register` | a deck-level front-matter key | **18** in `base.registers.docs.md` |
| `…="backdrop"` | the finish layer behind content | `finish:` is documented as "the palette-blind backdrop layer" |
| `data-fill` | — | sits on the same `<rect>` as SVG's own `fill` and means something else entirely |

The repo's grammar for a colour token is **owner-then-role**, and the role
vocabulary is small and stable: `-hue` (89 uses), `-ink` (57), `-mark` (46),
`-fill` (40). The contract follows it:

| name | says |
|---|---|
| `data-hue="1..8"` | which of the family's eight hues this mark takes |
| `--mark-hue` · `--mark-ink` · `--mark-fill` | this mark's resolved colour, however it was keyed |
| `--mark-retreat: 0..1` | how far a finish may pull this body back |

**`--mark-ink` already exists doing exactly this job.** `slope.styles.css:87`:
*"`--mark-ink` is the local channel: one rule per status re-points it, and the
mark reads it."* The contract generalizes it rather than inventing a synonym,
and in doing so replaces **five** local names for one idea — slope's
`--mark-ink`, gantt and progress's `--fill-hue`/`--fill-ink`, matrix-grid's
`--row-*`, quadrant's `--cell-*`, kanban's `--col-hue`.

`data-hue` carries its own honesty: a gantt bar has **no** `data-hue`, because
its colour is a status and not one of the eight. Absence reads as correct rather
than as a gap — which is what broke revision 1, where a "21 of 21 stamped"
target forced a lie onto state-keyed marks.

`--mark-retreat` collapses revision 1's two attributes into the one number the
cascade needs. A ramp is held at `0` because scaling it deletes the magnitude
(`spend-rules.md` §1d); a text-bearing mark is held at `0` because
`--cat-on-mark` was solved against a full-strength mark (§5). Different reasons,
same answer, and a finish only ever needs the answer. Both reasons stay in the
manifest.

The shadcn `data-slot` overlap is **not** why the name changed: measured, there
is no bare `[data-slot]` rule anywhere in `docs/src`, every shadcn rule is
value-qualified, and slide markup reaches the docs site through a `srcdoc`
iframe. The rename is for the 69 manifests, not for shadcn.

### 2b. The manifest — `marks`, inside the optional `kernel` block

```jsonc
"kernel": {
  "figureClass": "bar-figure",
  "marks": [
    { "class": "bar-mark", "keyed": "hue", "encodes": "hue", "bearsText": false }
  ]
}
```

Inside `kernel`, not at the top level: `manifest.schema.json` is one schema for
all 13 buckets with `additionalProperties: false` and no `if`/`allOf`, so a
bucket-conditional `required` is not expressible. `kernel` is already the
chart-only optional block, and `figureClass` is already required *within* it —
which is what makes the "same shape as `figureClass`" analogy actually true.

## 3. What CSS does with it

### 3a. The slot table — and the selector head that is load-bearing

```css
:is(section.chart-frame, figure.chart-frame) [data-hue="1"] {
  --mark-hue:  var(--chart-cat-1-hue);
  --mark-ink:  var(--chart-cat-1-ink);
  --mark-fill: var(--chart-cat-1-fill);
}
```

**The leading `:is(section…, figure…)` is not style — it is the difference
between working and painting everything black.** Revision 1 wrote
`.chart-frame [data-slot="1"]`. `packSelector` (`lib/engine/css.js:380`) treats
any non-literal-`section` leftmost compound as a slide DESCENDANT, so that
packs to `article.lattice > section .chart-frame [data-slot="1"]` — and
`chart-frame` is a class **on the section**, so it matches nothing and every
migrated mark falls to SVG's black initial value. Measured on the rendered
gallery: `section .chart-frame [data-cat]` → 0 matches, `section.chart-frame
[data-cat]` → 56.

The failure is reviewer-invisible: the packed path is the live Playground,
Studio and `--player`, while the UNPACKED path — the emulator, therefore
`npm run preview`, the committed gallery PDFs and the demo deck HARD RULE #9
asks for — renders correctly. No CI gate catches it either;
`tools/check-viz-render.js` exists for exactly this failure class and is an
on-demand script, absent from `.github/` and `tools/build.js`.

`packSelector` step 0 distributes a leading `:is(…)` so each arm scopes by its
own combinator, which is why the corrected head works. It is also the family's
own idiom — 13 member stylesheets already lead with it — and the code comment
at `lib/engine/css.js:370-379` records this exact bug happening to `--map-base`
once already.

**Every consumer needs a fallback.** `stroke: var(--mark-ink)` on a mark with
no `data-hue` is invalid-at-computed-value-time, which is black again. Write
`var(--mark-ink, var(--chart-cat-1-ink))` — the member default that
`bar.styles.css:38` already carries for this reason.

### 3b. State-keyed marks — and the worked example that was wrong

Revision 1 wrote `.gantt-bar[data-s="at-risk"] { --slot-ink: … }` and claimed it
beats the family table. It does not: `tools/build-css.js:562` bundles
`chart-family.css` AFTER every component sheet (`dist/lattice.css:6262` for
gantt vs `:26593` for the family), so at equal specificity — both `(0,2,0)` —
the family table wins and every gantt status flattens to one hue. That is the
same failure `spend-rules.md` §7 already records from the prototype.

The real gantt rule survives, because it is `(0,3,1)`:
`:is(section.gantt, figure.gantt) :is(.gantt-bar, .gantt-milestone)[data-s="at-risk"]`
(`gantt.styles.css:123`). Progress and waterfall are the same shape. So **the
tree is safe and revision 1's example was not** — anyone implementing from it
literally ships the bug.

The rule this makes explicit: **a state-keyed member sets `--mark-ink` at its
own full member specificity, and does not stamp `data-hue` at all.** Its colour
is not one of the eight.

Revision 1's sample also named `--chart-state-warn-ink`, which does not exist;
the token is `--state-warn-ink`. `checkPhantomTokenReads` would have caught it.

### 3c. What the collapse is actually worth — measured, and much smaller

Revision 1 claimed "six rules become one, on every member that cycles". The
trio counted what exists to collapse: **25** `[data-cat]`-keyed rules (line 15,
stacked-bar 10) plus **25** `nth-of-type`/`nth-child` rules naming a numbered
cat token (bar 6, kanban 5, matrix-grid 8, piechart 6). That is **6 members of
21**, and bar's six are label ink, not the mark.

The reason is §3d, and it is the single biggest correction in this revision.

### 3d. Nine members paint where a custom property on the mark cannot reach

Measured per member on the rendered gallery — filled marks / via `url(#defs)` /
with an inline-or-attribute fill:

```
bar          4 /  4 / 4      piechart    11 /  6 / 11
gantt       18 /  9 / 9      quadrant    14 /  4 / 4
map        184 /  1 / 9      radar       27 /  4 / 7
state-chart 22 /  5 / 5      waterfall    7 /  5 / 5
word-cloud   1 /  1 / 1      journey     26 /  0 / 21
```

Demonstrated on a live pie wedge: its fill is `style="fill:url(#pie-wedge-11-1)"`
and the numbered token lives in the `<stop>`'s own inline style inside `<defs>`.
Setting `--mark-hue: #ff0000` on the wedge changes nothing — **the `<stop>` is
not a descendant of the mark**, so nothing set on the mark inherits to it.
`state-chart.transform.js:922` documents exactly this. And `bar.styles.css:12`
says a CSS `fill` there "would BEAT that presentation attribute and throw the
gradient away."

So addressability is necessary and **not sufficient**. `data-hue` makes a mark
selectable; it does not make its body repaintable. For those nine members a
finish reaches the body through `fill-opacity` and the edge, or not at all —
which is a constraint on the finishes, not a defect in the contract, but it has
to be stated before anyone budgets the finish work.

## 4. The texture channel — REMOVED from this plan

Revision 1 made `data-slot` the a11y and print texture selector too, collapsing
those blocks to "one rule per slot for the whole family", and called that the
test of whether the contract is real. **By its own test it fails.** That rule
would texture:

- **`bullet-measure`** — `base.print-textures.css` says outright that bullet is
  *deliberately untextured*, because its layers separate by VALUE and a texture
  "would fight the measure bar";
- **`radar`** — `layered`; a pattern fill destroys the translucent composite the
  member rests on;
- **`map`** — `ramp`; a flat pattern deletes the magnitude across 167 regions;
- **`matrix-grid`** — `presence`; a pattern erodes the filled/outlined
  distinction;
- **`line-series` and `sbar-name`** — text labels, hatched inside the glyphs;
- **`line-path`** — `fill: none`, so `!important` fills the open path's implied
  closed region.

It also cannot express what is there: waterfall's textures are non-contiguous
by design (`up→1, down→3, total→5`), the stroked members key dashes on a
different axis, and the a11y ramp is 6 wide while `data-hue` is 1–8.

The texture blocks stay as they are. **The finish hook and the texture hook are
different questions and one attribute must not decide the second by accident.**
Revision 1's rule counts here were also wrong — "ten rules on the seven
Cartesian members" was lifted from a stale in-file comment; measured, it is 21
Cartesian rules, 12 piechart, and two legend-swatch sets, not one.

## 5. How it is enforced

**Not by text-matching the transform.** Applying `figureClass`'s exact predicate
(`src.includes('class="X"')`) to a plausible `marks` block fails on **6 of 28**
mark classes that are declared correctly — `bar-mark` and `scatter-dot` among
them, i.e. two of the five members revision 1 put in commit 1 — because those
transforms build the class by concatenation (`const cls = shape.diverging ? …`).
It also passes on comment-only mentions: `class="chart-detail"` appears in
gantt's and piechart's transforms **only inside comments**, the real emitter
being `_chart-family/mark-detail.js`. And `matrix-grid` is structurally
unreachable — its cells are tagged at parse time by
`lib/core/matrix-grid-cells.js`, so its transform writes no mark class at all.

A blind spot is a false negative and survivable. This is a **false positive**:
the gate rejecting a truthful declaration.

So the enforcing arm is the **rendered census**. Extend
`tools/chart-language-census.js` to assert, per member, that every declared mark
class appears in the render and carries its stamp — immune to how the class was
assembled. Two static arms stay, because they are cheap and sound: the `marks`
block exists, and every declared class appears in the member's own
`.styles.css` (verified feasible for all 22 classes).

**The census's own denominator has to be fixed first.** Its `markSel` is a
hand-maintained list of 30 class names — the exact artifact `marks` exists to
abolish — and it already contains a dead entry (`timeline-marker` appears
nowhere in `lib/`). Build `markSel` from the `marks` blocks, or the gate
certifies itself.

**No new build step.** `tools/build-chart-registry.js` already reads these
manifests' `kernel` block, already emits `LAYOUTS` / `FIGURE_CLASSES` /
`KERNELS` into `_chart-family/chart-registry.generated.js`, and already has a
`--check` freshness gate. `MARKS` is one more export on it. Revision 1 cited
`build-stage-catalog.js` and proposed a parallel generator; that was the wrong
precedent.

## 6. Three forks — the repo owner's call

**Fork A — commit order.** Revision 1 killed `data-cat` last, which leaves two
attributes for one fact across three commits and is the drift this repo hates.
Two better orders:

- **A1 (recommended)** — migrate the consumers to accept EITHER
  (`[data-cat="0"], [data-hue="1"]`), then stamp per cohort, then delete
  `data-cat` as a pure deletion. Each stamping commit ships independently
  correct and nothing is ever half-consumed.
- **A2** — delete `data-cat` in commit 1 on the five members that already carry
  a slot. Shorter, but `svg-legend.js:161` emits `data-cat` for every
  legend-bearing member from one shared file, so commit 1 would have to touch
  all of them at once.

**Fork B — do text labels carry `data-hue`?** `data-cat` is stamped today on
`line-series` and `sbar-name` so a label wears its series ink. `marks` declares
MARK classes. Either labels also get the attribute, or they lose their
per-series ink, or `data-cat` survives for them and two conventions persist.
**Recommendation: labels get `data-hue` and a `bearsText: true` entry** — the
label IS the join (`spend-rules.md` §3), so it belongs in the contract.

**Fork C — is this still worth building?** The honest case against, from the
inversion pass: the three finishes have never shipped, so nothing a reader sees
regresses if the contract never lands. The day-one payoff is real but small —
about 50 rules across 6 members, roughly 1% of chart CSS. And §3d says the
contract is necessary but not sufficient for the finishes, which additionally
need the `frame:` register (a whole new front-matter register, unbuilt) and
per-group track emission on ~13 transforms before `ground` is distinguishable
at all. The repo has a two-day-old precedent for stamping something no consumer
reads: `--i`, emitted by six transforms, read by **zero** CSS rules.
**Recommendation: build it, but sequence the `frame:` register decision first**,
so the contract is not stamped for a consumer that never arrives.

## 7. Banked while this was being checked

Two defects found on the path of this work, to be fixed with it (HARD RULE #18,
not logged as follow-ups):

- **`quadrant.styles.css:218-241` is stale.** It says the zone label "sits on
  the vivid pie-matched zone fills" and derives a 65% ink mix from that.
  Measured by rendering the quadrant gallery: **0 of 8 labels overlap any
  `.quadrant-tint`**. `cornerPositions` moved them outside the plot box. So
  `.quadrant-label` is `bearsText: false`.
- **`themes/a11y-base.css:391-396` textures `.chart-key-swatch[data-cat]` inside
  `section.scatter` and `section.slope`.** Neither member calls
  `buildSvgLegend`. Those selector arms match nothing.

And one deletion this work makes free: **`--i` is dead** — emitted by bar,
bullet, funnel, line, slope and stacked-bar, read by zero CSS rules repo-wide.
Those six transforms are open anyway.
