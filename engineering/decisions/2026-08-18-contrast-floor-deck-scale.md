---
status: shipped
summary: The contrast prober applied WCAG's 18pt large-text line to RAW CANVAS PIXELS, but every `--fs-*` token is authored in `cqi`, so one design resolves to a different pixel count per deck size — `--fs-body` is 21.4px on `hd` and 64.1px on `4k` and 16.03pt on both. Read raw, ordinary body copy graded as "large text" on a 4k deck and got the lenient 3:1, and both gated galleries are 4k. Rendering `gallery.md` at both sizes flips 1024 of 1534 runs and 317 pass/fail verdicts on the `size:` line alone. `isLarge` now divides the canvas scale out first (#1722), which restores to the gate the resolution-independence `--fs-*` already had rather than adding a policy. That re-graded the de-emphasis backlog (#1717) from 3:1 to the 4.5:1 those runs always owed, and the backlog turned out to be one mechanism in three components: `agenda`, `kanban` and `compare-prose` all de-emphasized with a CSS `opacity`, which composites ink AND backdrop and therefore steps each ink down in proportion to the headroom it had — on `agenda` it took an 18.13:1 title to 2.97:1 and the 5.47:1 accent counter beside it to 2.00:1, making the bigger, bolder element the illegible one. All three now de-emphasize with a role ink; both backlog entries are DELETED rather than lowered. `redline`'s 4.25:1 survives as the one new entry, because it carries no wash and is a `--fail`/`--fail-bg` palette question. The 4k threshold lands on 72px, the same number a reverted commit once shipped by dividing one deck's PDF page by another deck's canvas — the number is not the finding, the derivation is, and this one is checkable in two independent halves.
builds-on: 2026-08-17-journey-stage-ink-and-contrast-gate.md, 2026-08-17-composed-surface-contrast.md, 2026-07-03-semantic-html-accessibility.md
---

# The contrast floor is measured in the engine's own type units

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

24px is 18pt (1pt = 1.333 CSS px, 96dpi / 72pt). That conversion is exact and
does not vary with deck size — a branch that "fixed" it cost a full revert to
establish, and this change does not disturb it.

The problem is the left-hand side. `fs` is a **resolved** pixel value, and every
`--fs-*` token in this engine is authored in `cqi` — a fraction of the slide's
inline size. `base.tokens.css` says so in as many words: *"Every size in cqi
(container-query inline-size) so visual proportions hold across HD, 4K, and any
custom slide size."* So one design resolves to a different pixel count on every
canvas, which is the entire point of the token system.

Measured on rendered decks, both arms of the same token:

| deck | canvas | `--fs-body` resolves to | in points | `isLarge` said |
|---|---|---|---|---|
| `hd` | 1280px | 21.4px | **16.03pt** | normal — 4.5:1 |
| `4k` | 3840px | 64.1px | **16.03pt** | LARGE — 3:1 |

`--fs-body` is the default ink for cards, lists and inline prose, and the
typography contract calls it 16pt on every deck. It is never WCAG large text.
The prober called it large on any 4k deck — **and both gated galleries are
`size: 4k`**, so the lenient half was the half in force over ordinary body copy.

Rendering `test/integration/baseline-decks/gallery.md` at both sizes and diffing
the verdicts run-for-run: **1024 of 1534 runs change grading, and 317 pass as a
4k deck while failing as an hd deck.** Nothing about the slides differs but one
word of front matter. A deck could have silenced a real contrast failure by
typing `size: 4k`.

`hd` and `4K` are the same 16:9 format at different pixel densities — the size
registry lists them together under "Landscape (screen)" — so this was never a
question about how big a slide is. It is a unit mismatch.

### The fix, and why it is not a new policy

```js
const isLarge = (fs, w, scale) => {
  const ref = fs / scale; // the size this run would have at DEFAULT_SIZE
  return ref >= 24 || (ref >= 18.66 && w >= 700);
};
```

`scale` is resolved per section as the section's used width over the reference
canvas, and the reference comes from `DEFAULT_SIZE` in `lib/engine/sizes.js`,
which owns that table; the prober keeps no copy.

