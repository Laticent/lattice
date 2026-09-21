- **Fixed: `--read` no longer loses silently to `--fluid`.** The two ask for opposite
  documents — a viewer for the slides, and the slides replaced by prose — and only the
  `--player` clash warned, so `--read --fluid` produced a fluid viewer with no article
  in it and said nothing. Both clashes now say which one won. An explicit flag also
  beats a deck key in both directions, so a deck's `fluid: true` no longer overrides a
  `--read` typed on the command line.
- **Fixed: a `--read` export honors the deck's `color-mode`.** A deck declaring
  `color-mode: dark` handed its reader a white page: the engine carries dark as a class
  on the slide section, every rule for it is section-scoped, and `--read` removes the
  sections — so the palette's `light-dark()` tokens all resolved light. The article now
  carries the deck's declared scheme on the document root, which takes the body from
  `rgb(255,255,255)` to `rgb(0,29,51)` and the ink from `rgb(30,58,95)` to
  `rgb(203,217,232)` — the values the player already showed for the same deck.
  A `color-mode: print` deck maps to a light canvas, which is what a B&W handout is.
- **Fixed: a `--read` export no longer reports a trim that reaches nothing.** The
  `guards: strict` console keyed on `--fluid` being set rather than on which arm of the
  write chain actually wins, so a deck with `fluid: true` rendered with `--read` printed
  "TRIMMED … pages 1" for a cut present in no artifact, and suppressed the honest "NOT
  APPLIED" line.
- **Fixed: `color-mode: system` is honored by the reading article.** It defers to the
  reader's OS, as `.color-system` does on the slide — without it a `system` deck read
  light in the article while the player read dark on a dark-mode machine.
- **Fixed: a clash between two front-matter keys names the keys.** A deck setting both
  `fluid: true` and `read: true` and rendered with no flags was told "--fluid and --read
  both set", sending its author to grep an invocation carrying neither.
