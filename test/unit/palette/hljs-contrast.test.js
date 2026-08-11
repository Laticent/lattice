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
 * ALL TWELVE TOKENS ARE GATED. The first cut exempted `--hljs-comment` and
 * `--hljs-punctuation` as deliberately quiet; the 110 sub-floor values behind that
 * exemption were repaired instead. The tests below pin BOTH halves of what makes
 * that repair correct: every token is really gated (no exemption crept back), and
 * a comment is still the quietest thing in the panel (legible did not become loud).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkHljsContrast, HLJS_TOKENS, catResolve, catContrast,
} = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(ROOT, 'themes');
const FLOOR = 4.5;

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

/**
 * A full copy of `themes/` with ONE declaration rewritten to its own theme's
 * `--code-bg` — contrast 1.00:1, invisible, and guaranteed to fail whatever the
 * panel's lightness is. A fixed hex cannot do that job: near-white fails on a light
 * panel and sails through on a dark one, so half the tokens would be "tested"
 * against a value that was never a violation.
 *
 * The copy is the WHOLE corpus on purpose. A one-file temp dir trips the gate's
 * empty-scan guard before the token loop runs, which would let this pass for the
 * wrong reason — the guard firing rather than the token being caught.
 */
function themesWithMutation(token) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latt-hljs-'));
  let patched = null;
  for (const f of fs.readdirSync(THEMES)) {
    const src = fs.readFileSync(path.join(THEMES, f), 'utf8');
    let out = src;
    const re = new RegExp(`(${token}\\s*:\\s*)#[0-9a-fA-F]{3,8}(\\s*;)`);
    if (!patched && f.endsWith('.css') && re.test(src)) {
      const bg = catResolve(tokens(flatten(f.replace(/\.css$/, ''))), '--code-bg', 'light');
      if (bg) { out = src.replace(re, `$1${bg}$2`); patched = { theme: f, bg }; }
    }
    fs.writeFileSync(path.join(dir, f), out);
  }
  assert.ok(patched, `no theme declares ${token} on a resolvable panel — the mutation is inert`);
  return dir;
}

describe('--hljs-* contrast against --code-bg', () => {
  test('the live tree is clean', () => {
    const errors = [];
    checkHljsContrast(errors);
    assert.deepEqual(errors, []);
  });

  test('MUTATION — every one of the twelve tokens is really gated', () => {
    // The exemption this replaced meant two tokens could be driven to near-zero
    // contrast and the gate stayed green. If one ever comes back, exactly this
    // fails, and it fails per-token rather than in aggregate.
    for (const token of HLJS_TOKENS) {
      const dir = themesWithMutation(token);
      const errors = [];
      checkHljsContrast(errors, dir);
      fs.rmSync(dir, { recursive: true, force: true });
      assert.notDeepEqual(errors, [], `${token} driven to near-invisible must fail the gate`);
      assert.ok(errors.join(' ').includes(token), `the failure must NAME ${token}, not just count it`);
    }
  });

  test('no shipped value sits under the floor — comments and punctuation included', () => {
    const under = [];
    for (const f of fs.readdirSync(THEMES).sort()) {
      if (!f.endsWith('.css')) continue;
      const map = tokens(flatten(f.replace(/\.css$/, '')));
      for (const mode of ['light', 'dark']) {
        const bg = catResolve(map, '--code-bg', mode);
        if (!bg) continue;
        for (const t of HLJS_TOKENS) {
          if (!map.has(t)) continue;
          const fg = catResolve(map, t, mode);
          if (fg && catContrast(fg, bg) < FLOOR) {
            under.push(`${f}/${mode} ${t} ${fg} on ${bg} = ${catContrast(fg, bg).toFixed(2)}`);
          }
        }
      }
    }
    assert.deepEqual(under, [], `sub-AA syntax colors: ${under.join('; ')}`);
  });

  test('DESIGN — a comment is still the quietest thing in the panel', () => {
    // The repair had to satisfy two things at once: clear the floor, and stay
    // de-emphasized. Lifting a comment ABOVE the code it annotates would be a
    // different defect from the one that was fixed, and a contrast gate cannot
    // see it — this is the assertion that keeps the fix honest.
    const louder = [];
    for (const f of fs.readdirSync(THEMES).sort()) {
      if (!f.endsWith('.css')) continue;
      const map = tokens(flatten(f.replace(/\.css$/, '')));
      for (const mode of ['light', 'dark']) {
        const bg = catResolve(map, '--code-bg', mode);
        const cfg = map.has('--hljs-comment') && catResolve(map, '--hljs-comment', mode);
        if (!bg || !cfg) continue;
        const comment = catContrast(cfg, bg);
        for (const t of HLJS_TOKENS) {
          // `--hljs-punctuation` is quiet by the same design and lands at the same
          // floor, so the two sit within a few hundredths of each other; the
          // meaningful comparison is against the tokens that carry the CODE.
          if (t === '--hljs-comment' || t === '--hljs-punctuation' || !map.has(t)) continue;
          const fg = catResolve(map, t, mode);
          if (fg && catContrast(fg, bg) < comment) {
            louder.push(`${f}/${mode} ${t} ${catContrast(fg, bg).toFixed(2)} < comment ${comment.toFixed(2)}`);
          }
        }
      }
    }
    assert.deepEqual(louder, [], `comment is no longer the quietest: ${louder.join('; ')}`);
  });

  test('indaco specifically — the live defect this gate was written by', () => {
    const map = tokens(flatten('indaco'));
    const bg = catResolve(map, '--code-bg', 'light');
    const fg = catResolve(map, '--hljs-literal', 'light');
    assert.equal(bg, '#003d66');
    assert.ok(catContrast(fg, bg) >= FLOOR,
      `indaco --hljs-literal ${fg} on ${bg} = ${catContrast(fg, bg).toFixed(2)}:1`);
  });
});
