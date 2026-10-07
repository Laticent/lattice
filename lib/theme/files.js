/**
 * Where a theme's files live on disk: `themes/<name>/<name>.css` and `<name>.manifest.json`, one
 * folder per theme like every other package kind (portable-packages phase 5,
 * engineering/decisions/2026-09-23-portable-packages.md §9 Q2). The loose files beside the folders
 * (the README, `theme.schema.json`, the palette audit) stay at the root.
 *
 * The tools and tests that walk themes used to `readdirSync('themes')` and join the names back on.
 * `themeEntries` keeps that shape (the same base names, folders flattened, loose files included),
 * and `themePath` turns a base name back into its path, so a walk changes in two calls rather than
 * in its logic. A published consumer resolves `@laticent/lattice/themes/<name>.css` through the
 * package's `exports` map instead (package.json).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT_THEMES = path.join(__dirname, '..', '..', 'themes');
const ROLE_RE = /\.(?:manifest\.json|essentials\.json|css)$/;

/** The theme a base name belongs to: `indaco-dark.manifest.json` → `indaco-dark`. */
const stemOf = (file) => file.replace(ROLE_RE, '');

/**
 * Every theme file's base name, and the loose files at the root, sorted: the listing a flat
 * `themes/` gave. Folders whose name starts with `_` or `.` are skipped, as every package walk does.
 * @param {string} [dir] a themes directory (default: the repo's)
 * @returns {string[]}
 */
function themeEntries(dir = ROOT_THEMES) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile()) out.push(e.name);
    else if (e.isDirectory() && !/^[_.]/.test(e.name)) {
      for (const f of fs.readdirSync(path.join(dir, e.name), { withFileTypes: true })) if (f.isFile()) out.push(f.name);
    }
  }
  return out.sort();
}

/**
 * The path of a theme file (or a loose file) from its base name: `indaco.css` →
 * `<dir>/indaco/indaco.css`; `theme.schema.json` → `<dir>/theme.schema.json`.
 * @param {string} dir
 * @param {string} file  a base name, as `themeEntries` lists it
 */
function themePath(dir, file) {
  if (ROLE_RE.test(file)) {
    const folder = path.join(dir, stemOf(file));
    if (fs.existsSync(path.join(folder, file)) || !fs.existsSync(path.join(dir, file))) return path.join(folder, file);
  }
  return path.join(dir, file);
}

/**
 * Where a theme file goes in ANOTHER themes directory (a test's mutated copy of the corpus), in
 * the folder shape: `<dir>/indaco/indaco.css`. Makes the folder.
 */
function themeTarget(dir, file) {
  const to = ROLE_RE.test(file) ? path.join(dir, stemOf(file), file) : path.join(dir, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  return to;
}

module.exports = { ROOT_THEMES, themeEntries, themePath, themeTarget };
