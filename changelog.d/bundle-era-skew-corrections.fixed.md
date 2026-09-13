- Corrected four false claims shipped with the bundle-era-skew fix (#2162), three of them
  in a permanent decision record: the package-root walk was never "two byte-identical
  copies" (it existed once, in `lattice-emulator.js`; the duplicate was in an unshipped
  draft), `build-anima-player.js` cannot abort on a **type** error because esbuild strips
  types rather than checking them (only a syntax error, unresolvable import or esbuild
  crash aborts it), the runtime bundle carries **167** module markers and not 1288, and
  the `loadAll()` call site is `lattice-emulator.js:2006`.
- The `LatticeManifestSchema` warning no longer claims the bundle's behavior on both
  surfaces: the loose source rethrows from the fallback `require` rather than validating
  against anything.
- Pinned the three fixes with regression tests, each proven to fail under the mutation it
  guards: the `STEPS` ordering that keeps a generator ahead of the bundles inlining it,
  the join covering every consumer of a background library dist, and the require-cache
  schema freeze (checked in a child process, because an in-file assertion is masked by an
  earlier test loading `lib/layout/gate.js`). Adds `test/unit/core/pkg-root.test.js`.
