/**
 * The package spine's filesystem adapter: the ONE walk that finds shipped packages
 * (engineering/decisions/2026-09-23-portable-packages.md §3.4, "Build").
 *
 * It lists folders and reads only what identity needs — the manifest, and a theme's
 * stylesheet for its `@theme` projection. Every other file is passed to `read.js` as
 * `null`, so a component's gallery PDFs are never loaded to be walked past.
 *
 * Kept out of `index.js` on purpose: the rest of the spine bundles into the browser,
 * and this file needs `fs`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { KINDS, TYPES, MANIFEST_ROLE, rolesOf } = require('./kinds.js');
const { readPackage } = require('./read.js');

const ROOT = path.resolve(__dirname, '..', '..');
// The component buckets, from the manifest schema — the one list `loadAll` walks by too, so the
// package index and every catalog agree on which folders are buckets.
const COMPONENT_BUCKETS = require('../components/manifest.schema.json').properties.bucket.enum;

/** A directory name the walk never enters: private (`_…`) or hidden (`.…`). */
const skipped = (name) => name.startsWith('_') || name.startsWith('.');

/**
 * Every component folder under a component root, in the shapes `loadAll` accepts:
 *
 *   <root>/<bucket>/<name>/<name>.manifest.json   the shipped shape
 *   <root>/<name>/<name>.manifest.json             a folder at the root (fixtures)
 *   <root>/<name>/manifest.json                    the pre-dotted legacy name
 *   <root>/<name>.json                             a flat legacy manifest
 *
 * `isBucket(name)` says which root directories are buckets. A bucket folder that
 * itself holds `<bucket>/<bucket>.manifest.json` is read as a component, as
 * `loadAll` always did.
 *
 * @returns {Array<{ dir: string|null, folder: string|null, manifest: string, label: string }>}
 *   absolute paths; `dir`/`folder` are null for a flat legacy manifest
 */
function listComponentFolders(root, { isBucket = () => true } = {}) {
  const out = [];
  const inDir = (parent, name, { lone = true } = {}) => {
    const dotted = path.join(parent, name, `${name}.${MANIFEST_ROLE}`);
    if (fs.existsSync(dotted)) return { dir: path.join(parent, name), folder: name, manifest: dotted, label: `${name}/${name}.${MANIFEST_ROLE}` };
    const legacy = path.join(parent, name, MANIFEST_ROLE);
    if (fs.existsSync(legacy)) return { dir: path.join(parent, name), folder: name, manifest: legacy, label: `${name}/${MANIFEST_ROLE}` };
    // A folder whose one manifest carries ANOTHER name — a renamed folder, or a manifest
    // renamed without its folder. It used to be skipped as "no component here", so the
    // package silently vanished from every catalog and no gate saw it. It is listed now,
    // and the spine's strict read reports the disagreement.
    if (!lone) return null;
    const others = fs.readdirSync(path.join(parent, name)).filter((f) => f.endsWith(`.${MANIFEST_ROLE}`));
    if (others.length === 1) return { dir: path.join(parent, name), folder: name, manifest: path.join(parent, name, others[0]), label: `${name}/${others[0]}` };
    return null;
  };
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isFile()) {
      if (entry.name.endsWith('.json') && !entry.name.endsWith('.schema.json')) {
        out.push({ dir: null, folder: null, manifest: path.join(root, entry.name), label: entry.name });
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (isBucket(entry.name)) {
      // A bucket reads as a component only by its OWN name. The lone-manifest fallback
      // stays off here, or one stray manifest in a bucket would hide every component in it.
      const self = inDir(root, entry.name, { lone: false });
      if (self) {
        out.push(self);
        continue;
      }
      const bucketRoot = path.join(root, entry.name);
      for (const child of fs.readdirSync(bucketRoot, { withFileTypes: true })) {
        if (!child.isDirectory() || child.name.startsWith('_')) continue;
        const hit = inDir(bucketRoot, child.name);
        if (hit) out.push({ ...hit, label: `${entry.name}/${hit.label}` });
      }
      continue;
    }
    const hit = inDir(root, entry.name);
    if (hit) out.push(hit);
    // A folder that is neither a bucket nor a component but HOLDS components is a new bucket
    // nobody registered. Say so: walked as a component it finds nothing, and every component
    // in it would vanish from the catalogs without a gate noticing.
    else if (fs.readdirSync(path.join(root, entry.name), { withFileTypes: true }).some((c) => c.isDirectory() && !c.name.startsWith('_') && inDir(path.join(root, entry.name), c.name))) {
      throw new Error(`${entry.name}/ holds component folders but is not a known bucket — add it to the bucket enum in lib/components/manifest.schema.json`);
    }
  }
  return out;
}

