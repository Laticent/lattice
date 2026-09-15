- **Fixed: Compose no longer sets authoring comments as prose, and no longer corrupts the
  multi-line ones.** An HTML comment is a note to the author, never a thing on the slide, but the
  Compose parser did not model it — so every `<!-- … -->` landed in the writing surface as editable
  text. A comment spanning lines fared worse: markdown read its indented continuation as a CODE
  BLOCK, so re-serializing the slide put the closing `-->` inside a fence and the engine rendered an
  empty `pre` onto the slide. One keystroke on such a slide was enough, and 25 multi-line comments
  across 7 shipped decks were exposed. Comments are now a schema node carrying their source bytes
  verbatim: Compose shows a quiet `note` chip that expands to the text read-only, and the round-trip
  is byte-exact whatever shape the comment is in. Removal is a deliberate two-step inside the opened
  panel — reading a note can never delete it.
- **Fixed: a trailing note no longer mislabels the block above it in Compose.** The engine renders a
  comment as an HTML comment node, which CSS `:last-child` and `+` look straight through, so a
  key-insight blockquote followed by a note is still the slide's last element. Compose's register
  inference now skips comments the same way; it used to count them as ordinary siblings and light
  the wrong register.
