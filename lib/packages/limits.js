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
  /** Most photo bytes a `.lattice` carries or reads, on top of MAX_ZIP_BYTES for the deck and its packages. A
   *  writer and a reader that disagree make a file the sender could save and nobody could open, so both
   *  read this one number. */
  MAX_LATTICE_MEDIA_BYTES: 128 * 1024 * 1024,
  /** Most photo bytes the `.lattice` inside a re-openable PDF or PowerPoint carries. Smaller than
   *  MAX_LATTICE_MEDIA_BYTES on purpose: the carrier already holds the rendered pages and the Studio refuses
   *  a carrier over 200 MB (embedded-source.ts MAX_CARRIER_BYTES), so the originals must leave room. */
  MAX_EMBEDDED_MEDIA_BYTES: 32 * 1024 * 1024,
  /** Most entries an asset archive may hold. A bundle of every shipped asset is a few hundred. */
  MAX_ZIP_ENTRIES: 2000,
};
