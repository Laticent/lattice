#!/usr/bin/env node
/**
 * Build the browser playground bundle.
 *
 *   lib/playground/index.js  →  docs/public/playground/lattice-playground.js
 *
 * This bundles the shared markdown-it plugins (lib/integrations/markdown-it/
 * plugins.js) + the transformer registry into one IIFE that runs the engine's
 * render path CLIENT-SIDE for the docs-site playground. It lives under docs/
 * (not dist/) on purpose: it's a documentation-site asset, not part of the
 * npm engine package, so it stays out of the published tarball.
 *
 * The bundle is large (markdown-it), so it is MINIFIED. esbuild output is
 * deterministic for a pinned esbuild version, so the --check byte-diff is
 * stable in CI.
 *
 * KaTeX is deliberately EXCLUDED (~78.5KB gzip / see
 * engineering/decisions/2026-07-10-landing-perf-katex-defer.md §4): the
 * math plugin's KaTeX, which Node runs behind a wall (lib/core/katex-wall.js,
 * required by math.render.js), is swapped for lib/engine/katex-browser-stub.js
 * for THIS build only (katexStubPlugin), so neither KaTeX nor the wall's
 * WebAssembly reaches the bundle — a Node/CLI build of the same renderer
 * (lattice.js, the npm package) still requires the wall, since esbuild never
 * runs there. The real
 * KaTeX ships as a separate on-demand bundle — tools/build-katex-provider.js
 * → lattice-katex.js — loaded only when a deck actually has math.
 *
 * THE ESM BUILD (engineering/decisions/2026-10-14-engine-spine.md). The same engine is also built
 * as ES modules into docs/public/playground/esm/, which is what the docs site loads:
 *   esm/engine.js         lib/playground/index.js, with an EMPTY chart-kernel table
 *   esm/chart-<layout>.js one per chart kernel; importing it registers the kernel
 *   esm/bg-image-lift.js  the Marp export's SOURCE lift of `![bg]` (lib/core/bg-image-lift.js), built on its own
 *   esm/callout-place.js  the callout layer's lane, markers and readers (callout-place.js), which only a deck
 *                         that writes `@callout` loads, so no chart kernel carries them
 *   esm/code-record.js    the code record's writer (lib/plugins/code/shared/record-edit.js), which only
 *                         the Studio's code-block options panel loads, so the lint core does not carry it
 *   esm/chunk-*.js        modules more than one entry needs, shared by esbuild's code splitting
 *   esm/chunks.json       each entry's full static chunk list, so the host can preload it at once
 * The host loads the kernels a deck names before the synchronous render (docs/src/lib/
 * ensure-charts.ts), the way it loads KaTeX. The single-file IIFE above keeps every kernel and is
 * unchanged: tools/export-chart-svg.js and the e2e fixtures still read it.
 *
 * Flags:
 *   --watch    Rebuild on source change.
 *   --check    Build to a temp file and diff against the committed bundle.
 *              Exits 1 on drift.
 *   --silent   Suppress the success log line.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'lib', 'playground', 'index.js');
const OUT_FILE = path.join(ROOT, 'docs', 'public', 'playground', 'lattice-playground.js');
const ESM_DIR = path.join(ROOT, 'docs', 'public', 'playground', 'esm');

const argv = process.argv.slice(2);
const watch = argv.includes('--watch');
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;

// The code plugin's grammar loader, swapped for its browser half. In Node,
// lib/plugins/code/shared/load-grammar.js requires each highlight.js grammar the first time a fence
// names it; a browser cannot, so load-grammar.browser.js loads nothing and the preview fetches each
// grammar a deck names, one file per language (tools/build-hljs-languages.js,
// docs/src/lib/ensure-hljs-language.ts). The swap keeps the 192 grammar modules out of the bundle;
// before the code plugin, the bundle carried highlight.js's 36-language `common` build for every
// deck, code or not (engineering/decisions/2026-10-15-code-plugin.md §4.3).
// Matched on the resolved path, exact file, so nothing else named load-grammar is touched.
const CODE_LOAD_GRAMMAR = path.join(ROOT, 'lib', 'plugins', 'code', 'shared', 'load-grammar.js');
const CODE_LOAD_GRAMMAR_BROWSER = path.join(ROOT, 'lib', 'plugins', 'code', 'shared', 'load-grammar.browser.js');
const codeGrammarBrowserPlugin = {
  name: 'code-grammar-browser',
  setup(build) {
    build.onResolve({ filter: /load-grammar(\.js)?$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path.endsWith('.js') ? args.path : `${args.path}.js`);
      return resolved === CODE_LOAD_GRAMMAR ? { path: CODE_LOAD_GRAMMAR_BROWSER } : undefined;
    });
  },
};

// ONE markdown-it. The package ships two builds behind its `exports` map — `require` gets
// dist/index.cjs.js, `import` gets index.mjs — and the engine reaches it both ways:
// lib/engine/index.js `require`s it, lib/core/boundary-parser.mjs `import`s it. esbuild honors
// each condition, so the bundle carried TWO markdown-its and two copies of `entities` (measured
// 2026-10-14: about 175 KB raw of duplicate). Every bare specifier now resolves to the CommonJS
// build; an `import` of it still works, because esbuild hands a CJS module's exports to a default
// import. Exact match: an esbuild `alias` matches subpaths by prefix.
const MARKDOWN_IT_CJS = require.resolve('markdown-it');
const oneMarkdownItPlugin = {
  name: 'one-markdown-it',
  setup(build) {
    build.onResolve({ filter: /^markdown-it$/ }, () => ({ path: MARKDOWN_IT_CJS }));
  },
};

// Each plugin's DATA stays out of this bundle (the icons plugin's ~60 KB of drawings): the engine
// requires lib/plugins/data.generated.js, whose lazy `require`s esbuild would follow, so that one
// file resolves to a stub that registers no loader. The data ships as its own on-demand script
// (tools/build-plugin-data-bundles.js), which docs/src/lib/render-engine.ts loads before rendering
// a deck that uses the plugin. Matched on the resolved file, so every relative spelling is caught.
const PLUGIN_DATA = path.join(ROOT, 'lib', 'plugins', 'data.generated.js');
const PLUGIN_DATA_STUB = path.join(ROOT, 'lib', 'plugins', 'data-browser-stub.js');
// The math plugin's walled KaTeX → the stub (see the header). Matched by the RESOLVED path, so the
// relative `require('../../core/katex-wall.js')` in math.render.js is what it catches.
const KATEX_WALL = path.join(ROOT, 'lib', 'core', 'katex-wall.js');
const katexStubPlugin = {
  name: 'katex-browser-stub',
  setup(build) {
    build.onResolve({ filter: /katex-wall\.js$/ }, (args) =>
      path.resolve(args.resolveDir, args.path) === KATEX_WALL ? { path: path.join(ROOT, 'lib', 'engine', 'katex-browser-stub.js') } : undefined);
  },
};

const pluginDataStubPlugin = {
  name: 'plugin-data-stub',
  setup(build) {
    build.onResolve({ filter: /data\.generated(\.js)?$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path.endsWith('.js') ? args.path : `${args.path}.js`);
      return resolved === PLUGIN_DATA ? { path: PLUGIN_DATA_STUB } : undefined;
    });
  },
};

// The split capacity map, baked in. The browser has no component manifests to read, and the
// structural split (lib/core/structural-split.js) cannot run without the per-component capacity
// and recipe it reads. Projected by the SAME `splitCapacityFrom` the CLI calls, from the same
// manifests, so the live preview and the export cut a deck identically.
const SPLIT_CAPACITY = require('../lib/core/structural-split').splitCapacityFrom(
  require('../lib/components').loadAll(path.join(ROOT, 'lib', 'components')),
);

const BUILD_OPTIONS = {
  entryPoints: [ENTRY],
  define: { __LATTICE_SPLIT_CAPACITY__: JSON.stringify(SPLIT_CAPACITY) },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome109'],
  minify: true,
  legalComments: 'none',
  // The code plugin's browser grammar loader (see codeGrammarBrowserPlugin), one markdown-it (see
  // oneMarkdownItPlugin), and the KaTeX stub in place of the math plugin's copy.
  plugins: [codeGrammarBrowserPlugin, oneMarkdownItPlugin, pluginDataStubPlugin, katexStubPlugin],
  banner: {
    js: '/* Auto-generated by tools/build-playground.js — DO NOT EDIT. Source: lib/playground/index.js. Rebuild: npm run playground:build */',
  },
};

