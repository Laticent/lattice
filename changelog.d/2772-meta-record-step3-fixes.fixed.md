- **The Studio's slide panel no longer writes records into a deck that does not use them.** Adding a field to a
  slide written in directive comments writes the comment form (`<!-- _footer: Q3 -->`), and a new pane marker from
  Compose is `<!-- _pane: bar -->`, so a deck stays readable in Marp and VS Code until the cut. A slide that already
  has a record still gets the field in its record. (`lib/core/meta-edit.mjs`)
- **The slide panel no longer edits the wrong record.** It edits only a record the engine reads, never its copy in a
  blockquote or list item, and a field set in two places (two records, or a record and a comment) is read-only, as two
  `_class` comments are, because clearing one would bring the other back.
- **Compose refuses a pasted directive in any spelling.** A pasted record (`<!-- {background-image="url(…)"} -->`) or
  bare directive (`<!-- backgroundImage: url(…) -->`) could set a slide attribute, the second on every later slide;
  both are refused as a pasted `_class:` is. Compose also reads a record's class, and a comment with text after it
  can no longer pull the rest of the slide into the slide's directives. (`docs/src/lib/compose/`)
- **More readers take a record:** Present's section rail (`{layout=divider}`), the asset rename, the lint's pane split
  (`{layout=columns, class=ratio-35-65}`) and the `{stress-slide}` marker. Lint names a field set by two records of one
  slide, and checks a record that also holds a marker.
- **The D11 gate catches the write shapes it missed:** `attrPush`, `dataset`, `setAttributeNS`.
- A slide with thousands of nested records no longer takes seconds a keystroke in the slide panel.
