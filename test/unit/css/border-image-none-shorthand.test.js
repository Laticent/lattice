/**
 * No `border-image: none` shorthand in the CSS the package ships.
 *
 * lightningcss 1.32.0, Vite 8's default CSS minifier, rewrites any `border-image` shorthand whose
 * values are all defaults (`none`, `none 100% / 1 / 0 stretch`) to `border-image:` with no value.
 * The browser drops that invalid declaration, so the section keeps the spectrum bar it was meant to
 * reset. A consumer who bundles `@laticent/lattice/css` with Vite saw it on every `accent` and
 * `tone-edge` slide (portable-packages note §10, the packed palette form). The longhand
 * `border-image-source: none` survives the minifier and draws the same: with no image source, the
 * other border-image longhands draw nothing. engineering/gotchas/css.md has the symptom.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

test('no shipped CSS resets border-image with the `none` shorthand', () => {
  const files = [...cssFiles(path.join(ROOT, 'lib')), ...cssFiles(path.join(ROOT, 'themes'))];
  assert.ok(files.length > 50, `expected the engine and theme CSS, found ${files.length} files`);
  const hits = [];
  for (const file of files) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of css.matchAll(/border-image\s*:\s*none\b/g)) {
      const line = css.slice(0, m.index).split('\n').length;
      hits.push(`${path.relative(ROOT, file)}:${line}`);
    }
  }
  assert.deepEqual(hits, [], `use \`border-image-source: none\` instead (lightningcss empties the shorthand):\n${hits.join('\n')}`);
});

test('the scan finds the shorthand it bans', () => {
  const css = '.a { border-top: 1px solid; border-image: none; }';
  assert.match(css, /border-image\s*:\s*none\b/);
  assert.doesNotMatch('.a { border-image-source: none; }', /border-image\s*:\s*none\b/);
});
