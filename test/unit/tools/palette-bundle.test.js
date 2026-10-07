/**
 * dist/palettes/<name>.css — each shipped theme's tokens with its imports resolved, published as
 * `@laticent/lattice/palette/<name>.css` (tools/build-default-bundle.js). A bundler cannot import
 * the Marp theme file, whose `@import 'lattice'` Vite reads as a file path; the palette form is
 * what a Vite user imports after the engine. The Vite build itself is driven in
 * docs/src/lib/published-palette.test.ts, the one suite that has Vite installed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { palettes, resolvedPalette } = require('../../../tools/build-default-bundle.js');
const { stripCssComments } = require('../../../lib/core/css-comments.mjs');

const ROOT = path.resolve(__dirname, '../../..');
const shipped = fs
  .readdirSync(path.join(ROOT, 'themes'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(ROOT, 'themes', e.name, `${e.name}.css`)))
  .map((e) => e.name)
  .sort();

test('one palette per shipped theme, and no import or @theme header survives in any', () => {
  const out = palettes();
  assert.deepEqual(Object.keys(out).sort(), shipped);
  assert.ok(shipped.length >= 33, `saw ${shipped.length} themes`);
  for (const [name, css] of Object.entries(out)) {
    const body = stripCssComments(css);
    assert.doesNotMatch(body, /@import\b/, `${name} still imports something a bundler would try to read as a file`);
    assert.doesNotMatch(css, /@theme\b/, `${name} carries a @theme header, so Marp would read it as a theme`);
    assert.match(body, /--[a-z]/, `${name} declares no tokens`);
  }
});

test('cuoio is exactly the token block the zero-config default appends to the engine', () => {
  // The default bundle (dist/lattice-default.css) is engine + cuoio's tokens. The palette form
  // must be the same tokens, so `css` + `palette/cuoio.css` composes what `default` already ships.
  const theme = fs.readFileSync(path.join(ROOT, 'themes/cuoio/cuoio.css'), 'utf8');
  const m = theme.match(/^[ \t]*@import\s+['"]lattice['"]\s*;?/m);
  const norm = (s) => stripCssComments(s).replace(/^[ \t]+$/gm, '').replace(/\s+/g, ' ').trim();
  assert.equal(norm(resolvedPalette('cuoio')), norm(theme.slice(m.index + m[0].length)));
});

test('a variant inlines its base first, so its own rules win by source order', () => {
  const base = resolvedPalette('cuoio');
  const dark = resolvedPalette('cuoio-dark');
  assert.ok(dark.startsWith(base), 'cuoio-dark does not open with cuoio');
  assert.ok(dark.length > base.length, 'cuoio-dark adds nothing of its own');
  // The deepest chain: a11y-achromatopsia -> a11y-base -> onyx -> lattice.
  const chain = resolvedPalette('a11y-achromatopsia');
  assert.ok(chain.startsWith(resolvedPalette('a11y-base')));
  assert.ok(resolvedPalette('a11y-base').startsWith(resolvedPalette('onyx')));
});

test('THE FAILING ARMS: a cycle and an import of no shipped theme are refused, by name', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'palette-'));
  const write = (n, css) => {
    fs.mkdirSync(path.join(tmp, 'themes', n), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'themes', n, `${n}.css`), css);
  };
  // Run the generator against a copy of the tool rooted at the temp tree.
  const src = fs.readFileSync(path.join(ROOT, 'tools/build-default-bundle.js'), 'utf8').replace("const ROOT = path.join(__dirname, '..');", `const ROOT = ${JSON.stringify(tmp)};`);
  fs.mkdirSync(path.join(tmp, 'tools'));
  const tool = path.join(tmp, 'tools/build-default-bundle.js');
  fs.writeFileSync(tool, src.replace("require('./minify-css')", `require(${JSON.stringify(path.join(ROOT, 'tools/minify-css.js'))})`).replace("require('../lib/core/css-comments.mjs')", `require(${JSON.stringify(path.join(ROOT, 'lib/core/css-comments.mjs'))})`));
  try {
    const { resolvedPalette: resolve } = require(tool);
    write('a', "@import 'b';\n:root { --x: 1; }");
    write('b', "@import 'a';\n:root { --y: 1; }");
    assert.throws(() => resolve('a'), /cycle: a -> b -> a/);
    write('c', "@import 'nope';\n:root { --z: 1; }");
    assert.throws(() => resolve('c'), /imports 'nope', which is not a shipped theme/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the published subpath resolves through the package exports, from Node', () => {
  // The Vite half lives in the docs suite, which CI runs only when docs-facing paths change; this
  // arm runs on every PR, so a broken `./palette/*.css` entry in package.json fails here first.
  for (const name of ['cuoio', 'cuoio-dark', 'a11y-achromatopsia']) {
    const resolved = require.resolve(`@laticent/lattice/palette/${name}.css`);
    assert.equal(path.relative(ROOT, resolved).split(path.sep).join('/'), `dist/palettes/${name}.css`);
  }
});
