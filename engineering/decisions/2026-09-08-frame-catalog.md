---
status: superseded
summary: RETRACTED, and one of its four surviving findings has since been withdrawn too (§4.3 — the status stamp does paint on a bookend; measured). A proposal for a nine-Frame catalog defined by three atoms (order/rank/arity), three laws and a Mode contract. An adversarial trio plus a fact-checker falsified its foundation: §1 diagnosed a defect that had already been fixed — `FORM_TOGGLE_SKIP` IS declared data, derived from each frame manifest's `exemptFromChrome`, and the three hand-maintained Sets it promised to replace were retired on 2026-07-14 with a drift test. The counts were wrong (11 frames not 12, 9 sovereign not 10, stage 34/26/9 not 34/25/10), the axis derivation lands on 22 rather than the nine it claims, the degeneracy rule that killed `math` also merges `quiet` into `bookend`, Law II's motivating defect does not reproduce (an `image` slide renders as page 2 of 3), and both Mode clauses are refuted by shipped values. Two of the four survived and are shipped: the logo and watermark manifest-vs-render divergence (fixed — a `slide` Cell) and the absent `admits` field on the Frame schema (fixed); the Form/Finish axis separation survives as a recorded finding with nothing to build. The other two — `bookend`'s supposedly homeless status stamp and `plinth`'s moving coda band — were withdrawn after rendering them; both premises were false.
---

# The Frame catalog — what it got wrong, and the four things that survived

