- **Changed: `@laticent/lattice` now publishes from `packages/lattice/`.** The engine's
  published fields (`name`, `version`, `bin`, `exports`, `files`, `dependencies` and the rest)
  moved out of the repository root `package.json` into `packages/lattice/package.json`, so
  Changesets can version the engine as a workspace. Its `prepack` builds at the root and
  `tools/stage-engine-package.js` links the shipped files in. The tarball holds the same 2,202
  files as before; the one file that changes is the shipped `package.json`, which no longer
  carries the repository's 309 npm scripts, its `devDependencies` or its `workspaces`. Nothing
  changes for a deck or a consumer.
