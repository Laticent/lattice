/**
 * lib/theme/contrast.js `resolveVars` reads `light-dark(a, b)` and `var(--x)` through the CSS tokenizer (Segno P5a),
 * held to the two regexes it replaced (copied below as they stood on `main` dbc4d73a) on every shipped palette's
 * tokens, in both modes; and pinned where the tokenizer reads as CSS does and the regexes did not.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveVars } = require('../../../lib/theme/contrast.js');
const { stripCssComments } = require('../../../lib/core/css-comments.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');

function oldResolveVars(vars, mode = 'light') {
  const out = { ...vars };
  for (const k of Object.keys(out)) {
    const ld = String(out[k]).match(/^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
    if (ld) out[k] = (mode === 'dark' ? ld[2] : ld[1]).trim();
  }
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const k of Object.keys(out)) {
      const ref = String(out[k]).match(/^var\(--([a-z0-9-]+)\)$/i);
      if (ref && out[ref[1]] && out[ref[1]] !== out[k]) {
        out[k] = out[ref[1]];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** A light-dark() whose first argument holds a call with a comma in it, before the argument's own comma. */
const NESTED_CALL = /^light-dark\(\s*[^,()]*\([^)]*,/i;

/** Every `--name: value` in a palette's `:root` blocks, as the palette tests read them. */
function rootVars(css) {
  const vars = {};
  for (const block of stripCssComments(css).match(/:root[^{]*\{[^}]*\}/g) || []) {
    for (const m of block.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

test('resolveVars: the same map as the regexes on every shipped palette, both modes', () => {
  const dir = path.join(ROOT, 'themes');
  let palettes = 0;
  let lightDark = 0;
  const fixed = new Set();
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, `${name}.css`);
    if (!fs.existsSync(file)) continue;
    const vars = rootVars(fs.readFileSync(file, 'utf8'));
    lightDark += Object.values(vars).filter((v) => /^light-dark\(/i.test(v)).length;
    for (const mode of ['light', 'dark']) {
      const got = resolveVars(vars, mode);
      const was = oldResolveVars(vars, mode);
      for (const k of Object.keys(was)) {
        if (got[k] === was[k]) continue;
        // The one class where they differ: the regex split light-dark() at the first comma even inside a nested call
        // (`light-dark(color-mix(in srgb, …), …)` read `color-mix(in srgb`). A token resolved through such a value
        // differs with it.
        const root = [k, ...Object.keys(vars)].find((x) => NESTED_CALL.test(vars[x] ?? '') && (x === k || was[k] === was[x]));
        assert.ok(root, `${name} (${mode}) --${k}: ${JSON.stringify(got[k])} vs ${JSON.stringify(was[k])}`);
        fixed.add(`${name} --${root}`);
      }
    }
    palettes++;
  }
  assert.ok(palettes > 20, `only ${palettes} palettes`);
  // Measured on main dbc4d73a: carbone's --fail-bg, --pass-bg and --warn-bg were each read as `color-mix(in srgb`.
  // concrete joined on 2026-11-22: #3232 gave it the same `light-dark(color-mix(in srgb, …), …)` status tints.
  // Pinned, so a new case is seen.
  assert.deepEqual([...fixed].sort(), [
    'carbone --fail-bg',
    'carbone --pass-bg',
    'carbone --warn-bg',
    'concrete --fail-bg',
    'concrete --pass-bg',
    'concrete --warn-bg',
  ]);
  assert.ok(lightDark > 0, 'no palette holds a light-dark() value, so the comparison reached nothing');
});

test('resolveVars: what the tokenizer reads as CSS does, and the regexes did not', () => {
  // A comma inside a nested call does not split light-dark()'s two arguments.
  const ld = { a: 'light-dark(rgb(0, 0, 0), #fff)' };
  assert.equal(oldResolveVars(ld, 'light').a, 'rgb(0');
  assert.equal(resolveVars(ld, 'light').a, 'rgb(0, 0, 0)');
  assert.equal(resolveVars(ld, 'dark').a, '#fff');
  // Whitespace inside var() and a custom property with `_` in its name are an alias, as CSS reads them.
  assert.equal(resolveVars({ a: 'var( --b_c )', b_c: '#123456' }).a, '#123456');
  assert.equal(oldResolveVars({ a: 'var( --b_c )', b_c: '#123456' }).a, 'var( --b_c )');
  // Not an alias: a fallback, or anything after the call.
  assert.equal(resolveVars({ a: 'var(--b, red)', b: '#123456' }).a, 'var(--b, red)');
  assert.equal(resolveVars({ a: 'var(--b) x', b: '#123456' }).a, 'var(--b) x');
  // light-dark() takes exactly two arguments; three is not one.
  assert.equal(resolveVars({ a: 'light-dark(a, b, c)' }, 'dark').a, 'light-dark(a, b, c)');
});