// THE LAZY CHART REGISTRY, ESM build only. chart-registry.generated.js requires all 24 kernels; the
// ESM engine gets a stand-in with the same tables and an empty KERNELS map, which each chart entry
// fills. Matched on the resolved path, like the stubs above. Never in the IIFE: export-chart-svg needs
// every kernel there.
const CHART_REGISTRY = path.join(ROOT, 'lib', 'plugins', 'chart-family', 'shared', 'chart-registry.generated.js');
const chartRegistry = require(CHART_REGISTRY);
const CHART_KERNEL_FILES = Object.fromEntries(
  [...fs.readFileSync(CHART_REGISTRY, 'utf8').matchAll(/^const (\w+) = require\('([^']+)'\);$/gm)].map(([, id, rel]) => [id, path.join(path.dirname(CHART_REGISTRY), `${rel}.js`)]),
);
// layout token -> kernel file, read off the generated `"layout": { transformSection: id.transformSection }` rows
const CHART_KERNELS = Object.fromEntries(
  [...fs.readFileSync(CHART_REGISTRY, 'utf8').matchAll(/^ {2}"([a-z0-9-]+)": \{ transformSection: (\w+)\.transformSection \},?$/gm)].map(([, layout, id]) => [layout, CHART_KERNEL_FILES[id]]),
);
if (Object.keys(CHART_KERNELS).length !== chartRegistry.LAYOUTS.length || Object.values(CHART_KERNELS).some((f) => !f || !fs.existsSync(f))) {
  throw new Error(`build-playground: could not read every kernel file out of ${path.relative(ROOT, CHART_REGISTRY)}; its generated shape changed`);
}
// A plugin namespace's module path, repo-relative with `/` on every OS: esbuild hashes that text
// into the chunk names, so it must not carry the checkout folder or the platform's separator.
const repoPath = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const lazyChartRegistryPlugin = {
  name: 'lazy-chart-registry',
  setup(build) {
    build.onResolve({ filter: /chart-registry\.generated(\.js)?$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path.endsWith('.js') ? args.path : `${args.path}.js`);
      // The path is repo-relative: esbuild keys a module outside the `file` namespace by its path
      // text as given, and that key feeds every `chunk-[hash]` name. An absolute path made the
      // chunk names, the engine's asset version, and so the docs site's bytes depend on where the
      // repo was checked out (followups.d/2708-p1). onLoad never reads it.
      return resolved === CHART_REGISTRY ? { path: repoPath(CHART_REGISTRY), namespace: 'lazy-chart-registry' } : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: 'lazy-chart-registry' }, () => ({
      contents: `module.exports = ${JSON.stringify({ LAYOUTS: chartRegistry.LAYOUTS, FIGURE_CLASSES: chartRegistry.FIGURE_CLASSES, KERNELS: {}, PLUGIN: chartRegistry.PLUGIN })};`,
      loader: 'js',
    }));
    // Each chart entry: register its kernel in the one shared table.
    build.onResolve({ filter: /^lattice-chart:/ }, (args) => ({ path: args.path.slice('lattice-chart:'.length), namespace: 'lattice-chart' }));
    build.onLoad({ filter: /.*/, namespace: 'lattice-chart' }, (args) => ({
      contents:
        `import registry from ${JSON.stringify(CHART_REGISTRY)};\n` +
        `import kernel from ${JSON.stringify(CHART_KERNELS[args.path])};\n` +
        `registry.KERNELS[${JSON.stringify(args.path)}] = { transformSection: kernel.transformSection };\n`,
      resolveDir: ROOT,
      loader: 'js',
    }));
  },
};

