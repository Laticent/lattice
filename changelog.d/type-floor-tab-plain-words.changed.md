- **Changed: the type-floor alarm says what is wrong instead of quoting its own measurement.**
  The authoring tab on a slide whose figure shrank its labels below the legibility
  floor read `Type 6.6px · floor 7.2px` — two numbers, no verb, and a unit that
  changes with the deck's size. It now reads `Text too small · 4.9pt`, and carries
  the fix in a tooltip: *"Figure text renders at 4.9pt — below the 5.4pt minimum.
  Simplify the figure (fewer labels, shorter text) or give it a bigger box."*
  The size is reported in points on the standard 960×540pt slide page, so the floor
  is the same 5.4pt on every preset rather than four different pixel numbers for one
  rule, and it is directly comparable to the deck's own type roles (`meta` is
  11.25pt). The export's `TYPE FLOOR` stderr warning names the same points. The tab
  is authoring-only as before — no export or delivered deck shows it.
