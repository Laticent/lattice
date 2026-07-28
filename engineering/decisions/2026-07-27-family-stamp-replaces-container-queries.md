---
status: shipped
summary: Retire `@container lattice (aspect-ratio …)` as the family-reflow mechanism. A container query measures the section's CONTENT box, which the section's asymmetric padding makes proportionally wider than the deck — so a 1080×1080 deck classified `square` in JS while every `<= 1.05` rule in the library measured 1.051 and did not match, leaving the whole square tier inert across 34 blocks in 30 files. Components now select the `data-family` stamp the engine derives from the deck geometry: one classifier, one measurement, no numeric boundary in any stylesheet.
version: 1
supersedes: none
builds-on: 2026-06-18-component-adaptive-sizing.md, 2026-06-19-chart-adaptive-sizing.md, 2026-06-21-reflow-as-form-capability.md
---

# The family stamp replaces the container query

Fixes #1218.

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
  the thirty components. The oracle looks at all of them and reads the real
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

### Five more layouts had to LOSE their square tier

The two above were rules that should have run and didn't. The opposite case is
larger, and a red-team pass is what surfaced it: **~25 blocks were converted
verbatim from `<= 1.05`, which had never matched a square deck.** So for every
component except the three re-measured above, "the square layout" being switched
on for the first time was a *portrait* layout in a square box that nobody had
ever seen. Five of them were wrong, three of those badly enough to clip:

| component | at square, before the fix | why square keeps the wide layout |
|---|---|---|
| `cycle` | 4-stage stack, last card + return arc off the frame | its own `cycle.manifest.json` declares `adapt.families: [wide, tall, strip]` — there IS no square tier; the CSS had four square rules anyway |
| `authority-chain` | rail collapsed, body text sliced mid-word, last card clipped | a square box is 1080px wide; the `14cqi` rail is ~151px there against ~179px at `hd`, which is not a crush |
| `regulatory-update` | third card + its "Effective" pill off the frame | stacking four fields per row roughly triples row height |
| `statute-stack` | whole third jurisdiction card lost | measured the other way from the shipped comment: rails at square hold **3** (`calibrate-capacity` ceiling 3, overflows at 4), the stack holds **2**. Three is this component's own skeleton |
| `kpi` | hero flattened to a uniform ledger, `94%` barely larger than its supports | no clip, but square is the SOCIAL family, where one big number is most of the point. Rendered side by side: the hero card + rail fits with room to spare |

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
marp-cli 4.3.1: the bundled `lattice.css` carries **414** `data-family` selectors
and the deck markdown carries **0** stamps. Under the retired `@container` form
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
