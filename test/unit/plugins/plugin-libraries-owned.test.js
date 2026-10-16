/**
 * Every third-party library a plugin needs is a copy the plugin OWNS, and every surface ships that copy.
 *
 * We host third-party libraries ourselves (owner, 2026-10-06): each library sits in its plugin's
 * `vendor/` folder, recorded in the manifest (`payload.<key>.vendored` for the browser library,
 * `vendor.<key>` for the rest: version + SHA-256), and the browser pages, the CLI export and bake, the
 * Marp kit and the Export-to-Marp bundle all read it. `node_modules` is only the source
 * `npm run vendor:plugins` refreshes a copy from when WE upgrade, so no user downloads a library and no
 * install changes what ships (lib/plugins/payload-path.js).
 *
 * What is pinned here: the copies the manifests record are the ones on disk (the resolver checks that
 * too, at build); each source package is pinned exactly in package.json and installed at that build, so
 * a Dependabot bump fails here until someone refreshes the copy on purpose and looks at the result; and
 * each reader reads the copy, not the package.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { payloadOf, payloadPath, vendorPath, copiesOf, copySha } = require('../../../lib/plugins/payload-path.js');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkgOf = (from) => {
  const spec = from.replace(/^npm:/, '');
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
};

// Every copy every plugin records. The expected set is named, so a library quietly dropped from a
// manifest (back to node_modules) fails here as loudly as a missing file.
const COPIES = [];
for (const dir of fs.readdirSync(path.join(ROOT, 'lib', 'plugins'), { withFileTypes: true })) {
  const file = path.join(ROOT, 'lib', 'plugins', dir.name, `${dir.name}.manifest.json`);
  if (!dir.isDirectory() || !fs.existsSync(file)) continue;
  for (const c of copiesOf(JSON.parse(fs.readFileSync(file, 'utf8')))) COPIES.push({ plugin: dir.name, ...c });
}

test('the plugins own exactly the libraries we ship', () => {
  assert.deepEqual(COPIES.map((c) => `${c.plugin}:${c.key}`).sort(), [
    'function-plot:function-plot', 'function-plot:license',
    'math:katex', 'math:katex-css', 'math:katex-fonts', 'math:license',
    'mermaid:license', 'mermaid:mermaid', 'mermaid:render-page', 'mermaid:render-page-license', 'mermaid:zenuml', 'mermaid:zenuml-license',
  ]);
  // Each is MIT, whose notice must travel with every copy: every package a plugin copies from has
  // its LICENSE copied beside the library, recorded and hashed like the library itself.
  const libraries = new Set(COPIES.filter((c) => !c.entry.from.endsWith('/LICENSE')).map((c) => `${c.plugin}:${pkgOf(c.entry.from)}`));
  const licensed = new Set(COPIES.filter((c) => c.entry.from.endsWith('/LICENSE')).map((c) => `${c.plugin}:${pkgOf(c.entry.from)}`));
  assert.deepEqual([...libraries].filter((l) => !licensed.has(l)), [], 'a vendored library travels without its LICENSE');
  // And no plugin's browser library is read from node_modules any more.
  const unvendored = fs.readdirSync(path.join(ROOT, 'lib', 'plugins')).filter((n) => {
    const f = path.join(ROOT, 'lib', 'plugins', n, `${n}.manifest.json`);
    return fs.existsSync(f) && payloadOf(n) && !payloadOf(n).vendored;
  });
  assert.deepEqual(unvendored, [], `${unvendored.join(', ')} still loads its browser library from node_modules`);
});

test('each copy on disk is the one its manifest records', () => {
  for (const { plugin, key, entry } of COPIES) {
    const abs = path.join(ROOT, 'lib', 'plugins', plugin, entry.file);
    assert.equal(copySha(abs, entry.file.endsWith('/')), entry.sha256, `${plugin}:${key} (${entry.file}) does not match its record — npm run vendor:plugins`);
  }
});

test('each source is pinned exactly, installed at the build the copy came from, and ignored by Dependabot', () => {
  const pkg = require(path.join(ROOT, 'package.json'));
  const dependabot = read('.github/dependabot.yml');
  for (const { plugin, key, entry } of COPIES) {
    const name = pkgOf(entry.from);
    const pin = pkg.dependencies[name] || pkg.devDependencies?.[name];
    assert.equal(pin, entry.version, `package.json pins ${name} "${pin}"; ${plugin}:${key} is ${entry.version} — pin the exact version the plugin vendors`);
    assert.match(dependabot, new RegExp(`dependency-name: "?${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"?\\n`), `${name} is vendored but Dependabot would still bump it (.github/dependabot.yml ignore)`);
  }
  // The installed packages are the builds the copies were taken from. `vendor:plugins --check` is
  // the one comparator, so this and the upgrade path cannot disagree about what "the same" means.
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'vendor-plugin-libs.js'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `an installed library is not the build its plugin vendors — upgrading is deliberate: npm run vendor:plugins, then look at the galleries it draws.\n${r.stderr}`);
});

test('every surface reads the plugin\'s copy', () => {
  // The Marp kit and the Export-to-Marp bundle (lib/core/marp-bundle.js STATIC_ASSETS; the kit derives from it).
  const { STATIC_ASSETS } = require('../../../lib/core/marp-bundle.js');
  assert.equal(STATIC_ASSETS.find((a) => a.to === 'mermaid-v11-min.js')?.from, 'lib/plugins/mermaid/vendor/mermaid.min.js');
  // The CLI bake: Mermaid, ZenUML and mermaid-cli's render page.
  const { resolveBundles } = require('../../../lib/plugins/mermaid/shared/render-worker.js');
  const b = resolveBundles();
  assert.equal(b.mermaidIife, payloadPath('mermaid'));
  assert.equal(b.zenumlIife, vendorPath('mermaid', 'zenuml'));
  assert.equal(b.indexHtml, path.join(vendorPath('mermaid', 'render-page'), 'index.html'));
  // The CLI export page's hydrators (function-plot) resolve through payload-path.js.
  assert.match(read('lib/plugins/hydrate-script.js'), /const abs = libraryPath\(h\.name\);/);
  assert.equal(require('../../../lib/plugins/hydrate-script.js').payloadPath({ name: 'function-plot', payload: {} }), payloadPath('function-plot'));
  // KaTeX: the engine's renderer, the docs provider bundle, the stylesheet and fonts every export reads.
  assert.match(read('lib/plugins/math/math.render.js'), /katex = require\('\.\/vendor\/katex\/katex\.min\.js'\);/);
  assert.match(read('lib/playground/katex-provider.js'), /import katex from '\.\.\/plugins\/math\/vendor\/katex\/katex\.min\.js';/);
  assert.match(read('tools/build-css.js'), /const KATEX_CSS = vendorPath\('math', 'katex-css'\);/);
  assert.match(read('lattice.js'), /vendorPath\('math', 'katex-css'\)/);
  assert.match(read('lib/export/html-player.js'), /vendorPath\('math', 'katex-css'\)/);
  // The docs site stages each plugin's copy beside the runtime.
  const sync = read('docs/scripts/sync-playground-assets.mjs');
  assert.match(sync, /\.map\(\(\[name, d\]\) => \[d\.payload\.file, libraryPath\(name\)\]\)/);
  assert.match(sync, /assets\.push\(\['katex\/katex\.min\.css', vendorPath\('math', 'katex-css'\)\]\);/);
  // No other build of any vendored library is read by our code. A source package path names a build
  // from node_modules; an `npm:` spec is a manifest's update SOURCE (and the registries generated from
  // it), and remote-ref.js only ADMITS a sample deck's <script> path — neither reads a build.
  const READS = [
    "mermaid/dist/mermaid(\\.min)?\\.js'", 'mermaid-zenuml/dist', 'mermaid-cli/dist', 'mermaid-cli.*index\\.html',
    'function-plot/dist', 'katex/dist', "require\\('katex'\\)", "from 'katex'",
  ];
  for (const dir of ['lib', 'tools', 'docs/scripts', 'lattice.js']) {
    // `git grep` exits 1 when nothing matches, which is the passing case.
    const r = spawnSync('git', ['grep', '-n', '-E', READS.join('|'), '--', dir], { cwd: ROOT, encoding: 'utf8' });
    assert.ok(r.status === 0 || r.status === 1, `git grep failed: ${r.stderr}`);
    const hits = r.stdout.trim().split('\n').filter(Boolean)
      .filter((line) => !line.includes('npm:'))
      .map((line) => line.split(':')[0])
      .filter((f) => !f.includes('/vendor/') && f !== 'lib/core/remote-ref.js' && !f.endsWith('.md'));
    assert.deepEqual(hits, [], `${hits.join(', ')} reads a vendored library from node_modules; read the plugin's copy (lib/plugins/payload-path.js)`);
  }
});

test('a bundle that inlines the reader still finds every copy (the installed CLI is dist/lattice.js)', () => {
  // The installed `lattice` runs an esbuild bundle in dist/, which inlines payload-path.js, so its
  // `__dirname` is <pkg>/dist. A root COUNTED from __dirname (`../..`) pointed above the package there,
  // every copy read as missing, and the shipped CLI exported math without KaTeX's faces and plots
  // without their library — while every source-entry test passed (tier 1 checker). Bundle it one
  // directory deep, exactly as dist/ is, and require it from there.
  const out = path.join(ROOT, '.scratch', 'payload-path.bundle.js'); // one level deep, as dist/ is
  require('esbuild').buildSync({ entryPoints: [path.join(ROOT, 'lib', 'plugins', 'payload-path.js')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
  const bundled = require(out);
  for (const { plugin, key, entry } of COPIES) {
    const abs = payloadOf(plugin)?.vendored?.file === entry.file ? bundled.payloadPath(plugin) : bundled.vendorPath(plugin, key);
    assert.ok(fs.existsSync(abs), `${plugin}:${key} resolves to ${abs} from a bundle, which does not exist`);
  }
});