/** What is wrong with a shipped package folder's subfolders, for its kind (`kind.codeDirs`). */
function subfolderErrors(dir, kind) {
  const errors = [];
  // A kind that admits assets (a component) keeps its old reading: a subfolder is not a package
  // file and is left alone. A kind that admits none is held to its declared folders.
  if (kind.assets && !kind.codeDirs) return errors;
  const allowed = kind.codeDirs || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // A symlink is never followed (`isDirectory()` is false for one), so it is refused outright:
    // whatever it points at would ship in the package unseen.
    if (e.isSymbolicLink()) {
      errors.push(`${e.name} is a symlink: a ${kind.type} folder holds real files only`);
      continue;
    }
    if (!e.isDirectory() || skipped(e.name)) continue;
    if (!allowed.includes(e.name)) {
      errors.push(`${e.name}/ is not a ${kind.type} folder${allowed.length ? ` (a ${kind.type} may carry ${allowed.map((d) => `${d}/`).join(', ')})` : ''}`);
      continue;
    }
    // `vendor/` holds third-party library COPIES — a build, a stylesheet, fonts, a render page with
    // its assets, a LICENSE — so it is not held to the module rule. What may be in it is the plugin
    // resolver's call (lib/plugins/resolve.js): every file must be covered by a copy the manifest
    // records and hashes. Here, only that the tree is real files, at any depth, since a symlink
    // would ship whatever it points at unseen and the resolver's walk does not follow one.
    if (e.name === 'vendor') {
      errors.push(...vendorTreeErrors(path.join(dir, e.name), e.name, kind));
      continue;
    }
    // EVERY entry of a code folder is checked, `_` and `.` names too: the folder is shipped whole.
    for (const f of fs.readdirSync(path.join(dir, e.name), { withFileTypes: true })) {
      if (!f.isFile() || !(/\.(?:c?js|mjs)$/.test(f.name) || f.name === 'README.md')) errors.push(`${e.name}/${f.name} is not a module: ${e.name}/ holds .js, .cjs and .mjs files and a README.md`);
    }
  }
  return errors;
}

/** Every entry under a `vendor/` tree that is not a real file or folder (see subfolderErrors). */
function vendorTreeErrors(abs, rel, kind) {
  const errors = [];
  for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
    if (f.isDirectory()) errors.push(...vendorTreeErrors(path.join(abs, f.name), `${rel}/${f.name}`, kind));
    else if (!f.isFile()) errors.push(`${rel}/${f.name} is not a real file: a ${kind.type} folder holds real files only`);
  }
  return errors;
}

/** A folder's files as `name → contents`, with contents only for the files `needs` picks. */
function folderFiles(dir, needs) {
  const files = {};
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    files[f.name] = needs(f.name) ? fs.readFileSync(path.join(dir, f.name), 'utf8') : null;
  }
  return files;
}

/**
 * The package folders of a FOLDER-layout directory, by name: `name → [file names]`, each folder's
 * own files only. Sorted by name. This is the enumeration the theme tools share (themes moved into
 * `themes/<name>/` in phase 5), so a walk over themes is here rather than in every tool. A folder
 * whose name a walk skips (`_…`, `.…`) is not listed, and nor are loose files beside the folders
 * (the README, the schema, the audit report).
 *
 * @param {string} type  a folder-layout type
 * @param {string} [dir] the directory (default: the kind's repo root)
 * @returns {Map<string, string[]>}
 */
function listFolderPackages(type, dir) {
  const kind = KINDS[type];
  if (!kind || kind.layout !== 'folder') throw new Error(`listFolderPackages: ${type} is not a folder-layout type`);
  const base = dir || path.join(ROOT, kind.root);
  const out = new Map();
  for (const e of fs.readdirSync(base, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    if (!e.isDirectory() || skipped(e.name)) continue;
    out.set(e.name, fs.readdirSync(path.join(base, e.name), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name).sort());
  }
  return out;
}

/**
 * Discover every shipped package, of the given types, and read each one STRICTLY
 * (projections must already match — this is the repo's identity gate).
 *
 * @param {{ root?: string, types?: string[] }} [opts]
 * @returns {Array<{ type: string, path: string, result: ReturnType<typeof readPackage> }>}
 *   `path` is repo-relative with forward slashes; `result.ok` false carries the errors
 */
function discoverPackages({ root = ROOT, types = TYPES } = {}) {
  const out = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  for (const type of types) {
    const kind = KINDS[type];
    const base = path.join(root, kind.root);
    if (!fs.existsSync(base)) continue;
    const needs = (f) => f.endsWith(`.${MANIFEST_ROLE}`) || f === MANIFEST_ROLE || (type === 'theme' && f.endsWith('.css'));

    const folders =
      kind.layout === 'bucketed'
        ? listComponentFolders(base, { isBucket: (name) => COMPONENT_BUCKETS.includes(name) }).filter((f) => f.dir)
        : fs
            .readdirSync(base, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !skipped(e.name))
            .map((e) => ({ dir: path.join(base, e.name), folder: e.name }));
    for (const { dir, folder } of folders.sort((a, b) => a.dir.localeCompare(b.dir))) {
      const result = readPackage(folderFiles(dir, needs), { type, folder, strict: true });
      // A subfolder the kind does not declare (`kind.codeDirs`) is refused: `folderFiles` reads only the
      // folder's own files, so without this a folder of anything would ride beside a package
      // unseen. A declared one holds scripts and a README only — it is code, never assets.
      const dirErrors = subfolderErrors(dir, kind);
      out.push({ type, path: rel(dir), result: dirErrors.length ? { ok: false, errors: [...(result.errors || []), ...dirErrors] } : result });
    }
  }
  return out;
}

module.exports = { ROOT, discoverPackages, listComponentFolders, listFolderPackages, rolesOf };