This adds nothing to WCAG. It restores to the one place in the pipeline that had
lost it the resolution-independence `--fs-*` already carries. The check that it
is right is that dividing the scale out reproduces the typography contract's own
declared point sizes to two decimals, on both canvases: `--fs-body` 16.03pt
against a documented 16pt, `--fs-message` 21.00 against 21, `--fs-body-compact`
13.44 against 13.5.

### The uncomfortable part, stated rather than buried

On a 4k deck this lands on **72px / 56px** — the same numbers a reverted commit
on the predecessor branch shipped. That commit reached them by running `pdfinfo`
on the **demo** deck (a 960pt page) and dividing by the **gallery's** 3840px
canvas: two decks, one meaningless ratio, and a cascade of derived claims that
were all false.

The number is not the finding. The derivation is, and this one splits into two
halves that can be checked apart:

1. **pt is 1.333 CSS px on every shipped size.** Re-derived here on the
   gallery's *own* export — 3840px canvas → 2880pt page — not on a different deck.
2. **The scale factor is this deck's canvas over the reference canvas**, which is
   a property of `cqi` and is confirmed by the token measurements above.

Arriving at the right answer through a broken route is worse than arriving at a
wrong one, because nothing downstream can tell the difference. That is why this
section exists even though the conclusion agrees.

### What was rejected

- **Keep the letter (close #1722, change nothing).** Defensible — the spec does
  say 24px — and it costs nothing today. Rejected because it leaves the grading
  a property of the deck's `size:` line rather than of the design, and 317
  verdicts is not a rounding error.
- **Drop the large-text allowance entirely (4.5:1 for everything).** Removes the
  deck-scale question by removing the question. Rejected as over-strict on type
  that is large by any reading: a 48pt slide title is genuinely large, and
  normalization keeps the allowance exactly where it is earned. It also costs
  more — 14 runs rather than 10.
- **Normalize to a physical projection size.** Needs a viewing distance nobody
  can supply, and the engine has no such notion. The reference canvas is already
  in the tree and already anchors the type scale.

### What the decision does NOT touch

`EXEMPT_TIER_FLOOR.floor` stays at **3**. That floor is WCAG 1.4.11's graphical
minimum, which has no size component at all, so deck scale cannot move it. Its
recorded counts are unchanged at 14/14/12.

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

## The mistake this change made, kept because it is the same lesson

A patch script that edits the gate exited on a failed match **after** printing
`ok` for the two edits it had already made in memory and **before** writing the
file. So the gate ran for several steps calling `PROBE` without the reference
width. `scale` computed to `NaN`, every `isLarge` test returned false, and the
whole deck silently graded as normal text.

**It stayed green through all eight assertions.** A wrong answer that looks
exactly like a right one — the predecessor record's central warning, committed
again one branch later, by someone who had just read it.

Two things came out of it. `PROBE` now **throws** on a missing or non-positive
reference width rather than computing `NaN`, and the gate's own
did-it-actually-measure test asserts every row carries a finite normalized size.
A silent mis-grade is now a loud failure at both ends.

What caught it was not a test. It was reading `nullpt` in a mutation run's output
and asking why a field that cannot be null was null.

## Verification

- **Mutation-tested, eight ways, each reverted and restored**: putting the
  `opacity` wash back on `agenda`, on `kanban`, and on `compare-prose` (caught,
  each naming its own runs); reverting `isLarge` to raw pixels (caught — the
  `redline` entry goes stale); calling `PROBE` without the reference width
  (caught by the new guard); lowering the backlog ceiling 2 → 1 (caught as GREW);
  neutering the `redline` matcher (caught as stale); and restoring the exempt-tier
  ceiling to 184 (caught).
- One mutation initially read as NOT CAUGHT because the harness grepped for
  `# fail 0`. A failing `before` hook reports `# fail 0` with `# cancelled 8` and
  a non-zero exit — the predecessor record's "`cancelled` is not `failed`" lesson,
  reproduced in my own scaffolding. The harness now judges by exit code.
- Every ledger number was re-derived from clean renders after the fixes, never
  edited to fit.
- `npm run lint`, `npm test` (6639), `npm run build:check`, and the invariants
  gate all green, run before pushing.

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
- **G13 is narrowed, not closed.** The deck-scale half is settled; the register
  entry's separate claim about the running-header chrome tier (`--text-muted` at
  4.20:1 / 4.07:1) is a palette question this change does not touch.
