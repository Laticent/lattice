---
status: in-progress
date: 2026-11-06
summary: One front-matter key, `align:`, sets where a slide's content sits, on both axes, at deck and slide level, in everyday words modeled on flexbox. Each component declares its default in its manifest, used when the deck omits the key. It replaces the `cards:` register outright (no alias; not GA) and the stage `align-*` classes become its per-slide form. A split run's pages share one alignment, so turning a page never moves the content. Built in PR #2988.
---

# One `align:` key for both axes (owner, 2026-11-06)

## Why

Flipping a split run on a phone, the owner saw the content jump between pages: each body page centered
its own members, so a page holding three milestones began lower than one holding five (measured on the
export check deck: 57 to 125px). Tracing it showed alignment is decided in about forty places. The
`cards:` register governs 23 components through `--cards-align`; about twenty more center their stage
in their own CSS; split pages center through `--split-place`; and the stage carries six per-slide
`align-*` classes (#527) with a vocabulary of their own. The owner's ruling:

> "I think alignment today being owned by components is a very bad design, each component can declare
> its alignment but alignment horizontally and vertically should be one two global front mater
> controls … one unified alignment front matter key to control alignment as well as controls in
> specific slide/component. the alignment should have entries in deck and slide settings as well as
> have auto complete. one key controls multiple axis which we already have for other keys."

## Decisions

1. **One key, `align:`, two axes.** Deck-wide in front matter, per slide as a class, and in the Studio's
   deck settings and slide inspector, with editor autocomplete and a lint rule for an unknown word.
2. **Everyday words, modeled on flexbox** ("we model after flex alignment semantics but use everyday
   language"):

   | Up and down | flexbox | Side to side | flexbox |
   |---|---|---|---|
   | `top` | `flex-start` | `left` | `start` |
   | `middle` | `center` | `center` | `center` |
   | `bottom` | `flex-end` | `right` | `end` |
   | `spread` | `space-evenly` | `full` | `stretch` |
   | `fill` | `stretch` | | |

   One word or two, in any order (`align: bottom right`, `align: left top`). Each word belongs to one
   axis, except `center` alone, which centers both. `stretch` is renamed `fill`.
3. **The default is the component's.** A deck with no `align:` line takes each component's declared
   default from its manifest (a statement sits in the middle, a long list starts at the top), as
   `cards:` worked, so omitting the key keeps every deck looking as it does.
4. **`cards:` is replaced, not aliased** ("we are not ga so we can replace and have a clean break").
   The manifest field, the resolver, the tokens, the lint rule, the Studio control, the spec rows and
   the docs move to `align:`.
5. **The stage `align-*` classes become the per-slide form** of the key, in the new vocabulary
   (`_class: align-top`, `align-center`, `align-bottom-right`).
6. **A split run shares one alignment.** Every body page of a run uses the run's alignment; with a
   centered alignment, every page takes the top that centers the run's tallest page, so the run keeps
   the centered look the owner chose for split pages on 2026-11-04 (fit-everywhere-model.md §16) and
   no page jumps.
7. **Built in PR #2988**, with the measured-split default and the handheld ladder it grew out of.

## What it replaces

`lib/core/resolve-cards.js` and its catalog, the `cards` manifest field (23 components), `--cards-align`
and its CSS mapping in `base.tokens.css` and `pane.css`, the `[data-cards]` per-value rules, `--split-place`,
the component CSS that centers a stage on its own, the stage `align-*` modifiers and their `fill-center` / `fill-anchor` aliases, the `cards:`
spec rows and conformance fixtures, the Studio card-row control, and the `cards:` docs and demo decks.

## How it was built (2026-11-06)

- **Up and down** goes two ways. A component that declares an `align` default in its manifest
  (the 23 that declared `cards`) gets the resolved word stamped as `data-align`, which
  `base.tokens.css` turns into `--align-v`; every other component reads the `align-*` class
  through the stage rules in `lib/forms/cell/stage/stage.css`. **Side to side** is the stage's
  `align-items`, from the class, for every component.
- **`spread` maps to `space-evenly`**, not `space-between` as first written in the table above:
  it is what `cards: spread` rendered, so a deck that moves from `cards: spread` to
  `align: spread` keeps its look.
- **A slide word beats the deck word on its own axis only**, and `align-center` alone names both
  axes there too (`deckAlignTokensFor`).
- **`fill-optical` stays** as its own class: it is an optical offset, not an alignment word.
  `align-fill` grows rows only on a component that declares a default; elsewhere it reads as
  `align-top`.
- **Breaking for one per-slide class:** `align-center` used to center side to side only; alone
  it now centers both ways, as decision 2 says.
- **One placement per run (decision 6)** is a measuring pass, `lib/core/run-placement.js`, because
  CSS has no "tallest sibling page". The export page and the runtime run the same kernel (the
  `card-tag-equalize.js` pattern). It writes the top that places the run's tallest page as
  `--run-pad` on every body page; base.modifiers.css starts the stage there. Measured on the
  export check deck at square: the first line of each run moved by 57 to 125px between pages
  before, and 0px after. A plain `.html` export has no script, so each page keeps its own
  centering there.
