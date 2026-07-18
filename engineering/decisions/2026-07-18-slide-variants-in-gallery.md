---
status: shipped
summary: >
  Slide VARIANTS become first-class looks — searchable, insertable, and reshapeable —
  across the Studio. A variant is not a different kind of slide: it is the same authored
  slide with a different `_class` token, so "search a variant", "insert a variant", and
  "reshape to a variant" are one operation (change the tokens), and every look is a child
  of its parent component (`quote › insight-key`). Search indexes variant tokens; a
  gallery tile expands to a windowed sub-grid of live look previews; a new Reshape control
  in the edit-mode slide toolbar previews the CURRENT slide in every look and swaps the
  token in place (axis-aware). Decision: Reshape lives in the toolbar (sibling of Insert),
  not on the preview or only in the Inspector. Reuses the gallery preview tiles + the
  Inspector's token mutators — no new engine behavior.
---

# Slide variants as first-class looks — search, insert, and reshape

**Date:** 2026-07-18 · **Status:** shipped · **Follows:** the add-slide gallery
(`SlidePicker`, #1058/#1062).

## The problem

The add-slide gallery presents the 58 base components. Each component also carries
**variants** — `effectiveVariants` in `dist/docs/components.json`, ~50 per component,
**2,981** across the catalog (`insight-*`, `claim-*`, `dark`, `accent`, `tint-*`,
`tone-*`, `scale-*`, `no-*`, status stamps like `draft`/`confidential`, …). Today the
gallery ignores all of them: search doesn't match variant names, tiles show only the
base look, and inserting gives you the base skeleton. To get a variant you insert the
base and then change class tokens in the Inspector drawer (`SlideContext.tsx`) — a wall
of toggles with no preview.

## The model (the key framing)

**A variant is not a different kind of thing — it is a different LOOK on the same
slide.** The content is authored identically; the only thing that changes is the
slide's class token:

```
<!-- _class: quote -->            →   <!-- _class: quote insight-key -->
   (default look)                        (a variant look)
```

So "insert a variant", "pick a variant", and "reshape to a variant" are **one
operation: change the class tokens.** There is no flavor-vs-modifier taxonomy to
build — every variant is a selectable look, and every look is a child of its parent
component. Labels read `component › variant` everywhere (`quote › insight-key`).

Validity + exclusivity already live in the engine and the Inspector, and we reuse
them verbatim (HARD RULE #15):

- **Valid looks per component** = exactly the set the **playground and component
  reference surface**: the component's DECLARED `variants` narrowed to the ones that are
  DOCUMENTED (`variants.filter(v => variantDocs[v])`, the identical derivation in
  `docs/src/pages/playground.astro` and `components/[bucket]/[name].astro`). This is its
  own alternate forms — `kpi › ops/spotlight`, `list › numbered/roman` — NOT
  `effectiveVariants`. `effectiveVariants` also folds in the universal configuration every
  component accepts (`dark`, `no-header`, `insight-*`, `tone-*`, `compact`, …) — that is
  slide *settings* (the Inspector), not "variants of the component", so it stays out of
  looks. To keep the Studio and the playground from ever disagreeing, `components.json`
  now emits this filtered set at the source (`documentedVariants` in
  `tools/build-docs-portal.js`); every declared variant is documented today, so it is a
  no-op on current output that guards the future. 36 of 59 components carry real variants;
  the other 23 (title, quote, big-number, …) have none and correctly show no looks chip
  and no Reshape button. A component's variants are a mutually-exclusive family (a slide is
  one form), so reshaping to one replaces any other.
- **Exclusive vs additive** = `lintVocab.exclusiveAxes` (e.g. only one `insight-*` at a
  time; `dark` stacks). Applying a look uses the Inspector's own `mergeClassTokens` /
  `setGroupToken` / `toggleToken`, so the result is always a valid, non-contradictory
  class — never two members of the same axis.
- **A look's preview** = the component's `skeleton` with the variant token merged into
  its `_class`, rendered through the shared `SlideThumbFace` (same windowed engine
  render as every other tile).

## The three surfaces

1. **Search is variant-aware.** Each component's variant tokens join the search
   haystack (`component-search.ts`), so typing `insight`, `takeaway`, or `dark` finds
   the components that offer that look. A variant match surfaces as a child of its
   parent (`quote › insight-key`), never as a bare orphan.
2. **Insert picks a look.** A component tile can expand to reveal its looks — the base
   plus its variants — each a live-preview mini-tile. Picking one inserts
   `skeleton` + variant token. The base insert stays the one-tap default; variants are
   an opt-in expand, so the main grid is never flattened into ~2,900 near-identical
   tiles (windowed like every other preview).
3. **Reshape recasts an existing slide.** A **Reshape** control in the edit-mode slide
   toolbar (next to Insert) opens a popover of live variant previews for the *current
   slide's* component; picking one swaps the class token in place.

## Decision: Reshape lives in the edit-mode slide toolbar

Insert *adds* a slide in a chosen look; Reshape *swaps* the current slide's look —
siblings, so they sit together in the editor's slide toolbar. The popover itself is
preview-rich (reusing the gallery's tiles), satisfying "a dropdown with a preview of
the variant."

**Alternatives considered:**

- **On the preview pane** — most direct ("change it where you see it"), but it turns a
  clean display surface into a control surface and breaks on mobile single-pane (the
  preview isn't always on screen). Rejected as the primary entry.
- **Only in the Inspector drawer** — max reuse, but a settings drawer is less immediate
  than a toolbar action, and the drawer keeps its role: precise, per-token control.
  Reshape is the fast "recast the look" front end; the Inspector stays the fine-grained
  editor. They complement, not duplicate.

## Perf / display

Variant previews are live engine iframes, so they are **windowed** exactly like the
gallery grid (`useInView` + `SlideThumbFace`) and only mounted when a component is
expanded or the Reshape popover is open — never all at once. This keeps the ~2,981
potential variant previews bounded to the handful on screen.

## Reuse ledger

- Previews: `SlideThumbFace` / `useInView` (`slide-thumb.tsx`).
- Class mutation + validity: `mergeClassTokens` / `setGroupToken` / `toggleToken`
  (`front-matter.ts`), `effectiveVariants` + `exclusiveAxes` (`SlideContext.tsx`,
  `lintVocab`).
- Search: `component-search.ts` haystack (extended to include variant tokens).
- Insertion: `addSlideAfter` (unchanged); Reshape mutates the current chunk in place
  via the existing `applyDeckOp` / editor mutation path.

No new engine behavior — the whole feature is a preview-first front end over class-token
editing that already works.
