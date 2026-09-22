- **Fixed: `lint:deck` now flags a deferring inline `<script>` however its end tag is
  spelled.** The `author-script-defers` rule matched the whole element with one
  `<script …>…</script>` span, so it only ever recognized one end tag. A deck closing
  with `</script >`, `</script\n>`, `</script/>` or `</script foo>` — all of which end
  the element for a browser — walked past the rule silently. The rule now matches the
  opening tag and finds the end the way the HTML tokenizer does, which also removes the
  spanning tag regex CodeQL's bad-tag-filter query flags.
- **Fixed: the same rule no longer reads a slide's prose as script.** An unclosed
  `<script>` used to be scanned to the end of the slide, where `Worker productivity` and
  `We await sign-off` read as deferral calls the deck never made. An unclosed element is
  now left alone, and the end-tag search uses HTML whitespace rather than JavaScript's
  `\s` — the wider set ended a body on a non-breaking space, truncating it before the
  real code.
- **Fixed: linting a deck with many malformed `<script` runs is no longer quadratic.**
  Bounding the opening tag's attribute scan takes 156 KB of pathological input from
  6475 ms to 208 ms. The Playground runs this on the browser's main thread as the author
  types.
