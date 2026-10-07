/**
 * Every bare import a shipped Node bundle leaves EXTERNAL must resolve in a consumer install.
 *
 * The published `lattice` bin is dist/lattice-emulator.js. esbuild keeps every bare import
 * external except the workspace libraries in tools/build-emulator.js INLINE_PACKAGES, so an
 * external that is not in `dependencies` resolves in the repo (through a workspace symlink or
 * a devDependency) and nowhere else. That is how the installed CLI came to exit before
 * rendering anything: `Cannot find module '@laticent/segno/read'` (followup from #2577).
 * No in-repo test could see it, because every one of them runs where the symlink exists.
 *
 * So this reads the bundles the package ships, lists the specifiers in their `require("…")`
 * and `import("…")` calls, and fails on any that is not a Node builtin, a `dependencies` or
 * `optionalDependencies` entry, or a sanctioned opt-in below.
 *
 * Scope: the bundles Node loads, which are the files `bin`, `main` and `exports` name under
 * dist/, every .cjs/.mjs there, and the subcommand bundles the bin spawns (`lattice packages`,
 * `lattice video`), read from the bin's own `subcommandEntry(…)` calls. Those two once spawned raw
 * lib/ files, so the bin rendered in an install while both subcommands died the same way. The browser IIFEs (the PDF writer, dagre, mermaid, the
 * plugin data) are injected into a page as script text and never resolved by Node, so a
 * `require` inside one is not a consumer-install question.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const ROOT = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(ROOT, 'package.json'));

// Externals a consumer install deliberately lacks. Each is required lazily, on a path whose caller
// catches the miss, and each carries its reason. The test fails on a stale entry, so the
// list cannot outlive the code that needed it.
const SANCTIONED_OPTIONAL_EXTERNALS = new Map([
  ['kokoro-js', 'opt-in local narration voice; the CLI prints `npm i --no-save kokoro-js@1.2.1 …` (lib/export/kokoro-voice.mjs INSTALL_HINT) when it is absent'],
  ['@breezystack/lamejs', 'the MP3 encoder for that same opt-in voice, installed by the same hint'],
  ['jsdom', 'two lazy sites: `buildPlayerHtml` (lib/export/html-player.js), whose caller in lattice-emulator.js catches the miss and keeps the clean sidecar, and `buildReadingArticleDocument`, inside a try. `--player` needs it, tracked by followups.d/2248-p3-player-keeps-the-published-install-break.md'],
]);

// `require("x")` / `import("x")` with a string literal that is shaped like a package name.
// The shape filter keeps a prose `import(` or a template-literal argument out of the result.
const CALL_RE = /\b(?:require|import)\s*\(\s*(["'`])((?:node:)?(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w./-]*)?)\1\s*\)/g;
// Static ESM imports, for the .mjs files: `from "x"` and a bare `import "x"`.
const FROM_RE = /(?:\bfrom|^\s*import)\s*(["'])((?:node:)?(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[\w./-]*)?)\1/gm;

/** The package a bare specifier names: `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Every bare specifier `src` imports, as package names. */
function bareImports(src, { esm = false } = {}) {
  const out = new Set();
  for (const re of esm ? [CALL_RE, FROM_RE] : [CALL_RE]) {
    for (const m of src.matchAll(re)) out.add(packageOf(m[2]));
  }
  return out;
}

/** The packages in `imports` that a consumer install of `manifest` cannot resolve. */
function unresolvable(imports, manifest, sanctioned = new Set()) {
  const provided = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {}),
  ]);
  const builtins = new Set(builtinModules);
  return [...imports].filter((name) => {
    if (name.startsWith('node:') || builtins.has(name)) return false;
    return !provided.has(name) && !sanctioned.has(name);
  });
}

/** The Node-loaded files the package ships under dist/. */
function shippedNodeBundles(manifest) {
  const files = new Set();
  const add = (rel) => {
    if (typeof rel !== 'string' || rel.includes('*')) return;
    const clean = rel.replace(/^\.\//, '');
    if (clean.startsWith('dist/') && /\.(c|m)?js$/.test(clean)) files.add(clean);
  };
  for (const v of Object.values(manifest.bin || {})) add(v);
  add(manifest.main);
  for (const v of Object.values(manifest.exports || {})) add(typeof v === 'string' ? v : v?.require ?? v?.default);
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(cjs|mjs)$/.test(e.name)) files.add(rel);
    }
  };
  walk('dist');
  for (const name of subcommandBundles()) files.add(`dist/${name}`);
  return [...files].sort();
}

