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
  variants carrying their base. A web app imports `@laticent/lattice/css` and then one
  palette. The theme file itself still fails in Vite (`ENOENT: open 'lattice'`), because its
  `@import 'lattice'` is a Marp theme reference, not a file.
