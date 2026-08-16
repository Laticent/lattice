- **Added: the engine owns the slide's corner, and a deck can ask for a rounded
  one.** A new `corners:` front-matter register — `square` (the default, and what
  every deck rendered at before) or `rounded` — with a per-slide `_class:
  corners-rounded` / `corners-square` override. One engine rule owns how round,
  and nothing downstream re-derives it. It clips with
  `clip-path` rather than `border-radius`, so the brand bar and all four
  `spectrum-edge` rails follow the corner instead of poking square ends past it.
- **Fixed: the Studio preview no longer invents a corner the deck doesn't have.**
  Six surfaces that show a slide — the live preview, the slide-navigator
  thumbnails, the add-slide gallery tiles, the Fabricate specimens, the Layout
  Studio — each clipped at a fixed 12px or 8px of the *app's* chrome. So a square
  deck previewed rounded, in the Studio's palette rather than its own, which read
  as a foreign frame whenever the two themes differed. They now read the radius
  back off the live render as a fraction of the slide's width, so one deck rounds
  by the same proportion in a 240px tile and a 1280px preview.