// THE CALLOUT LAYER'S HEAVY HALF, ESM build only (design note 2026-10-20-callout-placement.md § 10).
// callout-layer.js reaches callout-place.js (the lane, the markers, legend-svg.js) through
// callout-place-load.js. Here that file becomes a stand-in that answers null, so no chart kernel carries the
// half, and `callout-place` is an entry of its own that installs it into the one shared layer. The host
// loads that entry for a deck that writes a callout (docs/src/lib/ensure-charts.ts `ensureCalloutLayer`).
// Never in the IIFE or Node, where the `require` stays.
const CALLOUT_CHUNK_DIR = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family');
const CALLOUT_PLACE_LOAD = path.join(CALLOUT_CHUNK_DIR, 'callout-place-load.js');
const calloutPlaceEsmPlugin = {
  name: 'callout-place-esm',
  setup(build) {
    build.onResolve({ filter: /callout-place-load(\.js)?$/ }, (args) => {
      const resolved = path.resolve(args.resolveDir, args.path.endsWith('.js') ? args.path : `${args.path}.js`);
      return resolved === CALLOUT_PLACE_LOAD ? { path: repoPath(CALLOUT_PLACE_LOAD), namespace: 'callout-place-stub' } : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: 'callout-place-stub' }, () => ({
      contents: 'module.exports = () => null; module.exports.lazy = true;',
      loader: 'js',
    }));
    build.onResolve({ filter: /^lattice-callout-place$/ }, () => ({ path: 'callout-place', namespace: 'lattice-callout-place' }));
    build.onLoad({ filter: /.*/, namespace: 'lattice-callout-place' }, () => ({
      contents:
        `import layer from ${JSON.stringify(path.join(CALLOUT_CHUNK_DIR, 'callout-layer.js'))};\n` +
        `import place from ${JSON.stringify(path.join(CALLOUT_CHUNK_DIR, 'callout-place.js'))};\n` +
        'layer.install(place);\n',
      resolveDir: ROOT,
      loader: 'js',
    }));
  },
};

