---
status: shipped
summary: Retire `@container lattice (aspect-ratio …)` as the family-reflow mechanism. A container query measures the section's CONTENT box, which the section's asymmetric padding makes proportionally wider than the deck — so a 1080×1080 deck classified `square` in JS while every `<= 1.05` rule in the library measured 1.051 and did not match, leaving the whole square tier inert across 34 blocks in 30 files. Components now select the `data-family` stamp the engine derives from the deck geometry: one classifier, one measurement, no numeric boundary in any stylesheet.
version: 1
supersedes: none
builds-on: 2026-06-18-component-adaptive-sizing.md, 2026-06-19-chart-adaptive-sizing.md, 2026-06-21-reflow-as-form-capability.md
---

# The family stamp replaces the container query

Fixes #1218.

## ★ Read this with its sibling — the two rungs of the Fit Ladder

*Added 2026-07-28 (#1234). Until then these two notes did not reference each other
at all, and that omission is the root of most of what the #1234 audit found.*

A slide that does not fit its box has two answers, and they are consecutive rungs of
one ladder. This note owns the first; a sibling owns the second:

| | rung | the note that owns it | status |
|---|---|---|---|
| **REFLOW** | the slide changes SHAPE for its box | this note | shipped |
| **SPLIT** | the slide becomes SEVERAL slides | [`2026-07-22-structure-derived-split-patterns.md`](2026-07-22-structure-derived-split-patterns.md) | proposed |

Reflow is the cheaper rung and runs first: a component restructures in place for its
family. When no reflow fits, the split rung paginates. When neither is available, the
export rings the slide — the honest terminal.

**Two things to carry across the boundary:**

1. **A clip recorded here is a clip with `autosplit: off`.** The overflow oracle
   (`test/oracle/family-overflow.json`) declares it explicitly, because it measures
   the un-split terminal on purpose — so a name in it means "overflows when splitting
   is disabled", *not* "broken". Since 2026-07-28 (#1234) splitting is the DEFAULT for
   non-landscape decks, so that is no longer the ordinary case: most of this set
   paginates under the sibling note's rung without anyone asking. At portrait, 21
   components clip with split off and **5** with it on. The two records measure
   different terminals of the
   same ladder; they do not disagree. `node tools/check-family-tiers.js --ladder`
   prints the overlap per @size, and the residue that still rings because no split is
   available to it at all — which is the set actually worth shrinking.

2. **The sibling's §0b talks about "portrait presets" as one bucket.** It is four
   families, and `square` is not `tall`. That section is corrected in place there and
   defers to the model in this note; `node tools/check-family-tiers.js --presets`
   prints the per-@size facts (family, orientation, `--canvas-scale`, measured body
   and `h2` px) so neither note has to quote a constant.

## The bug, in one line

A deck declared `size: square` (1080×1080) is `square` to `familyFor()` in JS and
`1.051` to a container query — so every `@container lattice (aspect-ratio <= 1.05)`
rule in the library silently failed to match on square decks.

## Why the two disagreed

`section` is `container-type: size`, and a container query evaluates the
container's **content box**, not its border box. The section carries asymmetric
padding — `6.875cqi` top and bottom against `5cqi` left and right, plus extra
bottom for the footer — so the content box is proportionally **wider** than the
deck. Measured through the emulator, one deck per registered `@size`:

| size | deck aspect | content aspect | family (JS) |
|---|---|---|---|
| hd · HD · 16:9 | 1.778 | 2.007 | wide |
| 4K · 4k | 1.778 | 1.845 | wide |
| standard (4:3) | 1.333 | 1.472 | wide |
| **square · 1:1** | **1.000** | **1.051** | **square** |
| portrait · 4:5 | 0.800 | 0.821 | tall |
| story · reel · 9:16 | 0.563 | 0.560 | tall |
| mobile | 0.462 | 0.453 | strip |

Look at the square row. It missed the 1.05 boundary by **0.001**. That thousandth
is the whole defect, and it is why the bug survived so long: nothing looked
broken, a tier just never fired. Only `square` crossed at all — its band is 0.15
wide against a +0.051 drift, while `tall`'s 0.4-wide band absorbs its +0.021. That
is exactly why portrait always worked and square never did.

## What we tried first, and why it was wrong

The first fix calibrated a **second** set of boundaries for the CSS —
`CSS_BOUNDARIES = [0.5, 0.93, 1.25]` beside the deck's `[0.5, 0.9, 1.05]` —
each placed at the midpoint of a measured gap. It worked, and it was still wrong:

- The drift is **not a clean function of deck aspect**. Vertical padding is `cqi`
  (width-derived) but resolves against the ICB, which is the *export* geometry
  while the section box may be a scaled CSS size. Slide chrome moves it too: a
  footer-less title slide measures 1.0435 where a footered one measures 1.069.
- So the calibration is a table of magic numbers that re-breaks the moment anyone
  changes the section's padding — and it needs a rendering gate
  (`tools/check-adaptive-families.js`) purely to notice when it has.
- Two numbers describing one model is a standing invitation to "tidy" one into
  the other.

Keeping two measurements of the same box and reconciling them with constants is
the workaround. Removing the second measurement is the fix.

## The fix

`familyFor()` already runs in JS over the deck geometry, and the engine already
stamps `data-orientation` per section. It now stamps `data-family` the same way
(`lib/engine/slides.js`, `lib/engine/index.js`; the runtime's `stampOrientation`
already did). Component CSS selects that stamp:

```css
/* before */
@container lattice (aspect-ratio <= 1.25) {
  section.decision.decision > .cell-stage > :is(ul, ol) { flex-direction: column; }
}

/* after */
section.decision.decision:where([data-family="square"], [data-family="tall"], [data-family="strip"])
  > .cell-stage > :is(ul, ol) { flex-direction: column; }
```

Three properties make this a safe mechanical conversion of 34 blocks:

1. **`:where()` contributes zero specificity.** A rule scoped to a family keeps
   exactly the specificity it had inside the `@container` block, so no cascade
   winner can flip. (The one rule that changed weight — roadmap's legend, which
   was written against `:is([data-orientation=…])` — is doubled-class back to
   (0,3,1), with a comment saying why.)
2. **`wide` carries no stamp.** It is the default, so landscape DOM and render
   stay byte-identical.
3. **The filter attaches to the `section` compound, not as a leading prefix.**
   The stamp is *on* the section and sections are direct children of `<body>`, so
   a leading `:where([data-family=…]) section.foo` is a descendant combinator
   looking for an ancestor that does not exist. This is the one real trap in the
   conversion, and it is now gated three ways: `component-ai.test.js` matches each
   taught selector against a stamped slide in jsdom; `check-family-tiers` probes
   three components at four sizes; and `families.test.js` scans every stylesheet
   under `lib/` **and** the six files that document the idiom, rejecting a leading
   family filter in front of a `section` compound in any of the three carriers
   (`:where(…)`, `:is(…)`, bare attribute). The doc half is not belt-and-braces —
   `lib/adaptive/families.js` shipped the broken form in its own header, i.e. the
   canon taught the trap.

The chart components write `:is(section.x, figure.x) …`, where one branch **is**
the section and the other is a `figure` inside it. No single filter covers both,
so those split into two selectors — `section.x:where(FAM) …` and
`:where(FAM) figure.x …` — each at the original specificity.

## What it cost

The container form was *documented* as box-local: a split/grid Cell could name
itself `lattice` so a nested component resolved against its cell rather than the
deck. **Nothing ever did.** `container-name: lattice` appeared exactly once in the
whole library, on `section` — and `split-compare` explicitly declines to make its
option cells size containers. So the box-local reach was an aspiration in the
comments, never shipping behavior, and the stamp gives up nothing real. If a
nested cell ever needs its own family it stamps its own `data-family`: same
classifier, same attribute, no second mechanism.

A related constraint also lifted. §11 of the 2026-06-18 note recorded that a
container query cannot style its own container element, which forced `math`,
`citation-card`, and `logo-wall` onto `data-orientation` or onto descendant-only
workarounds. The stamp sits *on* the section, so that boundary is gone. Those
rules are correct as written and were left alone rather than churned; their
comments now say the constraint no longer binds.

## What was deleted

- `CSS_BOUNDARIES` and `DECK_TO_CSS_BOUNDARY` (`lib/adaptive/families.js`) — there
  is one boundary list again. `familyQuery()` became `familySelector()`.
- The `--lat-family` stamp in `lib/base/base.elements.css`, which existed only so
  a gate could read the CSS's own verdict.
- `tools/check-adaptive-families.js` and its `check:families` script — the gate
  that rendered 14 deck sizes to catch the two classifiers disagreeing. With one
  classifier there is nothing to disagree.
- `CATEGORY_QUERY` in `lib/typography/scale.js` — a reserved `@container` twin of
  the type-category boundaries, never emitted, held for the same nested-box plan.

`container-name: lattice` stays on `section`. No engine rule queries it now, but
it is a stable handle for theme and deck CSS and removing it would break such a
rule silently.

## Gates

Seven, replacing the one that was deleted. The count grew twice during review —
the adversarial trio kept finding a failure the existing set could not see, and
each one is listed here with the failure that motivated it rather than as a
feature:

- **`no engine CSS reintroduces an @container aspect-ratio query`**
  (`test/unit/adaptive/families.test.js`) — the retired mechanism stays retired.
  It failed silently, which is why it needs a gate rather than review.
- **`component family selectors name only canonical families`** — a typo like
  `[data-family="portrait"]` is a rule that matches nothing; `[data-family="wide"]`
  never matches at all, since `wide` is the unstamped default.
- **`checkAdaptDeclarations`** (`tools/check-ownership.js`) now keys on
  `[data-family=…]` instead of `@container … aspect-ratio`. Left unchanged it
  would have matched nothing and let every `reflow` component silently
  reclassify — the gate would have gone green by going blind.
- **`no family selector uses the leading form against a section compound`** and
  **`no doc or canon file teaches the leading form`** (both in
  `families.test.js`) — the trap in rule 3 above, in engine CSS and in the six
  files that document it. Added after the canon itself was found teaching it.
- **The overflow oracle** in `check-family-tiers.js`
  (`test/oracle/family-overflow.json`) — renders one gallery slide per
  family-reflowing component at all four family sizes and freezes which
  components clip. This is the one that mattered most: a red-team pass found
  `cycle`, `authority-chain` and `regulatory-update` rendering clean on `main`
  and CLIPPED on this branch, with every other gate green, because turning the
  square tier on for the first time applied a *portrait* layout to a square box
  that nobody had ever seen render. The probe half of `check-family-tiers` proves
  the mechanism fires; it cannot see a clip, and it only ever looked at three of
  the thirty-three. The oracle looks at all of them and reads the real
  export. It runs in the nightly render tier, not per-PR CI — four full emulator
  sweeps are too slow for the fast lane.
- **`checkCssSyntax`** (`tools/check-ownership.js`) — every stylesheet under
  `lib/` and `themes/` must parse without an esbuild warning. Not strictly a
  family gate, but found the same way: driving the real Marp export surfaced
  `Cannot register theme CSS: lattice.css`, traced to a mangled comment in
  `radar.styles.css` that had swallowed a rule. esbuild warned about it, and the
  minifier destructured `{ code }` and threw the warning away, so `npm run build`
  had been green over a bundle Marp's stricter parser rejected outright.

Plus one in the AI tier. The canon in `lib/layout/ai.js` teaches this idiom, and
the existing tests only proved the taught CSS was gate-*clean* — a leading
`:where([data-family=…]) section.x` is perfectly scoped and matches nothing, so it
passed. `component-ai.test.js` now parses the family selectors out of the worked
examples and asserts each one actually matches an element in a stamped slide.
That guard was written after the first draft of this change shipped exactly that
broken form into the canon.

`lib/layout/gate.js` also gained `splitSelectorList`: `findUnscopedSelectors` split
selector lists on a naive `,`, so `:where([data-family="tall"], [data-family="strip"])
section.foo` read as two parts and the first looked like an unscoped leak. That was
a latent bug — `:is(ul, ol)` already tripped it — and the family idiom makes it
load-bearing.

## Verification

Rendered through the real emulator at four deck sizes, reading the computed
result of a reflow rule only that tier can produce:

| size | stamp | `stats` wrap | `decision` list | `matrix-2x2` list |
|---|---|---|---|---|
| hd | (none → wide) | nowrap | row | row |
| square | `square` | **wrap** | row | row |
| portrait | `tall` | nowrap | column | column |
| mobile | `strip` | nowrap | column | column |

The square row is the fix: `stats` wraps 2-up there where the whole tier was
inert, while `decision` and `matrix-2x2` deliberately keep their side-by-side set
— so the boundary is precise, not a blanket "everything non-landscape".

An earlier draft of this note, and of the CHANGELOG, claimed `decision` reflows
to ONE column at square. It does not, and the shipped code says so in its own
comment: square is the balanced family, and collapsing it was measured to cost
capacity. The claim was written before that decision was made and never revised —
caught by the independent checker, recorded here rather than quietly corrected.

## Square is a real family now — two layouts fixed, and one number that isn't

Turning the tier on exposed layouts nobody had ever seen render. Two were wrong,
and both are fixed here rather than filed:

- **`stats` at square is now 2-UP.** Stacking it into one column wasted the width
  a square box has: four stats needed 825px of a 750px stage and clipped
  `examples/social-square.md` — the first tile's number sheared off, the fourth
  tile's label gone entirely. A 2x2 wrap uses both axes, which is what
  `families.js` says square *means* ("balanced — 2x2 grids, 2-up"), and lifts the
  measured ceiling from 3 to **4** at `calibrate-capacity`'s default basis
  (`density.soft`), or to 6 at a terse 6-word basis. The two numbers are not a
  contradiction — a count ceiling is a function of element size — but the basis
  has to be NAMED, and an earlier draft quoted the terse figure as if it were the
  default. See the capacity section below for why that distinction is the whole
  unfinished problem. Two wrong answers were tried first and are recorded in
  the CSS so nobody repeats them: keeping the WIDE N-across row (crowds every
  number — a square box is not a wide one), and keeping one column (the clip).

- **`citation-card`'s `.split` and `.triptych` never reflowed at all.** Their
  collapse rule listed three comma-parts but only the third carried `> .cell-stage`,
  so the first two applied it to the SECTION — a no-op, since the section is
  already a flex column — and the stage stayed `flex-direction: row`. At `story`
  that clipped by 293px (stage 1504, content 1797), on two slides whose own titles
  read "collapsed to bands" and "collapsed to a stream". A selector list
  distributes nothing; each part needs its own combinator. Pre-existing (it
  reproduces on `main`), but squarely on this branch's path.

`tools/check-family-tiers.js` now probes `stats`' **flex-wrap** rather than its
direction: since stats went 2-up, square and wide are both `row`, and only square
`wrap`s. Mutation-tested — repointing the square rule at another family fails the
gate.

### Four more layouts had to LOSE their square tier (a fifth was tried and reverted)

The two above were rules that should have run and didn't. The opposite case is
larger, and a red-team pass is what surfaced it: **~25 blocks were converted
verbatim from `<= 1.05`, which had never matched a square deck.** So for every
component except the three re-measured above, "the square layout" being switched
on for the first time was a *portrait* layout in a square box that nobody had
ever seen. Five were changed; **four of those stuck**, three badly enough to clip.
The fifth — `statute-stack` — was reverted, and that reversal is the most
instructive thing in this section, so it is kept in the table rather than quietly
deleted:

| component | at square, before the fix | why square keeps the wide layout |
|---|---|---|
| `cycle` | 4-stage stack, last card + return arc off the frame | its own `cycle.manifest.json` declares `adapt.families: [wide, tall, strip]` — there IS no square tier; the CSS had four square rules anyway |
| `authority-chain` | rail collapsed, body text sliced mid-word, last card clipped | a square box is 1080px wide; the `14cqi` rail is ~151px there against ~179px at `hd`, which is not a crush |
| `regulatory-update` | third card + its "Effective" pill off the frame | stacking four fields per row roughly triples row height |
| `statute-stack` | **REVERTED — square still stacks today.** | The removal was made on `calibrate-capacity` (rails 3, stack 2) and it was wrong. Both readings hold words at this component's declared `density.soft` of **16** while its real cards carry 6–8, and at that size the ordering inverts. Rendering its OWN gallery at square: removing the tier took it from **1 clipped slide to 5**, including the default three-jurisdiction slide (`GDPR Art. 8` cut to `GDP`). The render beats the harness (HARD RULE #23). Verify with `grep -c 'data-family=\"square\"' lib/components/legal/statute-stack/statute-stack.styles.css` → 5. |
| `kpi` | hero flattened to a uniform ledger, `94%` barely larger than its supports — and clipping 11px, so this was a fit fix as well as a taste one | square is the SOCIAL family, where one big number is most of the point. Rendered side by side: the hero card + rail fits with room to spare, and the clip goes to 0 |

The `statute-stack` entry is the sharpest instance of this note's own theme. A
comment claimed, in the word "measured", that holding the rails at square drops
the ceiling 2 → 1. Re-run against the real probe it is 3 versus 2 — the reverse.
Nobody re-derived it, so it drifted, exactly like the `1.05` boundary did.

Where the square tier IS right, it is a clear win: `progress` at square goes from
a cramped band in the middle of the frame to full-width bars with readable
labels. Whole-library check — one gallery slide per family-reflowing component at
`size: square`, pixel-diffed against `main` — leaves six pages differing, all of
them either these deliberate decisions or sub-pixel text shifts, and the clipped
set is now a strict subset of `main`'s.

## Six components promised `reflow` and shipped none

Reported from a phone, on the deployed docs preview: `premise` rendering its lede
one word per line, each ladder row's verb cut to "R…", the slide ringed
OVERFLOWS. It reproduced byte-identically on `main` — same stamps, same 2151 vs
2121 — so it was never a regression from this branch. It was a component
declaring `adapt.mode: "reflow"` while shipping a single landscape composition
and painting it in every box: a 34% claim rail (≈333px on a phone) beside a
ledger whose term track is a fixed `10.9375cqi` with `nowrap` + ellipsis.

Nothing caught it, because `checkAdaptDeclarations` was **one-directional**. It
asserted "CSS with a family rule ⇒ manifest says reflow" and never the converse,
so a manifest could claim `reflow` with nothing behind it and stay green. Six
did: `premise`, `compare-code`, `compare-table`, `inventory`, `video`, `diagram`.

That is this note's own theme one level up. #1218 was a *boundary* that drifted
from what it measured; this is a *promise* that was never checked against what
shipped — and worse, the manifest is the machine-readable contract the docs and
authoring agents read, so it was actively telling consumers the component adapts.

The gate now runs both ways, and enumerates **four** mechanisms rather than one,
because a CSS-only check is a false-positive machine:

| mechanism | the component that proves it is needed |
|---|---|
| `[data-family=…]` / `[data-orientation=…]` CSS | most reflowing components |
| an orientation-branching `*.transform.js` | **nothing today** — it is in the list because the schema names it, and it admits no component the CSS test would not already admit. Untested surface; tighten it before relying on it |
| the mermaid reorient | **`diagram`** — no layout CSS at all; `reorient.js` rewrites a flowchart's direction token LR→TB on a tall box. A CSS-only gate would have forced this TRUE declaration into a false one |
| a carousel `split.strategy` reshape | **`compare-table`** — a wide read-across table cannot paginate out of HORIZONTAL overflow, so `cover-cards` transposes each row into a card. Box-conditional by construction: auto-split is skipped outright on a landscape `@size` |

Two of the six were therefore correct all along. The other four got real reflows:

- **`premise`** — claim above ledger; each row becomes a hanging-ordinal card with
  the term stacked over its description. `white-space: normal` is the
  load-bearing line: the landscape row is `nowrap`, which is what forced the
  ellipsis instead of a wrap. Square stacks too, unlike `stats`/`decision`/
  `cards-grid` — those keep their wide form because it is a 2-up of PEER items and
  a square box has the width for two; this is a narrow prose RAIL beside a table,
  unreadable at any height.
- **`compare-code`** — the `1fr 1fr` read-across stacks. Its clip was HORIZONTAL,
  which the vertical overflow probe cannot see at all, so the right block ran
  clean off the frame in silence. Stacking does not replace the `cover-code`
  split recipe; it is what the slide does when it is *not* split.
- **`inventory`** — the two-column variant grids collapse; the default ledger was
  always a single column and needed nothing.
- **`video`** — `.video-embed` is a flex row, so the poster held its `46cqi` cap
  beside a squeezed lead. Stacked at tall/strip; square keeps the row (972px
  leaves ~500px for the copy beside a ~447px poster).

**What the inversion pass caught in that work, and what it cost.** Three of the
four fixes above shipped a defect of their own; they are listed because the shape
repeats:

- **`premise`'s reflow dropped the slide's claim off the top of the frame.** The
  new family block set `flex-direction: column` while the section kept
  `justify-content: center`, and a centered flex column that overflows spills off
  BOTH ends — measured, the `<h2>` sat at **−145px** at portrait while the rows it
  frames stayed visible. That is strictly worse than the truncation it replaced:
  "R…" is a damaged term, a missing claim is a missing argument. Fixed with
  `justify-content: safe center`, which falls back to `start` exactly when
  overflow would occur, so the spill goes one way — off the bottom, where the
  overflow probe and the split recipe can both see it.
- **`compare-code`'s stacking only halved its horizontal clip.** A bare `1fr`
  track floors at min-content, and a `<pre>` reports its longest unwrapped line as
  min-content — so the single column computed **1173px inside a 1080px section**
  and every descendant hung 147px off the right edge. `minmax(0, 1fr)` plus
  `pre-wrap` at these families closes the horizontal half (measured: 972px track,
  zero elements overflowing right) and clears the mobile clip. It does NOT make the
  slide fit at portrait — two code blocks that each want real height never will,
  which is precisely what `cover-code` is for — and the oracle records that clip
  rather than the prose implying it is gone. The vertical probe reads horizontal
  overflow as zero, so nothing would have reported the original at all.
- **The overflow oracle claimed coverage it did not have.** Its roster listed 34
  components and rendered **31**: `_chart-family` is a shared stylesheet directory
  with no manifest and no slide, and `premise` and `video` — the two components
  this change gave new reflows — have no slide in the baseline gallery. So the two
  most-changed components were the two never measured, which is precisely why the
  `premise` regression above passed every gate. The sweep now falls back to a
  component's OWN gallery deck (rather than adding slides to a long-running
  gallery, which HARD RULE #8 forbids in feature work) and **hard-fails** when a
  rostered component has no slide at all. Roster is 33, all rendered.

**Open, and NOT cosmetic: `premise`'s stacked composition collides with the deck header
(found 2026-07-28, #1234, by looking at a render on a phone).** `section.premise` sets
`padding: 0 var(--sp-2xl)` — zero on the block axis. Correct for the landscape
composition, where the claim rail and the ledger sit side by side and nothing reaches the
top edge. Stacked, the claim IS the top edge, and it lands straight under the deck
`<header>`, which is `position: absolute; top: var(--frame-inset-y)` and reserves no space
of its own. The running header prints THROUGH the `<h2>` and both are unreadable, on every
premise slide in any deck that sets `header:`. A Form layout never hits this because
`.cell-masthead` occupies the band; a sovereign frame has to reserve it itself.

Reproduce: any premise slide, `size: portrait`, `header:` set. No split involved — this
shipped with the reflow in this note, not with the split work.

**Not fixed, because it is a density decision rather than a padding one.** Reserving the
berth is two lines and a full box has no slack to give. Measured against premise's own
gallery at portrait — 5 slides, 1 clipping today — reserving top *and* bottom takes it to
**5 of 5 clipped**; reserving the top alone, sized to exactly one `--fs-meta` line, still
takes it to **2**. So the honest statement is "premise holds fewer rows at portrait than
it claims", which is the owner's call and wants the capacity work
(`2026-07-28-capacity-basis.md`) behind it. The overflow oracle caught the attempt and
refused it, which is the gate working.

**~~Still open, and cosmetic~~ — the `--row-mark` hue restart. The note below sent the
next reader to the wrong place, so here is what an attempt found (2026-07-28, #1234).** The `--row-mark` hue cycles on
`nth-child(8n+k)` *within each `<ol>`*, so across a split run page two restarts at the
first hue. Confirmed by computed style on a real portrait render: page three's four rows
read `rgb(46,96,138) · rgb(134,50,54) · rgb(123,119,45) · rgb(50,54,134)` — byte-identical
to page two's. The ordinal was fixed here by moving to the `list-item` counter; its visual
twin cannot follow, because CSS cannot select on the `start` offset without a rule per
start value.

**Correction to this paragraph's own diagnosis.** It proposed "a transform that stamps each
row's absolute index" and deferred on the grounds that "`premise` has no transform today".
Both halves are misleading. `premise` *does* have one (`lib/core/premise.js`), and more
importantly the absolute index is **not premise's to know** — it is the SPLIT's, and
`partitionAxis` (`lib/core/collections.js`) already holds it exactly, as the `offset` it
uses to write `<ol start="N">`. Anyone starting from this paragraph will go looking for a
component transform and find the wrong problem.

**Why the obvious fix was built, measured, and then reverted.** Stamping the palette slot
on every member at that `offset` works — verified end to end, page three continuing
`rgb(48,130,126) · rgb(134,88,50) · rgb(88,56,128) · rgb(128,56,95)` for slots 5–8. It was
still the wrong change to ship: `partitionAxis` is component-agnostic, so an unconditional
stamp alters the emitted HTML of **every** item-axis split across 15+ components to serve
one, and eleven byte-exact tests said so. A kernel may legitimately own a *structural* fact
(`data-split-role` is stamped everywhere for exactly that reason), but "which of eight
palette slots" is a presentation concern, and the modulo cannot move to CSS — there is no
attribute-modulo selector, which is the same wall the `start` offset hits.

So the honest shape is **opt-in through the manifest**, the way `capacity.relationship` was
added (§8 rule 12a): the component declares it wants a continuous categorical cycle, the
kernel stamps only for those, and the split oracle records it so dropping it fails CI. That
is a real slice — schema, oracle, plumbing — for a cosmetic defect, so it is written down
rather than smuggled in. Shipping the broad version to avoid the slice would be the same
trade this note exists to argue against.

One trap worth keeping, found on the way: the first cut named the attribute `data-cat`,
which the chart family already owns on `.chart-key-swatch` — and owns **0-based**. Same
name, inverted indexing, different subtree; it would have read as correct right up until
someone generalized one of the two.

**A split surfaced a counter bug in `premise`.** Once it could paginate, page two
restarted the ordinals at `01` — on a Bloom ladder, "Analyze is the first verb".
The splitter was already emitting `<ol start="4">`; `premise` was using a private
`counter-reset: premise-row`, which ignores it. Switched to the built-in
`list-item` counter, which `start` maps onto — with an explicit
`counter-increment`, since `display: grid` removes the element's list-item-ness
and with it the UA's automatic increment. All 8 landscape pages stay
pixel-identical (`compare -metric AE` → 0).

## What is NOT fixed: the capacity numbers, and why

`tools/calibrate-capacity.js` measures a real ceiling, and the per-family lint
plumbing ships. The NUMBERS do not, because the basis is not yet trustworthy —
and the reason is worth recording, because it is the same defect one level down.

A count ceiling is only meaningful for a stated element size, so the tool holds
words-per-element fixed and grows the count. Calibrated at each component's
declared `density.soft`, 34 declared values exceeded their ceiling — but the
result warned on decks that render perfectly (`social-portrait`, `social-story`),
because real decks write terser than their budget allows. Re-calibrated at a flat
terse 6 words, 21 exceeded — and it *still* warned on `social-portrait`.

The reason is `stats`: it declares `density.soft: 8` with the note "a metric
label, not a sentence", while its own skeleton uses **two** words (`73%` /
`faster close`). The declared density is four times its own canonical example. A
capacity ceiling measured against it is measuring a slide nobody writes.

So: **capacity cannot be grounded until density is honest**, and the right basis
is neither `density.soft` nor any constant — it is each component's own SKELETON,
the canonical authored element already sitting in every manifest. That is the
next step, and it is a derivation, not another number to hand-maintain. Shipping
the current values would have replaced one set of unverified numbers with
another, which is the exact failure this whole note is about.

> **⚠ SUPERSEDED — the skeleton prescription above was checked, and it does not
> hold (2026-07-28, #1234).** The *diagnosis* stands: `density.soft` is more
> generous than real authoring on **23 of the 25** measurable components, and
> tighter on none. The *prescription* is backwards. A skeleton is a shape template
> with placeholder filler ("One-sentence description"), not a length specimen — it
> runs more than 30% terser than real authoring on **8 of 25**, and a terser basis
> measures a **higher** ceiling. For `inventory`, the very component the paragraph
> below is about, the skeleton basis moves the measured `tall` ceiling from **3 to
> 5** — away from the truth, and in the direction that makes the linter quieter
> about slides that clip.
>
> Measured deeper, the count ceiling is not a well-defined quantity at all: holding
> `inventory` at 4 members and ~10 words, the same slide fits or clips depending on
> its look modifier and whether it carries a trailing insight. See
> `2026-07-28-capacity-basis.md`; re-derive with `node tools/audit-capacity-basis.js`.
>
> This paragraph is itself an instance of what this note is about. "The right basis
> is the skeleton" was written down once — in the section arguing that assertions
> nobody re-derives drift from what ships — and never checked against the skeletons.

**`inventory` is the sharpest live instance, and it is deliberately left alone.**
It declares `adapt.capacity.tall.hard: 8`; the measured tall ceiling is **3**
(`node tools/calibrate-capacity.js inventory --family tall` → overflows at 4).
The gallery's four-item slide clips at portrait by **594.6px** measured with the
engine's own overflow probe — an earlier draft said 200px, which was a
stage-level reading rather than the probe's. The direction is the point and it is
unchanged: a declared-8 / measured-3 gap predicts exactly this. Two things make this a LOG rather than a
fix. First, it is pre-existing and untouched by this change — 200px over before
the reflow landed and 200px after, so nothing here worsened it (the probe reports the same 594.6px on `main`). Second, and more
important, correcting it would mean shipping a new hand-set number on the same
untrustworthy basis: the tool held `density.soft` at 14 words while inventory's
own skeleton writes "a name and one clause of body", so a measured 3 is probably
as pessimistic as `stats`'s was. Replacing 8 with 3 would swap one unverified
number for another and call it progress. The honest move is to wait for the
skeleton-derived basis above — which is why this is written down instead.

`premise` is the counter-example, and the contrast is the point: its numbers ARE
shipped here, because they are **re-derivable**. A `premise` element builder was
added to `tools/lib/calibrate-core.js`, so `node tools/calibrate-capacity.js
premise --family tall` reproduces them on demand.

That was not true of the first cut, and the inversion pass caught it: the numbers
came from an ad-hoc script, the manifest note said "measured", and this very
paragraph claimed "same tool" for a component the tool refused to run
(`No element builder for 'premise'`). The ad-hoc rows were also shorter than the
tool's basis, so the ceilings came out too high — declaring a `tall.hard` the tool
did not support, which would have kept the linter silent on a slide that clips.
The value moved twice more as the reflow changed shape, so this note deliberately
does NOT quote it: run `node tools/calibrate-capacity.js premise --family tall`
(currently 6). An audit found three different published figures for this one
number across the manifest, its split note and this paragraph — which is the
sharpest possible demonstration that an assertion nobody re-derives drifts from
what ships. Writing that sentence twice in this note did not exempt the note
from it; naming the command instead of the constant is the actual fix.

## The export change this note did not originally mention

`data-family` was stamped only by the RUNTIME before this change, and
`lattice-emulator.js` strips the runtime from the export document. So the Frame's
own generated rules —

```css
section.form[data-family="tall"]  { --masthead-cols: [masthead-lede masthead-bay] 1fr; }
section.form[data-family="strip"] { --masthead-cols: [masthead-lede masthead-bay] 1fr; }
```

— **never fired in PDF or HTML export.** Stamping server-side turns them on. The
masthead bay goes from a 0px column to a full-width row on every tall/strip slide
in every export path, which is a far wider blast radius than "34 blocks in 30
files" and belongs in the record.

Measured across all 19 non-landscape example decks, both engines: **zero overflow
regressions**, three decks improved (`adaptive-sweep` pages 14–15, `social-square`
page 4, `reflow-legal` two of three). A computed-style diff of `adaptive-sweep`
(`size: story`) shows 132 property changes, all either this masthead column or
the intended `citation-card` fix. Landscape output is unchanged and pixel-verified.

It reads as an improvement, but it alters exported bytes library-wide, so it goes
through the export sign-off gate rather than riding along with the reflow work.

### Known limitation: the Export-to-Marp CSS-only route

Family reflow moved from renderer-agnostic CSS to a JS-stamped attribute, so it
now needs something to do the stamping. Both Lattice render paths do (the engine
server-side, the runtime in the browser). An **Export-to-Marp bundle rendered by
marp-cli** does not: the bundle ships the deck as plain markdown, marp-cli renders
it with marp-core, and marp-core knows nothing about `data-family`.

Verified on the real surface rather than reasoned about — exported
`examples/adaptive-sweep.md` (`size: story`) to a bundle and rendered it with
marp-cli 4.3.1: the bundled `lattice.css` carries **hundreds** of `data-family`
selectors and the deck markdown carries **0** stamps. (The load-bearing half is
the zero. An earlier draft quoted "414" — that was a point-in-time count of a
bundle that keeps growing, and it did not reproduce on re-export; a number that
drifts every time the CSS changes should not have been written as a constant.) Under the retired `@container` form
these rules were pure CSS and did fire there, so this is a real narrowing of that
route.

Its practical reach is small. The same route already renders none of Lattice's
transformer-built structure (no `.cell-stage`, no chart figures), which most
family rules select through — so most of them had nothing to match on anyway.
The bundle's browser route is unaffected: `lattice-runtime.min.js` survives into
marp-cli's HTML output and stamps on load. And Marp is a retired render path
(HARD RULE #1); export-to-Marp is the one surface left.

Recorded rather than fixed, because every fix is worse than the limitation: a
class carrier would reintroduce the second mechanism this note exists to delete,
and rewriting the bundled CSS per deck would break `lattice.min.css`'s
byte-identical static-asset contract across both bundle producers.

## Corrections this note carries

An independent checker found five load-bearing claims here and in the CHANGELOG
that the code, this branch's own gate, or its own measurement tool contradicted.
They are corrected above and listed here so the pattern is visible rather than
buried:

1. `decision` reflows to one column at square — **false**, it keeps 2-up.
2. `stats` square ceiling "3 → 6" — **basis-dependent**; 4 at the tool's default.
3. The `**Breaking:**` list named four removals (`CSS_BOUNDARIES`,
   `DECK_TO_CSS_BOUNDARY`, `--lat-family`, `check:families`) that this branch both
   created and removed, so no consumer could observe them.
4. `split-envelope` "had stopped demonstrating the split" — **false**; the split
   fires at six cards too. The deck edit that rested on it is **reverted**: the
   committed deck is main's, six cards, still splitting to 24 pages, linting clean.
5. The leading-prefix trap was described as gated; it was gated for the AI canon
   only. It is **now gated for engine CSS too** — `test/unit/adaptive/families.test.js`
   scans `lib/**/*.css` for `:where([data-family…]) section…` and fails on it,
   while still permitting the legitimate leading form against a `figure.`
   descendant.

The common thread: each was written at the moment the work was *intended*, and
none was re-checked after the implementation changed under it. The lesson is the
same one this note is about — an assertion nobody re-derives drifts from what
ships.
