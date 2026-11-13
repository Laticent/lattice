- **`lint:deck --fix` rewrites a Marp `![bg …](src "description")` line into Markdown's picture, `![description](src)`**,
  rather than an `@image{…}` record, and moves its placement to the slide as before (`left` becomes `mirror` on an `image`
  slide; any other slide gains `bleed`). On those slides Markdown's picture is the record's shortcut, so it draws the same
  photo, and the line stays the one an author already knows. A description that starts with `bg` becomes `Image: …`, so it
  never reads as the keyword again. A line with no description becomes `![](src)`, which `image-no-alt` then asks you to name.
- Every shipped example deck is swept off `![bg]`, and each swept photo gets a name a screen reader can say. 15 of the 16 swept decks render
  pixel-identically to `main`; `bg-on-any-slide`'s three background slides gain `bleed`'s scrim behind the heading.
  `examples/bg-split-ratio.md`, which showed a `![bg left:40%]` share being ignored, is removed.
- Exporting a deck with a locked figure (a drawing the CLI captures in its own page) to PNG or PDF no longer fails with
  `Cannot find module '../core/sanitize-slide-html.mjs'`: the bundled CLI read two files relative to `dist/`.
