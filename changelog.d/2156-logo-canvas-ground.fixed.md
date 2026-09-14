- **Fixed:** the deck logo was invisible on a `-dark` **theme**. A dark theme flips the
  canvas at the root without touching any slide class, so no class-keyed rule could reach
  it and the mark rendered at the canvas's own lightness — nothing errored and nothing was
  missing, the slide just looked as though it had no logo. The engine now reaches it on the
  theme's own name, declared above the per-slide rules so a `light` slide inside a dark deck
  still takes the light mark.
- **Fixed:** a slide stacking `dark light` (or `divider light dark`) kept the dark-canvas
  filter on a light ground — a brightened mark at 0.45 opacity on white. `light` and
  `color-light` now give the token back, as `print` already did.
- **Fixed:** the exported player disagreed with the PDF on those same stacked slides. Its
  unconditional dark rule excluded only the print band, and the rules that would have
  restored a light-pinned slide are emitted only inside the player's dark scopes — so in
  light scheme nothing corrected it. The exclusion is now derived from the pin set itself,
  at all three emitters, so the two cannot drift apart again. Exported bytes: +960 raw,
  +11 gzipped on a 4-slide deck.
- **Fixed:** a `title light dark` or `closing light dark` bookend rendered as a blank white
  slide in the exported player — white ink on a white ground. The engine keeps a bookend's dark
  panel even when the slide is pinned light; the player, which rebuilds dark from flat rules and
  has no cascade to consult, was not told. Both the dark rule and all four restore-to-light sites
  now carve the bookends out, and a printed bookend still correctly takes paper.
