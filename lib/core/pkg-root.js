/**
 * The package root — the nearest ancestor directory with a `package.json`.
 *
 * ONE walk, because two copies of it silently stop agreeing. Callers use this to
 * resolve files that ship with the package (themes/, dist/lattice.css, the
 * manifest schema) from BOTH the loose source and the bundle, where `__dirname`
 * differs: `lib/components/` in one, `dist/` in the other. The walk crosses no
 * nested package.json in this repo, so both land on the same root.
 *
 * That agreement is load-bearing, not incidental. `lib/components/index.js` reads
 * the manifest schema through this and `lattice-emulator.js` hands `loadAll()` a
 * directory resolved through it; if the two walks resolved differently, the
 * contract and the manifests it governs would come from different trees — the
 * exact skew `engineering/decisions/2026-09-13-bundle-era-skew.md` exists to
 * close.
 *
 * This is a NEW shared helper, not a de-duplication. Before it the walk existed
 * once, inline in `lattice-emulator.js`; it is extracted here so the second
 * caller cannot become a second copy. (The decision record and #2162 first said
 * "two byte-identical copies" — that described an unshipped draft, not the tree.
 * `git log -S "dirname(dir)" -- lib/components/index.js` is empty.)
 *
 * @param {string} fromDir  Directory to walk up from (usually `__dirname`).
 * @returns {string} The package root, or `fromDir` if no package.json is found.
 */

const fs = require('node:fs');
const path = require('node:path');

function pkgRootFrom(fromDir) {
  let dir = fromDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return fromDir;
}

module.exports = { pkgRootFrom };
