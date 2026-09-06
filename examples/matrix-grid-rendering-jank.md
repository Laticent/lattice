---
marp: true
theme: indaco
paginate: true
header: "Lattice · matrix-grid column jank"
---

<!-- _class: title silent -->

# The grid that moved after it painted.

`matrix-grid · rendering jank`

`matrix-grid` drew its columns from its own cell text. When the web font landed a frame after first paint, every column re-solved and every cell slid sideways — with nothing overflowing for a fit gate to catch.

---

<!-- _class: cards-stack compact -->
<!-- _footer: "The defect · measured in the Studio" -->

`What was moving`

## Column widths were a function of the font that had not loaded yet.

- Measured, not inferred
  - Same deck, same Studio, fonts blocked against fonts allowed. Blocked, the columns never moved.
- The five columns moved
  - `258.2 · 165.7 · 175.5 · 216.4 · 304.2` on first paint. `248.7 · 176.9 · 178.9 · 218.9 · 296.6` one frame later.
- Invisible to every gate
  - The table was 1120px wide before and after. Nothing overflowed, so nothing was reported.

---

<!-- _class: matrix-grid -->
<!-- _footer: "After · equal columns, fixed geometry" -->

## Your level is a cell, not a rung.

Every column is the same width, so the reach axis reads as equal steps.

`Wider reach`  `Deeper cognition`

| Verb | Self | Team | Org | Field |
| ---------- | :--: | :--: | :--: | :---: |
| Create     | [ ]  | [-]  | [-]  | [x] Distinguished |
| Evaluate   | [ ]  | [-]  | [x] Principal | [-] |
| Analyze    | [ ]  | [-]  | [x] Staff | [-] |
| Apply      | [-]  | [x] Senior | [-] | [ ] |
| Understand | [x] Mid | [-] | [ ] | [ ] |
| Remember   | [x] Junior | [-] | [ ] | [ ] |

**Your level** · *where you can operate when called for* — illustrative, placements vary by company.

---

<!-- _class: matrix-grid -->
<!-- _footer: "After · six rows by five columns holds the same rhythm" -->

## Six categories by five columns is the grid's practical ceiling.

The widest label no longer buys width from its neighbors.

`Wider reach`  `Deeper cognition`

| Discipline | Self | Pair | Team | Org | Field |
| --- | :--: | :--: | :--: | :--: | :--: |
| Vision    | [ ] | [ ] | [-] | [-] | [x] Chief |
| Strategy  | [ ] | [-] | [-] | [x] VP | [-] |
| Execution | [ ] | [-] | [x] Director | [-] | [ ] |
| Delivery  | [-] | [x] Manager | [-] | [ ] | [ ] |
| Craft     | [x] Senior | [-] | [ ] | [ ] | [ ] |
| Basics    | [x] Associate | [ ] | [ ] | [ ] | [ ] |

**Your level** · *reachable from here* — the row hue carries category, never status.

---

<!-- _class: cards-stack compact -->
<!-- _footer: "The fix · one declaration, and the reason it is the right one" -->

`How it is held still`

## `table-layout: fixed` takes the text out of the geometry.

- Geometry stops reading text
  - A fixed table divides its width by declaration. A late font changes the glyphs, never the column.
- The sibling already did it
  - `roadmap`, the other table in this bucket, has been fixed-layout all along, for this reason.
- Equal steps read truer
  - Under `auto` the reach axis was sized by the longest label: 165.7px against 304.2px, an 1.8x spread.

---

<!-- _class: cards-stack compact -->
<!-- _footer: "The limit · what this fix does not reach" -->

`Only wide is wide enough`

## Every narrower family still has to negotiate.

- Measured as text advance
  - `scrollWidth` on a centered flex box misses the half that overflows left. A Range over the text node is the honest unit — and it reads `-25.2px` where `scrollWidth` reported a 2px rounding artifact.
- Square fails like portrait, later
  - `--canvas-scale` raises the type as the box narrows. `Distinguished` clears its cell by `+75.9px` at wide, misses by `-25.2px` at square and `-44.5px` under `mode: sketch`.
- The type floor is reached
  - `--fs-meta` is the floor of the twelve-token scale, so the step the narrow arm already takes is the last one available.
- So only wide takes `fixed`
  - Square, tall and strip keep `auto` and render byte-identically. The shift stays live there, and `scale-2xl` leaves wide only `+19.7px`.

---

<!-- _class: closing silent index -->

## See also.

`Related`

- `roadmap` — the sibling table, fixed-layout since it shipped
- `obligation-matrix` — rows × columns of pass/partial/exempt status
- `engineering/jank.md` — does the layout stay put as content grows
