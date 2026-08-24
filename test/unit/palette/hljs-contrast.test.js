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
 * exemption were repaired instead.
 *
 * Four things have to hold at once, and each has its own test below, because three
 * of them were broken at some point in getting here:
 *   1. every token is really gated — no exemption crept back;
 *   2. nothing ships under the floor;
 *   3. a comment sits below every token that carries CODE — legible did not become
 *      loud (say it that way: comment vs PUNCTUATION is a tie at the floor by
 *      design, and the looser "quietest thing in the panel" was false in 26 of 66);
 *   4. comment and punctuation do not COLLAPSE into one gray — the second defect
 *      the lift introduced, invisible to any contrast number.
 *
 * Plus the axis that hid the worst of it: the export path USED to load the base AFTER
 * the theme, so base tokens painted on theme panels and no theme's own ramp ever
 * rendered. #1527 flipped that. The base's value is the FALLBACK now — see the
 * export-path test, which is also where the population of that fallback is pinned,
 * because it is currently EMPTY and an empty population is a gate that cannot fail.
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
/**
 * The same flatten WITHOUT the engine base — a theme's own declarations, through its
 * `@import` chain of other THEMES only. `flatten` above merges the base in first, which
 * is the post-#1527 effective cascade and therefore the right map for "what paints";
 * this one answers the different question "did the palette declare this itself", which
 * is what decides whether the base's value is a fallback or dead weight.
 */
function flattenOwn(name, seen = new Set()) {
  if (name === 'lattice' || seen.has(name)) return '';
  seen.add(name);
  const file = path.join(THEMES, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    out += `${flattenOwn(m[1], seen)}\n`;
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

  test('DESIGN — a comment sits below every token that carries code', () => {
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
    assert.deepEqual(louder, [], `a code token is quieter than the comment: ${louder.join('; ')}`);
  });

  test('DESIGN — comment and punctuation do not collapse into one gray', () => {
    // Lifting both to the same floor made them 2/255 apart in `concrete` (OKLab
    // dE 0.0030, 1.01:1 against each other). Legible, indistinguishable, and a
    // different defect from the one the lift fixed — `.hljs-operator` and
    // `.hljs-comment` co-occur in SQL and Java, `.hljs-punctuation` in JSON.
    // Judged against the repo's own collapse floor rather than a new number.
    const { oklabDistance } = require('../../../lib/theme/color.js');
    const FLOOR_DE = 0.010;
    const collapsed = [];
    for (const f of fs.readdirSync(THEMES).sort()) {
      if (!f.endsWith('.css')) continue;
      const map = tokens(flatten(f.replace(/\.css$/, '')));
      for (const mode of ['light', 'dark']) {
        const c = map.has('--hljs-comment') && catResolve(map, '--hljs-comment', mode);
        const p = map.has('--hljs-punctuation') && catResolve(map, '--hljs-punctuation', mode);
        if (!c || !p) continue;
        const d = oklabDistance(c, p);
        if (d < FLOOR_DE) collapsed.push(`${f}/${mode} ${c} vs ${p} dE ${d.toFixed(4)}`);
      }
    }
    assert.deepEqual(collapsed, [], `comment/punctuation collapsed: ${collapsed.join('; ')}`);
  });

  test('EXPORT PATH — the base value is a FALLBACK, and nothing inherits it today', () => {
    // Before #1527 `lattice-emulator.js` concatenated `paletteCSS + layoutCSS`, so the
    // base loaded AFTER the theme and its --hljs-* won on every panel; a theme's own
    // value never painted on the export. That is what left indaco rendering
    // --hljs-literal at 3.71:1 and --hljs-comment at 3.06:1 while the gate reported
    // clean and a "Fixed" changelog entry shipped.
    //
    // The flip landed. The base's value now paints in exactly two places: on the
    // UN-THEMED bundle (what the golden corpus and a bare `dist/lattice.css` consumer
    // render with), and as the fallback for a token a theme's chain never declares.
    //
    // THE SECOND SET IS EMPTY — all 32 declare all twelve — and that is asserted rather
    // than left to make this test quietly vacuous. If a palette ever drops one, this
    // fails and names it, which is the moment the arm below starts doing work.
    const base = tokens(flatten('lattice'));
    const inheriting = [];
    const panels = new Map();
    for (const f of fs.readdirSync(THEMES).sort()) {
      if (!f.endsWith('.css')) continue;
      const own = tokens(flattenOwn(f.replace(/\.css$/, '')));
      const map = tokens(flatten(f.replace(/\.css$/, '')));
      for (const t of HLJS_TOKENS) {
        if (own.has(t)) continue;
        inheriting.push(`${f} inherits ${t}`);
        for (const mode of ['light', 'dark']) {
          const bg = catResolve(map, '--code-bg', mode);
          if (bg) panels.set(`${t}|${bg}`, { t, bg, who: `${f}/${mode}` });
        }
      }
    }
    assert.deepEqual(inheriting, [],
      `a palette stopped declaring a syntax color, so the base's value paints on its panel: ${inheriting.join('; ')}`);

    const under = [];
    for (const { t, bg, who } of panels.values()) {
      const fg = catResolve(base, t, 'light');
      if (fg && catContrast(fg, bg) < FLOOR) {
        under.push(`base ${t} ${fg} on ${who} ${bg} = ${catContrast(fg, bg).toFixed(2)}`);
      }
    }
    assert.deepEqual(under, [], `an inherited base syntax color is sub-AA: ${under.join('; ')}`);
  });

  test('indaco specifically — the live defect this gate was written by', () => {
    // Indaco declares Night Owl's `#ff5874` verbatim against a lighter panel than Night
    // Owl's. Since #1527 indaco's OWN value is what the export paints, so that is the
    // one assertion here; pairing the BASE's value with indaco's panel would now score
    // a combination nothing renders, which is the mistake this file has made twice.
    const map = tokens(flatten('indaco'));
    const own = tokens(flattenOwn('indaco'));
    const bg = catResolve(map, '--code-bg', 'light');
    assert.equal(bg, '#003d66');
    assert.ok(own.has('--hljs-literal'), 'indaco must declare its own --hljs-literal for this to be its surface');
    const fg = catResolve(map, '--hljs-literal', 'light');
    assert.ok(catContrast(fg, bg) >= FLOOR,
      `indaco --hljs-literal ${fg} on ${bg} = ${catContrast(fg, bg).toFixed(2)}:1`);
  });
});
