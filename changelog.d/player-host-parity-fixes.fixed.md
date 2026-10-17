- **Fixed: a math deck exported from the Studio as a Webpage now carries its KaTeX fonts.** The
  Studio linked KaTeX's stylesheet, whose relative font addresses can't load in a shared file, so
  every formula drew in fallback type. It now inlines the fonts, as the CLI does.
- **Fixed: a deck with a function plot exports the same file every time.** The plot library named
  its clip paths from random numbers, so two exports of one deck differed. The names now come from
  the plot's own config.
- **Fixed: the browser runtime reads a CSS `url()` that holds an SVG `data:` address in full.** It
  stopped at the first `)` or `'`, which such an address contains, so a picture embedded that way
  failed to load wherever the runtime measured it. That included the Studio's Webpage export and
  the CLI's `--html` and `--fluid` exports.
