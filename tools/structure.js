#!/usr/bin/env node
/**
 * The codebase's PARTS, their LAYERS, and the measurements that keep them apart
 * (engineering/decisions/2026-10-11-codebase-structure.md).
 *
 * A part is a folder that should make sense on its own: `lib/core`, `lib/engine`, one plugin,
 * one workspace library, the Studio. Each part sits on a layer, and a part may import only parts
 * on its own layer or below. This tool builds the import graph with dependency-cruiser, maps
 * every file to its part, and reports:
 *
 *   - part LOOPS: groups of parts that can each reach the others through imports. A loop has no
 *     bottom, so nothing in it can be released, tested or understood on its own. Budget 0.
 *   - UPWARD imports: a part importing a part on a higher layer. Budget 0, plus the
 *     SANCTIONED_UPWARD list, each entry with its reason; a stale entry fails.
 *   - the PLUGIN BOUNDARY: a plugin (`lib/plugins/<name>/`) imports only its own folder and the
 *     plugin kit (`lib/plugin-kit/`); nothing else imports a plugin's folder except the
 *     generated registries. Both counts 0, so a plugin can move out of the repo as a folder.
 *   - per-part SIZE and SHAPE: files, lines, Ca (parts that import it), Ce (parts it imports),
 *     instability I = Ce/(Ca+Ce), and cohesion = imports that stay inside the part / all of the
 *     part's imports. Reported and snapshotted, not gated: they move with every honest change.
 *
 *   node tools/structure.js            # the table, the loops, the violations
 *   node tools/structure.js --check    # exit 1 on a loop, an upward import or a boundary break
 *   node tools/structure.js --json     # machine-readable
 *   node tools/structure.js --bless    # rewrite the snapshot, test/quality/structure.json
 *
 * The `--check` arm runs in build:check as a preflight gate (tools/build.js). The generated
 * registries (`lib/plugins/*.generated.*`) are SEAMS: the one place the engine is wired to its
 * plugins, so edges out of them are exempt from the layer and loop rules. That is the point of a
 * registry: code below asks for a plugin by name, and only the build-time list knows which exist.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'test', 'quality', 'structure.json');

// The workspace libraries in docs/src/lib/ that publish on their own (CLAUDE.md, the npm release):
// every folder there with its own `@laticent/*` package.json. Read from disk, not listed, so a new
// workspace lands on layer 0 the day it is added instead of failing as an upward import from lib/.
const LIBRARIES = fs.readdirSync(path.join(ROOT, 'docs', 'src', 'lib'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => {
    try {
      return /^@laticent\//.test(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'src', 'lib', d.name, 'package.json'), 'utf8')).name);
    } catch {
      return false;
    }
  })
  .map((d) => d.name)
  .sort();

/**
 * Every part, bottom layer first. `match` is a path prefix (or a function); the first match wins.
 * Layers: 0 leaves and libraries · 1 core · 2 contracts over core · 3 the catalog · 4 adapters and
 * plugins · 5 the engine · 6 what uses the engine · 10+ the docs site · 20 tools.
 */
