---
status: shipped
summary: The contrast prober applied WCAG's 18pt large-text line to RAW CANVAS PIXELS, but every `--fs-*` token is authored in `cqi`, so one design resolves to a different pixel count per deck size — `--fs-body` is 21.4px on `hd` and 64.1px on `4k`. Read raw, ordinary body copy graded as "large text" and got the lenient 3:1, and both gated galleries are 4k; rendering `gallery.md` at both sizes flips 1024 of 1534 runs and 317 pass/fail verdicts on the `size:` line alone. The obvious repair — divide the deck's canvas scale out — was BUILT, MEASURED AND DELETED: it needs one reference canvas, and `lib/typography/scale.js` curates three scales against TWO reference widths, so normalizing every deck against 1280 inflates portrait and square and re-creates the identical defect on ~20 committed decks no gated surface measures (verified on a rendered `size: story` deck). Nor is 1080 the repair, since that file anchors portrait type on the DEVICE. So the 3:1 allowance is dropped rather than normalized: one flat 4.5:1, stricter than WCAG and never more lenient, costing zero runs measured and invariant under every future size-registry change. That re-graded the de-emphasis backlog (#1717), which turned out to be one mechanism in three components: `agenda`, `kanban` and `compare-prose` all de-emphasized with a CSS `opacity`, which composites ink AND backdrop and so weakens each ink in proportion to the headroom it had — on `agenda` it took an 18.13:1 title to 2.97:1 and the 5.47:1 accent counter beside it to 2.00:1, making the bigger, bolder element the illegible one. All three now de-emphasize with a role ink; both backlog entries are DELETED. `redline`'s 4.25:1 survives as the one new entry, because it carries no wash and is a `--fail`/`--fail-bg` palette question.
builds-on: 2026-08-17-journey-stage-ink-and-contrast-gate.md, 2026-08-17-composed-surface-contrast.md, 2026-07-03-semantic-html-accessibility.md
---

# One contrast floor, and what "de-emphasized" should mean

`2026-08-17-journey-stage-ink-and-contrast-gate.md` closed with two things open:
a threshold question it deliberately did not settle (**#1722**), and a
de-emphasis backlog the new gate had to carry to stay green (**#1717**). They
ship together because the first decides the number the second has to hit.

## Part 1 — what "large text" means on a deck (#1722)

### The defect

WCAG AA asks 4.5:1 of normal text and 3:1 of large text, where large is 18pt, or
14pt when bold. `tools/check-slide-contrast.js` encoded that as:

```js
const isLarge = (fs, w) => fs >= 24 || (fs >= 18.66 && w >= 700);
```

24px is 18pt (1pt = 1.333 CSS px, 96dpi / 72pt). That conversion is exact and does
not vary with deck size — a branch that "fixed" it cost a full revert to establish,
and nothing here disturbs it.

The problem is the left-hand side. `fs` is a **resolved** pixel value, and every
`--fs-*` token is authored in `cqi` — a fraction of the slide's inline size.
`base.tokens.css` says so outright: *"Every size in cqi (container-query
inline-size) so visual proportions hold across HD, 4K, and any custom slide size."*
One design therefore resolves to a different pixel count on every canvas:

| deck | canvas | `--fs-body` resolves to | `isLarge` said |
|---|---|---|---|
| `hd` | 1280px | 21.4px | normal — 4.5:1 |
| `4k` | 3840px | 64.1px | LARGE — 3:1 |

`--fs-body` is the default ink for cards, lists and inline prose. **Both gated
galleries are `size: 4k`**, so the lenient half was the half in force over ordinary
body copy. Rendering `gallery.md` at both sizes and diffing run-for-run: **1024 of
1534 runs change grading, and 317 pass as a 4k deck while failing as an hd deck.**
A deck could have silenced a real contrast failure by typing `size: 4k`.

### The repair that was built, measured, and deleted

The obvious fix is to divide the deck's canvas scale out before applying the line —
`fs / (canvasWidth / REFERENCE_WIDTH)`. It was implemented, and it is correct for
landscape: dividing the scale out reproduces the typography contract's own declared
point sizes to two decimals on both canvases (`--fs-body` 16.03pt against a
documented 16pt, `--fs-message` 21.00 against 21, `--fs-body-compact` 13.44
against 13.5).

**It does not survive contact with the other two orientations.** It needs ONE
reference canvas, and `lib/typography/scale.js` curates **three scales against two
reference widths** — landscape ≈ 1280, square/portrait ≈ 1080 — with coefficients
that are, in that file's words, *"curated, not derived from one another by a
constant"*. Normalizing every deck against 1280 therefore **inflates** portrait and
square instead of normalizing them. Measured on a rendered `size: story` deck:

| deck | canvas | `--fs-body` raw | normalized to 1280 | verdict |
|---|---|---|---|---|
| `hd` | 1280px | 21.4px | 21.4px | normal ✅ |
| `4k` | 3840px | 64.1px | 21.4px | normal ✅ |
| `square` | 1080px | 30.2px | **35.8px** | **LARGE** ❌ |
| `story` | 1080px | 47.0px | **55.7px** | **LARGE** ❌ |

That is the *same defect*, relocated to the ~20 committed portrait and square decks
that no gated surface measures. The gate would have tightened exactly where it looks
and loosened exactly where it does not.

**And 1080 is not the repair either.** `scale.js` anchors the portrait ramp on the
DEVICE, not the frame: *"body = 47px ⇒ ~17px on a phone (the iOS body floor)"*. 17
device px is ~12.75pt — normal text. Getting portrait right needs a viewing-scale
judgment (a ×0.36 device mapping), which means the whole exercise was never a unit
conversion. It was a policy about how big a slide is assumed to appear, and the
allowance is not worth encoding one.

### What shipped instead

```js
const AA = 4.5;   // every run, large text included
```

The 3:1 allowance is **not granted**. This is stricter than WCAG and can never be
more lenient, which is the only direction a contrast gate should err in.

- **It costs nothing measured.** On all three gated surfaces, **zero** non-exempt
  runs sit between 3:1 and 4.5:1. Every recorded number in the ledger is unchanged.
- **It is invariant** under everything that would have broken the normalized version:
  a new entry in the size registry, a change to `DEFAULT_SIZE`, a re-curation of the
  orientation scales, or a new preview surface at another canvas.
- **It is a deletion.** `isLarge`, the per-section scale read, the `scale` argument
  and its NaN class, the `refWidth` guard, the `pt` field, the `REFERENCE_WIDTH`
  export and the coupling to `lib/engine/sizes.js` all go away.

The cost is real but currently theoretical: genuinely poster-sized display type that
WCAG would pass at 3:1 fails here. Ornaments that can never clear 4.5:1 are handled
where they belong — as named entries in `SANCTIONED_CONTRAST_EXEMPTIONS`, on the
record with exact counts, rather than waved through by a size heuristic that lets
*every* large run past.

### What was rejected

- **Keep the letter (close #1722, change nothing).** Defensible — the spec does say
  24px — but it leaves the grading a property of the deck's `size:` line rather than
  of the design, and 317 verdicts is not a rounding error.
- **Normalize to the reference canvas.** Built and measured; deleted for the
  portrait/square defect above. Its numbers are kept here because the derivation is
  sound for landscape and someone will propose it again.
- **Normalize per orientation** (1280 landscape / 1080 square+portrait). Closer, but
  still wrong for portrait by that file's own device anchor, and it buys a permanent
  three-way coupling between the prober, the size registry and the type scale to
  preserve an allowance worth zero runs.

### What the decision does NOT touch

`EXEMPT_TIER_FLOOR.floor` stays at **3**. That is WCAG 1.4.11's graphical minimum,
which has no size component at all, so none of the above reaches it. Its recorded
counts are unchanged at 14/14/12.

## Part 2 — the de-emphasis backlog (#1717)

### It was one mechanism, not two components

`agenda progress-*` dimmed non-current rows with `opacity: 0.45`, and `kanban`
dimmed its "Done" column's cards with `opacity: 0.52`. A CSS `opacity` renders
the subtree to a buffer and composites the whole buffer — **ink and backdrop
together** — so it does not step every ink down by the same amount. It steps each
one down in proportion to the headroom it already had.

Measured on the rendered gallery, that is stark:

| run | undimmed | through the wash |
|---|---|---|
| `agenda` row title (`--text-heading`) | 18.13:1 | 2.97:1 |
| `agenda` counter (`--accent`, bigger AND bolder) | 5.47:1 | **2.00:1** |
| `kanban` card title | 16.59:1 | 3.51:1 |
| `kanban` inline code token | 5.00:1 | 2.12:1 |

The worst run on the agenda slide is its **largest, boldest** element. When the
biggest thing on a row is the illegible one, the amount is not what is wrong —
the instrument is.

A third instance surfaced while fixing those two: `compare-prose` `.decision` /
`.rejected` wash the losing card at `opacity: 0.72`, taking its label chip from
a perfectly sound white-on-accent 5.41:1 down to 3.24:1.

### The fix

De-emphasis is a role, and the palette already names it. All three now step down
by **ink**:

- **`agenda`** — non-current rows take `--text-secondary`, the "secondary prose /
  subtitle / caption" ink that is AA on both canvases by contract. A new
  `--ag-marker-ink` carries the same step into the `::before` counter, which sets
  its own color and so cannot inherit one; custom properties do inherit into
  pseudo-elements, so one declaration reaches every variant's marker without
  restating the four `:not()` chains. **The `section.dark` twin is retired**:
  opacity is scheme-blind, so a dark slide needed its own number, while a
  `light-dark()` token resolves itself because `section.dark` flips
  `color-scheme`. So is the `.checks` past-row rule, whose 0.05 of extra alpha
  was never visible — past versus future is carried by the tick and the empty box.
- **`kanban`** — the done card drops its elevation and its title steps down a
  weight and one rung of the ink scale. `--text-secondary` was the first choice
  and lands at 4.47:1 in dark mode, 0.03 short; that is not a rounding accident
  worth tuning away, because `--text-secondary`'s AA contract is against the
  **canvas** and a kanban card deliberately sits *lighter* than the canvas in
  both modes. An ink solved for one surface does not carry to a surface built to
  differ from it. The status chip and the pass-green column header keep full
  strength — they are the signal that the column is done, so washing them out was
  backwards.
- **`compare-prose`** — the losing card recedes by ink alone. The wash was doing
  no work the design needs: the winner already carries an `--accent-soft` fill
  and an accent edge, and the loser's label is already struck through.

Emphasis on the agenda's current row never rested on alpha either — it is bold,
indented, and carries an accent arrow, a filled ring or an accent card fill
depending on the variant.

This is the house rule `base.tokens.css` already states and `redline`'s `ins/del`
rule already follows: *"If you need a quieter label here, spend size or weight,
not alpha."*

### Both entries are deleted, not lowered

All three components now contribute **zero** sub-threshold runs on all three
gated surfaces, in both schemes. `PREEXISTING_CONTRAST_BACKLOG` therefore loses
both of its entries outright, which is what the ledger's staleness check exists
to force.

### One new entry, and why it is not the same thing

`redline`'s `<del>` measures **4.25:1 on the dark canvas**, against the 4.5:1 it
owes as 16pt normal text. It is in the ledger rather than in the fix, and the
distinction is the one this list is built on:

- It **carries no opacity.** Its rule removed one deliberately, for exactly the
  reason above, and says so at length. There is no wash to take away.
- Its ratio is `--fail` ink on `--fail-bg`, a 10% tint of `--fail` over the
  canvas — a **palette token-pair** question owned by
  `2026-08-17-composed-surface-contrast.md`, where a re-tune reaches all 32
  palettes and that record already measures how far a wash drags the curated hues.

It surfaced here because the deck-scale correction re-grades it from "large text,
3:1" to what it always was. **The rendered pixels did not move; only the grading
did**, so nothing on that slide is worse than before this change (HARD RULE #18's
found-not-caused case).

### One run moved INTO the exempt tier, and the ceiling was raised for it

`gallery-jargon`'s exempt count goes 184 → 185. A `.kanban-size` token
("M"/"L"/"XL") returned to the tier: the wash had been shifting its *composited*
value off `--text-muted`, so a run authored in the exempt tier was being measured
as failing body copy. It sits at 3.24:1, above the graphical floor. The ceiling is
raised in this commit with its reason attached, which is what that ceiling exists
to force.

## Three mistakes this change made, kept because they are all the same lesson

**1. A patch script printed `ok` and then threw the edits away.** It aborted on a
later failed match, *after* reporting success for the edits it had already made in
memory and *before* writing the file. So the gate ran for several steps calling
`PROBE` without the reference width the normalized design needed. The scale computed
to `NaN`, every large-text test returned false, and the whole deck silently graded as
normal text — **green through all eight assertions**. It then happened a *second*
time later in the same branch, on a different script, for the identical reason.

What caught the first one was not a test. It was reading `nullpt` in a mutation run's
output and asking why a field that cannot be null was null.

That specific trap no longer exists in the shipped design: `PROBE` takes no argument,
computes no scale, and has no reference to lose. Deleting a mechanism deletes its
failure modes, which is a quiet part of why the simpler floor won.

**2. The mutation harness passed a build it had not checked.** It ran `npm run build`,
ignored the exit code, then ran the gate — which rendered from a `dist/` that still
held the *unmutated* CSS. Three mutations came back "NOT CAUGHT" and were, for about
a minute, believed. The build had failed for an unrelated reason (below), and every
one of those three is caught the moment the build is real.

This is the predecessor record's warning wearing yet another costume: **a check whose
inputs are stale confirms nothing, and it fails in the reassuring direction.** The
harness now aborts loudly and prints the build's own error instead of reporting a
verdict it cannot support.

**3. The thing the build was failing on was mine.** I wrote *"judgement"* in a code
comment — the British form — which pushed HARD RULE #21's ratchet from 1293 to 1294.
Two instances: one in `tools/check-slide-contrast.js`, one in this record. Only the
first counted (dated decision records are exempt), and the gate caught it exactly as
designed. Fixed to *judgment*. Worth a line because it is the cheerful case: the
machine gate did its job, and the only reason it took a detour is that mistake 2 had
swallowed the message.

## Verification

- **Mutation-tested eight ways against the SHIPPED design**, each reverted and
  restored, each judged by exit code:
  - restore the `opacity` wash on `agenda` — caught (`li::before` at 2.06:1, need 4.5)
  - restore it on `kanban` — caught (`code` at 2.12:1, need 4.5)
  - restore it on `compare-prose` — caught (`strong` at 3.24:1, need 4.5)
  - reinstate the 3:1 large-text allowance — caught (the `redline` entry goes stale)
  - lower the backlog ceiling 2 → 1 — caught as GREW
  - neuter the `redline` matcher — caught as stale
  - restore the exempt-tier ceiling to 184 — caught
  - inflate an exemption count 2 → 3 — caught
- One mutation initially read as NOT CAUGHT because the harness grepped for
  `# fail 0`. A failing `before` hook reports `# fail 0` with `# cancelled 8` and a
  non-zero exit — the predecessor's "`cancelled` is not `failed`" lesson, reproduced
  in my own scaffolding. It now judges by exit code.
- **The portrait/square defect in the deleted design was found by an adversarial
  reviewer and confirmed by rendering**, not by argument: a real `size: story` deck,
  probed, with `--fs-body` grading as large text. The design was reversed on that
  measurement after the normalized version was already built, committed and green.
- Every ledger number was re-derived from clean renders; the strict floor was
  simulated across all three surfaces before it was implemented, and the recorded
  counts came out unchanged.
- Visual before/after crops of all three components in both schemes were rendered
  from the real pipeline (`HEAD~1` CSS, rebuilt) and looked at, not inferred.
- `npm run lint`, `npm test` (6639), `npm run build:check` and the invariants gate all
  green, run before pushing.

## What this does not cover

- **Three surfaces at one viewport (1280×720), export shell only.** Never the
  player, the Playground, or a real device. Unchanged from the predecessor.
- **Not re-verified on the PDF rasterizer.** Everything here is measured on the
  rendered DOM in Chromium (HARD RULE #23).
- **The `--fail` / `--fail-bg` pair is logged, not fixed** — see above.
- **`--text-secondary` is not solved per surface.** The kanban card showed that a
  canvas-solved ink can fall short on a surface built to differ from the canvas.
  Nothing systematically checks de-emphasis ink against the surface it lands on;
  today that is caught only when a rendered gate happens to measure it.
- **The exempt tier's net-zero swap is still open** (a change moving N runs out
  buys room to move N different runs in). Unchanged from the predecessor, still
  tracked on #1717's successor work.
- **G13 is narrowed, not closed.** The size half is settled — by declining to grade
  on size at all — but the register entry's separate claim about the running-header
  chrome tier (`--text-muted` at 4.20:1 / 4.07:1) is a palette question untouched here.
- **Nothing gates the "de-emphasize with ink, not opacity" rule.** Three components
  were fixed; roughly a dozen `opacity` declarations on text survive elsewhere (the
  `.split-feat-eye` / `.split-feat-lede` pair alone is copy-pasted across four
  components at 0.85–0.92). They pass today because the alpha is mild. The pattern is
  what recurs, and only a rendered gate on a gated surface would catch the next one.
- **Portrait and square decks remain ungated for contrast**, as they were before. The
  strict floor means they are no longer graded WRONG — nothing normalizes anything —
  but no gated surface renders them, so their ratios are unmeasured either way.
