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
  { part: 'lib/schemas', layer: 0, match: (f) => /^lib\/.*\.schema\.json$/.test(f) },
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
  { part: 'site/pages', layer: 15, match: 'docs/src/' },
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
 */
const isSeam = (file) => /^lib\/.*\.generated\.[a-z]+$/.test(file);

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
  const r = spawnSync(bin, ['--config', 'tools/structure.cruise.cjs', '--output-type', 'json', 'lib', 'lattice.js', 'docs/src', 'tools'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  if (r.error) throw r.error;
  if (!r.stdout) throw new Error(`dependency-cruiser produced no output:\n${r.stderr}`);
  return JSON.parse(r.stdout);
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
function analyze(graph) {
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
  const unsanctioned = upward.filter((e) => !Object.hasOwn(SANCTIONED_UPWARD, sanctionKey(e)));
  const usedSanctions = new Set(upward.map(sanctionKey));
  const staleSanctions = Object.keys(SANCTIONED_UPWARD).filter((k) => !usedSanctions.has(k));

  const pluginOut = edges.filter((e) => e.a.plugin && e.a.name !== e.b.name && e.b.name !== 'lib/plugin-kit' && !isSeam(e.from) && !/\/dist\//.test(e.to));
  const pluginIn = edges.filter((e) => e.b.plugin && e.a.name !== e.b.name && !isSeam(e.from) && e.a.name !== 'tools');

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
    staleSanctions,
    pluginOut: pluginOut.map((e) => `${e.from} -> ${e.to}`),
    pluginIn: pluginIn.map((e) => `${e.from} -> ${e.to}`),
    unmapped: graph.modules.filter((m) => !m.coreModule && !m.couldNotResolve && !/node_modules/.test(m.source) && !partOf(m.source)).map((m) => m.source),
  };
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
  return problems;
}

function printTable(result) {
  const pad = (s, n) => String(s).padStart(n);
  console.log(`${'part'.padEnd(26)}${pad('layer', 6)}${pad('files', 6)}${pad('lines', 8)}${pad('Ca', 4)}${pad('Ce', 4)}${pad('I', 6)}${pad('cohesion', 9)}`);
  for (const r of result.rows) {
    console.log(`${r.part.padEnd(26)}${pad(r.layer, 6)}${pad(r.files, 6)}${pad(r.lines, 8)}${pad(r.Ca, 4)}${pad(r.Ce, 4)}${pad(r.I.toFixed(2), 6)}${pad(r.cohesion.toFixed(2), 9)}`);
  }
}

module.exports = { PARTS, SANCTIONED_UPWARD, partOf, isSeam, analyze, structureProblems };

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const result = analyze(cruise());
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.has('--bless')) {
    const snapshot = {
      note: 'Per-part size and shape, from `node tools/structure.js --bless`. A record, not a gate: build:check fails on loops, upward imports and plugin-boundary breaks only. engineering/decisions/2026-10-11-codebase-structure.md.',
      parts: result.rows,
    };
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`wrote ${path.relative(ROOT, SNAPSHOT)}`);
  } else {
    const problems = structureProblems(result);
    if (!args.has('--check')) printTable(result);
    if (problems.length) {
      console.error(`\nstructure: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
      if (args.has('--check')) process.exit(1);
    } else console.log(args.has('--check') ? 'structure: no part loops, no upward imports, plugin boundary holds' : '\nno part loops, no upward imports, plugin boundary holds');
  }
}
