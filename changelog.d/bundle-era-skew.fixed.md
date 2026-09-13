- `dist/lattice-emulator.js` no longer validates manifests against a schema frozen at
  bundle time. `lib/components/index.js` read `lib/components/**/*.manifest.json` from
  disk at run time but `require`d `manifest.schema.json`, which esbuild inlines — so a
  bundle older than the working tree rejected manifests the loose source accepted, with
  an error telling the author to add a field the schema already had. The schema is now
  read from the package root, the same directory the manifests come from.
- `npm run build` converges in one pass when an Anima source changes. `build-anima-player.js`
  ran 18 steps after `build-emulator.js`, which inlines its output, so the emulator was
  written 2.6s before the file it contained.
- The four workspace library dists now join before their FIRST consumer. `build-player-core.js`
  bundles `@laticent/cadenza` but ran six steps ahead of the join, reading a file a live
  background process could be rewriting — a race won by 5.7s of scheduling luck.
