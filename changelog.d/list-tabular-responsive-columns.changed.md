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
- **A ruled list's rule is a separator, so it no longer draws an outer edge.**
  `list-tabular` drew a hairline above its first row and below its last; `inventory`
  drew one below its last, `--sp-xs` above the insight band's filled panel. Both now
  rule between rows only (`li + li`), which is what `list.takeaway`,
  `list.principles` and `list-steps.ghost` already did. This is #2055's table-family
  fix carried to the list family. `kpi`'s banding and its heavier last-row total
  rule are a designed treatment and are deliberately untouched, as are card stacks
  whose rows do not touch (`list-steps`, `statute-stack`).
- **`list-tabular` centers in the stage.** A four-row ledger on a full-height slide
  read as a fragment pinned under the masthead; it now sits on the stage's midline
  (`safe`, so an overflowing list still loses its tail rather than its head).
- **Fixed: a long pill no longer bleeds past its column.** `white-space: nowrap`
  made a pill's min-content its whole string, which floored the trailing track's
  `fit-content()` cap — one long pill took most of the row and pushed the status
  disc onto a line of its own. Pills wrap at spaces now, and the disc stays beside
  the first one.