// THE LINT CORE, as an entry of this build (engineering/decisions/2026-10-14-engine-spine.md §10).
// It is the same entry tools/build-authoring-core.js writes for vitest, so the docs site and the
// tests run one source. Built here, it shares every chunk it has in common with the engine (one
// markdown-it, one copy of each lib/core reader) instead of shipping its own.
//
// ONE MODULE IT MUST NOT SHARE: lib/core/boundary-parser.mjs. Its parser instance holds the enabled
// plugin block rules, and the lint narrows them per deck (authoring-door.js) to the deck's plugin
// admission. Shared, that would narrow the engine's parser too, and the engine's output would depend
// on whether the lint core had loaded yet. So the lint modules that reach the parser (lint-core, notes-core, slide-boundaries) get their
// own module instance of it: same source, its own `boundaryParser` and `rulesGeneration`.
// assertLintParserIsolated() fails the build if either side ever reaches the other's copy.
const { ENTRY_CONTENTS: LINT_ENTRY_CONTENTS, SRC_DIR: AUTHORING_DIR } = require('./build-authoring-core.js');
const BOUNDARY_PARSER_MJS = path.join(ROOT, 'lib', 'core', 'boundary-parser.mjs');
const BOUNDARY_PARSER_CJS = path.join(ROOT, 'lib', 'core', 'boundary-parser.js');
const LINT_PARSER_IMPORTERS = new Set([
  path.join(ROOT, 'lib', 'authoring', 'lint-core.js'),
  path.join(ROOT, 'lib', 'authoring', 'notes-core.js'), // liveCommentOpeners parses to find live notes (#2012)
  path.join(ROOT, 'lib', 'core', 'slide-boundaries.mjs'),
]);
const lintEntryPlugin = {
  name: 'lint-entry',
  setup(build) {
    build.onResolve({ filter: /^lattice-lint$/ }, () => ({ path: 'lint', namespace: 'lattice-lint' }));
    build.onLoad({ filter: /.*/, namespace: 'lattice-lint' }, () => ({ contents: LINT_ENTRY_CONTENTS, resolveDir: AUTHORING_DIR, loader: 'js' }));
    build.onResolve({ filter: /boundary-parser(\.m?js)?$/ }, (args) => {
      const fromLint = args.namespace === 'lattice-lint' || LINT_PARSER_IMPORTERS.has(args.importer);
      if (!fromLint) return undefined;
      const resolved = path.resolve(args.resolveDir, args.path);
      if (![BOUNDARY_PARSER_MJS, BOUNDARY_PARSER_CJS, BOUNDARY_PARSER_CJS.slice(0, -3)].includes(resolved)) return undefined;
      // Repo-relative for the same reason as the lazy chart registry: an absolute path here names chunks by checkout.
      return { path: repoPath(BOUNDARY_PARSER_MJS), namespace: 'lint-boundary-parser' };
    });
    build.onLoad({ filter: /.*/, namespace: 'lint-boundary-parser' }, (args) => ({
      contents: fs.readFileSync(path.join(ROOT, args.path), 'utf8'),
      resolveDir: path.dirname(path.join(ROOT, args.path)),
      loader: 'js',
      watchFiles: [path.join(ROOT, args.path)],
    }));
    // On every build, watch mode included.
    build.onEnd((result) => {
      if (result.metafile) {
        assertLintParserIsolated(result.metafile);
        assertCheckoutIndependent(result.metafile);
      }
    });
  },
};

