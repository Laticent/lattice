- **Inline icons**, as a plugin (`lib/plugins/icons/`, on by default). `^{database, c3, lg}` draws
  one of 265 curated icons (Tabler, MIT, plus two of ours) at the size of the text around it,
  framed or bare, in the sparks' three looks, with the deck's chart colors; `{S3, icon=bucket, c4}`
  leads a pill with one. An `icon:` front-matter register and `icon-*` slide classes set the frame,
  look and corners, axis by axis. No vendor logos: `lint:deck` coaches `^{s3}` to `^{bucket}`
  beside the service's name (`icon-literal`). The drawings load only for a deck that writes an
  icon. Demo: `examples/inline-icons.md`. A deck that does not load icons leaves `^{…}` and an
  icon-only pill as code on every surface: the engine marks the span `data-lattice-off="icons"`, as it marks an
  unadmitted plugin's fence, and the browser runtime leaves it alone.
- The plugin host gains four contribution points: `inline` (an inline-code kind in the host's
  dispatch table), `services` (a function other code asks the host for), `registers` (a
  front-matter axis register declared as data) and `data` (data loaded only when the deck uses the
  plugin). The inline-code dispatcher is now that table; marks, pills and sparks render
  byte-identically through it.
- The Studio's class completions offer the `icon-*` slide classes (framed/bare, the three looks,
  the two corners), from the same modifier vocabulary the linter reads.
