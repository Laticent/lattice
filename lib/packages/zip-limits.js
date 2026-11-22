/**
 * The declared-size checks every reader of an untrusted zip runs before it inflates anything: ONE
 * copy, used by the Studio's imports (docs/src/components/studio/zip-limits.ts) and the shared
 * `.lattice` reader (lib/packages/lattice-read.mjs), so the Studio and the CLI refuse the same files.
 *
 * The size an entry DECLARES sits in the archive's central directory; JSZip keeps it on the entry's
 * internal `_data`. Checking it refuses an honest zip bomb before a byte inflates. A dishonest archive
 * can understate it, which the running read budget catches (lib/packages/zip-read.js).
 *
 * A leaf whose one `require` is a sibling leaf, which the docs dev server inlines
 * (docs/src/plugins/vite-cjs-lib-dev.mjs).
 */
const limits = require('./limits.js');

/**
 * The uncompressed size an entry declares, or 0 when it declares none.
 * @param {unknown} entry  a JSZip file object
 * @returns {number}
 */
function declaredInflatedBytes(entry) {
  return Number(entry?._data?.uncompressedSize) || 0;
}

/**
 * Refuse an archive whose entry count or declared inflated total is over the caps. Throws
 * `Error(message)`, so the caller's notice shows the caller's own words.
 *
 * `paths` limits the size sum to the entries the caller will actually read: an asset bundle carries
 * showcase PDFs the importer never opens, and a large export must not be refused on re-import for
 * bytes nobody inflates.
 * @param {{ files: Record<string, { dir?: boolean }> }} zip  a loaded JSZip
 * @param {string} message
 * @param {Iterable<string>} [paths]
 */
function assertZipWithinLimits(zip, message, paths) {
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > limits.MAX_ZIP_ENTRIES) throw new Error(message);
  const counted = paths ? [...new Set(paths)].map((p) => zip.files[p]).filter(Boolean) : entries;
  let total = 0;
  for (const e of counted) total += declaredInflatedBytes(e);
  if (total > limits.MAX_INFLATED_BYTES) throw new Error(message);
}

module.exports = { declaredInflatedBytes, assertZipWithinLimits };
