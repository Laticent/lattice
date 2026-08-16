- **Added: the engine owns the slide's corner, and a deck can ask for a rounded
  one.** A new `corners:` front-matter register — `square` (the default, and what
  every deck rendered at before) or `rounded` — with a per-slide `_class:
  corners-rounded` / `corners-square` override. One engine rule owns how round,
  and nothing downstream re-derives it. It clips with
  `clip-path` rather than `border-radius`, so the brand bar and all four
  `spectrum-edge` rails follow the corner instead of poking square ends past it.
- **Fixed: the Studio's live preview no longer invents a corner the deck doesn't
  have.** It clipped at a fixed 12px of the *app's* chrome, so a square deck
  previewed rounded, in the Studio's palette rather than its own — which read as a
  foreign frame whenever the deck's theme and the app's differed. It now reads the
  radius
  back off the live render as a fraction of the slide's width, so the corner holds
  its proportion at every split position and every screen size. The gallery tiles
  and navigator thumbnails keep their own card corner: a tile is a frame around a
  slide, not the slide.
- **Fixed: the corner author-warning flags follow the slide's shape.** The overflow,
  illegible and fix-me markers sit in the corners a rounded deck clips, so they now
  inset with it rather than being sliced — an authoring alarm should not go quiet
  because a deck chose a corner. No movement on a square deck.
