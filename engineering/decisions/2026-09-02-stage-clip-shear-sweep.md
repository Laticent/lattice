---
status: shipped
summary: >
  The `list-steps` shear (#2046) was one instance of a class, so the class was swept: every
  growing flex rule under `lib/components`, `lib/base` and `lib/forms` was enumerated, and
  every direct `.cell-stage` child among them was pressed with a dense fixture in a real
  Chromium at `hd`. Nine declarations across eight components were shearing card chrome
  while every word still fitted, and they are fixed. The more useful half of the result is
  the other column: `min-height: 0` is the WRONG answer more often than it is the right
  one. It is inoperative on a `<table>` (row boxes drive the height, measured identical
  either way), inert on a wrapping row whose lines keep their own height (`cards-grid`,
  `verdict-grid`, `pricing`), and actively harmful on four more, where clamping moves the
  overflow inside the frame — the failure `kpi.styles.css` already records (#1277). Two
  components were also losing text off the TOP of the slide, silently, because a centered
  box that overflows splits the excess both ways and block-start overflow does not grow
  `scrollHeight`.
---

# The stage-clip shear class, swept

**Date:** 2026-09-02 · **Status:** SHIPPED — nine fixes landed, the rest recorded here

## The symptom

A dense slide loses the bottom border, radius and shadow off its cards, and not one word of
text is missing. The export then warns "Content clipped" about a slide that lost nothing.

## The mechanism

`.cell-stage` (`lib/forms/cell/stage/stage.css`) is a bounded clipping cell — `flex: 1 1
auto; min-height: 0; overflow: clip`. Every direct child of it is therefore a flex ITEM, and
a flex item's default `min-height: auto` is a CONTENT-height floor. A component body that
does not say `min-height: 0` refuses to shrink into the cell that clips it, so the box grows
past the stage and the clip takes whatever chrome sits between the last line of text and the
box's own bottom edge.

That gap is the **shear window**, and its width decides everything: it is the growing box's
own bottom padding plus border. Measured across the sweep it runs 4.45px (`logo-wall`, which
has neither) to 31.18px (`decision`, 28px of card padding plus a 3px accent border). The
**density quantum** — one more wrapped line, one more item, one more row — is 26.9–34.2px for
a card grid, 32.07px for a table row, 103–160px for a logo wall. So whether an overfull slide
shears chrome or eats a word is close to a coin flip on phase: for `decision`, the same three
cards under a one-line heading fit with 43.86px to spare and under a two-line heading shear
19.44px.

## What was swept, and how

A static pass over all 86 files in `lib/components/**/*.styles.css`, `lib/base/**/*.css` and
`lib/forms/**/*.css` found 109 growing-flex declarations, 79 of them with no `min-height: 0`
plausibly applying. A dynamic pass over the 84 staged sections of the CI baseline gallery
read the COMPUTED style of every direct stage child in a real Chromium and found 20 with a
growing flex and `min-height: auto`. Every direct stage child from either list was then
pressed with a hand-authored dense fixture and an overstuffed control, at `size: hd` — 16:9
is the shortest landscape stage, and `hd` is the default, so it is where the shear bites
first. It is aspect ratio, not resolution: 4k shears the same proportion, `standard` (4:3)
often does not reproduce at all.

The measurement that separates the two outcomes is the **deepest ink** versus the box:

- **SHEAR** — the box hangs past the clip edge, the last line of text is still inside it.
  Chrome is lost, no word is. This is the fixable case.
- **REAL OVERFLOW** — the ink is outside too. Clamping the box does not remove the loss, it
  MOVES it inside the frame where the stage clip can no longer catch it.

## Fixed (nine declarations, eight components)

Each measured at `size: hd`; each is inert while the content fits, and each is pinned by two
arms in `test/integration/parity/stage-clip-chrome-shear.test.js` — a dense arm that fails
without the declaration, and an overstuffed control that must keep reporting overflow.

| component | was | now |
|---|---|---|
| `compare-prose` (the card row) | 445.06px row in a 438.22px stage, 6.84px shorn off both cards, ink 14.34px inside | row is exactly stage height, ink unmoved |
| `decision` (the option row) | 412.88px in a 393.44px stage, 19.44px shorn including the 3px `--decision-accent` border | no hang |
| `redline` (the plain clause only) | 429.28px against a 406.28px share, 23px of border, radius and left rail shorn | no hang |
| `matrix-2x2` (the quadrant list) | 448.78px in a 438.22px stage, both bottom quadrants 10.56px out | no hang |
| `statute-stack` (the three rails) | 446.63px in a 438.22px stage, ALL THREE rails 8.41px out | no hang |
| `policy-recommendation` (the rationale list) | held 282.56px against a 276.12px share and pushed the ask bar 6.44px out | no hang |
| `citation-card.pull-quote` (the hero quote) | a 294px quote where the stage could give it 249.50px, pushing the gloss 44.50px out — and here the clip was into TEXT, 15.17px of the gloss outside it | no hang, ink 29.33px inside |
| `citation-card.split` (both centerings) | the gloss sat 25.02px ABOVE the stage top, 21.02px of text gone | nothing above the top edge |
| `cycle` (the ring, and the stage's centering) | 471.94px ring in a 400.44px stage, 35.75px off EACH edge, 16.75px of text gone off the top, the return arc and ↻ mark entirely below the clip | ring is exactly stage height, arc and mark back |

| `statute-stack.preemption` (its centering) | **self-inflicted, caught by the checker** — releasing the base list's floor above let `.preemption`'s bare `center` split the excess both ways: 53.53px of real text above the stage top on a four-card stack, 129.56px on a five-card one, taking the FEDERAL label, its citation pill and the card's top border off the slide. Unclamped, the same deck put all 125.97px of its loss out the bottom, where it is visible | nothing above the top edge, and the rail chrome the base fix bought is kept |

So ten declarations, not nine: the `.preemption` keyword is the base fix's own cost, found by
the independent checker and fixed before the PR. It is the exact hazard the gotchas entry
this change ships describes — a fair thing to walk into, a bad thing to ship.

**"Chrome only" holds for six of the nine, not all nine.** On `citation-card.pull-quote`,
`citation-card.split` and `cycle` the fixture loses words as well, so the fix recovers text
too and the residual spill stays visible with `over: true`. The dense arms in the test mean
"the box would have overrun", not "this slide fits".

`redline` is scoped `:not(.stacked):not(.annotated)` and the exclusions are measured, not
cautious — see below.

## NOT fixed, and why — the more useful column

**`min-height: 0` is inoperative.**

- `compare-table`, `obligation-matrix`, `statute-stack.lane` — the growing box is a
  `<table>`, whose used height comes from the table layout algorithm; the flex auto-minimum
  is not what holds it. Measured both ways on `obligation-matrix`: hang 30.16px and ink
  16.48px, identical with the floor released. An isolated control confirms the mechanism —
  same clip cell, same content, a `div` goes 312 → 200px and a `table` stays at 324px.
- `citation-card.split` — that stage is `flex-direction: row`, so the auto-minimum on its two
  children is a WIDTH. Clamping either child changes no geometry at any density. (Its head
  loss was real, and that is what the `safe` keywords fix.)

**`min-height: 0` is inert on the defect.**

- `cards-grid`, `verdict-grid`, `pricing` — the row WRAPS, and `align-content` gives each
  flex line its own height, so clamping the container does not shrink the line that carries
  the chrome. Measured on `cards-grid`: the `ul` goes 445.63 → 438.22px and the card still
  hangs the identical 7.41px. These three shear (7.41px, 6.78px, 20.92px) and this is not
  their remedy; naming one would need a design pass on where the row yields, not a
  declaration.

**`min-height: 0` is harmful.**

- `kpi` — tried, shipped, reverted. The record is in `kpi.styles.css` and it is the reason
  this sweep measured an ink discriminator at all (#1277).
- `redline.stacked` — two `flex:1` clauses at basis 0 split the stage evenly regardless of
  content once released; the longer clause escapes its own box and ink goes −6.44 → +0.28px.
- `redline.annotated` — the overrun belongs to the trailing annotation list, not to the
  clause. Released, the stage hang goes to nothing and the probe goes SILENT while the
  clause's own `scrollHeight/clientHeight` reads 169/92 — 77px of text painting over the
  annotation list.
- `split-compare` — clamping `.options` takes the probe clean while 20.88px of option text
  ends up underneath the verdict card's `--accent-soft` panel.

**Immune.**

- `list-criteria` — its `li` carries `container-type: size`, so each row contributes exactly
  zero to the list's floor. Falsified hard rather than taken on trust: 34 bare criteria are
  needed before the list overruns at all, and 33 × `--sp-sm` = 528.00px matches the measured
  528.00px to the hundredth. Documented capacity is ~4.
- `list` — the shear band is 0px wide. Its `li` is `flex:1 1 0; min-height:0`, so each row is
  squeezed to its own decoration height and text spills to the box edge: every hang measured
  equals its ink to the hundredth (145.78/145.78, 45.78/45.78, 40.56/40.56).
- `premise` — a sovereign frame with no `.cell-stage` at all.
- `stats` — all three growing rules are orientation- or family-gated and inert at `hd`. At
  `size: square` the component does shear 33.94px, and the clamp relocates rather than
  removes it (same as `regulatory-update`).
- `logo-wall` — a 4.45px band on a `ul` with no border, radius or shadow: nothing a viewer
  could name is lost. Worth recording separately: the ink discriminator is **blind** here,
  because a logo is a CSS mask and not a text node. An entire partner mark measured 150.36px
  outside the clip while the ink read 21.77px inside. Any conclusion drawn from ink on an
  image-bearing component is unsafe.

## The head-loss half

Two of the nine fixes are not `min-height` at all. `stage.css` § safe alignment (#1299)
requires every alignment that can push content off the block-start edge to be `safe`, because
block-start overflow does not grow `scrollHeight` — a cut tail announces itself, a cut head
does not. Two components were breaking that rule and losing text off the top of the slide
with every gate reading clean: `cycle` (16.75px) and `citation-card.split` (21.02px). Both
now use `safe`, which falls back to `start` only once content overflows, so a fitting slide
is byte-identical.

Two of the `min-height` fixes needed a `safe` keyword WITH them, for the same reason in the
other direction: released and still centered, `policy-recommendation` and
`citation-card.pull-quote` throw their own content off the top — measured one density past
the shear fixtures at 103.50px and 30.14px of real text above the stage edge. A third,
`statute-stack.preemption`, is the same story and is the one this sweep briefly shipped
broken (above).

**Which of the four `safe` keywords is load-bearing, measured by reverting each to a bare
`center`:** `policy-recommendation` (103.50px), `citation-card.pull-quote` (30.14px) and
`statute-stack.preemption` (53.53px) each reintroduce head loss, and each is pinned by its
own test arm. `cycle`'s stage keyword is **inert** once the ring's own `min-height: 0`
landed — identical geometry either way — so it is belt-and-braces and is deliberately not
claimed as pinned. The three that matter were invisible to the shear arms, because those
fixtures are not dense enough for the CLAMPED box to overflow its own share; they needed one
density more, which is why the test gives them a separate table.

## Found, not fixed — pre-existing, off the path of this change

Two more silent head-loss surfaces turned up while checking this one, both measured
**identical before and after** every declaration here, so they are found rather than caused
(HARD RULE #18 logs those rather than pulling them into the diff):

- **`decision.banner-tag`** — the card body already carries `min-height: 0` with a bare
  `justify-content: center` inside an `overflow: hidden` card
  (`compare-prose.styles.css:318`). Measured at `size: hd` on a six-line card: **119.88px of
  real text above the stage's top edge with the probe reading `over: false`** — the card's
  own clip absorbs the rest, so nothing in the system sees any of it. 160px of a 594px body
  eaten inside a 434px client box.
- **`compare-prose.axis`** — the same shape in the same file, ~103px.

Both are one `safe` keyword away from fixed, and neither is on this change's path.

## What the static filter got wrong

The candidate filter this sweep started from — "a growing flex with no `min-height: 0`" — is
not the right one, and `cycle` is the proof: its ring is `flex: 0 1 auto`, flexGrow **0**, so
it never appeared in the growing-flex list at all. Growth is not the mechanism; the mechanism
is that a flex item with `min-height: auto` refuses to SHRINK. The correct filter is *every*
direct `.cell-stage` child with `min-height: auto` and chrome below its last line. That is a
much larger set than the one swept here, and it is the natural next pass.

## See also

- `engineering/gotchas/overflow.md` — the symptom entry.
- `lib/components/evidence/kpi/kpi.styles.css` — the counter-example, in full.
- `lib/forms/cell/stage/stage.css` — the clip contract and the `safe` alignment rule.
- `test/integration/parity/list-steps-card-chrome-clip.test.js` — #2046, the first instance.
