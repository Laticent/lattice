- **Fixed: the Playground's Deck settings now sets the deck's own theme.** The
  sheet used the `noTheme` field profile, which is the full set minus `theme`,
  on the reasoning that the site header's palette picker was the theme control
  for this surface. That picker is hidden below the `lg` breakpoint, so on a
  phone the near control was withheld in favor of a far one that was not
  rendered and the Playground had no theme control at all. The row is back, it
  writes the deck's own `theme:` — the authoritative axis, which travels with an
  exported `.md` — and it leads with an **Automatic** stop that clears the key
  and hands the deck back to the site palette. Palettes are named and grouped
  exactly as the header picker names them.
- **Fixed: Deck settings controls no longer fall outside the panel.** Each row
  paired a label column with a `min-width` floor against a control that refused
  to shrink, giving the row an incompressible 18.6rem minimum while the panel is
  capped in px/vw. The control was pushed out of the panel and the sheet grew a
  horizontal scrollbar — 5 clipped rows at a 320px viewport, and 4 at 390px once
  the reader scaled text up, because the failing sum is in `rem` and the panel is
  not. Controls may shrink now, and the rows stack below the width where a label
  and its control can sit side by side.
- **Fixed: opening Deck settings no longer arms the first control.** Radix
  focuses the first focusable descendant on open, which was the first row's
  `<select>`. iOS Safari opens a select's picker on the tap that *gives* it
  focus, so one arriving pre-focused swallowed the first tap and the row looked
  dead until you touched another control and came back. Focus parks on the panel
  itself; keyboard readers still tab straight in.