const PARTS = [
  ...LIBRARIES.map((name) => ({ part: `@laticent/${name}`, layer: 0, library: true, match: `docs/src/lib/${name}/` })),
  { part: 'lib/adaptive', layer: 0, match: 'lib/adaptive/' },
  { part: 'lib/fonts', layer: 0, match: 'lib/fonts/' },
  { part: 'lib/finishes', layer: 0, match: 'lib/finishes/' },
  { part: 'lib/exemplars', layer: 0, match: 'lib/exemplars/' },
  { part: 'lib/typography', layer: 0, match: 'lib/typography/' },
  { part: 'lib/motion', layer: 0, match: 'lib/motion/' },
  // A JSON Schema is a contract both sides read (the component, theme, plugin and package
  // formats), and imports nothing: its own part, at the bottom, wherever its folder is.
  // The treatment vocabulary (`tint-*`, `mark-*`) as data: pure, require-free, read by the linter.
  { part: 'lib/base', layer: 0, match: 'lib/base/' },
  // The root manifest, read as data (a build stamps its version into the player core).
  { part: 'package.json', layer: 0, match: (f) => f === 'package.json' },
  { part: 'lib/schemas', layer: 0, match: (f) => /^lib\/(?!plugins\/[^/]+\/).*\.schema\.json$/.test(f) },
  { part: 'lib/core', layer: 1, match: 'lib/core/' },
  { part: 'lib/plugin-kit', layer: 3, match: 'lib/plugin-kit/' },
  { part: 'lib/theme', layer: 2, match: 'lib/theme/' },
  { part: 'lib/tokens', layer: 2, match: 'lib/tokens/' },
  { part: 'lib/integrations', layer: 2, match: 'lib/integrations/' },
  { part: 'lib/components', layer: 3, match: 'lib/components/' },
  { part: 'lib/forms', layer: 3, match: 'lib/forms/' },
  { part: 'lib/layout', layer: 3, match: 'lib/layout/' },
  // The package FORMAT: how a component, theme, finish or plugin folder is read, written and
  // stored. The commands that act on packages (add, gate, render) are lib/cli.
  { part: 'lib/packages', layer: 3, match: 'lib/packages/' },
  { part: 'lib/transformers', layer: 4, match: 'lib/transformers/' },
  { part: 'lib/plugins', layer: 4, match: (f) => /^lib\/plugins\/[^/]+$/.test(f) },
  { part: (f) => `lib/plugins/${f.split('/')[2]}`, layer: 4, plugin: true, match: 'lib/plugins/' },
  { part: 'lib/engine', layer: 5, match: 'lib/engine/' },
  { part: 'lib/authoring', layer: 6, match: 'lib/authoring/' },
  { part: 'lib/cli', layer: 6, match: 'lib/cli/' },
  { part: 'lib/concepts', layer: 6, match: 'lib/concepts/' },
  { part: 'lib/diagnostics', layer: 6, match: 'lib/diagnostics/' },
  { part: 'lib/export', layer: 6, match: 'lib/export/' },
  { part: 'lib/playground', layer: 6, match: 'lib/playground/' },
  { part: 'lib/runtime', layer: 6, match: 'lib/runtime/' },
  { part: 'lattice.js', layer: 7, match: (f) => f === 'lattice.js' },
  // The docs site. The bundles in docs/src/playground/*.generated.* are lib/ compiled for the
  // browser: built, never scanned, and the site's way into the engine.
  { part: 'site/bundles', layer: 9, match: (f) => /^docs\/src\/playground\/.*\.generated\./.test(f) },
  { part: 'site/styles', layer: 10, match: 'docs/src/styles/' },
  { part: 'site/lib', layer: 10, match: 'docs/src/lib/' },
  { part: 'site/ui', layer: 11, match: 'docs/src/components/ui/' },
  { part: 'site/playground', layer: 12, match: 'docs/src/playground/' },
  { part: 'site/components', layer: 13, match: 'docs/src/components/' },
  { part: 'site/studio', layer: 14, match: 'docs/src/components/studio/' },
  // The Craft lab is a page-sized tool built on Studio pieces (the code field), so it sits above.
  { part: 'site/craft', layer: 15, match: 'docs/src/components/craft/' },
  // So is the Playground's UI (its deck setup reuses the Studio's catalogs, pickers and slide pool),
  // and the prototype bake-offs, which stage Studio pieces side by side. Nothing below imports them.
  { part: 'site/playground-ui', layer: 15, match: 'docs/src/components/playground/' },
  { part: 'site/proto', layer: 15, match: 'docs/src/components/proto/' },
  // Pages, layouts, content collections and the site's build plugins; a NEW folder under docs/src/
  // matches nothing, so it fails until it is placed on a layer here.
  { part: 'site/pages', layer: 16, match: (f) => /^docs\/src\/(?:pages|layouts|content|plugins)\/|^docs\/src\/[^/]+$/.test(f) },
  // The conformance contracts: a harness over the engine that reads tools/ (the component-docs and
  // schema builders) and is run only by tools/. Each side imports the other, so it is part of tools.
  { part: 'tools', layer: 20, match: 'lib/conformance/' },
  { part: 'tools', layer: 20, match: 'tools/' },
];
// site/studio must win over site/components: order by specificity, not by layer.
const MATCH_ORDER = [...PARTS].sort((a, b) => specificity(b) - specificity(a));
function specificity(p) {
  return typeof p.match === 'string' ? p.match.length : 1000;
}

/**
 * A generated file under lib/ is a SEAM: a build step reads the parts above and writes a table or a
 * registry that the parts below read by name (the plugin registries, the pane and coda catalogs,
 * the reserved-class list). That is how a lower layer learns about a higher one without importing
 * it, so imports into and out of a seam are exempt from the layer and loop rules.
 *
 * The name alone does not make a seam, or any file called `x.generated.js` would bypass every rule.
 * A generated JSON file is pure data and imports nothing, so it is one. A generated JS file is one
 * only when its header names a `tools/` script that exists AND whose source names the file's whole
 * repo path: proof that a build step writes THIS file. The base name is not enough: a hand-written
 * `lib/core/dispatch.generated.js` would borrow the plugin registry's tool, and a substring match let
 * `registry.generated.js` borrow `chart-registry.generated.js`'s (the red team, #2997). Note what the
 * exemption costs: through the registries the engine is still WIRED to its plugins at runtime, by
 * design; the gate holds the source-level dependencies.
 */
