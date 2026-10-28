# @laticent/fluido

Decide how content fits the box it is shown in. Give Fluido the facts about a rendered slide and
it tells you what the slide becomes: one page, a run of pages along a seam the content declares,
or a single over-budget element cut into runs. Pure and synchronous, with no DOM, no I/O and no
dependencies.

Fluido is the core of **Fluid**, Lattice's fit system
([design note](../../../../engineering/decisions/2026-10-27-fluid-layout-library.md),
[canonical doc](../../../../engineering/fluid.md)).

## The model

Two questions, kept apart:

- **Where may the content break?** The content answers: a component declares its seam, such as
  list items, table rows or panes. The host reads that from its own markup.
- **Does it break here?** The box answers: a `wide` box never breaks; `square`, `tall` and
  `strip` break on the seam, one element to a page. A first cut may open on a cover (when the
  slide has a heading) and may close on a closing page (when it has a note or an insight).

Fluido reads no markup and measures nothing. The host passes facts in and builds the pages the
answer names, so every surface that asks gets the same answer, and the answer is the same on every
machine.

## The calls

```ts
import { fitsCap, paginates, planSlide, rescueRuns, MAX_PAGES, ONE_PER_PAGE } from '@laticent/fluido';
```

### `paginates(family)`

The size gate. `false` for `'wide'`, `true` for `'square'`, `'tall'` and `'strip'`.

### `planSlide(facts, readSeam?)`

What one slide becomes. `facts`:

| Field | Meaning |
|---|---|
| `optOut` | `'specimen'` or `'report'`: the author opted the slide out. |
| `enrolled` | The slide is built on a component that declares a seam. |
| `recipe` | `{ strategy, shapeReader }`, the component's own page recipe, if it has one. |
| `recipeDeclined` | The recipe was tried and declined. |
| `reSplit` | The slide is a page an earlier cut emitted. |
| `seam`, `members` | The seam to cut on and its member count, or leave both out and pass `readSeam`. |

`readSeam` is a function returning `{ seam, members }`. Fluido calls it only when the decision
needs it, so a host does not read the seam of a slide that an opt-out or a recipe already decided.

The answer is a `Move`:

- `{ kind: 'whole', reason }`: one page. `reason` is `opt-out`, `not-enrolled`, `recipe-veto`,
  `no-seam` or `one-member`.
- `{ kind: 'recipe', strategy }`: run the component's recipe. If it declines, call again with
  `recipeDeclined: true`. A recipe whose `shapeReader` is `false` treats a decline as a veto.
- `{ kind: 'paginate', seam, perPage, envelope }`: cut on `seam`, `perPage` members a page
  (`ONE_PER_PAGE`, 1). `envelope` is `true` for a first cut, which may open on a cover and close on
  a closing page, and `false` for a re-split, which is a bare partition.

The order is the policy: the opt-out first, then enrollment, then the recipe, then the seam, then
the single-member check.

### `rescueRuns(units, budget)`

The budget rescue for ONE element that holds more units than its budget, such as code lines:
`[{ from, to }, …]` runs of at most `budget` units, or `null` when the element fits its budget.

### `fitsCap(pages)` and `MAX_PAGES`

`MAX_PAGES` is 64. The host builds the run the move names, counts the pages it actually made, cover
and closing included, and asks `fitsCap`; past 64 the slide stays one page and rings. The check is
on the BUILT run because only the host knows whether a cover or a closing page exists, and because a
component's recipe builds its own run. So a runaway or forged seam cannot cost a reader thousands of
pages, however the run was built. The longest run in 402 shipped decks at every size is 41
(2026-10-27).

## Cost

`planSlide` takes about 23 ns a call (Node 22, measured over a million calls). The cost of a split
is in building the pages, which is the host's: about 0.2 ms a page for Lattice's builders. The
benchmark's split tier records it (`npm run bench`).

## Not yet

The measured rescue (an element that still overflows its own page, on live screens) and a DOM
adapter that reads the facts and applies the plan are later Fluid phases. Fluido does not own the
family classifier yet; until P4 the host passes the family in.
