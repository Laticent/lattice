- **Fixed: `spectrum-card: rainbow` keeps the theme's full ribbon in the Studio and the
  Playground.** On a deck that sets `spectrum: solid`, `duo` or `mono`, the pinned card rail used
  to draw the quieter bar in every browser preview and in the Studio's Webpage export, while the
  CLI export drew the ribbon. It now draws the ribbon everywhere.
- **Breaking:** a `spectrum:` style now sets `--spectrum-style`, and the bar reads
  `--spectrum-bar`. `--spectrum` is always the theme's own ribbon. Custom CSS that painted with
  `var(--spectrum)` and expected the slide's bar should read `var(--spectrum-bar)`.
