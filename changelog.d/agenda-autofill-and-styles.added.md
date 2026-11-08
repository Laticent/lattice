- **An empty agenda fills itself from the deck's dividers.** Write an `agenda` slide with a
  heading and no list, and it lists one item per `divider` slide, named by the divider's heading.
  The same empty agenda placed inside a section also gets that section's `progress-N`. A list you
  write always wins. A hidden divider and a divider inside a code fence do not count. With fewer
  than two dividers there is nothing to fill from, and `lint:deck` warns (`agenda-empty`). It works
  in the CLI, the Studio and Export to Marp.
- **Breaking:** the agenda's `rail` and `cards` styles are retired. The agenda keeps three styles:
  the default `ledger`, `circles` and `checks`. A slide that still names `rail` or `cards` renders as
  the ledger, and `lint:deck` warns (`agenda-retired-style`) with a one-click fix: `rail` becomes
  `circles`, and `cards` is removed.
- **Fixed: page references on `circles` and `checks` agendas sit at the right edge, as on the
  ledger.** They used to render as pills stuck to the end of the title. `checks` rows are now as
  tall as `circles` rows, so the two styles have the same row spacing.
