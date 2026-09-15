- **Fixed: Compose no longer sets authoring comments as prose, and no longer corrupts the
  multi-line ones.** An HTML comment is a note to the author, never a thing on the slide, but the
  Compose parser did not model it — so every `<!-- … -->` landed in the writing surface as editable
  text. A comment spanning lines fared worse: markdown read its indented continuation as a CODE
  BLOCK, so re-serializing the slide put the closing `-->` inside a fence and the engine rendered an
  empty `pre` onto the slide. One keystroke on such a slide was enough, and 25 multi-line comments
  across 7 shipped decks were exposed. Comments are now a schema node carrying their source bytes
  verbatim. The COMMENT'S OWN BYTES survive whatever shape it is in — internal line breaks, hanging
  indent and all. Its surrounding blank line is normalized like any other block's, so a comment
  written tight against a paragraph gains one on the next edit to that slide; that changes the
  source, never the render, and it affects a handful of shipped decks.
- **Added: a run of comments reads as one control.** Adjacent comments — a `caption:`, a
  `describe:` and a note all belong to the same slide — show as pills on a single row, labeled by
  CHANNEL rather than all called "note", with exactly one open at a time and its words in a shared
  panel below. Clicking another pill moves the panel instead of opening a second. Previously each
  comment rendered its own box with its own Remove button, so three comments meant three identical
  stacked "NOTE" panels. `caption:` and `describe:` also drop their prefix in the panel — that is
  the syntax selecting the channel, not part of what the author wrote.
- **Fixed: removing a note on a locked slide no longer looks like it worked.** A slide Compose
  cannot round-trip takes no edits, and the delete was silently filtered. It is reachable by
  accident, because a note's own contents can lock its slide: `<!-- TODO: kill the ~~old~~ wording -->`
  made a slide read-only with no visible cause. The control now says to edit in Markdown.
- **Fixed: a comment no longer hides text the slide renders.** `<!-->` and `<!--->` carry their
  terminator inside the opener, and the scan skipped past it — so `<!--->` followed by a line of
  prose swallowed that prose into the comment. A `---` inside a comment could also be read as a
  setext underline and rewritten into a visible heading; the rule now sits where the engine's own
  HTML-block rule sits. A comment inside a list item stays prose, because lifting it out turns a
  tight list loose.
- **Fixed: a trailing note no longer mislabels the block above it in Compose.** Key-insight,
  below-note and eyebrow all survive a comment in the gap — the transform that decides them counts
  elements only — so Compose skips comments when looking forward. A SUBTITLE does not survive one:
  it is hoisted by a string match that an intervening comment defeats, so Compose no longer claims
  a subtitle the engine will not render.
- **Security: a pasted comment cannot carry a directive into the deck source.** Comment text is
  written back verbatim, so a crafted `div.cs-comment` from a page the author does not control
  could have landed `<!-- _backgroundImage: url(…) -->` in the source, where it becomes a real slide
  directive. Pasted comments now need this editor's own provenance token, are refused if they are
  directive-shaped, and must be one self-contained inert comment — the check refuses every way the
  HTML parser can end a comment early (`-->`, `--!>`, and the abrupt `<!-->` / `<!--->` forms).
