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
- **Present's section rail reads a slide's class the way the engine does.** A `divider` set in a comment that holds
  several keys (`<!-- _class: divider` on one line, `paginate: false` on the next) now opens a section, and a
  `_class: divider` comment inside fenced or indented code no longer makes a phantom one.
  (`docs/src/components/studio/present-sections.ts`)
- **Editing a slide in Compose no longer changes what the slide applies.** Compose lifts a setting to the top of the
  slide only when the engine applies it there and moving it changes nothing: an example in indented code or inside an
  HTML block stays put, and a setting never moves past one that stays in place and sets the same field (a bare
  `<!-- class: dark -->`, one in a quote, or a record's other fields). Nothing after a pane marker leaves its pane,
  a record with a speaker note stays put so the notes keep their order, and a setting between two lists stays so the
  lists do not merge (also when the first list's last item runs onto more lines, lazy or indented, or several
  settings, one-line or multi-line, sit between them). A setting indented in a list item after a blank line stays,
  so a loose list is not drawn tight. A spot `_class` or a record's class still moves past a bare `class:` kept in
  place, because the local one wins in either order. A slide where a setting would be taken into a list item
  (indented under one, or right below one or its lazy next line, a note between them or not, pane markers included) opens in Markdown, because Compose would write it back as list text. A seeded test
  renders random slides before and after a Compose edit, through the editor's own parser and serializer, and
  requires the same slide class, style, panes, lists and loose or tight items.
- **Present's section rail reads a quoted divider** (`<!-- _class: "divider" -->`).
- **A speaker note no longer locks a field.** A note with a line that starts `focus:` or `class:` is not a second
  place the field is set, so the slide panel still edits the record. A field set twice shows the value that wins.
- **A record after an unclosed `<!--` inside a code block applies again.** The engine paired the fenced `<!--` with
  the record's own `-->` and dropped both as code, so `<!-- {layout=kpi} -->` after such a block did nothing.
- **A record after an unclosed `<!--` inside an inline code span applies again**, for the same reason.
- **The same holds for a `<!--` inside a double-backtick span** (``` ``<!--`` ```): spans are matched by backtick-run
  length, as CommonMark does.
