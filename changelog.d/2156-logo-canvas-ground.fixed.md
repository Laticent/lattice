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
- **Fixed:** `color-mode: system` gave the logo a light-canvas mark on a dark-canvas ground.
  The ground already followed the receiver's OS on every surface; only the mark did not, so a
  viewer on a dark OS got a dark-ink logo on a dark slide. The mark now follows the same
  signal the canvas does — `@media (prefers-color-scheme: dark)` in the engine, and the
  player's own scheme scopes where its toggle overrides the OS. Measured across five slide
  kinds — bookends, a divider, a pinned-light slide and ordinary content — by six
  combinations of OS setting and player toggle: 30 of 30 agree with their own ground.
- **Fixed:** an eyebrow on a `dark light` slide kept its on-dark ink on a light ground —
  white on white, 1.00:1. Same defect as the logo, on the element beside it: the rule keyed
  on the `.dark` class while `.light` decides the ground. Bookends keep the on-dark ink,
  because a bookend stays a dark panel.
- **Fixed:** a bookend or divider lost its dark tokens after a toggle to light in the exported
  player, so a `strong` inside one came back at 1.61:1 (now 11.29:1). These are dark panels in
  every player scheme and now carry the dark token block unconditionally. The two places that
  decide whether a slide gets dark TOKENS — the unconditional block and the restore-to-light
  carve-out — now take the engine's force-dark set whole: `title`, `closing`, and `divider` unless it is the bright
  `divider.light` variant, which replaces the canvas and keeps the light scheme it declares.
  The carve-out is per pin, because which slides must not restore depends on the pin doing the
  restoring: a `divider light` is genuinely light and restores, a `divider color-light` is a
  dark panel and does not. Spelling those the same left a divider at 1.61:1 in the player's
  dark scheme, now 11.29:1. It takes a slide carrying `color-light` as a per-slide class on a
  deck with no deck-wide `color-mode:` — with one set, the player's toggle strips the class
  before the rule can match, so no `color-mode: light` deck was ever affected.
