/**
 * Size caps for a package zip from someone else — ONE copy, read by the Studio's import
 * (docs/src/components/studio/zip-limits.ts) and the CLI's `lattice packages add`
 * (lib/packages/cli.js).
 *
 * A zip is untrusted input: a few-KB archive can declare entries that inflate to
 * gigabytes, and a large one can stall a reader before a byte is checked.
 *
 * A dependency-free leaf on purpose: the docs dev server can default-import a CommonJS
 * leaf, and nothing else (docs/src/plugins/vite-cjs-lib-dev.mjs).
 */
module.exports = {
  /** Largest archive accepted, on disk. */
  MAX_ZIP_BYTES: 25 * 1024 * 1024,
  /** Largest total the entries a reader actually opens may inflate to. */
  MAX_INFLATED_BYTES: 64 * 1024 * 1024,
  /** Most entries an asset archive may hold. A bundle of every shipped asset is a few hundred. */
  MAX_ZIP_ENTRIES: 2000,
};
