/**
 * The package kinds — one row per type (engineering/decisions/2026-09-23-portable-packages.md §3.3).
 *
 * A package is a folder named for the item:
 *
 *     <name>/
 *       <name>.manifest.json      required — owns the name, declares the type
 *       <name>.<role>             the files this table names
 *
 * The manifest's `name` is the identity. The folder name and every role file's
 * `<name>.` prefix are PROJECTIONS of it; `read.js` checks them and `write.js`
 * rewrites them. Adding a kind means adding a row here.
 *
 * `role` is the part of a file name after `<name>.`, so a component's stylesheet
 * role is `styles.css` and a theme's is `css` (`indaco.css`).
 *
 * Pure data. No fs, so it bundles into the browser like the rest of the spine.
 */

/** The package format this spine reads and writes. A manifest may say `"format": 1`. */
const FORMAT = 1;

/** The manifest role every kind carries. */
const MANIFEST_ROLE = 'manifest.json';

/**
 * @typedef {object} Kind
 * @property {string} type       the manifest `type` value
 * @property {string} root       where shipped packages of this type live in the repo
 * @property {'flat'|'folder'|'bucketed'} layout
 *   flat     — `<root>/<name>.<role>` (themes today; phase 5 moves them into folders)
 *   folder   — `<root>/<name>/<name>.<role>`
 *   bucketed — `<root>/<bucket>/<name>/<name>.<role>` (components)
 * @property {string[]} required  roles every package of this type has
 * @property {string[]} optional  roles it may have
 * @property {string[]} code      roles that hold JavaScript: their presence makes a CODE package (§3.5)
 * @property {string[]} outputs   build outputs: they sit in the folder but never travel
 * @property {boolean} assets     whether other files (images, data) may ride in the folder
 */

/** @type {Readonly<Record<string, Kind>>} */
const KINDS = Object.freeze({
  theme: Object.freeze({
    type: 'theme',
    root: 'themes',
    layout: 'flat',
    required: Object.freeze([MANIFEST_ROLE, 'css']),
    optional: Object.freeze(['essentials.json']),
    code: Object.freeze([]),
    outputs: Object.freeze([]),
    assets: false,
  }),
  component: Object.freeze({
    type: 'component',
    root: 'lib/components',
    layout: 'bucketed',
    required: Object.freeze([MANIFEST_ROLE, 'styles.css', 'gallery.md']),
    optional: Object.freeze(['docs.md', 'transform.js']),
    code: Object.freeze(['transform.js']),
    outputs: Object.freeze(['gallery.light.pdf', 'gallery.dark.pdf']),
    // Gallery images (team-profile portraits, logo-wall marks) and data files
    // (the map basemaps) live beside a shipped component.
    assets: true,
  }),
  finish: Object.freeze({
    type: 'finish',
    root: 'lib/finishes',
    layout: 'folder',
    required: Object.freeze([MANIFEST_ROLE, 'recipe.json']),
    optional: Object.freeze([]),
    code: Object.freeze([]),
    // The CSS is generated from the recipe (§3.6), so it never travels.
    outputs: Object.freeze(['finish.css']),
    assets: false,
  }),
  motion: Object.freeze({
    type: 'motion',
    root: 'lib/motion',
    layout: 'folder',
    required: Object.freeze([MANIFEST_ROLE, 'scene.json', 'poster.svg']),
    optional: Object.freeze(['art.svg']),
    code: Object.freeze([]),
    outputs: Object.freeze([]),
    assets: false,
  }),
});

/** Every type, in a stable order. */
const TYPES = Object.freeze(Object.keys(KINDS));

/** A package name: a lowercase slug starting with a letter (the theme and component rule). */
const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** Every role a kind knows, longest first, so `gallery.light.pdf` wins over a shorter suffix. */
function rolesOf(kind) {
  return [...kind.required, ...kind.optional, ...kind.outputs].sort((a, b) => b.length - a.length);
}

/** The file name a role projects to for `name`. */
function fileName(name, role) {
  return `${name}.${role}`;
}

/** The kind for a type, or throw naming the known ones. */
function kindOf(type) {
  const k = KINDS[type];
  if (!k) throw new Error(`unknown package type ${JSON.stringify(type)} (known: ${TYPES.join(', ')})`);
  return k;
}

module.exports = { FORMAT, MANIFEST_ROLE, KINDS, TYPES, NAME_RE, rolesOf, fileName, kindOf };