/**
 * No module key may name the checkout. esbuild keys a `file` module relative to absWorkingDir, but a
 * plugin namespace keeps the path text it was given, and every key feeds the `chunk-[hash]` names.
 * One absolute path renamed the chunks per checkout, which moved the engine's asset version and the
 * docs site's bytes, so measure-route-base.sh charged PRs 2–3 bytes they did not add
 * (followups.d/2708-p1). PURE over the metafile, so a test can hand it a fake one.
 */
function assertCheckoutIndependent(metafile) {
  // Strip a plugin namespace, then ask whether the rest is absolute. Not a search for ROOT's text:
  // a checkout at `/src` or `/code` would match `docs/src/…` and `lib/components/code/…`.
  const leaks = Object.keys(metafile.inputs).filter((k) => path.isAbsolute(k.replace(/^[\w-]+:/, '')));
  if (leaks.length) {
    throw new Error(
      `build-playground: ${leaks.length} module key(s) name the checkout, so chunk names depend on where the repo lives; return a repo-relative path from the plugin: ${leaks.slice(0, 3).join(', ')}`,
    );
  }
}

/**
 * The lint core and the engine must each reach only their own boundary-parser instance. Walks the
 * metafile's module graph (static, require and dynamic edges) from each entry. PURE over the
 * metafile, so a test can hand it a fake one.
 */
