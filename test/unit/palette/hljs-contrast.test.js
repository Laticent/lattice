/**
 * Unit: the `--hljs-*` syntax colors against the code panel they sit on (#1527).
 *
 * WHY THIS EXISTS. Twelve tokens × 32 themes × 2 modes and no contrast test
 * anywhere — the one large token family `checkCatContrast` does not reach. The
 * gap hid a LIVE defect: `indaco` declares Night Owl's `#ff5874` verbatim, but
 * Night Owl tuned it for Night Owl's panel (`#011627`) and indaco's `--code-bg`
 * is the lighter `#003d66`. 3.71:1, in shipped output, in both concat orders — so
 * #1527's before/after sweep could never have found it, because a value under the
 * floor in *both* orders never registers as a crossing.
 *
 * The exemption is the part to guard hardest. `--hljs-comment` and
 * `--hljs-punctuation` are deliberately quiet, and a test that let the exemption
 * silently widen would give back the whole gate.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  checkHljsContrast, HLJS_TOKENS, HLJS_QUIET_TOKENS, catResolve, catContrast,
} = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(ROOT, 'themes');

/** A theme's tokens with its `@import` chain flattened — base first, then the theme. */
function flatten(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  if (name === 'lattice') return fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.tokens.css'), 'utf8');
  const file = path.join(THEMES, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    out += `${flatten(m[1], seen)}\n`;
  }
  return out + css;
}
function tokens(css) {
  const map = new Map();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

describe('--hljs-* contrast against --code-bg', () => {
  test('the live tree is clean', () => {
    const errors = [];
    checkHljsContrast(errors);
    assert.deepEqual(errors, []);
  });

  test('CANARY — a gated token below the floor is named', () => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'latt-hljs-'));
    fs.writeFileSync(path.join(dir, 'probe.css'),
      "@import 'lattice';\n:root{--surface-inverse:#ffffff;--hljs-keyword:#f7f7f7;}\n");
    const errors = [];
    checkHljsContrast(errors, dir);
    // The empty-scan guard fires first on a one-theme dir; either way it must not pass silently.
    assert.notDeepEqual(errors, [], 'a near-invisible keyword must not pass');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the exemption covers exactly two tokens, and they are the quiet ones', () => {
    // If this list ever grows, the gate has been widened rather than the palettes
    // fixed — which is the failure mode that would give the whole thing back.
    assert.deepEqual([...HLJS_QUIET_TOKENS].sort(), ['--hljs-comment', '--hljs-punctuation']);
    for (const t of HLJS_QUIET_TOKENS) assert.ok(HLJS_TOKENS.includes(t), `${t} is a real hljs token`);
  });

  test('the exempt population is genuinely large and the gated one genuinely small', () => {
    // The exemption's justification IS this ratio. If it inverts, the reasoning in
    // the note stops holding and the exemption should be revisited.
    const under = {};
    for (const f of fs.readdirSync(THEMES).sort()) {
      if (!f.endsWith('.css')) continue;
      const map = tokens(flatten(f.replace(/\.css$/, '')));
      for (const mode of ['light', 'dark']) {
        const bg = catResolve(map, '--code-bg', mode);
        if (!bg) continue;
        for (const t of HLJS_TOKENS) {
          if (!map.has(t)) continue;
          const fg = catResolve(map, t, mode);
          if (fg && catContrast(fg, bg) < 4.5) under[t] = (under[t] || 0) + 1;
        }
      }
    }
    const quiet = HLJS_QUIET_TOKENS.reduce((s, t) => s + (under[t] || 0), 0);
    const gated = Object.entries(under).filter(([t]) => !HLJS_QUIET_TOKENS.includes(t))
      .reduce((s, [, n]) => s + n, 0);
    assert.equal(gated, 0, `gated tokens must all clear AA; under the floor: ${JSON.stringify(under)}`);
    assert.ok(quiet > 20,
      `the exemption is justified by the quiet population being large (found ${quiet}); if it has `
      + 'shrunk, the palettes were fixed and the exemption can go');
  });

  test('indaco specifically — the live defect this gate was written by', () => {
    const map = tokens(flatten('indaco'));
    const bg = catResolve(map, '--code-bg', 'light');
    const fg = catResolve(map, '--hljs-literal', 'light');
    assert.equal(bg, '#003d66');
    assert.ok(catContrast(fg, bg) >= 4.5,
      `indaco --hljs-literal ${fg} on ${bg} = ${catContrast(fg, bg).toFixed(2)}:1`);
  });
});
