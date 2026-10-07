- **Fixed: `npm i @laticent/lattice` gives a working `lattice` command.** The installed CLI
  exited with `Cannot find module '@laticent/segno/read'` before rendering anything, and an
  install without jsdom quietly skipped the compare-code, scene, wifi and build transforms.
  The bundled CLI now inlines every workspace library it uses, and the package declares the
  libraries and jsdom as dependencies.
- **Changed: the npm package is smaller and its public paths are named.** The Marp kit and the
  agent kit leave the tarball (they ship on the `dist-kits` branch and in the release zip),
  Mermaid, ZenUML, KaTeX and function-plot are no longer installed because their plugins ship
  their own copies, and the `./lib/*` and `./dist/*` wildcard exports are gone in favor of
  named ones. Packed size goes from 28.1 MB to 22.0 MB.
