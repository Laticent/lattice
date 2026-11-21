# Writing a deck

Read these in order. The first one matters most.

1. **[`deck-canon.md`](./deck-canon.md)** (~1.5k tokens) — what a good deck IS.
   How a boardroom deck argues: one idea per slide, a narrative arc, rhythm, restraint,
   stereotyped bookends. Ends with the traps a reviewer flags, each with its fix. This is
   what the Lattice Studio sends its own model on every turn. **If you read one file
   before writing slides, read this one.**
2. **[`rules.md`](./rules.md)** (~1.1k tokens) — the mechanics that apply to every slide:
   how classes compose, how card layouts nest, what a title slide is.
3. **[`../components/`](../components/)** — pick the layout, then author it from its own file.
4. **[`../review/`](../review/)** — run the checker before you hand it over.

**[`modifiers.md`](./modifiers.md)** (~1.1k tokens) when you need one — the
cross-cutting tokens (`dark`, `tone-*`, `insight-*`, the `tint-*` / `mark-*` decorations)
that compose onto any layout. Not on the path above: you can write a good deck without
reaching for one, and a component file names its own variants.

## Front matter

Every deck opens with it. This is the whole of what you need:

```markdown
---
theme: indaco
paginate: true
---
```

`theme:` picks the palette: `indaco` is the default, and `cuoio`, `onyx` and the rest of
the palettes in `../skills/theme.md` work the same way. Add `color-mode: dark` for the
dark version. `paginate:` turns on page numbers.

## primer.md — the other way to work

**[`primer.md`](./primer.md)** (~26k tokens) carries all 80 layouts with their
authoring skeletons in one document. Use it when you are drafting a whole deck in one
pass and want every option in front of you.

Authoring ONE slide? Do not load it — `../components/<name>.md` is the same content for
the layout you actually chose, at a fraction of the cost.