function assertLintParserIsolated(metafile) {
  const inputs = metafile.inputs;
  const reach = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const imp of inputs[queue.pop()]?.imports ?? []) {
        if (!seen.has(imp.path)) {
          seen.add(imp.path);
          queue.push(imp.path);
        }
      }
    }
    return seen;
  };
  const keys = Object.keys(inputs);
  const lintEntry = keys.find((k) => k.startsWith('lattice-lint:'));
  const lintCopy = keys.find((k) => k.startsWith('lint-boundary-parser:'));
  const shared = keys.find((k) => !k.includes(':') && k.endsWith('lib/core/boundary-parser.mjs'));
  if (!lintEntry || !lintCopy) throw new Error('build-playground: the lint entry or its own boundary parser is missing from the ESM build');
  const problems = [];
  const lintReach = reach(lintEntry);
  if (shared && lintReach.has(shared)) problems.push('the lint core reaches the engine\'s boundary-parser.mjs');
  // The engine build swaps some modules for browser stand-ins (KaTeX, plugin data, the chart
  // registry, the code plugin's grammar loader). vitest runs the lint core from authoring-core.generated.js,
  // which has none of them, so a lint that reached one would pass its tests and differ in the browser.
  const stubbed = [path.join(ROOT, 'lib', 'engine', 'katex-browser-stub.js'), PLUGIN_DATA_STUB, CODE_LOAD_GRAMMAR_BROWSER].map((p) => path.relative(ROOT, p));
  for (const k of lintReach) {
    if (k.startsWith('lazy-chart-registry:') || stubbed.includes(k)) problems.push(`the lint core reaches ${k}, which the engine build replaces with a browser stand-in`);
  }
  for (const k of keys.filter((x) => !x.startsWith('lattice-lint:') && (x === path.relative(ROOT, ENTRY) || x.startsWith('lattice-chart:')))) {
    if (reach(k).has(lintCopy)) problems.push(`${k} reaches the lint core's own boundary parser`);
  }
  if (problems.length) throw new Error(`build-playground: the lint core and the engine must not share a boundary parser: ${problems.join('; ')}`);
}

const ESM_OPTIONS = {
  ...BUILD_OPTIONS,
  // Metafile keys relative to the repo whatever the working directory, so assertLintParserIsolated and
  // esmChunkList read the same paths from `cd docs && node ../tools/build-playground.js` as from the root.
  absWorkingDir: ROOT,
  entryPoints: {
    engine: ENTRY,
    lint: 'lattice-lint',
    'code-record': path.join(ROOT, 'lib', 'plugins', 'code', 'shared', 'record-edit.js'),
    'callout-place': 'lattice-callout-place',
    ...Object.fromEntries(Object.keys(CHART_KERNELS).map((l) => [`chart-${l}`, `lattice-chart:${l}`])),
  },
  format: 'esm',
  splitting: true,
  chunkNames: 'chunk-[hash]',
  metafile: true,
  plugins: [lintEntryPlugin, lazyChartRegistryPlugin, calloutPlaceEsmPlugin, ...BUILD_OPTIONS.plugins],
  banner: { js: '/* Auto-generated by tools/build-playground.js (ESM) — DO NOT EDIT. Rebuild: npm run playground:build */' },
};

/** Each entry's static chunk closure, from the metafile: what the host preloads before `import()`. */
function esmChunkList(metafile, outDir) {
  const rel = (p) => path.relative(outDir, path.resolve(ROOT, p)).split(path.sep).join('/');
  const outputs = metafile.outputs;
  const closure = (out) => {
    const seen = new Set();
    const walk = (o) => {
      for (const imp of outputs[o].imports) {
        if (imp.kind !== 'import-statement' || seen.has(imp.path)) continue;
        seen.add(imp.path);
        walk(imp.path);
      }
    };
    walk(out);
    return [...seen].map(rel).sort();
  };
  const entries = {};
  for (const [out, o] of Object.entries(outputs)) {
    if (!o.entryPoint || !out.endsWith('.js')) continue;
    entries[rel(out)] = closure(out);
  }
  return { entries };
}

