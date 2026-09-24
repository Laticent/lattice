/**
 * The package spine — one shape for themes, components, finishes and motion
 * (engineering/decisions/2026-09-23-portable-packages.md §3.4).
 *
 *   kinds.js   the descriptor table: one row per type
 *   read.js    files → validated package (schema-free identity + role checks)
 *   write.js   package → files, projections rewritten from the manifest
 *   index.js   THIS FILE: packages → the generated index, and the in-memory registry
 *   fs.js      the build's folder walk (the only part that touches the filesystem;
 *              it is not re-exported here, so this entry point bundles into the browser)
 *
 * The registry is what `packages.add / list / remove` operate on. It knows which names
 * are SHIPPED, so the reserved-name rule (§3.7) reads its list from the generated index
 * rather than a hand-kept copy that can drift.
 */

const kinds = require('./kinds.js');
const { readPackage, roleOf } = require('./read.js');
const { writePackage, stampManifest } = require('./write.js');

const { TYPES, kindOf } = kinds;

/** The suffix a user package takes when it would shadow a shipped name (§3.7). */
const RESERVED_SUFFIX = '-custom';

/**
 * The generated index for a set of read packages: type, name, repo path, the role
 * files present, and whether the package carries code. Sorted by type then name, so
 * the committed file only changes when a package does.
 *
 * @param {Array<{ pkg: object, path: string }>} entries
 */
function buildIndex(entries) {
  const packages = entries
    .map(({ pkg, path }) => ({
      type: pkg.type,
      name: pkg.name,
      path,
      roles: Object.keys(pkg.roles).sort(),
      ...(pkg.code ? { code: true } : {}),
    }))
    .sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(TYPES.map((t) => [t, packages.filter((p) => p.type === t).length]));
  return { format: kinds.FORMAT, counts, packages };
}

/**
 * An in-memory registry over the shipped index plus whatever a surface adds.
 *
 *   add(pkg)                 register a user package; a shipped name is renamed to
 *                            `<name>-custom` (the returned entry says which name it got,
 *                            and `replaced` says whether it took over an earlier entry)
 *   list({ type })           shipped + user entries, each with its `source`
 *   get(type, name)          one entry, or undefined
 *   remove(type, name)       user packages only; removing a shipped one throws
 *   reservedNames(type)      the shipped names of a type
 *   unreservedName(type, n)  `n`, or `n-custom` when `n` is shipped
 *
 * @param {{ packages?: Array<{type: string, name: string}> }} [index]  a `buildIndex` result
 */
function createRegistry(index = { packages: [] }) {
  const shipped = new Map();
  for (const p of index.packages || []) shipped.set(`${p.type}/${p.name}`, { ...p, source: 'shipped' });
  const user = new Map();
  const key = (type, name) => `${kindOf(type).type}/${name}`;

  // The engine's own names, reserved though no package ships them: `lattice` is the base
  // theme every palette imports, so a user theme under that name would replace it.
  const engine = new Set(['theme/lattice']);
  const reservedNames = (type) => new Set([...[...shipped.values()].filter((p) => p.type === type).map((p) => p.name), ...[...engine].filter((k) => k.startsWith(`${type}/`)).map((k) => k.slice(type.length + 1))]);
  const isReserved = (type, name) => shipped.has(key(type, name)) || engine.has(key(type, name));
  const unreservedName = (type, name) => (isReserved(type, name) ? `${name}${RESERVED_SUFFIX}` : name);

  return {
    add(pkg, { source = 'user' } = {}) {
      const name = unreservedName(pkg.type, pkg.name);
      const renamed = name !== pkg.name;
      // A rename reaches the manifest too, so nothing reading `entry.pkg.manifest` sees
      // the shipped name. File names follow on `writePackage`, which derives them from `name`.
      const stored = renamed ? { ...pkg, name, manifest: { ...pkg.manifest, name } } : pkg;
      const k = key(pkg.type, name);
      const entry = { type: pkg.type, name, source, pkg: stored, renamedFrom: renamed ? pkg.name : undefined, replaced: user.has(k) };
      user.set(k, entry);
      return entry;
    },
    list({ type } = {}) {
      return [...shipped.values(), ...user.values()]
        .filter((p) => !type || p.type === type)
        .sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.name.localeCompare(b.name));
    },
    get(type, name) {
      return user.get(key(type, name)) || shipped.get(key(type, name));
    },
    remove(type, name) {
      const k = key(type, name);
      if (shipped.has(k) && !user.has(k)) throw new Error(`${type}/${name} is shipped with Lattice and can't be removed`);
      return user.delete(k);
    },
    reservedNames,
    unreservedName,
  };
}

module.exports = {
  ...kinds,
  RESERVED_SUFFIX,
  readPackage,
  roleOf,
  writePackage,
  stampManifest,
  buildIndex,
  createRegistry,
};
