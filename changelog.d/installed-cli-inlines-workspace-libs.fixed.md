- **The installed `lattice` CLI starts again.** An `npm install` of the package ran a bin that
  exited before rendering anything: `Cannot find module '@laticent/segno/read'`. The CLI bundle
  required three workspace libraries (Segno, LTT and Cadenza) that are neither published nor
  dependencies, so only a checkout of this repo could resolve them. `tools/build-emulator.js` now
  inlines all three, as it already inlined Trama and Calco. `lattice packages` and `lattice video`
  failed the same way in an install, because the bin ran them from raw `lib/` files; each now runs
  from its own bundle, `dist/lattice-packages.js` and `dist/lattice-video.mjs`. A unit test fails
  when any shipped Node bundle imports a package a consumer install does not provide, or when the
  bin spawns a subcommand from a raw `lib/` file.
  (`tools/build-emulator.js`, `test/unit/tools/shipped-bundle-externals.test.js`)
