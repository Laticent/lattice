/**
 * No all-default `border-image` reset the minifier can empty, in the CSS the package ships.
 *
 * lightningcss 1.32.0, Vite 8's default CSS minifier, rewrites any `border-image` shorthand whose
 * values are all defaults (`none`, `100%`, `stretch`, `none 100% / 1 / 0 stretch`) to
 * `border-image:` with no value, and merges a rule that writes all five longhands back into that
 * same empty shorthand. The browser drops the invalid declaration, so the section keeps the
 * spectrum bar it was meant to reset. A consumer who bundled `@laticent/lattice/css` with Vite saw
 * it on every `accent` slide (portable-packages note §10, the packed palette form). The longhand
 * `border-image-source: none` on its own survives the minifier and draws the same: with no image
 * source, the other border-image longhands draw nothing. engineering/gotchas/css.md has the symptom.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

// A shorthand (or its mask twins) whose value is made only of initial-value tokens. The lookbehind
// keeps a custom property such as `--x-border-image: none` out.
const DEFAULT_SHORTHAND =
  /(?<![\w-])(?:border-image|mask-border|-webkit-mask-box-image|-webkit-border-image)\s*:\s*(?:none|100%|1|0|stretch|\/|\s)+(?:!important)?\s*(?=[;}])/gi;
const LONGHANDS = ['source', 'slice', 'width', 'outset', 'repeat'];

function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// Comments blanked to spaces, so line numbers still point at the source.
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

function findResets(css) {
  const lines = [];
  const lineOf = (i) => css.slice(0, i).split('\n').length;
  for (const m of css.matchAll(DEFAULT_SHORTHAND)) lines.push(lineOf(m.index));
  for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
    const all = LONGHANDS.every((l) => new RegExp(`(?<![\\w-])border-image-${l}\\s*:`, 'i').test(m[1]));
    if (all) lines.push(lineOf(m.index));
  }
  return lines;
}

test('no shipped CSS resets border-image in a form lightningcss empties', () => {
  const files = [...cssFiles(path.join(ROOT, 'lib')), ...cssFiles(path.join(ROOT, 'themes'))];
  assert.ok(files.length > 50, `expected the engine and theme CSS, found ${files.length} files`);
  const hits = files.flatMap((file) => findResets(blankComments(fs.readFileSync(file, 'utf8'))).map((line) => `${path.relative(ROOT, file)}:${line}`));
  assert.deepEqual(hits, [], `reset with \`border-image-source: none\` alone (lightningcss empties these):\n${hits.join('\n')}`);
});

test('the scan finds every form it bans, and nothing else', () => {
  for (const bad of [
    '.a { border-top: 1px solid; border-image: none; }',
    '.a { border-image:\n  none !important }',
    '.a { BORDER-IMAGE: NONE; }',
    '.a { border-image: none 100% / 1 / 0 stretch; }',
    '.a { border-image: stretch; }',
    '.a { mask-border: none; }',
    '.a { border-image-source: none; border-image-slice: 100%; border-image-width: 1; border-image-outset: 0; border-image-repeat: stretch; }',
  ]) {
    assert.equal(findResets(bad).length, 1, bad);
  }
  for (const ok of [
    '.a { border-image-source: none; }',
    '.a { border-image: var(--spectrum-bar) 1; }',
    '.a { border-image: initial; }',
    '.a { --x-border-image: none; }',
    blankComments('/* border-image: none */ .a { color: red; }'),
  ]) {
    assert.deepEqual(findResets(ok), [], ok);
  }
});