/** The dist/ bundles the bin spawns as subcommands, from the loose source's dispatch. */
function subcommandBundles() {
  const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
  return [...src.matchAll(/subcommandEntry\('([^']+)'/g)].map((m) => m[1]);
}

describe('shipped bundles import only what a consumer install provides', () => {
  const emulator = path.join(ROOT, 'dist', 'lattice-emulator.js');

  test('every external in a shipped Node bundle is a dependency, a builtin, or sanctioned', (t) => {
    if (!fs.existsSync(emulator)) return t.skip('dist/ not built (npm run build)');
    const bundles = shippedNodeBundles(pkg);
    assert.ok(bundles.includes('dist/lattice-emulator.js'), 'the bin bundle is not in scope; the discovery broke');
    const seen = new Set();
    const problems = [];
    for (const rel of bundles) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue;
      const imports = bareImports(fs.readFileSync(abs, 'utf8'), { esm: rel.endsWith('.mjs') });
      for (const name of imports) seen.add(name);
      const bad = unresolvable(imports, pkg, new Set(SANCTIONED_OPTIONAL_EXTERNALS.keys()));
      if (bad.length) problems.push(`${rel}: ${bad.join(', ')}`);
    }
    assert.deepEqual(
      problems,
      [],
      'a shipped bundle requires a package a consumer install does not have. Inline it ' +
        '(tools/build-emulator.js INLINE_PACKAGES) or add it to `dependencies`:\n  ' + problems.join('\n  '),
    );
    const stale = [...SANCTIONED_OPTIONAL_EXTERNALS.keys()].filter((name) => !seen.has(name));
    assert.deepEqual(stale, [], `SANCTIONED_OPTIONAL_EXTERNALS names packages no shipped bundle imports: ${stale.join(', ')}`);
  });

  test('the bin spawns its subcommands from their bundles, never a raw lib/ entry', (t) => {
    const src = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
    const spawns = [...src.matchAll(/spawnSync\(process\.execPath, \[([^,\]]+)/g)].map((m) => m[1].trim());
    const raw = spawns.filter((arg) => /['"]lib\//.test(arg) && !arg.startsWith('subcommandEntry('));
    assert.deepEqual(raw, [], 'a subcommand spawns a raw lib/ file, which an install cannot run: route it through subcommandEntry()');
    const bundles = subcommandBundles();
    assert.deepEqual(bundles.sort(), ['lattice-packages.js', 'lattice-video.mjs']);
    if (!fs.existsSync(emulator)) return t.skip('dist/ not built (npm run build)');
    for (const name of bundles) assert.ok(fs.existsSync(path.join(ROOT, 'dist', name)), `dist/${name} is not built`);
  });

  test('no workspace library is left external in the bin bundle', (t) => {
    if (!fs.existsSync(emulator)) return t.skip('dist/ not built (npm run build)');
    const imports = bareImports(fs.readFileSync(emulator, 'utf8'));
    const workspace = [...imports].filter((name) => name.startsWith('@laticent/'));
    assert.deepEqual(workspace, [], `dist/lattice-emulator.js requires workspace libraries at run time: ${workspace.join(', ')}`);
  });

  // The failing arm: the exact shape the installed CLI died on must be caught.
  test('the check flags a workspace library left external, and passes a dependency', () => {
    const src = [
      'var read = require("@laticent/segno/read");',
      'var ltt = import("@laticent/ltt");',
      'var md = require("markdown-it");',
      'var fs = require("node:fs"); var p = require("path");',
      'var voice = import("kokoro-js");',
    ].join('\n');
    const imports = bareImports(src);
    assert.deepEqual([...imports].sort(), ['@laticent/ltt', '@laticent/segno', 'kokoro-js', 'markdown-it', 'node:fs', 'path']);
    const manifest = { name: '@laticent/lattice', dependencies: { 'markdown-it': '^14' } };
    assert.deepEqual(unresolvable(imports, manifest, new Set(['kokoro-js'])), ['@laticent/segno', '@laticent/ltt']);
    assert.deepEqual(unresolvable(imports, manifest), ['@laticent/segno', '@laticent/ltt', 'kokoro-js']);
  });

  test('prose and template literals are not read as imports', () => {
    // A template-literal argument, built here so the source has no `${` inside a plain string.
    const tpl = ['require(`', '$', '{dir}/x`);'].join('');
    const src = `const hint = "import (the deck) first"; ${tpl} const s = "from 'markdown-it'";`;
    assert.deepEqual([...bareImports(src)], []);
  });
});
