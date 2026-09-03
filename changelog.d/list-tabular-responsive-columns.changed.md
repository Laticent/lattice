- **`list-tabular` columns size to their content.** The grid moved from each row
  onto the list, and every row is now `grid-template-columns: subgrid`, so one set
  of tracks is shared and each sizes to the widest content across the list. The
  hard `3.4375cqi 15.625cqi 1fr minmax(0,0.9fr)` tracks it replaces made a
  two-letter label pay for the longest one — "ID" wasted most of a 15.625cqi track
  while a long label wrapped to three lines beside an empty description column.
  `fixed` restores the old widths for a deck that was laid out around them.
- **`list-tabular` rows carry a checkbox and pills.** A nested bullet holding only
  a state marker (`[x]` `[-]` `[ ]` `[/]`) and/or inline `code` pills becomes the
  row's trailing marks cell — right-aligned, and the marker drawn as the same
  status disc checklist uses rather than left on the slide as literal `[x]` text.
  It can follow any sublist element, and pills alone need no checkbox.
- **New `list-tabular` column modifiers.** `fit-name` `fit-body` `fit-meta` hug one
  column; `flex-name` `flex-meta` name the column that absorbs the leftover instead
  of the description. Most ledgers need none of them — the default already fits.
