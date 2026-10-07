- **Shipped motion library.** Lattice now ships four motion scenes as packages in
  `lib/motion/<name>/`: `rotor`, `pipeline-beats`, `arrivals` and `ring-marker`.
  `lattice packages list --type motion` lists them, `lattice packages export motion/<name>`
  zips one, and the Studio's Library lists them on its Motion tab under "Shipped with
  Lattice", where Insert places one in the deck like a saved scene.
- **Theme manifests take `type` and `format`.** `themes/theme.schema.json` accepts
  `"type": "theme"` and `"format": 1`, and every shipped theme manifest carries both, so a
  theme exported from the Studio or the CLI is a valid `themes/` manifest as written.
- **Library motion thumbnails draw every stroke.** A motion card in the Studio's Library
  dropped each stroke painted from the categorical ramp (`--cat-N-mark`), because the
  Studio page does not define it; the cards now use the Motion faculty's fallback ramp.
- **A palette a bundler can import.** Each shipped theme now also publishes as
  `@laticent/lattice/palette/<name>.css`: its tokens with every `@import` resolved, dark
  variants carrying their base. It imports cleanly in Vite and webpack, where the theme file
  fails (`ENOENT: open 'lattice'`), because its `@import 'lattice'` is a Marp theme
  reference, not a file. A palette is for tokens, not for showing slides: to render slides in
  a web page, use `render()` from `@laticent/lattice/engine`, which matched the CLI's render
  pixel for pixel. The themes guide has the recipe.
- **The docs no longer promise that a stylesheet pair renders slides.** The README called
  `dist/lattice-default.css` "browser-droppable" and its browser embed linked the engine and
  a theme. Neither sizes the slide, and a `dark` slide keeps the light canvas. The README and
  the themes guide now point to the engine for slides, and the README no longer says the
  runtime fetches a Mermaid section from the palette file (it reads tokens from the slide).