**Date:** 2026-09-08
**Status:** **Retracted.** The catalog, the three laws and the Mode contract should not
be built. Read §4 for what is worth keeping.
**Reviewed by:** red-team · Munger inversion · independent checker · fact-checker
(HARD RULE #25). Every claim below marked *verified* was re-checked against the tree
by hand after the review, not taken from an agent report.

---

## 1. What was attempted

A catalog of Frames a component could select from, on the premise that Lattice's
sovereign Frames are welded one-to-one to single components. It grew to 28 entries,
collapsed to nine, and acquired three laws, a three-atom definition of a Frame's
"reading" (`order` / `rank` / `arity`), a chrome placement matrix, and a six-channel
contract for the `mode:` register with six proposed postures.

## 2. Why it is retracted

### The foundation described a defect that was already fixed

The proposal's §1 said: *"The binding is `Set` membership in `masthead.transform.js`
(`FORM_TOGGLE_SKIP`), not declared data."* Every clause is false (**verified**):

- It lives in `lib/integrations/markdown-it/plugins.js:829`, not `masthead.transform.js`.
- It is an Array, not a Set.
- **It is declared data.** `deriveFormToggleSkip()` reads the frame manifests and
  filters on `exemptFromChrome`; `lib/forms/index.js` holds the derivation. The
  docblock calls it *"the Open/Closed win"* — the exact property the proposal claimed
  was missing.

Law III promised to replace *"three hand-maintained `Set`s"*. Those were retired on
2026-07-14 (`2026-07-14-one-frame-model.md`, step A).
`lib/forms/cell/masthead/masthead.transform.js` says so in a comment: the generated
catalog *"REPLACES the three hand-maintained Sets that used to live inline here"*, with
a drift test asserting the partition reproduces exactly.

**That doc was read at the start of the session.** Its front matter says
`status: shipped`. Its *problem statement* was carried forward as current and never
re-checked against the tree. Everything downstream inherits the error.

### The counts were wrong (**verified**)

| Stated | Actual |
|---|---|
| 12 frame manifests, 10 sovereign | **11 and 9** — `math` was removed in `a2397b0` (#2129), *"start moving math off its sovereign frame"* |
| stage split 34 flow / 25 canvas / 10 sovereign | **34 / 26 / 9** |
| "59 of 69 components" | **60 of 69** |
| author-selectable Frames: `standard` + `minimal` | **1** — `form: minimal` was retired 2026-07-03 and renders byte-identical to `standard` |

`a2397b0` matters beyond the count: **`main` moved `math` off its sovereign frame
independently, in one PR, while §5.5 was spending a section deriving that it should
be.** That is direct evidence that the incremental path dissolves the sovereign set
without needing a catalog.

### The derivation does not produce nine (**verified**)

§4 ran: 675 → drop chrome posture (÷3) → 225 → keep 22 legal pairs × 5 → 110 → strip
treatment → **22**, not nine. The original chain was no better: 110 × 3/5 = 66, never
30. Both terminal numbers were asserted. The product also double-counts — `bled` sits
on both the topology and treatment axes — so it was never a bound.

Nine came from a different route (an atom enumeration, filtered by hand) that §4 never
mentions. Enumerated properly, `order × rank × arity` under the proposal's own
degeneracy rule is 33 readings; the nine Frames cover 8. `before/takeaway/2` — two
columns with a reserved recommendation band, the most common consulting slide there
is — has no Frame.

### The atoms contradict themselves (**verified**)

§5.5 argues `rank: none` is degenerate at arity 1 and uses it to reclassify `math`.
Applied consistently the same rule merges `quiet` (`none/none/1`) into `bookend`
(`none/thesis/1`). The proposal exempted them six lines later using a criterion —
*does the Frame reserve a position* — that is not one of the three atoms, and that the
degeneracy paragraph had just declared meaningless at arity 1.

Separately, §5.5's heading claims *"the unary readings are five and not six"* while
§5.3's own table lists **six** arity-1 Frames. The "five" is a fossil of a
pre-collapse table where `bookend` sat in a different pool.

### Law II's motivating defect does not reproduce (**verified by render**)

The proposal said suppression *"is why `image` silently leaves the pagination
sequence."* Rendered through the engine:

```
page 1 of 3 | class: content form
page 2 of 3 | class: image
page 3 of 3 | class: content form
```

The slide is page 2 of 3 and slide 3 is still 3. The numeral is not *drawn*; the
sequence is intact. "Not drawn" and "out of sequence" are different defects.

### §2's mechanism is false (**verified**)

*"They carve two content Cells"* — every sovereign frame manifest declares
`"cells": ["stage"]`, one Cell. `.panel-left` / `.panel-right` are produced by the
component's transform inside that single Cell. And only 4 of the 9 sovereigns are
two-cell at all; §5.4 files the other five into shared single-cell Frames, which the
same document treats as proof of the mechanism it disproves.

### The Mode contract is refuted by shipped values

`mode:` ships **three** values, not the one claimed: `boardroom`, `sketch`,
`sketch-clean` (**verified**). `sketch-clean` exists to return prose to the baseline
body face on dense slides — a deliberate partial fallback, which is exactly what M4
forbids. And `base.sketch.css` steps list items from `--fs-message` to `--fs-body`,
which by `engineering/typography.md`'s own doctrine is a change in what reads as the
message — so the only fully shipped Mode violates M2.

M2 was also called *"testable"* eight lines before the document conceded that
**"M4 is the only clause a machine can cheaply check."**

## 3. Two claims the artifacts made that were false

- **"The component lever shows an M4 failure."** It cannot. All six Modes' CSS was
  hand-authored for the same five shapes, so nothing can fall back. The bench can only
  ever report success on the clause said to decide whether the axis is worth having.
- **The `Design` / `Boardroom` scores** are typed constants in a JS array. A rubric was
  published and never applied by any rater. HARD RULE #23.

## 4. What survived

Four findings, each verified, each independently shippable — none of which needs the
catalog, the atoms or the laws.

### 4.1 The Form / Finish axis separation

The one idea no reviewer dented. `design/design-system.md` owns a four-axis model —
Function · Form · Substance · **Finish** — and Finish is surfaced through three
registers: `theme:` (color), `mode:` (the typographic hand), `finish:` (the backdrop).
Eleven of the sixteen proposed "Frames" changed how a slide looks rather than what it
argues; two were near-duplicates of shipped code (`ruled` ≈ `finish: ledger`,
`mat` ≈ `finish: gallery`). Anything that does not change the reading belongs on the
Finish axis, not the Form axis.

The correct bookkeeping, which the proposal itself got wrong: of those eleven, **four**
were `mode:` values, three were `finish:` values, and four were carve variants — which
are on the Form axis. The proposal's headline "11 misfiled → Finish" was overstated.

### 4.2 The logo and watermark diverge from their manifests (**verified**)

`lib/forms/tile/logo/logo.manifest.json` declares `fits: ["masthead-bay"]` and
`design/forms.md:280` lists it as docked there. `lib/base/base.modifiers.css` pins it
absolutely to the section at `top: var(--logo-y, var(--frame-inset-y))` /
`right: var(--logo-anchor-right, var(--frame-inset-x))`, and `logo-x`/`logo-y` set the
logo's **center as a percent of the whole slide**.

`watermark` has the identical divergence: `fits: ["stage"]` in its manifest,
`s.appendChild(wm)` onto the **section** in `watermark.transform.js:85`.

Two Tiles, same shape of defect. The cheap, correct fix is to make the manifests say
what ships. *(One correction to the proposal's own text: the Tile's `"z": 2` is the
plane ordinal, not a `z-index` — the computed `--z-content` is `0`.)*

### 4.3 ~~`bookend` slides have no home for the status stamp~~ — FALSE, measured 2026-09-08

**This finding was wrong and is withdrawn.** It was flagged three times in the
original proposal, survived the retraction as "the only user-visible harm the whole
exercise turned up", and is refuted by a render. Computed `::before` on the real
engine CSS at 1280×720:

| slide | `content` | box | background |
|---|---|---|---|
| `title silent confidential` (`spectrum: on`) | `"Confidential"` | 84.3 × 9.8px | `rgb(237,104,104)` |
| `divider confidential` | `"Confidential"` | 80.1 × 9.3px | `rgb(237,104,104)` |
| `closing silent wip` | `"WIP"` | 21.1 × 9.8px | `rgb(247,166,79)` |

The stamp paints on all three bookends, under `silent`, with the spectrum bar
present, for two different state markers.

**Why it was believed:** the claim was inferred from the bookend frames'
`suppresses` lists, which name chrome *Cells* — masthead, footer, pagination. The
state marker is a `section::before` and is not a Cell at all, so nothing in those
lists touches it. Reasoning from a manifest field to a rendered outcome, without
rendering, is the same error that produced the retraction; it survived the review
because all four agents were pointed at the proposal's internal logic and its
citations, and none was asked to render a bookend.

The genuine constraint nearby, which is documented and not a defect: `section::before`
is a *contested* single pseudo — state markers, bands, watermarks and the `mark-*`
decorations all want it — which is why `tone` was moved off it onto an inset
box-shadow (`base.variants.css`). A fourth claimant would collide. Nothing needs
building here.

### 4.4 `frame.schema.json` has no `admits` field (**verified**)

Its properties are `$schema, id, form, kind, exemptFromChrome, description, cells,
suppresses, slicing`. Frame-side admissibility genuinely is undeclared — the component
side ships (`stage: flow|canvas`, in a generated catalog with a drift test), the frame
side does not. This is the real gap Law III was reaching for, and it needs motivating
from this fact rather than from the retired-Sets story.

### 4.5 One pre-existing gap found on the way (logged, not fixed — HARD RULE #18)

**Nothing checks that a Tile's `kind` is accepted by the Cell it `fits`.**
`checkTileFits` (`lib/forms/index.js`) verifies only that the named Cell exists;
`checkCellKindsSatisfied` verifies the converse direction (every `accepts` kind has
*some* Tile). So a `chrome` Tile can declare `fits` on a Cell whose `accepts` is
`["surface"]` and the catalog loads clean — demonstrated by mutation during the
review of this branch. The `slide` Cell's `accepts: ["chrome", "surface"]` is
therefore correct by authorship, not by gate. Off the path of this change; not
pulled into the diff.

## 5. What to build, unbundled

In this order. Each stands alone; none needs the others.

1. **Correct the logo and watermark manifests** to `fits: ["slide"]`, plus the matching
   line in `forms.md` §5.1. One commit, real defect, no design debt.
2. ~~Give `bookend` a declared home for the status stamp.~~ **Withdrawn** — the
   stamp already paints there (§4.3).
3. **Add `admits` to `frame.schema.json`**, populated from the shipped stage catalog.
4. ~~`plinth` as a single layout~~ — **withdrawn, measured 2026-09-08.** See §4.5.

**Do not build:** the nine-name Frame vocabulary as a canonical rename, `carve` as a
system noun, "the Mode axis" as a phrase (Mode is a *register* of the Finish axis —
the proposal committed the same third-sense error it correctly caught for `ledger`),
M2 as a numbered clause, or any new `mode:` value before `sketch` reaches its own
coverage bar.

## 5.1 ~~`plinth`~~ — the premise was false too

`plinth` was justified by "the coda lands at content height and moves per slide,
so promoting it to a reserved band is a rank change". **It does not move.**
Emulator render, HTML sidecar in Chromium at 1920×1080, section 720px, the same
deck twice with one line of body and with five bullets:

| | one line | five bullets |
|---|---|---|
| coda top, from the section top | 528.6px | **528.6px** |
| coda bottom, above the section floor | 104.0px | **104.0px** |
| stage height | 334.8px | **334.8px** |

Identical. 104px is exactly `--footer-reserve`. The band is already pinned.

**`design/forms.md` says so, in the sentence this proposal quoted from:** the stage
is `flex: 1 1 auto` and the coda `flex: 0 0 auto`, "so the stage absorbs all the
slack and the band lands at content height above the footer — **bottom-aligned with
no positioning and no margin**". "At content height" describes the band's own
height, not a floating position; it was read as the latter.

What might survive is a *treatment* — a hairline above the band, more typographic
weight — which is a Finish concern (§4.1), not a Frame, and is not what item 4
claimed. It is not being substituted in.

**Two of the four build items were false, and identically so.** §4.3 and this one
were both inferred from a manifest field or a doc sentence and contradicted by a
render that took two minutes. The two that were real — the `logo`/`watermark`
divergence and the missing `admits` field — are the two that were found by reading
code against code rather than by reasoning about behavior.

## 6. The process failure worth keeping

The error that produced everything else was small and mechanical: **a decision note
marked `status: shipped` was read for its problem statement and not for its outcome.**
Every subsequent claim was internally consistent and confidently argued on top of a
premise that a single `grep` would have refuted.

Four rounds of human review caught four separate errors before the trio ran; the trio
then found that the foundation itself was wrong. The lesson is not "review more" — it
is that a proposal's §1 should cite the tree, not another document's description of
the tree.

## See also

- `design/design-system.md` — the four axes; §2.5's vocabulary law; the three Finish registers.
- `design/forms.md` — the Form model. Note §751's `form: <frame>` claim overstates what
  ships: `FORM_MODES = ['off', 'standard']`.
- `2026-07-14-one-frame-model.md` — step A, shipped: the generated stage catalog and
  drift test that replaced the three hand-maintained Sets.
- `2026-08-24-universal-coda-cell.md` — the coda Cell `plinth` would reuse.
- `2026-06-11-sketch-finish.md` — the one substantially shipped Mode, and why a hand
  cannot be a theme.
