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
and they need three different measurements.

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

## What it does not do

- **It measures the ink, not the box.** The flowed block is the union of every box that
  actually paints, descending through pure wrappers — because the Form's `.cell-stage`
  spans its whole grid area whatever is inside it, so a section's top-level children read
  identical on a crowded slide and an empty one. The cost is that an inline eyebrow reads
  ~9px lower than the paragraph that contains it (its line box has leading). It has never
  changed a step-level verdict — a line is four times that — but it is why a number here
  can differ slightly from one measured off a block box.
- **A positioned pseudo's own `transform` is applied.** The `translate(-50%, 50%)` centering
  idiom put a shipped mark 15.3px from where it paints; six positioned pseudos in the bundle
  carry a transform. A `matrix3d`, or a transform on the containing block itself (which mixes
  coordinate spaces), is refused rather than approximated.
- **A generated box is not a child**, and the first version of that walk could not see one:
  a pseudo painting chrome on a text-free wrapper was simply absent from the ink, and a
  hard, full-width overlap with the anchor reported `COLLISION none` and exit 0. Positioned
  pseudos are now reconstructed and folded in, and the **descent continues past a painting
  box** — stopping there left 66 positioned pseudos in the shipped gallery unseen, with no
  `UNPLACED` note, which is the same false clean one level down. An in-flow one **offset by
  `relative`** still
  cannot be placed — the DOM does not expose a pseudo's static position — so it is counted
  and printed as `UNPLACED`, and the clean line stops saying `ok`. A rig that cannot see
  something must say so rather than certify around it.
- **The ink is the border box, and text escaping it on the inline axis is NOT in the ink.**
  Two richer measures were tried and both invented collisions on layouts that are fine: a
  Range's rects are line boxes carrying the font's leading, and `scrollWidth` includes the
  border boxes of absolutely positioned descendants — so every out-of-flow box the walk
  drops, the named anchor included, came back through its own container, and shipped
  `list-steps` reported a −219.1px collision against unmodified CSS. The escape is not
  silent: the engine's own probe flags it, in the `probe` column of the same row. A measure
  that invents collisions on shipped components to catch a case another channel already
  catches is a bad trade.
- **Out-of-flow boxes are excluded from the ink by construction.** An absolutely positioned
  mark is what an anchor *is*; to measure one, name it with `--anchor`. The named anchor is
  excluded from its own ink, or every sweep would collide with itself.
- **A collision is judged per painted rect, not against the ink's bounding box.** An anchor
  sitting in a *gap* between two pieces of ink is enveloped by the union while touching
  neither; the union is the right thing to report a clearance against and the wrong thing
  to fail on.
- **One component, one family, one theme per run.** There is no corpus mode and no
  committed oracle — see below.
- **It is not a CI gate.** It is a Chromium sweep, and a wall-clock-ish diagnostic in the
  merge train is a flake generator. Same reasoning as `overflow:check` and `bench:check`.
  What *does* run per PR is the falsifiability test above, which is a different claim: that
  the tool still works.

## Two traps this already paid for

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

## Canonical sources

- `tools/check-jank.js` — the measurement, and the long form of every flag.
- `engineering/gotchas/css.md` — *an OVERLAP IS NOT AN OVERFLOW*, the entry this generalizes.
- `test/integration/parity/numbered-bookend-stamp.test.js` — the hand-written, per-component
  version of the same invariant.
- `test/integration/invariants/jank-sweep.test.js` — the proof the tool can still fail.
- `engineering/capabilities.md` — every neighboring instrument, and what each one measures.