const seamCache = new Map();
function isSeam(file) {
  if (!/^lib\/.*\.generated\.[a-z]+$/.test(file)) return false;
  if (file.endsWith('.json')) return true;
  if (seamCache.has(file)) return seamCache.get(file);
  let ok = false;
  try {
    const head = fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 600);
    const tool = /tools\/[\w./-]+\.(?:c|m)?js/.exec(head)?.[0];
    if (tool && fs.existsSync(path.join(ROOT, tool))) ok = namesPath(fs.readFileSync(path.join(ROOT, tool), 'utf8'), file);
  } catch {
    ok = false;
  }
  seamCache.set(file, ok);
  return ok;
}

/**
 * Whether a tool's source names `file` (a repo path) as a whole path: written out
 * (`lib/plugins/dispatch.generated.js`), or as `path.join` segments from the root
 * (`path.join(ROOT, 'lib', 'core', 'x.generated.js')`), directly or through a folder constant
 * (`const DIR = path.join(ROOT, 'lib', 'plugins')` … `path.join(DIR, 'x.generated.js')`).
 */
function namesPath(src, file) {
  let s = src.replace(/(['"])\s*,\s*['"]/g, '/');
  const dirs = [...s.matchAll(/\b([A-Z_][A-Z0-9_]*)\s*=\s*path\.(?:join|resolve)\(\s*ROOT\s*,\s*['"]([^'"]+)['"]\s*\)/g)];
  for (const [, name, dir] of dirs) s = s.replace(new RegExp(`\\b${name}\\s*,\\s*['"]`, 'g'), `'${dir}/`);
  const esc = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w./-])${esc}(?![\\w.-])`).test(s);
}

/**
 * A plugin reaching past the kit, admitted on purpose: `plugin -> part` with its reason. Fails on a
 * stale entry. chart-family is the one today: it is the chart bucket's dispatcher, and its
 * generated registry names each chart component's kernel, so it cannot leave the repo without the
 * chart components. It is in-tree by nature; the plugins meant to move to npm are the others.
 */
const SANCTIONED_PLUGIN_REACH = {
  'lib/plugins/chart-family -> lib/components':
    "the chart bucket's dispatcher: its generated registry (shared/chart-registry.generated.js) names every chart component's kernel, so the plugin is in-tree by nature",
};

/**
 * Upward imports admitted on purpose. Each entry is `from -> to` (part names) with its reason;
 * the check fails on an entry that no longer matches any import, so the list cannot rot.
 */
const SANCTIONED_UPWARD = {};

/** The lowest layer a host tool sits on (lib/authoring, lib/cli, lib/export, …): see `viaHostApi`. */
const HOST_TOOL_LAYER = 6;

/**
 * How many files the plugins' `hostApi` lists hold together. Lower it in the commit that empties an
 * entry (followups.d/2630-p2-host-tools-read-plugins-as-data.md); raising it is a design change for the
 * owner, not a fix for a failing gate.
 */
const HOST_API_CEILING = 14;

/**
 * How many lib/core files serve exactly one other part and no file in core: each is a candidate to
 * move beside its one user. Same-layer imports are free, so core is the gate's easiest way out
 * (decision note §5, the "two consumers" rule); this holds that rule as a ceiling. It fails on growth
 * only, since an honest change elsewhere can give a core file its second consumer; lower it when
 * `npm run structure` shows fewer.
 */
const CORE_SINGLE_CONSUMER_CEILING = 50;

/** The repository's own package name: a self-import by name resolves at runtime but not in the graph. */
const SELF_NAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;

function partOf(file) {
  for (const p of MATCH_ORDER) {
    const hit = typeof p.match === 'function' ? p.match(file) : file.startsWith(p.match);
    if (hit) return { name: typeof p.part === 'function' ? p.part(file) : p.part, layer: p.layer, plugin: !!p.plugin, library: !!p.library };
  }
  return null;
}

// A `createRequire(<repo root>)` specifier (`./lib/…` in a tool) resolves from the root, not the file.
const rootRelative = (spec) => spec.startsWith('./') && ['', '.js', '.mjs', '.cjs', '.json'].some((ext) => fs.existsSync(path.join(ROOT, spec + ext)));

function cruise() {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'depcruise');
  // The cache makes a repeat run about 1.3s instead of about 6.5s (measured on a 4-core sandbox);
  // dependency-cruiser re-reads any file whose content changed, committed or not.
  const cache = path.join(ROOT, 'node_modules', '.cache', 'dependency-cruiser-structure');
  const r = spawnSync(bin, ['--config', 'tools/structure.cruise.cjs', '--cache', cache, '--output-type', 'json', 'lib', 'lattice.js', 'docs/src', 'tools'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  if (r.error) throw r.error;
  if (!r.stdout) throw new Error(`dependency-cruiser produced no output:\n${r.stderr}`);
  const graph = JSON.parse(r.stdout);
  graph.unread = unreadModules(graph);
  graph.excludedImports = excludedImports(graph);
  graph.modules.push(...astroModules());
  return graph;
}

// A relative or `@/` import specifier in source text: `from '…'`, `import '…'`, `require('…')`,
// `import('…')`. Comments are stripped first, so a path quoted in prose is not one.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]((?:\.{1,2}|@)\/[^'"]+)['"]/g;
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1').replace(/`[^`]*`/g, '``');

// A relative specifier counts toward the unread-file rule only when it names a file dependency-cruiser
// scans: one that exists (a string that merely LOOKS like an import, such as esbuild's `stdin` source,
// names none) and is not in a tree the cruise config excludes (tests, examples), whose edges it drops.
const CRUISE_EXCLUDE = require('./structure.cruise.cjs').options.exclude.path.map((re) => new RegExp(re));
const SPEC_EXTS = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '/index.js', '/index.ts'];
function scannedTarget(from, spec) {
  if (spec.startsWith('@/')) return true;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const hit = SPEC_EXTS.map((e) => base + e).find((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
  return !!hit && !CRUISE_EXCLUDE.some((re) => re.test(hit));
}

/**
 * Modules dependency-cruiser listed with no local imports although their source has some. It exits
 * 0 on a parse error and reports the file with no dependencies, which would hide every edge the
 * file has, so the gate fails instead of passing a file it could not read.
 */
function unreadModules(graph) {
  const out = [];
  for (const m of graph.modules) {
    if (m.coreModule || m.couldNotResolve || /node_modules|\/dist\/|\.json$|\.css$/.test(m.source)) continue;
    if (m.dependencies.some((d) => !d.coreModule && !/node_modules/.test(d.resolved || ''))) continue;
    let src;
    try {
      src = fs.readFileSync(path.join(ROOT, m.source), 'utf8');
    } catch {
      continue;
    }
    const specs = [...stripComments(src).matchAll(SPECIFIER)].map((x) => x[1]).filter((spec) => !spec.includes('node_modules') && scannedTarget(m.source, spec));
    if (specs.length) out.push(m.source);
  }
  return out;
}

/**
 * Imports from a part into a tree the cruise config excludes (`test/`, `examples/`, …). dependency-cruiser
 * drops those edges, so `lib/core -> test/x.js -> lib/authoring` would pass every rule unseen (the red
 * team, #2997). Shipping code has no reason to import a test or an example; `tools/` (the top layer,
 * where an extra edge cannot hide an upward import or a loop) may, for its test helpers.
 */
function excludedImports(graph) {
  const out = [];
  for (const m of graph.modules) {
    if (m.coreModule || m.couldNotResolve || /node_modules|\/dist\//.test(m.source)) continue;
    const part = partOf(m.source);
    if (!part || part.name === 'tools') continue;
    let src;
    try {
      src = fs.readFileSync(path.join(ROOT, m.source), 'utf8');
    } catch {
      continue;
    }
    for (const [, spec] of stripComments(src).matchAll(SPECIFIER)) {
      if (!/^\.{1,2}\//.test(spec) || spec.includes('node_modules')) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(m.source), spec));
      const hit = SPEC_EXTS.map((e) => base + e).find((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
      if (hit && CRUISE_EXCLUDE.some((re) => re.test(hit))) out.push(`${m.source} -> ${hit}`);
    }
  }
  return out;
}

/**
 * The imports in every `.astro` file's front matter (the `---` block), which dependency-cruiser
 * does not read: a component or layout in an `.astro` file sits on its folder's layer like any other
 * file, so its imports are held to the same rules.
 */
function astroModules() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.astro')) out.push(rel);
    }
  };
  walk('docs/src');
  const resolve = (from, spec) => {
    const base = spec.startsWith('@/') ? path.join('docs/src', spec.slice(2)) : path.join(path.dirname(from), spec);
    const clean = base.replace(/\?.*$/, '');
    for (const ext of ['', '.ts', '.tsx', '.js', '.mjs', '.astro', '.json', '/index.ts', '/index.js']) {
      if (fs.existsSync(path.join(ROOT, clean + ext)) && fs.statSync(path.join(ROOT, clean + ext)).isFile()) return (clean + ext).split(path.sep).join('/');
    }
    return null;
  };
  return out.map((file) => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'))?.[1] ?? '';
    const deps = [];
    SPECIFIER.lastIndex = 0;
    for (const m of stripComments(fm).matchAll(SPECIFIER)) {
      const to = resolve(file, m[1]);
      if (to && !/\.test\./.test(to)) deps.push({ resolved: to });
    }
    return { source: file, dependencies: deps };
  });
}

const countLines = (file) => {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length;
  } catch {
    return 0;
  }
};

/** Every import between two known files, as { from, to, a, b } with a and b their parts. */
function edgesOf(graph) {
  const edges = [];
  const files = new Map();
  for (const m of graph.modules) {
    if (m.coreModule || m.couldNotResolve || /node_modules/.test(m.source)) continue;
    const a = partOf(m.source);
    if (!a) continue;
    files.set(m.source, a);
    for (const d of m.dependencies) {
      if (d.coreModule || d.couldNotResolve || /node_modules/.test(d.resolved)) continue;
      const b = partOf(d.resolved);
      if (b) edges.push({ from: m.source, to: d.resolved, a, b });
    }
  }
  return { edges, files };
}

function tarjan(nodes, adj) {
  let i = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const on = new Set();
  const out = [];
  const visit = (v) => {
    idx.set(v, i);
    low.set(v, i++);
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) || []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do {
        w = stack.pop();
        on.delete(w);
        c.push(w);
      } while (w !== v);
      if (c.length > 1) out.push(c.sort());
    }
  };
  for (const v of nodes) if (!idx.has(v)) visit(v);
  return out;
}

