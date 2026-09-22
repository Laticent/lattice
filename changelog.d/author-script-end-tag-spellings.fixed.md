- **Fixed: `lint:deck` now flags a deferring inline `<script>` however its end tag is
  spelled.** The `author-script-defers` rule matched the whole element with one
  `<script …>…</script>` span, so it only ever recognized one end tag. A deck closing
  with `</script >`, `</script\n>`, `</script/>` or `</script foo>` — all of which end
  the element for a browser — walked past the rule silently, and so did an unclosed
  script. The rule now matches the opening tag and finds the end the way the HTML
  tokenizer does, which also retires the last spanning tag regex CodeQL's bad-tag-filter
  query flags.
