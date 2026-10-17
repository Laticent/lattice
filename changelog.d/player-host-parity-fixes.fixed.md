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
- **Fixed: a portrait, square, story or mobile deck exported from the Studio as a Webpage is cut
  into pages, as the CLI's `--player` cuts it.** The Studio shipped each multi-element slide as one
  crowded page, so a `size: story` deck had 8 slides from the Studio and 32 from the CLI.
- **Fixed: a CLI `--player` file carries the deck's diagrams as source, not as drawings.** Its
  embedded source had every Mermaid fence replaced by the drawn SVG, so re-importing the file gave
  frozen diagrams nobody could edit. It now carries the deck exactly as written, as the Studio's does.
- **Fixed: Mermaid drop shadows draw in a CLI `--player` file.** The file's HTML pass lowercased the
  `feDropShadow` filter element, which SVG then ignored.
- **Fixed: a diagram in the Studio's preview and exports has an accessible name.** A diagram
  without `accTitle:` reached a screen reader as an anonymous graphic; it is now named for its
  type ("Pie chart", "Flowchart"), as CLI exports already named it.
- **Fixed: a Mermaid label containing the text "my-svg" keeps it.** The CLI's diagram renderer
  rewrote every "my-svg" in the drawing, label text included, to its internal id.
