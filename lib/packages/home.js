/**
 * The CLI's package store: `~/.lattice/packages/<type>/<name>/`
 * (engineering/decisions/2026-09-23-portable-packages.md §6, owner decision §9 Q3).
 *
 * User-global on purpose: install once, use in every deck. Two overrides, so CI and tests
 * never touch a real home directory:
 *
 *   LATTICE_HOME=<dir>     the store is <dir>/packages
 *   --packages <dir>       for one run, the store IS <dir>
 *
 * Every folder here is a package exactly as the repo and the Studio's zip hold it, so a
 * Studio export unzipped into it works, and `lattice packages export` zips one back out.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TYPES } = require('./kinds.js');
const { readPackage } = require('./read.js');

/** The store root: `--packages` wins, then `$LATTICE_HOME/packages`, then `~/.lattice/packages`. */
function packagesRoot({ flag, env = process.env } = {}) {
  if (flag) return path.resolve(flag);
  const home = env.LATTICE_HOME ? path.resolve(env.LATTICE_HOME) : path.join(os.homedir(), '.lattice');
  return path.join(home, 'packages');
}

/** A package folder's files as `name → text`. Package files are text; an asset is read as bytes. */
function readFolder(dir) {
  const files = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const p = path.join(dir, e.name);
    files[e.name] = /\.(css|md|json|svg|js|txt)$/i.test(e.name) ? fs.readFileSync(p, 'utf8') : fs.readFileSync(p);
  }
  return files;
}

/**
 * Every installed package, read strictly (a folder someone hand-edited into a bad state is
 * reported, not skipped), sorted by type then name.
 * @returns {Array<{ type: string, name: string, dir: string, ok: boolean, errors: string[] }>}
 */
function listInstalled(root) {
  const out = [];
  for (const type of TYPES) {
    const base = path.join(root, type);
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const dir = path.join(base, e.name);
      const r = readPackage(readFolder(dir), { type, folder: e.name, strict: true });
      out.push({ type, name: r.ok ? r.pkg.name : e.name, dir, ok: r.ok, errors: r.errors, pkg: r.pkg });
    }
  }
  return out;
}

/** One installed package that reads cleanly, or null. */
function findInstalled(root, type, name) {
  const dir = path.join(root, type, name);
  if (!fs.existsSync(path.join(dir, `${name}.manifest.json`))) return null;
  const r = readPackage(readFolder(dir), { type, folder: name, strict: true });
  return r.ok ? { dir, pkg: r.pkg } : null;
}

/**
 * Is this zip entry name one an honest archive never holds? A `..` segment, an absolute path, a
 * drive letter, a backslash, or a NUL. A `.` segment is allowed: it names the same folder, and
 * some packers write `./name` (the inversion lens on #617's first cut, which refused them). JSZip resolves `..` out of a name as it LOADS
 * (`../../x` arrives as `x`, the raw name kept in `unsafeOriginalName`) but leaves an absolute
 * name absolute, so the caller passes the RAW name and the import refuses the whole archive
 * rather than installing a cleaned-up guess at it (#617).
 * @param {string} name the entry's name as written in the archive
 * @returns {boolean}
 */
function unsafeEntryName(name) {
  const s = String(name);
  if (!s || s.includes('\\') || s.includes('\0') || s.startsWith('/') || /^[A-Za-z]:/.test(s)) return true;
  return s.split('/').some((seg) => seg === '..');
}

/** One path segment the store may create: no separator, not `.`/`..`, not empty. */
const safeSegment = (s) => typeof s === 'string' && s !== '' && s !== '.' && s !== '..' && s === path.basename(s) && !s.includes('\\') && !s.includes('\0');

/**
 * Write a package's files into the store, replacing any earlier copy. Returns the folder.
 * The ONE place the store writes, so every importer (the CLI today, the desktop app later)
 * goes through it and its path checks; none adds path logic of its own (threat model §8).
 */
function install(root, type, name, files) {
  // `type` and `name` come from a manifest the spine already validated, and each file name has
  // no directory part. All three are checked again here, because a caller that skipped the spine
  // would otherwise join `../../x` straight into a path.
  if (!TYPES.includes(type)) throw new Error(`refusing to write a package of type ${JSON.stringify(type)}`);
  if (!safeSegment(name)) throw new Error(`refusing to write a package named ${JSON.stringify(name)}`);
  const dir = path.join(root, type, name);
  // Write beside the target, then swap it in: a write that fails part-way leaves the
  // earlier copy in place instead of a half-written folder.
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(dir), `.${name}-`));
  try {
    for (const [file, body] of Object.entries(files)) {
      // A file name comes from a package the spine already read, so it has no directory part —
      // checked again here because this is the one place the store writes.
      if (!safeSegment(file)) throw new Error(`refusing to write ${JSON.stringify(file)}`);
      fs.writeFileSync(path.join(staging, file), body);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

/** Remove an installed package. Returns whether there was one. */
function uninstall(root, type, name) {
  // A recursive delete: the same checks as `install`, so `../..` can never name a folder above the store.
  if (!TYPES.includes(type) || !safeSegment(name)) throw new Error(`refusing to remove ${JSON.stringify(`${type}/${name}`)}`);
  const dir = path.join(root, type, name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

module.exports = { packagesRoot, readFolder, listInstalled, findInstalled, install, uninstall, unsafeEntryName };
