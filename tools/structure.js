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

// The workspace libraries in docs/src/lib/ that publish on their own (CLAUDE.md, the npm release).
const LIBRARIES = ['anima', 'cadenza', 'calco', 'lente', 'ltt', 'segno', 'suono', 'tavola', 'trama', 'vetrina'];

/**
 * Every part, bottom layer first. `match` is a path prefix (or a function); the first match wins.
 * Layers: 0 leaves and libraries · 1 core · 2 contracts over core · 3 the catalog · 4 adapters and
 * plugins · 5 the engine · 6 what uses the engine · 10+ the docs site · 20 tools.
 */
const PARTS = [
  ...LIBRARIES.map((name) => ({ part: `@laticent/${name}`, layer: 0, match: `docs/src/lib/${name}/` })),
  { part: 'lib/adaptive', layer: 0, match: 'lib/adaptive/' },
  { part: 'lib/fonts', layer: 0, match: 'lib/fonts/' },
  { part: 'lib/finishes', layer: 0, match: 'lib/finishes/' },
  { part: 'lib/exemplars', layer: 0, match: 'lib/exemplars/' },
  { part: 'lib/typography', layer: 0, match: 'lib/typography/' },
  { part: 'lib/motion', layer: 0, match: 'lib/motion/' },
  // A JSON Schema is a contract both sides read (the component, theme, plugin and package
  // formats), and imports nothing: its own part, at the bottom, wherever its folder is.
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
  // Pages, layouts, content collections and the site's build plugins; a NEW folder under docs/src/
  // matches nothing, so it fails until it is placed on a layer here.
  { part: 'site/pages', layer: 16, match: (f) => /^docs\/src\/(?:pages|layouts|content|plugins)\/|^docs\/src\/[^/]+$/.test(f) },
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
 * only when its header names a `tools/` script that exists AND whose source names the file: proof
 * that a build step writes it. Note what the exemption costs: through the registries the engine is
 * still WIRED to its plugins at runtime, by design; the gate holds the source-level dependencies.
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
    if (tool && fs.existsSync(path.join(ROOT, tool))) ok = fs.readFileSync(path.join(ROOT, tool), 'utf8').includes(path.basename(file));
  } catch {
    ok = false;
  }
  seamCache.set(file, ok);
  return ok;
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

function partOf(file) {
  for (const p of MATCH_ORDER) {
    const hit = typeof p.match === 'function' ? p.match(file) : file.startsWith(p.match);
    if (hit) return { name: typeof p.part === 'function' ? p.part(file) : p.part, layer: p.layer, plugin: !!p.plugin };
  }
  return null;
}

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
  graph.modules.push(...astroModules());
  return graph;
}

// A relative or `@/` import specifier in source text: `from '…'`, `import '…'`, `require('…')`,
// `import('…')`. Comments are stripped first, so a path quoted in prose is not one.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]((?:\.{1,2}|@)\/[^'"]+)['"]/g;
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1').replace(/`[^`]*`/g, '``');

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
    const specs = [...stripComments(src).matchAll(SPECIFIER)].map((x) => x[1]).filter((spec) => !spec.includes('node_modules'));
    if (specs.length) out.push(m.source);
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
function analyze(graph, { sanctioned = SANCTIONED_UPWARD, pluginSanctioned = SANCTIONED_PLUGIN_REACH } = {}) {
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
  const pluginReach = edges.filter((e) => e.a.plugin && e.a.name !== e.b.name && e.b.name !== 'lib/plugin-kit' && !/\/dist\//.test(e.to));
  const pluginOut = pluginReach.filter((e) => !Object.hasOwn(pluginSanctioned, reachKey(e)));
  const usedReach = new Set(pluginReach.map(reachKey));
  const staleReach = Object.keys(pluginSanctioned).filter((k) => !usedReach.has(k));
  const pluginIn = edges.filter((e) => e.b.plugin && e.a.name !== e.b.name && !isSeam(e.from) && e.a.name !== 'tools');

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
    inside,
    pluginOut: pluginOut.map((e) => `${e.from} -> ${e.to}`),
    pluginIn: pluginIn.map((e) => `${e.from} -> ${e.to}`),
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
  for (const f of result.unmapped) problems.push(`file belongs to no part (add it to PARTS in tools/structure.js): ${f}`);
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

module.exports = { PARTS, SANCTIONED_UPWARD, SANCTIONED_PLUGIN_REACH, partOf, isSeam, analyze, structureProblems, cruise, astroModules, unreadModules };

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
