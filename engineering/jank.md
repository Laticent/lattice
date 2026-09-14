# Jank analysis — does the layout stay put as the content grows?

Every fit gate in this repo asks the same question: *does it fit?* This one asks a
different one: *does it stay put?* A slide can pass every overflow channel we have and
still be wrong, because nothing in the engine measures a box **moving**.

Run it with `npm run check:jank` (`tools/check-jank.js`). This doc is the judgment half —
what the numbers mean, what counts as a defect, and the traps already paid for.

---

## What "jank" means here

Not the web-perf sense (dropped frames, layout thrash). In a slide engine it is: **a fixed
visual element does not stay fixed as the content around it varies.** Three failure modes,
and they need three different measurements — plus a fourth, RE-SOLVE, where the content
never varied at all and the FONT changed underneath it. `check:jank` measures the first
three; the fourth is fixed at its cause rather than swept, and is described at the end of
this section so the model is complete.

**Drift.** An anchor that is supposed to hold position moves as content grows. A running
section mark that sits 22% down the canvas on a one-line heading and 14% down on a
three-line one is a defect *precisely because* the eye expects it in the same place on
every slide. In a still it looks fine. Across a deck it wobbles.

**Collision.** The anchor reaches **readable content** — text, or a replaced element. The
fatal case: one box is `position: absolute` and the other flex-centered, so they lay out
independently and **neither overflows anything**.
`probeSectionOverflow` measures flowed children spilling past the section's rect, and two
boxes painting on top of each other never leave it — so no `⚠ OVERFLOW` line, no red ring,
no "Content clipped" tag, no autosplit. See the *an OVERLAP IS NOT AN OVERFLOW* entry in
`engineering/gotchas/css.md`.