async function buildEsm(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const result = await esbuild.build({ ...ESM_OPTIONS, outdir: outDir });
  fs.writeFileSync(path.join(outDir, 'chunks.json'), `${JSON.stringify(esmChunkList(result.metafile, outDir), null, 2)}\n`);
  // THE MARP EXPORT'S SOURCE LIFT, a self-contained module beside the split build rather than an entry of it:
  // as an entry it shared bg-image.js with the engine, and code splitting moved that into new chunks the engine
  // imports, which cost the engine about 2 KB gzipped for a module only one export loads.
  await esbuild.build({ ...BUILD_OPTIONS, entryPoints: [path.join(ROOT, 'lib', 'core', 'bg-image-lift.js')], format: 'esm', outfile: path.join(outDir, 'bg-image-lift.js'), banner: { js: '/* Auto-generated by tools/build-playground.js — DO NOT EDIT. Source: lib/core/bg-image-lift.js. Rebuild: npm run playground:build */' } });
  if (fs.readFileSync(path.join(outDir, 'engine.js'), 'utf8').includes('KaTeX parse error')) {
    throw new Error(`${path.relative(ROOT, outDir)}/engine.js bundles real KaTeX — katexStubPlugin no longer catches the math plugin's copy`);
  }
}

async function buildOnce(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await esbuild.build({ ...BUILD_OPTIONS, outfile: outFile });
  // katexStubPlugin matches a resolved PATH, so a renamed copy or a new specifier would quietly
  // bundle real KaTeX (~78.5 KB gzip) into every page. Its parser's error text is the tell; the
  // stub carries none of it.
  if (fs.readFileSync(outFile, 'utf8').includes('KaTeX parse error')) {
    throw new Error(`${path.relative(ROOT, outFile)} bundles real KaTeX — katexStubPlugin no longer catches the math plugin's copy`);
  }
}

async function main() {
  if (watch) {
    const ctx = await esbuild.context({ ...BUILD_OPTIONS, outfile: OUT_FILE });
    await ctx.watch();
    // The ESM build the docs site loads, rebuilt alongside (no manifest rewrite in watch mode: the
    // entries' chunk lists change only when imports do; run a full build after such an edit).
    const esmCtx = await esbuild.context({ ...ESM_OPTIONS, outdir: ESM_DIR });
    await esmCtx.watch();
    if (!silent) console.log(`[build-playground] watching lib/playground/ → ${path.relative(ROOT, OUT_FILE)}`);
    return;
  }

  if (check) {
    const tmp = `${OUT_FILE}.check.tmp`;
    let exitCode = 0;
    try {
      await buildOnce(tmp);
      try {
        execFileSync('diff', ['-q', OUT_FILE, tmp], { stdio: 'pipe' });
      } catch (_e) {
        console.error('✗ docs/public/playground/lattice-playground.js is stale relative to lib/playground/');
        console.error('  Run: npm run playground:build');
        exitCode = 1;
      }
      await buildEsm(`${ESM_DIR}.check.tmp`);
      try {
        execFileSync('diff', ['-rq', ESM_DIR, `${ESM_DIR}.check.tmp`], { stdio: 'pipe' });
      } catch (_e) {
        console.error('✗ docs/public/playground/esm/ is stale relative to lib/playground/');
        console.error('  Run: npm run playground:build');
        exitCode = 1;
      }
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch (_e) {
        /* best effort */
      }
      fs.rmSync(`${ESM_DIR}.check.tmp`, { recursive: true, force: true });
    }
    process.exit(exitCode);
  }

  await buildOnce(OUT_FILE);
  await buildEsm(ESM_DIR);
  if (!silent) {
    const bytes = fs.statSync(OUT_FILE).size;
    console.log(`[build-playground] ${path.relative(ROOT, OUT_FILE)}  (${(bytes / 1024).toFixed(1)} KB)`);
  }
}

// The ESM options and the two metafile pins, for test/integration/lint-engine/ (which builds its own
// copy) and test/unit/tools/build-playground-determinism.test.js.
module.exports = { ESM_OPTIONS, assertLintParserIsolated, assertCheckoutIndependent };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
