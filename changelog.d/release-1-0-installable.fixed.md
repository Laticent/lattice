- **Fixed: `npm i @laticent/lattice` gives a working `lattice` command.** The installed CLI
  exited with `Cannot find module '@laticent/segno/read'` before rendering anything, and an
  install without jsdom quietly skipped the compare-code, scene, wifi and build transforms.
  The bundled CLI now inlines every workspace library it uses, and the package declares the
  libraries and jsdom as dependencies.
- **Breaking:** the npm package's public paths are named, and it carries less. The `./lib/*`
  and `./dist/*` wildcard exports are gone; the named exports (`/css`, `/runtime`, `/engine`,
  `/themes/<name>.css`, `dist/lattice-emoji.css`, `dist/docs/components.json`) remain. The
  Marp kit and the agent kit leave the tarball (take them from the `dist-kits` branch or the
  release zip). Mermaid, its CLI, ZenUML, KaTeX and function-plot are no longer installed,
  because their plugins ship their own copies. Packed size goes from 28.1 MB to 22.0 MB.
- **Breaking:** Node 22.13 or newer is required (was 22.12), because jsdom, now a runtime
  dependency, supports Node 22 from 22.13.
