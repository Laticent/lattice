- **`--reopenable` warns when `-p` themed the export but the deck re-opens in another
  theme.** The `.lattice` carries the deck as written, so a deck themed by `-p cuoio` with no
  `theme:` line re-opened in the default theme. The CLI now prints one warning naming both
  themes and the `theme:` line that makes the theme travel, and says nothing when the deck
  already names it. (`lattice-emulator.js`)
