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
 * @property {'folder'|'bucketed'} layout
 *   folder   — `<root>/<name>/<name>.<role>` (themes, finishes, motion)
 *   bucketed — `<root>/<bucket>/<name>/<name>.<role>` (components)
 * @property {string[]} required  roles every package of this type has
 * @property {string[]} optional  roles it may have
 * @property {string[]} code      roles that hold JavaScript: their presence makes a CODE package (§3.5)
 * @property {string[]} outputs   build outputs: they sit in the folder but never travel
 * @property {boolean} assets     whether other files (images, data) may ride in the folder
 * @property {RegExp} nameRe      what a name of this type may look like (default NAME_RE)
 * @property {string[]} [codeDirs] subfolders of CODE a shipped package of this type may carry
 *                                (default none): modules (.js/.cjs/.mjs) and a README.md. In-tree
 *                                only: the strict repo walk allows exactly these; the importers read
 *                                top-level files only, so an imported package never brings one
 */

/** @type {Readonly<Record<string, Kind>>} */
const KINDS = Object.freeze({
  theme: Object.freeze({
    type: 'theme',
    root: 'themes',
    layout: 'folder',
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
    // A finish's name is used as `finish-<name>`, so it may start with a digit (the Studio
    // has always saved "2024 Launch" as `2024-launch`); a theme or component name is used
    // bare, as a `@theme` name or a class, and must start with a letter.
    nameRe: /^[a-z0-9][a-z0-9-]*$/,
  }),
  motion: Object.freeze({
    type: 'motion',
    root: 'lib/motion',
    layout: 'folder',
    // The note's table lists the poster as required. The Studio's motion records have
    // always allowed a scene without one (the poster is a still the author may not have
    // rendered yet), and a package format that refused them would strand every such
    // record on export. So the poster is optional; a SHIPPED motion package still
    // carries one by review.
    required: Object.freeze([MANIFEST_ROLE, 'scene.json']),
    optional: Object.freeze(['poster.svg', 'art.svg']),
    code: Object.freeze([]),
    outputs: Object.freeze([]),
    assets: false,
    // Motion is inlined into a deck and never named in one (§5), so, like a finish, its
    // name may start with a digit — the Studio's scene slugs always could.
    nameRe: /^[a-z0-9][a-z0-9-]*$/,
  }),
  // A plugin teaches Lattice something new — a syntax, a fence — that works on any slide; a component
  // that is designed around one declares it in its own manifest's `plugins` block
  // (engineering/decisions/2026-09-27-plugin-system.md §4.1). The manifest declares what it
  // contributes; `syntax.mjs` (grammar, pure), `render.js` (renderers), `hydrate.js` (the browser
  // half), `bake.js` (the CLI half, Node-side — phase D), `highlight.js` (a highlight.js grammar for
  // its code fences), `dispatch.js` (the module that calls an extension point's fillers — phase F, the
  // chart family) and `styles.css` (token-only CSS) say how, and the build checks the two agree. Fixtures are required because a plugin with no case cannot show it
  // works; docs because they are the author's contract (HARD RULE #6).
  plugin: Object.freeze({
    type: 'plugin',
    root: 'lib/plugins',
    layout: 'folder',
    required: Object.freeze([MANIFEST_ROLE, 'docs.md', 'fixtures.md']),
    // `inline.js` (an inline-code kind), `services.js` (functions other code asks the host for),
    // `data.generated.js` (data its kernels read only through lib/plugins/plugin-data.js, so a deck
    // that does not use the plugin never loads it) and `vocab.generated.js` (the small generated
    // table its light modules read): the contribution points the icons plugin added
    // (engineering/decisions/2026-09-29-inline-icons.md § 6a). A plugin's SOURCES for a generated
    // file live outside the package, in an `_`-prefixed folder the spine does not walk.
    // `dispatch.js`: the module that calls an extension point's fillers (phase F, the chart family).
    optional: Object.freeze(['syntax.mjs', 'render.js', 'hydrate.js', 'bake.js', 'highlight.js', 'dispatch.js', 'styles.css',
      'inline.js', 'services.js', 'data.generated.js', 'vocab.generated.js']),
    code: Object.freeze(['syntax.mjs', 'render.js', 'hydrate.js', 'bake.js', 'highlight.js', 'dispatch.js', 'inline.js', 'services.js']),
    outputs: Object.freeze([]),
    assets: false,
    // `shared/` — the plugin's own shared modules, imported by its role modules (Mermaid's init
    // directive, render worker, reorientation and motion roles, which both its halves use, HARD RULE
    // #1). A role is one file named for the plugin, so a plugin with several such modules has no role for
    // them; the folder is where they go. NOT "kernels/": phase F gives "kernel" a package meaning (a
    // contribution point a component fills, plugin-system §5), and one word must not name both.
    // IN-TREE ONLY (plugin-system §11, #2509 P5). The zip and folder importers read only a package's
    // top-level files (lib/packages/cli.js `readSource`, home.js), so a zip's `shared/` is DROPPED,
    // never installed; an npm plugin's layout is settled with phase G.
    // `vendor/` — a third-party library the plugin OWNS a committed copy of (its manifest's
    // `payload.vendored`, with the version and SHA-256 the build checks): Mermaid's build, which every
    // surface reads from here, so no user downloads it and no install changes it
    // (lib/plugins/payload-path.js). In-tree only, like `shared/`.
    codeDirs: Object.freeze(['shared', 'vendor']),
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
