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
