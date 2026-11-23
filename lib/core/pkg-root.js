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
 * the manifest schema through this and `lattice.js` hands `loadAll()` a
 * directory resolved through it; if the two walks resolved differently, the
 * contract and the manifests it governs would come from different trees — the
 * exact skew `engineering/decisions/2026-09-13-bundle-era-skew.md` exists to
 * close.
 *
 * This is a NEW shared helper, not a de-duplication. Before it the walk existed
 * once, inline in `lattice.js`; it is extracted here so the second
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

/**
 * The engine's published manifest, the one that carries `version`, `bin` and `exports`.
 *
 * In this repository the root `package.json` is a private workspace root (scripts and
 * devDependencies), and the engine's fields live in `packages/lattice/package.json`, which
 * `tools/stage-engine-package.js` packs from (engineering/decisions/2026-10-07-first-npm-release.md
 * §8, option A). In an installed package that folder does not exist, and the package's own
 * `package.json` IS the engine manifest. One helper, so the dev CLI and the installed one report
 * the same version.
 *
 * @param {string} root  A package root, from `pkgRootFrom`.
 * @returns {string} The path of the manifest to read.
 */
function engineManifestPath(root) {
  const inRepo = path.join(root, 'packages', 'lattice', 'package.json');
  return fs.existsSync(inRepo) ? inRepo : path.join(root, 'package.json');
}

module.exports = { pkgRootFrom, engineManifestPath };