/** The whole analysis, from a dependency-cruiser graph (exported so the unit test can feed one). */
/**
 * What each plugin's manifest says about its edges, by part:
 *
 *   requires — the plugins it depends on. A plugin may import a plugin it requires (the host only
 *              ever admits it with them, and on npm it is a declared package dependency), and no
 *              other; `checks` composes its pill through `pills` that way.
 *   hostApi  — IN-TREE ONLY, and a bridge: the plugin's own files that host tools ABOVE the plugin
 *              layer (the linter, the inline editors, the Marp export, the Studio) may import, because
 *              they still call a first-party plugin's code to author a deck. Each entry is a file to
 *              turn into manifest data, generic host code or a sandboxed call (the one-model decision,
 *              followups.d/2630-p2-host-tools-read-plugins-as-data.md); the list only shrinks.
 */
function pluginManifests(dir = path.join(ROOT, 'lib', 'plugins')) {
  const requires = new Map();
  const hostApi = new Map();
  const nameToPart = new Map();
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = fs.readdirSync(path.join(dir, e.name)).find((f) => f.endsWith('.manifest.json'));
    if (!file) continue;
    const m = JSON.parse(fs.readFileSync(path.join(dir, e.name, file), 'utf8'));
    const part = `lib/plugins/${e.name}`;
    nameToPart.set(m.name, part);
    requires.set(part, m.requires || []);
    hostApi.set(part, new Set((m.hostApi || []).map((f) => `${part}/${f}`)));
  }
  for (const [part, names] of requires) requires.set(part, new Set(names.map((n) => nameToPart.get(n)).filter(Boolean)));
  return { requires, hostApi };
}
const pluginRequires = (dir) => pluginManifests(dir).requires;

