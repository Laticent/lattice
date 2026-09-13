- The Inspector's search field draws **one** trailing ✕, not two: it clears the text while
  there is text and closes the field once there is not. The two jobs were two buttons side
  by side — a 24px "Clear search" 19px from a 28px "Close search", same glyph, on a 293px
  phone row — and the docked desktop panel drew a third within 100px of the same 296px,
  because the panel's own collapse used the ✕ too. That one is now a panel-collapse mark,
  matching the preview pane's. Escape still leaves from either state.
- While the search field is open, the scope banner's sentence steps aside instead of
  truncating to "Set it …", so the row's words are either whole or absent, never a stub.
- Inspector search reaches a control through the word an author actually types. It stems
  ("numbers" finds "Hide page number", "captions" finds Caption), it carries a small shared
  synonym table ("font" finds Type scale, "pagination" finds the slide's page-number row,
  "margin" finds Claim), and it repairs a typo ("numbre", "capiton", "algnment"). No
  ranking: a filter draws a row or it does not, so precision-first substring matching still
  runs first. Per-row `find=` synonyms are unchanged.
- Searching "color" in the deck panel returned the whole Accent section — eleven rows —
  because that section listed a keyword its own Brand bar row already carries. It now
  returns the two rows that are about color.