**Crowding.** Content stays inside the frame and eats all its breathing room. The engine's
own warning text already names this case ("a slide that overflows by padding alone is not
tagged"), which is the honest admission that it is unmeasured.

**Re-solve.** The content did not change at all — the FONT did. Every engine `@font-face`
is `font-display: swap`, so a preview document lays out against the fallback face, paints,
and re-solves when the real face lands. This is the one failure mode `check:jank` does NOT
measure, and it is invisible to the sweep by construction: the sweep varies content and
compares slides, while this varies nothing and compares one slide *against itself, one
moment later*. Measured on `/playground/?view=edit` with a `list` + `cards-grid` deck, two
layouts at 197ms and 517ms, the worst text run moving 330.3px. It is fixed at the CAUSE
rather than measured per component — `lib/core/preview-font-gate.mjs` holds each preview
builder's existing reveal until the document's own faces settle. **What that covers is a
document's FIRST reveal**, which is the case where a page assembles itself in front of a
reader; an edit that patches into an already-settled document and introduces a face it has
not loaded can still swap, and deliberately so (hiding content an author is actively
editing is the worse trade). **Any new preview surface owes that gate**; the guard is
`docs/e2e/preview-font-swap.spec.ts`, and the oracle there is worth borrowing whenever you
suspect a surface assembles in view: sample every animation frame and count how many
distinct geometries a person was SHOWN, rather than asking whether the settled one is right.

## Why no existing tool answers it

| Existing | What it measures | Why it misses jank |
|---|---|---|
| `calibrate-capacity` / `calibrate-density` | the element or word count at which a layout **overflows** | a binary verdict read out of the CLI log — no geometry, so a box that moves 200px without overflowing is invisible |
| `check:overflow-corpus` | how many corpus slides **clip** | the same verdict corpus-wide; a ratchet, not a diagnostic |
| `regress` / `pixel-check.js` | pixel drift against a **golden** | needs a committed before/after, and reads one deck at one content shape |
| `check:family-conformance` | whether a family's reflow rule **fires** | the right *shape* of instrument — render a sweep, toggle one thing, compare within one render — pointed at rule activation instead of position |
| `check:chart-fit` | whether a chart paints outside `.cell-stage` | one component, one box, clip-based |

## The method

Four steps. All mechanical, and the tool does the middle two.

**1. Sweep.** One slide per content length, monotonically increasing, everything else held
fixed. The tool builds the deck from the component's own manifest `skeleton`, so the sweep
carries the **documented chrome** — for a divider that is the eyebrow, and the eyebrow is
the top of the block. A sweep that renders a bare heading measures the wrong element and
reads a line late.

**2. Measure per slide in Chromium.** The rendered geometry, not a model of it: where the
ink sits, where the anchor sits, the clearance between them, how much of the section's
content box is left, and the real overflow probe's verdict for the same page.

**3. Read the table, not the render.** The numbers say what a screenshot cannot. The run
this method came from, with the fix backed out:

```
slide  words  chars  lines  ink top  anchor  clearance
    5      5     33      1    311.8   200.2      111.6
    9      9     60      2    273.4   200.2       73.2
   14     14     94      3    235.0   200.2       34.8
   15     15    101      4    196.6   200.2       -3.6   <- collision, and silent
   19     19    127      5    158.2   200.2      -41.9
```

Nothing else in the engine reports a single row of that. The probe column read `·` — not
overflowing — on every one of them.

**4. Prove the fix costs nothing where it should not bite.** `tools/pixel-check.js` (or
`compare -metric AE` per page) between the before and after renders. The band fix came
back at **0 differing pixels** on the one- and two-line cases, and that is the claim that
made it safe to ship a change to a shared stylesheet.

## Running it

```sh
node tools/check-jank.js "divider numbered" --anchor 'h2::after'
node tools/check-jank.js cards-grid --axis count --max 8
node tools/check-jank.js "divider numbered" --anchor 'h2::after' --style 'section.divider.numbered { justify-content: center; }'
```

The positional is the whole `_class` string, modifiers included — sweeping the modifier
that owns the anchor is the normal case. `--anchor` is a CSS selector resolved inside the
section, and a trailing `::before` / `::after` names a pseudo, which is what an
engine-drawn mark usually is. `--help` prints the flags and exits 0; the tool's
header is the long form of each.

**`--anchors` is where you start on a component you did not write.** The tool's own premise
is that nobody forms the suspicion by looking — so a mode that only verifies an anchor you
already suspected would contradict it, and without `--anchor` a run *cannot fail*: drift and
collision are both undefined, every other line is advisory, and it exits 0 on everything.
`--anchors` lists the generated boxes the walk can actually place, with how far each moves
across the sweep and how many match per slide. Pick the anchor from that, then sweep it.

**`--style` is the lever that turns a description into evidence.** It injects CSS through
the deck's own front-matter `style:`, so you can sweep once as shipped and once with the
fix's declarations neutralized. The difference between the two tables *is* the proof, and
it is what `test/integration/invariants/jank-sweep.test.js` asserts on every PR — a
geometry rig that quietly stops finding collisions reports "clean" for the same reason an
unplugged smoke alarm reports no fire.

### Reading the columns

| Column | What it is |
|---|---|
| `ink top` / `ink bot` | the flowed content's painted extent, relative to the top of the slide |
| `anchor` | the anchor's painted edge **facing the content** — its bottom when it sits above, its top when below |
| `clearance` | the signed gap between the anchor and the **content** ink. Negative means they have reached each other; `✱` means the boxes genuinely intersect on both axes, not merely on one |
| `CHROME` | the anchor overlaps decoration rather than content — reported, never failed on |
| `breathe` | how far the ink stays inside the section's content box, worst edge, with that edge's initial. `0 L` is normal — text begins where the content box begins. Negative means the ink is into the padding: inside the frame, so no channel tags it |
| `UNPLACED` | generated boxes that paint where the tool cannot place them. When this appears, a clean COLLISION line says "among the ink it could place" and withholds the word `ok` — see below |
| `probe` | the engine's own overflow verdict for that page. A collision with `·` here is the silent case |

Exit 1 on a collision or drift past `--max-drift`; exit 2 when the rig could not run,
never a silent 0. **The exit-2 set is deliberately wide**, because the dangerous failure for
a measurement rig is not a crash — it is a confident CLEAN over something it never measured.
So: no Chromium, no manifest, an unknown or misspelled flag, a non-numeric `--tight` /
`--max-drift` / `--max`, a `--style` path that does not exist (it would inject nothing and
the sweep would silently match its own baseline, which is the *proof* the flag exists to
produce), and an anchor that resolves on some slides but not all — drift and clearance are
claims across the whole sweep, so a partial one has no verdict. Every one of those was a
silent exit 0 in the first cut, found by an independent checker.

## The judgment

**"It looks fine in a still" is not an answer.** Every individual slide in a drifting deck
looks fine — that is what makes drift a deck-level defect and a slide-level non-event.
Judge an anchor across the sweep, and judge it on the numbers.

**Any drift at all is a defect for an anchor you named**, on either axis — the tool
measures both, and names the one that set the number. `--max-drift` defaults to 2px, which
is sub-pixel rounding, not a tolerance. Naming something with `--anchor` asserts it
holds position; if it moves, either the design is wrong or it was never an anchor. The
design killed by this measurement in #2005 kept a *constant* clearance on every slide and
still wandered 70px down the canvas, because it rode the heading. Constant clearance is
not the same as holding position, and only the drift row can tell them apart.

**Decoration touching decoration is not a collision.** The verdict keys on the anchor
reaching *readable content*, because that is the defect: #2005's numeral struck the eyebrow
text and its hairline cut the copy. An anchor overlapping a painted box or another generated
one is reported as `CHROME` and does not fail the run — shipped `cycle` centers its hub dot
*on* the ring it straddles, and a geometry rig cannot tell that deliberate composition from a
mistake. It is still **measured and printed** — chrome stays in the ink, so it moves `ink top`,
`ink bot`, `breathe` and CROWDING exactly as before; only the COLLISION verdict asks whether
what was struck is readable. A slide with no readable content at all falls back to the whole
ink, so a text-free layout cannot pass by having nothing to measure.

**What counts as readable is a classifier, and it has three edges worth knowing.** A box
carrying its own text is content, and so is a replaced element. A box that only paints —
a card surface, a rule — is chrome, and the walk *continues through it*: an earlier cut
stopped there, so a painting ancestor swallowed the text beneath it and a mark laid across an
`h2` on any Form component exited 0, because `.cell-masthead` carries a `border-bottom`. And
a generated box is chrome only when it generates no text: the bundle has 20 positioned pseudo
rules whose `content` is a counter, an `attr()` or a quoted label.

**A collision is never acceptable and never "unlikely".** The reachable heading length is
whatever an author types. If a collision exists anywhere in the sweep, either make it
geometrically impossible (reserve the band) or turn it into a real overflow, where every
existing channel already knows how to report it. Both, ideally — that is what the divider
fix does.

**Crowding is advisory, and the reference box is worth knowing.** `breathe` measures
against the section's content box, so a component whose padding *is* a reserved keep-out
band (a numbered divider's is) reads as crowded the moment the block grows into that band
— which is the design working, not failing. Read the crowding row next to the anchor row
before acting on it. What crowding is genuinely good for is the step *before* the probe
fires: `cards-grid` crowds at five elements and overflows at six.

**A clean sweep on an axis that never moved anything proves nothing.** The tool says so
itself (`vacuous`) when every step lays out at the same height. Raise `--max` or pick a
different `--axis` rather than banking the green.

## What a green run does NOT mean

Narrower than the word suggests. It means: *one* anchor you named, on *one* component, at
*one* family and *one* theme, on *one* axis, with autosplit suppressed, moved less than
`--max-drift` and did not intersect a readable box — among the ink the tool could place.

- **Only DRIFT and COLLISION can fail the run.** CROWDING is advisory, so one of the three
  headline failure modes never sets the exit code — as are `CHROME`, `PASSES`, `SUBTREE` and
  `UNPLACED`. A run that prints an advisory and exits 0 has still told you something.
- **A `--anchors` candidate matching several boxes per slide is not one mark.** Its `moves`
  number is one item's travel, not the set's, and `per > 1` says so on the row. The
  `Sweep one with:` line prefers a candidate that matches exactly once, precisely because
  naming a `per: 5` selector measures whichever box happens to be first in document order.
- **The sweep renders `--no-split`** so page N stays step N. That is a no-op at `wide`, where
  autosplit does not apply — and an active suppression at `square`, `tall` and `strip`, where
  the sweep then measures a slide shape the real render may never emit. The tool prints this
  warning on every non-wide run. The heading axis is unaffected: a heading is one element, so
  the structural splitter has nothing to split.
- **Read the `SWEEP moved` line before believing a clean verdict.** It names which dimension
  actually changed. Four byte-identical-looking rows under a clean verdict are normal when the
  only thing moving is ink *width*, which the table has no column for.
- **A whole FAMILY can have nothing for two of the three arms to watch, and the run is still
  green.** Drift and collision both need an anchor; the chart bucket has none — `--anchors`
  reports "none" on all 21 members, because a chart draws its furniture inside its own figure
  rather than pinning it to the section. So on a chart only CROWDING can report anything, and
  crowding is advisory, which means **no chart can ever fail this gate**. Ask `--anchors`
  first: a green run on a component with no anchor is green because nothing was watched.
  `engineering/decisions/2026-09-07-chart-design-language/jank-audit.md`
- **`--axis count` and `--axis words` are unavailable to any component missing from
  `BUILDERS`**, and the roster is smaller than it looks: 27 entries, none of them a chart.
  The refusal is explicit (`no element builder for 'X'`), so it cannot pass silently — but it
  does push you onto the heading axis, which for 14 of the 21 charts moves no ink at all and
  reports itself vacuous. The axis a component actually responds to is not always the one you
  can sweep.

## What it does not do

- **It measures the ink, not the box.** The flowed block is the union of every box that
  actually paints, descending through pure wrappers — because the Form's `.cell-stage`
  spans its whole grid area whatever is inside it, so a section's top-level children read
  identical on a crowded slide and an empty one. Two kinds of box, and the difference is
  the whole content/chrome split: what an element **paints** is its border box, and what a
  reader **reads** is **one box per line of its own text**, taken from that text's line
  boxes and clamped to the element's content box.
- **Measuring text by the box it sits in was a false-positive generator**, and it took two
  rounds to get out of. The border box first: padding is how the engine RESERVES room for a
  mark, so a bullet drawn in its own host's `padding-left` intersects that host's border box
  by construction, and shipped `roadmap` reported `clearance −233.5px` against unmodified
  CSS on the sweep its own `--anchors` output tells you to run. The content box next, which
  is still a superset on both axes: on the inline axis it spans the whole line even when the
  text does not — shipped `pricing` draws its badge mark on an **in-flow** `::before` disc,
  and an in-flow pseudo is never a rect of its own, so "mark on decoration" and "mark on
  words" were the same picture with the first glyph 6.0px clear — and on the block axis an
  element carrying its own text AND element children has a content box spanning all of them,
  so a card title contributed a phantom rect covering the entire card. That one made the
  same mark a −255.1px collision.
  A **line box** is the honest unit: its width is the text advance, exactly. Its height
  carries the font's leading, ~5px more than the glyphs, which is why the *first* attempt at
  this — one Range over a whole element including its descendants — read a mark just above a
  paragraph as a strike. Per line, over an element's own text nodes only, keeps the
  precision and drops the case that broke. Crying wolf is the more corrosive failure mode:
  the next person to see it stops trusting the tool.
- **A positioned pseudo's own `transform` is applied.** 21 positioned pseudo rules in the
  bundle carry one, and the `translate(-50%, 50%)` centering idiom displaces a box by half
  its own size — 15.3px for shipped `cycle`'s repeat mark, which is `1em` at `--fs-h3`
  (2.3958cqi, so 30.67px in a 1280px-wide section), halved. A `matrix3d`, a transform on
  the containing block itself (which mixes coordinate spaces), and the individual
  `translate` / `rotate` / `scale` longhands are all **refused** rather than approximated —
  the longhands compute to `transform: none` beside themselves, so reading `transform`
  alone dropped the displacement silently and placed the box where it does not paint.
- **A generated box is not a child**, and the first version of that walk could not see one:
  a pseudo painting chrome on a text-free wrapper was simply absent from the ink, and a
  hard, full-width overlap with the anchor reported `COLLISION none` and exit 0. Positioned
  pseudos are reconstructed and folded in, and the **descent continues past both a painting
  box and a text-bearing one** — stopping at either left every positioned pseudo below it
  unreachable with no `UNPLACED` note, which is the same false clean one level down.
  Measured on shipped `pricing`: 2 positioned pseudos per slide, 0 of them reached, and
  `--anchors` answering "this component draws no positioned pseudo the walk can place" over
  two marks it places fine. An in-flow pseudo **offset by `relative`** still cannot be
  placed — the DOM does not expose a pseudo's static position — so it is counted and
  printed as `UNPLACED`, **with the reason it could not be placed**, and the clean line
  stops saying `ok`. A rig that cannot see something must say so rather than certify around
  it.
- **The section's own pseudos are in the walk.** The engine's entire running-mark family is
  `section::before` / `section::after` — `mark-orbit`, `mark-ticks`, `mark-chevron` and the
  rest: 13 distinct `section`-level pseudo selectors, counted over `dist/lattice.css` — which
  is the archetype this whole tool was built for. The walk started at
  the section's *children*, and `sec.querySelectorAll` matches descendants, so for a while
  the one shape in the opening paragraph was the one shape the tool could neither see as an
  obstacle nor name as an anchor: `--anchor 'section::before'` refused with "no match".
- **The ink is the border box, and text escaping it on the inline axis is NOT in the ink.**
  Two richer measures were tried and both invented collisions on layouts that are fine: a
  Range's rects are line boxes carrying the font's leading, and `scrollWidth` includes the
  border boxes of absolutely positioned descendants — so every out-of-flow box the walk
  drops, the named anchor included, came back through its own container, and shipped
  `list-steps` reported a −219.1px collision against unmodified CSS. The escape is not
  silent: the engine's own probe flags it, in the `probe` column of the same row. A measure
  that invents collisions on shipped components to catch a case another channel already
  catches is a bad trade.
- **Only the ANCHOR is out of the ink — not everything out of flow.** The walk used to
  return on any absolutely positioned element, on the reasoning that "an absolutely
  positioned mark is what an anchor *is*". That reasoning covers the anchor, which is
  excluded by name; it never covered readable content, and the engine positions plenty of
  that: `image`'s spotlight headline block, `scene`'s `.scene-text`, `pricing`'s corner tag,
  `state-chart`'s `.state-index`. Laying the divider's eyebrow through its numeral out of
  flow reported `COLLISION none … ok` over a 61 × 117px two-axis overlap, and on `image` the
  tool went further and blamed the operator — the heading grew 1 → 4 lines in its own
  `lines` column while the vacuity warning said the axis was not moving the content and told
  them to raise `--max`. Naming an anchor still drops **its whole subtree**, which is right
  for a mark (its children ride with it) and wrong for a container, so a run that drops one
  says so on a `SUBTREE` line rather than looking clean.
- **A collision is judged per painted rect, not against the ink's bounding box.** An anchor
  sitting in a *gap* between two pieces of ink is enveloped by the union while touching
  neither; the union is the right thing to report a clearance against and the wrong thing
  to fail on.
- **CROWDING is measured over the whole ink, and the named anchor is not in it.** So the
  same component reports 168.1px of top crowding on its own and none under `--anchor
  'h2::after'` — because the 168.1px *is* the numeral you would have named. The number alone
  is ambiguous in a way that reads as a broken tool, so the row names what is sitting in the
  band.
- **One component, one family, one theme per run.** There is no corpus mode and no
  committed oracle — see below. All four families, a second theme (`cuoio`) and both
  non-heading axes have been driven by hand and behave; what the falsifiability suite
  PINS is wide / indaco / heading, so a regression outside that cell would not red a gate.
  `--axis words` needs room to bite — it was vacuous at `--max 6` on `cards-grid` and moved
  the ink 51.3px at `--max 20`, which is the vacuity warning doing its job, not a defect.
- **The tool is not a CI gate; its falsifiability test is.** Sweeping the corpus per PR
  would be the flake generator — dozens of Chromium renders whose verdicts are
  wall-clock-adjacent, which is why `overflow:check` and `bench:check` are held back too.
  What runs per PR is `test/integration/invariants/jank-sweep.test.js`: 18 arms, **measured
  100s serial** against the `integration` job's p50 of 601s (ci.yml's own
  table, n=86). It makes a different
  claim from any sweep — not that a component is clean, but that this rig can still go red.

## Three traps this already paid for

**Measure the anchor's painted edge, not its content box.** A `::after` is `content-box`,
so `getComputedStyle(el, '::after').height` is the glyph alone — beneath it sit its
`padding-bottom` and the `border-bottom` that IS the hairline, 21.48px at 1280x720. Using
the content box understated every clearance by that much and moved the reported first
collision a whole line late; a shrunken band passed a test on a render whose hairline
struck through the eyebrow. Any pseudo you treat as a keep-out zone has this trap.

**A `center`ed flex line overflows in BOTH directions.** Reserving the band with plain
`justify-content: center` looks correct and is not: the block spills straight back through
`padding-top` into the reserved band. `safe center` is the fix — it falls back to `start`
exactly when the block would overflow, so the top edge pins and the growth goes downward,
where a slide running long eventually leaves the frame and every existing channel can see
it. The tool reproduces this: keep the band, drop `safe`, and the collision comes back at
the same step.

**Declaring a `capacity.axis` silently changes what the tool sweeps — and can WEAKEN
discovery.** The sweep axis is chosen in `check-jank.js`: a component with a
`capacity.axis` AND an entry in `calibrate-core.js` BUILDERS is swept by **count**,
everything else by **heading**. The count sweep builds its slides from that builder, and a
builder emits one plain repeated element — `BUILDERS.pricing` produces N identical tiers
with a single `[x]` badge each. So the moment `pricing` gained a capacity (2026-09-06,
enrolling it in splitting), `--anchors` stopped reporting its `*Most chosen*` corner tag
and its `[/]` slashed badge: two positioned marks the shipped component really has, and
the corner tag is *precisely* the fixed-element-that-must-hold-position this tool exists
to police. Nothing warned; two arms of `jank-sweep.test.js` failed and that is the only
reason it was noticed.

The general shape: **for any capacity-bearing component whose real chrome is optional — a
featured flag, a variant-only badge — a count sweep under-reports.** `split-compare` was
the second instance and lost `div.verdict::before`, the RECOMMENDATION corner tag, which is
the most position-sensitive mark it has; nothing failed, because it has no arm here.

**Fixed for DISCOVERY (2026-09-06): `--anchors` now defaults to the heading sweep**, which
reads the component's own sample. Discovery asks what marks a component HAS, and a
generated deck cannot answer that. The MEASURING modes still default to the count sweep for
a capacity-bearing component — there, growing the collection and watching what moves is the
entire point, and the builders also feed `calibrate-capacity` / `calibrate-density`, where a
heavier element would shift the measured ceilings. So the builders were deliberately NOT
taught the optional chrome; that remains open if a measuring mode ever needs it.

## Four decisions, and what would change them

**The anchor is a CSS selector argument, not a manifest field.** A `stability: { anchor,
axis }` block per component is the ambitious version and is premature: it would need every
component to declare something only a handful can answer today, and the selector is
already the thing you are reasoning about while you work. Revisit when several components
carry a measured anchor and the selectors start being copy-pasted between invocations.

**The sweep axis follows `capacity.axis` where a component has one**, and defaults to the
heading where it does not — an anchor slide (`adapt.mode: native`, one heading, no
repeating element) has exactly one thing that can grow. `--axis` overrides both.

**There is no committed oracle.** A ratchet per component (the `check:family-conformance`
pattern) would catch a future engine change that reintroduces drift, and it is worth
building once a few components are measured. An oracle over one component is a unit test
wearing a costume — and that unit test already exists as
`test/integration/parity/numbered-bookend-stamp.test.js`.

**It does not belong in the visual-review fan-out.** `engineering/visual-review.md` sends
reviewer agents at whole slides; jank is invisible to that by construction, because every
individual slide looks fine. A reviewer agent that suspects an anchor moves should call
this tool and read the table, not squint at three renders side by side.

## The census — the whole catalog, once

`tools/jank-census.js` runs the `--anchors` discovery above across every class the
catalog declares and ranks what moves. The committed table is `engineering/jank-census.md`,
and the command that regenerates it is printed at the top of that file.

It exists because of a gap this doc had not named. `jank-sweep.test.js` is a
RIG-INTEGRITY test — it proves the tool can still detect a collision — and it runs on
essentially one component. Green there says nothing about the other 68, and nothing had
ever pointed the tool at the catalog. 272 component classes had never been measured.

**Read three things out of it before anything else.**

**A census cannot fail a component.** `--anchors` is discovery: without `--anchor` a
check-jank run cannot exit 1 at all. Every row is a LEAD. The verdict comes from
re-sweeping with `--anchor`, and the census prints that command per hit.

**Rank from BOTH ends of the table, not the top.** The census sorts by travel, which puts
the drift leads first and buries the collision archetype at the bottom — a mark that
holds *perfectly* still while content grows into it reads as `0px` and looks like the
cleanest row on the page. That is #2005's shape exactly. The `0px` rows are where to look
for a collision; the moving rows are where to look for drift.

**Most travel is a mark riding its own block, and the clearance column is what tells them
apart.** A `ul::before` ring drawn on a list moves down when the heading above it grows;
that is flow, not drift, and the tell is that the clearance to the content does not
change. Judge a mark against what it is positioned against: a `section::before` is
section-relative and owes the canvas a fixed position, while a `ul::before` owes its list.

### What the first full run found (2026-09-13)

**The census had the same blind spot the invariant did, one level up.** Sweeping every
manifest class and variant finds no `section::before` candidate anywhere — because the
engine's running marks are base MODIFIERS (`mark-orbit`, `stamp-seal`), not manifest
variants, so a catalog sweep never renders one. The archetype this whole tool was built
for was not in the 272. `--marks` reads the mark selectors out of the built bundle and
sweeps each on a plain host; **all 23 hold position** (22 at 0px, `mark-pills` at 0.1px).

**One class the scan finds is NOT a modifier, and treating it as one manufactured the exact
false clean this tool is built against.** `form` is the Form wrapper every slide carries — not
a component, so the catalog never covers it, and not a modifier, so appending it to a host
does nothing. Its `::after` is the PAGE NUMBER, which paints only under `paginate: true`
front matter that a `_class` string cannot supply. Swept as `content form` it rendered no
mark, produced no candidate, and took its place in the committed table's "no placeable
positioned mark" list — a clean bill for a section-level running mark that was never on the
page, and the pagination number is precisely the fixed-element-that-must-hold-position case
this tool exists for. It is now listed OUT OF REACH with its reason instead. Caught by a
checker, not by the sweep.

**`--front-matter` is the lever that closed it, and measuring found the premise was half
wrong** (#2168). The flag injects arbitrary deck-level keys through the same block-scalar
insert `--style` uses, so `paginate: true` finally puts a page number on a sweep deck. What
that revealed is that `section.form::after` is the FALLBACK, not the shipped mark: on any
Form carrying a footer cell — the normal case — the page number is a real element,
`span.lat-pagination`, and `lib/forms/cell/stage/stage.css` retires the pseudo beside it
("Retire the pagination PSEUDO wherever the real element exists"). So the mark to measure is
an element, not a pseudo, and it is an in-flow flex child rather than a positioned one: its
exposure is crowding inside the footer row, not a silent collision with slide copy.

**Measured, first time: it holds.** `content`, heading axis to 40 words, `paginate: true`,
anchored on `span.lat-pagination` — drift 0.0px, no collision, clearance falling
**348.6px → 169.4px** as the heading grows. (An earlier draft of this line said 268 → 178.4.
Those came from the `--style`-SIMULATED run on `section.form::after`, not from the real mark:
two runs, conflated. Re-derived from the shipped mark on the base this ships against.)

**The pseudo IS a fallback, and it really ships — those are both true and this doc has now
got each of them wrong once.** It is a fallback by construction: the rule below retires it
wherever the real element exists. It is also live on committed decks, which is the part the
first version of this section denied. What it is NOT is the common case — a draft of this
paragraph called it "the page number on most paginated slides we ship", and it is the
minority mark. Measured over the whole population — every deck in `examples/` that sets
`paginate: true`, exported through `dist/lattice-emulator.js` and read in Chromium:

| of 1882 paginated slides | | |
|---|---:|---:|
| the real `span.lat-pagination` | 1485 | 78.9% |
| the `::after` pseudo | **232** | **12.3%** |
| neither — `silent` suppresses the numeral | 165 | 8.8% |

89 of the 164 decks paint the pseudo at least once. The counting rule: a section carrying
`data-lattice-pagination`, pseudo painted when `getComputedStyle(sec, '::after').content`
is not `none` and it is not hidden, span shown when `span.lat-pagination` has a client rect.
Validated against this section's own published datum — it returns `bloom`'s 7 of 13 exactly.

**Two smaller samples got this wrong, and the sample size is why.** A draft quoted **5.5%**
from 12 decks; an independent pass over 27 decks got **17.8%**. Resampling the 164 decks
20,000 times says neither was unlucky — at n=12 the 5th-95th percentile band is **4.6%-21.3%**
(full range 0.0%-37.6%), and at n=27 it is 6.6%-18.4%. Both drafts sat inside their own band.
A decimal place off a dozen decks is noise dressed as precision, and neither draft named its
decks or its command, so no reader could re-derive either. That is the reason the table above
gives a population figure and the rule that produces it rather than a sample.

**And one deck is not the population.** `bloom-engineering-journey`'s 7 of 13 is six
`split-panel` slides plus a `premise`, not seven of anything — and it is high rather than
exceptional: six other shipped decks match or exceed its share (`scene` 6/8, `adaptive-image`
6/9, `motion-asset` 4/6, `anima-scene` 3/5, `seven-steps-problem-to-code` 10/17,
`marker-corner` 4/7). Quoting one deck as the general case is how "most" got written.

**The split is by frame kind.** The retirement rule keys on a `.cell-footer` DIV
(`section.form:has(> .cell-footer)::after { content: none }`), which `buildFooterCell`
(`lib/forms/cell/masthead/masthead.transform.js`) emits only for a frame that is not
chrome-exempt. So `kind` / `exemptFromChrome` decides it, not the `cells` array:

| | frames | `.cell-footer` | page number |
|---|---|---|---|
| root (`kind: root`) | `minimal`, `standard` | emitted | the real `span.lat-pagination` |
| sovereign (`exemptFromChrome: true`) | the other **nine** | never emitted | the `::after` pseudo |

**Measured on a committed deck, not inferred.** `examples/bloom-engineering-journey.md`
exported through `dist/lattice-emulator.js` and opened in Chromium paints the pseudo on **7 of
its 13 slides** — `premise`, `split-panel` and friends, `visibility: visible`, `opacity: 1`, no
`.cell-footer`. 164 of the decks in `examples/` set `paginate: true`. This is the shipped
behavior, not an edge case waiting for an author to find it.

**Three wrong claims led here, and the shape of each is worth more than the correction.**

1. *"Exactly one frame declares no footer cell."* Nine do. `grep -c '"footer"'` over the frame
   manifests returns 1 for ten and 0 for `compare-code`, which reads like a count of frames
   that HAVE one; in eight sovereigns the hit is inside **`suppresses`**, and `compare-code` is
   the single sovereign that does not suppress the footer. A count taken off a string match
   rather than the field it belongs to inverts whenever two fields can hold the same word.
2. *"Every other sovereign frame's skeleton carries `<!-- _paginate: false -->`."* Three
   components do — the two bookends and `divider`. The other six sovereign frames are reachable
   with the lever. Only `premise` was actually swept, and the sentence below says so rather
   than implying six runs exist. The claim came from opening `divider` and generalizing,
   which is the same move as (1) one level up.
   **And `_paginate: false` is not a rule** — it lives inside the `"skeleton"` STRING of
   three component manifests, a starter snippet an author can delete or never use. So the
   sentence an earlier draft removed was true and is restored here: an author who writes
   `paginate: true` does get a numeral on a `title` or `divider` slide. What suppresses it on
   the decks we ship is usually a different mechanism entirely — `section.silent.silent::after
   { content: none }` (`lib/base/base.variants.css`), and `bloom` authors them
   `title silent spectrum` and `closing silent spectrum`.
3. *"`divider.manifest.json:39`."* The frame manifests contain no `_paginate` at all
   (`grep -rn "_paginate" lib/forms/frame/` is empty); that line is in the COMPONENT manifest,
   `lib/components/anchor/divider/divider.manifest.json`. A citation naming the wrong file of
   two with the same basename reads as precision and carries none.

**So the mark IS measurable, and here it is.** `premise`, a sovereign frame, `paginate: true`,
element axis to 12:

```
slide   elements   ink top   ink bot   anchor   clearance
    1          1     327.9     396.1      681       284.9
    9          9      47.2     676.8      681         4.2
   10         10      12.1     711.9      681       -30.9
   11         11       -23       747      681         -66     OVER
```

`DRIFT 0.0px  ok` — the mark holds position across the whole sweep, which is what it is for.
What moves is the content: ink height 772.1px, ink top 386.0px. Clearance closes to **4.2px at
step 9**, and at step 10 the ink is 30.9px PAST the anchor without touching it, because they do
not share a column — the tool's `PASSES` line, and one wider line away from a collision. The
probe flags overflow from step 11. So the pseudo does not drift; the copy arrives at it.

**Which makes the two marks a question, not a curiosity — #2206.** The page number is
`span.lat-pagination` on a root frame and `section::after` on a sovereign one: different box
models, different styling surfaces, and nothing tells an author which they have. The 4.2px
clearance above belongs to the pseudo alone.

**The first attempt at this measurement was vacuous, and the tool could not say so because of a
defect this change introduced.** `compare-code` was swept instead — the only sovereign frame
with no element builder, so `heading` is its only axis, and on that axis its ink does not move:
ten steps, every ink column constant. The run was presented here as evidence that "a growing
heading does not reach it". The vacuity guard should have refused it, and did not, because it
still maxed `spreadRange('anchorLeft')` — the raw near-edge spread the move-vs-grow fix
replaced in the verdict. The page numeral going 9 -> 10 is worth 9.9px of near-edge spread, so a
mark that merely got WIDER vouched for a sweep that moved nothing; at `--max 9` the same run
warned correctly. Second instance of the half-migrated kernel in this one change — the first was
`--anchors` discovery — and the guard now takes the anchor's term from `drift`.

**Getting there needed a fix to DRIFT ITSELF, and that is the more useful half.** The first
run reported `DRIFT 9.0px horizontal ✗` and exit 1. It had not moved: across a 12-page deck
the mark sits at a constant 30px right inset on every page, and at page 10 the numeral gains
a digit so its LEFT edge steps 8.99px. Drift was `Math.max` over an axis's two edge spreads,
which cannot tell a box that MOVES from one that is pinned and merely GROWS. It is now `min`
over three references — near edge, far edge and midpoint — because a mark may be pinned at
either edge or centered, and a true translation moves all three together while growth leaves
its own reference at zero. The measure lives in `tools/lib/jank-drift.js` with metamorphic
relations that need no browser, including the sideways-walk case the old measure was written
for, so the fix cannot be traded back for the bug it replaced.

**Both halves of the tool now share the measure, and for a while only one did.** The first cut
moved the verdict path onto the kernel and left `--anchors` computing `Math.max` over the two
NEAR edges. The tool then contradicted itself: discovery printed `26.2px — does not hold
position` about a right-pinned mark that the `--anchor` verdict cleared at `0.0px` in the same
run, and discovery is the step this tool's own output tells you to run FIRST, so the wrong
answer arrived first. Splitting a kernel out and moving one of its two call sites is the shape
HARD RULE #1 exists to stop.

**Regenerate the census with the command in its own header, and no other.** It is printed at
the top of `jank-census.md` and it is not the obvious one: without `--md` the tool writes
nothing at all, and without `--tolerate-unmeasured` it exits 1 on the three classes that have
no growable axis. Running `node tools/jank-census.js --variants --marks` and diffing the file
therefore compares the committed table against ITSELF and reports "byte-identical" no matter
what changed — a check that passes because it never measured, which is the exact failure this
whole tool exists to catch. It was run that way three times before anyone read the header.

**And when it WAS re-derived, the table moved — at the top.** Every one of the census's biggest
movers turned out to be a box GROWING, which the old discovery measure could not tell from a
box moving:

| class · candidate | before | after |
|---|---:|---:|
| `image statement` · `div.image-text` | 614.3px | **0.1px** |
| `image spotlight` · `div.image-text` | 184px | **0.1px** |
| `scene spotlight` · `div.scene-text::before` | 184px | **0.1px** |
| `state-chart lr` · `div.state-chart-scale` | 160px | **10.1px** |
| `state-chart` · `div.state-chart-scale` | 89.5px | **0.1px** |
| `list-criteria` · `li::before` | 89.5px | **67.1px** |
| `q-and-a grid` · `ul::before` → `ul::after` | 89.5px | **44.8px** |

The 614.3px row was the headline lead when the census first shipped — the worst mover in the
catalog, quoted as such. It had not moved at all. The real top mover is `state-chart inline`'s
`span.state-index` at 85px, which was not in the old top ten.

**One census row was stale, and the first explanation offered for it was invented.**
`matrix-grid`'s worst candidate is `div.matrix-grid-figure::after` at 44.8px; the committed
table named `::before` at 44.8px, and `::before` measures **44.7px**. A draft of this section
explained that away as sub-pixel jitter across a tie — "the measurements reproduce to a tenth
of a pixel, the row LABEL does not". Every part of that was wrong. Three consecutive
`--anchors` runs here return 44.8 and 44.7 with no variation, and a full census regeneration
reproduces the committed table byte for byte, so there is no jitter to appeal to; 0.1px is
the tool's ROUNDING
QUANTUM (`+(...).toFixed(1)`), so "reproduces to a tenth of a pixel" is unfalsifiable rather
than an error bound; and at 44.8 against 44.8 there would be no crossing to describe, only a
stable sort deciding a tie. The row was simply older than the tool. The census is regenerated
here and the row is correct.

**The lesson is the reflex, not the row.** A committed artifact disagreeing with a fresh run is
a stale artifact until something proves otherwise. Reaching for a mechanism that makes the
disagreement benign — and one that cannot be falsified, at that — is how a wrong number
survives a re-derivation.

**Read the ranking accordingly.** `moves` now means TRANSLATION, so a row that fell to ~0 was
never a lead; the ones that stayed high (85px, 67.1px, 44.8px) are the ones worth a verdict
sweep. Nothing in the catalog was newly found to move — the correction only removes false
leads — but the table's ORDER, which is the whole point of a census, was wrong at the top.

**The new measure still fails a real mover, and that arm matters more than the others.**
Every verdict the change moves, it moves toward PASS, so the relations in
`test/unit/tools/jank-drift.metamorphic.test.js` are all defending against a rig that quietly
stops finding things — and they are arithmetic, not a render. The census's real top mover
supplies the control the real surface owes:
`node tools/check-jank.js video --anchor 'span.video-play' --max 12` reports
`DRIFT 44.8px vertical ✗` and exits 1, on a **single-match** anchor over a sweep that is not
vacuous (ink height moves 44.8px with it). Its four advisories travel with it, since the
paragraph below is about exactly that: `CHROME` (the anchor overlaps decoration at step 1,
reported never failed), `PASSES`, `CROWDING`, and `SUBTREE` — which reports **one** box
removed from the ink, and that box is the anchor ITSELF. `check-jank.js` counts
`1 + el.querySelectorAll('*').length`, so a `1` means the element has no descendants at all.
A draft of this line read it as "its one child box", inventing a child and inverting what the
advisory warns about: the trap is naming a CONTAINER, which deletes its contents from the
measurement. This anchor is not one.
Neither touches the single-match, non-vacuous, exit-1 properties the control is quoted for.

**And the census row for this same anchor reads 89.6px, not 44.8px.** That is not a
contradiction and it is the reason the census header calls a row a LEAD: 89.6 is the
twenty-four-slide `--anchors` discovery figure, 44.8 is the twelve-slide `--anchor` verdict.
A census row and a verdict are not comparable AT DIFFERENT STEP COUNTS — match them and they
agree exactly: `--anchor 'span.video-play' --max 24` returns 89.6px, the census row to the
decimal. (A draft said "never comparable", which the very next command disproves.) That is
why a draft of this paragraph claiming "five of them moving further than the control" was
wrong: it ranked twenty-four-slide discovery figures against a twelve-slide verdict.
Re-swept like for like,
`citation-card pull-quote` ties the control rather than beating it. Because the measure is a
MINIMUM, 44.8 can only
come back if the near edge, the far edge AND the midpoint each spread at least that far — the
shape of a box that moved, not one pinned at an edge or centered that merely grew. It is NOT a
shape only translation can make: growth that is neither pinned nor symmetric reports drift too,
and correctly (`near [0,-50]`, `far [300,450]` — a box expanding 300px to 500px about no fixed
reference — reads 50).

**The first control offered here was `state-chart inline`'s `span.state-index`, and it should
not have been.** That sweep prints `ANCHOR 'span.state-index' matches more than one element
(6) — the FIRST in document order is measured and the rest are folded into the ink. Narrow
it.` The number was quoted without the line the instrument attached to it (HARD RULE #23), and
the paragraph then claimed a single-match substitute "does not exist among the census's
movers". `engineering/jank-census.md` lists thirteen `per = 1` rows at or above 44.8px — the
answer was one `awk` away in the file this very section is about.

**A later draft then "corrected" a number that was already right, and the correction is the
error.** It said the paragraph's `42.6px` for `--anchors` should have been `85px`. Both are
real `--anchors` readings of `span.state-index`, and the only thing between them is the step
count: `--max 12` gives 42.6, `--max 24` gives 85, which is what the census sweeps. The draft
quoted the figure for the step count its own paragraph used, so it was correct; what neither
version said is that a discovery figure means nothing without its step count. Saying "the
real figure is 85px" silently re-bases to 24 steps and accuses the earlier text of a mistake
it did not make.

**And the residual — "no counter-example was found" — is now a statement about what CAN
happen.** The measure is a MINIMUM over three references, so a zero verdict is a case where
some reference never moved, and the three references are exactly the three ways a mark holds
position while it grows: pinned at its near edge, pinned at its far edge, or centered. **A
mark whose near edge, far edge and midpoint all moved cannot read exactly zero** — and that
is a theorem of `Math.min`, not a property of the corpus, so no counter-example exists to be
hunted.

**Say "exactly zero", not "clean".** The tool's clean verdict is `drift <= --max-drift`
(default 2), and a small nonzero reading can sit under it while two of the three references
moved a great deal: `near [0,1.5]`, `far [100,300]` reads 1.5 and passes. That is the
intended semantics — the smallest reference movement is what the mark's own pinning allows —
but it is a threshold, not a proof, and this paragraph first claimed the stronger thing.

**MR13's inner assertion cannot fail, and the relation is honest about that.** For any
implementation returning the min of those three spreads, a zero result implies one spread is
zero — unconditionally, for any corpus (checked over 300,000 randomized shapes: zero inner
failures). What MR13 actually pins is narrower and still worth having: that the function does
not return something SMALLER than the min of its three references, and that the corpus still
contains genuinely pinned shapes. Its corpus guard is what fails under the `Math.max` mutant,
so "MR13 kills that mutant" is true of the relation as a whole and not of the direction it
advertises. MR6b kills the same mutant directly.

**The converse does NOT hold, and assuming it did put a false relation in the suite for one
run.** MR12 started as the claim that adding the same per-step offset to any box reports at
least that offset's spread. It reported 34.92 for an offset spreading 35, because a box's own
wander partly cancels the offset: `spread(a + b)` is not `spread(b)` once `a` varies, and in
the shifted coordinates the box genuinely is more static than the offset alone. MR12 is
therefore narrowed to a STATIC box, where all three references are the constant plus the
offset and the answer is exact. The general guarantee is MR13's direction only.

**A modifier that paints nothing alone must be given its companion**, or the census
reports "none" for a mark that is simply not on the page — the false clean this tool is
built against, reproduced in the instrument that was supposed to check for it.
`stamp-*` picks the SHAPE of a state marker and the LABEL comes from the state class, so
`content stamp-seal` draws nothing while `content confidential stamp-seal` draws a
98.8x98.8 seal. The census carries that pairing in `MARK_COMPANIONS`.

**A ROTATED anchor cries wolf, and this is the rig's own defect.** `applyTransform`
returns the axis-aligned bounding box of the transformed corners — exact for the
`translate(-50%, 50%)` centering idiom it was built for, and badly wrong for a rotation.
`stamp-ribbon` is a 768x25px bar at 38 degrees, so its AABB is roughly 620x493 — about
sixteen times the area it paints — and check-jank reports a confident COLLISION from step
7 over a real clearance of about 145px. Rendered and looked at: the heading is
measure-capped and cannot reach the band. `stamp-mark` and `stamp-veil` are the other two
verdicts, and both are `inset: 0` full-slide overlays where covering the content IS the
design. Three of the 23 marks the tool exists to police therefore fail it falsely, which
is the corrosive direction — see *Crying wolf* above. Tracked; the fix is an oriented-box
test rather than an AABB.

**Three classes cannot be swept on any axis this rig has.** `big-number`, `quote` and
`quote bare` carry no heading to grow and no element builder to grow a collection. The
census tries all three axes before saying so, because one refusal reads as a bad
invocation and three read as a hole in the instrument.

## Canonical sources

- `tools/check-jank.js` — the measurement, and the long form of every flag.
- `engineering/gotchas/css.md` — *an OVERLAP IS NOT AN OVERFLOW*, the entry this generalizes.
- `test/integration/parity/numbered-bookend-stamp.test.js` — the hand-written, per-component
  version of the same invariant.
- `test/integration/invariants/jank-sweep.test.js` — the proof the tool can still fail.
- `tools/jank-census.js` + `engineering/jank-census.md` — the same measurement across the
  whole catalog, and the committed table.
- `engineering/capabilities.md` — every neighboring instrument, and what each one measures.