function analyze(graph, { sanctioned = SANCTIONED_UPWARD, pluginSanctioned = SANCTIONED_PLUGIN_REACH, requires, hostApi, hostApiCeiling, coreSingleConsumerCeiling } = {}) {
  if (!requires || !hostApi) {
    const m = pluginManifests();
    requires ??= m.requires;
    // The ratchet holds the live manifests; a synthetic graph passes its own hostApi and ceiling.
    if (!hostApi) {
      hostApiCeiling ??= HOST_API_CEILING;
      coreSingleConsumerCeiling ??= CORE_SINGLE_CONSUMER_CEILING;
    }
    hostApi ??= m.hostApi;
  }
  const { edges, files } = edgesOf(graph);
  const parts = new Map();
  const get = (p) => parts.get(p.name) || parts.set(p.name, { ...p, files: 0, lines: 0, internal: 0, out: new Map(), inc: new Set() }).get(p.name);
  for (const [file, p] of files) {
    // A built bundle stands for the code it was built from; its size is not ours to count twice.
    const row = get(p);
    if (p.name === 'site/bundles' || /\/dist\//.test(file)) continue;
    row.files += 1;
    row.lines += countLines(file);
  }
  for (const e of edges) {
    if (/\/dist\//.test(e.from)) continue;
    const row = get(e.a);
    get(e.b);
    if (e.a.name === e.b.name) row.internal += 1;
    else {
      row.out.set(e.b.name, (row.out.get(e.b.name) || 0) + 1);
      parts.get(e.b.name).inc.add(e.a.name);
    }
  }

  const ruled = edges.filter((e) => e.a.name !== e.b.name && !isSeam(e.from) && !isSeam(e.to) && !/\/dist\//.test(e.from));
  const adj = new Map();
  for (const e of ruled) (adj.get(e.a.name) || adj.set(e.a.name, new Set()).get(e.a.name)).add(e.b.name);
  const loops = tarjan([...parts.keys()], adj).map((members) => ({
    members,
    // The imports inside the loop that point UP a layer (or across, inside one layer): the ones to cut.
    cut: ruled.filter((e) => members.includes(e.a.name) && members.includes(e.b.name) && e.a.layer <= e.b.layer).map((e) => `${e.from} -> ${e.to}`),
  }));

  const upward = ruled.filter((e) => e.b.layer > e.a.layer);
  const sanctionKey = (e) => `${e.a.name} -> ${e.b.name}`;
  const unsanctioned = upward.filter((e) => !Object.hasOwn(sanctioned, sanctionKey(e)));
  const usedSanctions = new Set(upward.map(sanctionKey));
  const staleSanctions = Object.keys(sanctioned).filter((k) => !usedSanctions.has(k));

  const reachKey = (e) => `${e.a.name} -> ${e.b.name}`;
  // A workspace library (`@laticent/segno`, …) publishes on its own: a plugin on npm would depend on it
  // from npm, as it would on any package, so reaching it is not reaching past the kit.
  const declared = (e) => e.b.plugin && !!requires.get(e.a.name)?.has(e.b.name);
  const pluginReach = edges.filter((e) => e.a.plugin && e.a.name !== e.b.name && e.b.name !== 'lib/plugin-kit' && !e.b.library && !declared(e));
  const pluginOut = pluginReach.filter((e) => !Object.hasOwn(pluginSanctioned, reachKey(e)));
  const usedReach = new Set(pluginReach.map(reachKey));
  const staleReach = Object.keys(pluginSanctioned).filter((k) => !usedReach.has(k));
  // A host tool importing a file the plugin lists in `hostApi` (the bridge, see pluginManifests). Host
  // tools sit on HOST_TOOL_LAYER or above: the linter, the exports, the CLI, the site. The engine (layer
  // 5) renders every plugin through tables and services, so it asks for a service like code below it.
  const viaHostApi = (e) => !e.a.plugin && e.b.plugin && e.a.layer >= HOST_TOOL_LAYER && !!hostApi.get(e.b.name)?.has(e.to);
  const pluginIn = edges.filter((e) => e.b.plugin && e.a.name !== e.b.name && !isSeam(e.from) && e.a.name !== 'tools' && !declared(e) && !viaHostApi(e));
  // A listed file nothing outside imports is stale: the list only shrinks, so the entry goes.
  const hostApiUsed = new Set(edges.filter(viaHostApi).map((e) => e.to));
  const staleHostApi = [...hostApi.values()].flatMap((set) => [...set]).filter((f) => !hostApiUsed.has(f)).sort();
  // "Only shrinks", held by a ratchet like the route budget's: more entries than HOST_API_CEILING fail,
  // and so do fewer, until the ceiling is lowered to match, so a removed entry cannot quietly come back.
  const hostApiCount = [...hostApi.values()].reduce((n, set) => n + set.size, 0);

  const inside = insideParts(edges, files);

  const rows = [...parts.values()]
    .filter((p) => p.files > 0)
    .map((p) => {
      const ce = p.out.size;
      const ca = p.inc.size;
      const outEdges = [...p.out.values()].reduce((s, n) => s + n, 0);
      return {
        part: p.name,
        layer: p.layer,
        files: p.files,
        lines: p.lines,
        Ca: ca,
        Ce: ce,
        I: ce + ca ? +(ce / (ce + ca)).toFixed(2) : 0,
        cohesion: p.internal + outEdges ? +(p.internal / (p.internal + outEdges)).toFixed(2) : 1,
      };
    })
    .sort((a, b) => a.layer - b.layer || a.part.localeCompare(b.part));

  return {
    rows,
    loops,
    upward: unsanctioned.map((e) => `${e.from} (${e.a.name}, layer ${e.a.layer}) -> ${e.to} (${e.b.name}, layer ${e.b.layer})`),
    staleSanctions: [...staleSanctions, ...staleReach.map((k) => `${k} (SANCTIONED_PLUGIN_REACH)`)],
    unread: graph.unread || [],
    // A relative import that resolves to nothing: a file that moved and an importer that did not.
    // A path into node_modules is a dependency question, not a structure one (and is absent where a
    // CI job skips that install), so it is not counted.
    unresolved: graph.modules.flatMap((m) =>
      partOf(m.source) && !/\/dist\//.test(m.source)
        ? m.dependencies.filter((d) => d.couldNotResolve && /^(\.{1,2}|@)\//.test(d.module || '') && !d.module.includes('node_modules') && !rootRelative(d.module)).map((d) => `${m.source} -> ${d.module}`)
        : [],
    ),
    inside,
    pluginOut: pluginOut.map((e) => `${e.from} -> ${e.to}`),
    pluginIn: pluginIn.map((e) => `${e.from} -> ${e.to}`),
    staleHostApi,
    hostApiCount,
    hostApiCeiling,
    excludedImports: graph.excludedImports || [],
    coreSingleConsumer: inside['lib/core']?.singleConsumer.length ?? 0,
    coreSingleConsumerCeiling,
    // `require('@laticent/lattice')` from inside the repo is Node's self-reference: it loads the engine
    // (package.json `exports`), but dependency-cruiser cannot resolve it, so the edge is invisible and
    // core could reach the engine unseen (the red team, #2997). Inside the repo, import by path.
    selfImports: graph.modules.flatMap((m) =>
      partOf(m.source) ? m.dependencies.filter((d) => d.module === SELF_NAME || String(d.module || '').startsWith(`${SELF_NAME}/`)).map((d) => `${m.source} -> ${d.module}`) : [],
    ),
    unmapped: graph.modules.filter((m) => !m.coreModule && !m.couldNotResolve && !/node_modules/.test(m.source) && !partOf(m.source)).map((m) => m.source),
  };
}

/**
 * Inside each large part (50+ files): how its files connect. Cross-part cohesion cannot see a folder
 * of unrelated files, since a low layer imports little outside itself whatever it holds; these two
 * numbers can. ISLANDS are groups of files with no import between them, and SINGLE-CONSUMER files
 * are imported by no file in their own part and by exactly one other part: each is a candidate to
 * move beside its one user rather than sit in a shared layer. Reported, never gated.
 */
function insideParts(edges, files) {
  const byPart = new Map();
  for (const [file, p] of files) {
    if (/\/dist\//.test(file) || p.name === 'site/bundles') continue;
    (byPart.get(p.name) || byPart.set(p.name, []).get(p.name)).push(file);
  }
  const out = {};
  for (const [name, members] of byPart) {
    if (members.length < 50) continue;
    const set = new Set(members);
    const adj = new Map(members.map((f) => [f, new Set()]));
    const importers = new Map(members.map((f) => [f, { inside: 0, parts: new Set() }]));
    for (const e of edges) {
      if (!set.has(e.to)) continue;
      if (set.has(e.from)) {
        adj.get(e.from).add(e.to);
        adj.get(e.to).add(e.from);
        importers.get(e.to).inside += 1;
      } else if (e.a.name !== name) importers.get(e.to).parts.add(e.a.name);
    }
    const seen = new Set();
    const sizes = [];
    for (const f of members) {
      if (seen.has(f)) continue;
      let n = 0;
      const stack = [f];
      seen.add(f);
      while (stack.length) {
        const v = stack.pop();
        n += 1;
        for (const w of adj.get(v)) {
          if (seen.has(w)) continue;
          seen.add(w);
          stack.push(w);
        }
      }
      sizes.push(n);
    }
    sizes.sort((x, y) => y - x);
    const singleConsumer = members
      .filter((f) => importers.get(f).inside === 0 && importers.get(f).parts.size === 1)
      .map((f) => `${f} <- ${[...importers.get(f).parts][0]}`)
      .sort();
    out[name] = { files: members.length, islands: sizes.length, largestIsland: sizes[0], isolated: sizes.filter((n) => n === 1).length, singleConsumer };
  }
  return out;
}

/** Everything --check fails on, as one message per problem; [] when the structure holds. */
function structureProblems(result) {
  const problems = [];
  for (const l of result.loops) problems.push(`part loop: ${l.members.join(' <-> ')}${l.cut.length ? `\n      cut one of:\n        ${l.cut.join('\n        ')}` : ''}`);
  for (const u of result.upward) problems.push(`upward import: ${u}`);
  for (const s of result.staleSanctions) problems.push(`stale SANCTIONED_UPWARD entry (no import matches it any more): ${s}`);
  for (const e of result.pluginOut) problems.push(`plugin reaches past the plugin kit: ${e}`);
  for (const e of result.pluginIn) problems.push(`code imports a plugin's folder directly (use the registry or a service): ${e}`);
  for (const f of result.staleHostApi || []) problems.push(`stale hostApi entry (nothing outside the plugin imports it, or the file is gone; remove it from the manifest): ${f}`);
  if (result.hostApiCeiling != null && result.hostApiCount > result.hostApiCeiling) problems.push(`hostApi grew: the manifests list ${result.hostApiCount} files, over HOST_API_CEILING (${result.hostApiCeiling}); the bridge only shrinks, so read the plugin through a service or its manifest instead`);
  if (result.hostApiCeiling != null && result.hostApiCount < result.hostApiCeiling) problems.push(`hostApi shrank to ${result.hostApiCount} files: lower HOST_API_CEILING in tools/structure.js from ${result.hostApiCeiling} to ${result.hostApiCount}, so it cannot grow back`);
  if (result.coreSingleConsumerCeiling != null && result.coreSingleConsumer > result.coreSingleConsumerCeiling) problems.push(`lib/core grew a single-consumer file: ${result.coreSingleConsumer} files there serve exactly one other part, over CORE_SINGLE_CONSUMER_CEILING (${result.coreSingleConsumerCeiling}); keep a file beside its one user, and move it down when a second part needs it (\`npm run structure\` lists them)`);
  for (const e of result.selfImports || []) problems.push(`imports the repository by its package name, which the gate cannot follow; import it by path: ${e}`);
  for (const e of result.excludedImports || []) problems.push(`imports a file the gate does not read (tests, examples and other excluded trees hide their edges; only tools/ may): ${e}`);
  for (const f of result.unmapped) problems.push(`file belongs to no part (add it to PARTS in tools/structure.js): ${f}`);
  for (const u of result.unresolved || []) problems.push(`import resolves to no file (moved or misspelled): ${u}`);
  for (const f of result.unread) problems.push(`dependency-cruiser read no imports from a file that has some (a parse error hides its edges): ${f}`);
  return problems;
}

function printTable(result) {
  const pad = (s, n) => String(s).padStart(n);
  console.log(`${'part'.padEnd(26)}${pad('layer', 6)}${pad('files', 6)}${pad('lines', 8)}${pad('Ca', 4)}${pad('Ce', 4)}${pad('I', 6)}${pad('cohesion', 9)}`);
  for (const r of result.rows) {
    console.log(`${r.part.padEnd(26)}${pad(r.layer, 6)}${pad(r.files, 6)}${pad(r.lines, 8)}${pad(r.Ca, 4)}${pad(r.Ce, 4)}${pad(r.I.toFixed(2), 6)}${pad(r.cohesion.toFixed(2), 9)}`);
  }
}

module.exports = { PARTS, SANCTIONED_UPWARD, SANCTIONED_PLUGIN_REACH, HOST_TOOL_LAYER, HOST_API_CEILING, CORE_SINGLE_CONSUMER_CEILING, pluginManifests, pluginRequires, partOf, isSeam, analyze, structureProblems, cruise, astroModules, unreadModules };

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const result = analyze(cruise());
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.has('--bless')) {
    const snapshot = {
      note: 'Per-part size and shape, from `node tools/structure.js --bless`. A record, not a gate: build:check fails on loops, upward imports and plugin-boundary breaks only. engineering/decisions/2026-10-11-codebase-structure.md.',
      parts: result.rows,
      inside: Object.fromEntries(Object.entries(result.inside).map(([k, v]) => [k, { files: v.files, islands: v.islands, largestIsland: v.largestIsland, isolated: v.isolated, singleConsumer: v.singleConsumer.length }])),
    };
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`wrote ${path.relative(ROOT, SNAPSHOT)}`);
  } else {
    const problems = structureProblems(result);
    if (!args.has('--check')) {
      printTable(result);
      console.log('\ninside the large parts (islands = file groups with no import between them):');
      for (const [name, x] of Object.entries(result.inside)) {
        console.log(`  ${name.padEnd(18)} ${x.files} files, ${x.islands} islands (largest ${x.largestIsland}, ${x.isolated} isolated), ${x.singleConsumer.length} single-consumer files`);
      }
    }
    if (problems.length) {
      console.error(`\nstructure: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
      if (args.has('--check')) process.exit(1);
    } else console.log(args.has('--check') ? 'structure: no part loops, no upward imports, plugin boundary holds' : '\nno part loops, no upward imports, plugin boundary holds');
  }
}
