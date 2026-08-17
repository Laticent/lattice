/**
 * Unit: the journey STAGE RIBBON's label is legible on the bar it actually sits on —
 * every shipped palette, both color schemes.
 *
 * THE BUG THIS EXISTS TO CATCH (#1702). `--journey-stage-bg` is `--bg-alt` deepened
 * 30% toward `--surface-inverse`. That is a CANVAS-DERIVED surface: it lands mid-slate
 * on a light canvas, dark on a dark one, and near-white on the print band (whose
 * `--surface-inverse` is a light `#ECECEC`). A comment in `journey.styles.css` asserted
 * the opposite — "always a dark surface on BOTH canvases" — and on the strength of it
 * the label ink was pinned to `--on-dark-primary`, white at 92% alpha.
 *
 * On the dark canvas that is right. On the light canvas it is 92%-white on mid slate:
 * 1.87:1 in indaco, and 31 of 64 palette x scheme pairs below even the 3:1 large-text
 * floor — EVERY light-mode pair. The rendered gallery showed only 3 failing runs, on
 * one slide, in one palette; the defect was 31 pairs wide. That gap is why this file
 * exists ALONGSIDE the rendered gate in `test/integration/invariants/slide-contrast.test.js`
 * rather than being replaced by it: a render proves a real surface, a sweep proves the
 * whole matrix, and #1702 needed both to be described honestly.
 *
 * WHY THE SURFACE IS STATED HERE, not derived from whatever token the CSS names. Same
 * reasoning as `journey-chip-contrast.test.js` beside it: a gate that reads the fill
 * out of the same rule it reads the ink out of cannot fail, because re-pointing the
 * ink also re-points what it is judged against. WHERE the label is drawn — on
 * `--journey-stage-bg`, in both the landscape ribbon and the portrait stage name — is
 * a fact about the component, so it is asserted independently below and the recipe is
 * pinned. The ink is then read from the real stylesheet and scored against it.
 *
 * THE FLOOR IS AA 4.5:1, not the 3:1 the rendered prober applies. The prober classes
 * these labels as WCAG "large text" because they compute to ~45px — but only in canvas
 * units, on a nominally 3840px-wide slide. At any size a human looks at, `--fs-meta`
 * is small text. Holding the honest floor here costs nothing (the shipped ink clears
 * it with 1.13:1 of headroom, worst pair) and stops the ratio drifting into the gap
 * between the two thresholds.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(REPO, 'themes');
const JOURNEY_CSS = path.join(REPO, 'lib', 'components', 'chart', 'journey', 'journey.styles.css');
const AA = 4.5;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = stripComments(fs.readFileSync(JOURNEY_CSS, 'utf8'));

/** Flatten a palette's `@import` chain, base first — mirrors the cascade. */
function paletteSource(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  if (name === 'lattice') return fs.readFileSync(path.join(REPO, 'lib', 'base', 'base.tokens.css'), 'utf8');
  const file = path.join(THEMES_DIR, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of stripComments(css).matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${paletteSource(m[1], seen)}\n`;
  return `${out}${css}`;
}

function tokenMap(css) {
  const vars = Object.create(null);
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1].slice(2)] = m[2].trim();
  return vars;
}

/** The component's own `:root` block — the stage tokens are declared there, not by a palette. */
function componentRoot() {
  const at = CSS.indexOf(':root {');
  assert.notEqual(at, -1, 'journey.styles.css has no :root block');
  return tokenMap(CSS.slice(at, CSS.indexOf('\n}', at)));
}

function resolve(vars, expr, dark) {
  const out = String(resolveTokenExpr(String(expr).trim(), vars, dark)).trim();
  const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(out);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

function relLum(hex) {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Composite a possibly-translucent ink over its opaque backdrop, in sRGB — what the
 * browser does. `--on-dark-primary` is `color-mix(in srgb, white 92%, transparent)`,
 * and scoring it as if it were opaque white would have UNDER-reported the very defect
 * this file covers.
 */
function flatten(inkExpr, vars, dark, backdropHex) {
  const raw = String(resolveTokenExpr(inkExpr, vars, dark)).trim();
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (rgba) {
    const p = rgba[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && !p.some(Number.isNaN)) {
      const a = p.length > 3 ? p[3] : 1;
      const b = backdropHex.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
      return `#${p.slice(0, 3).map((c, i) => Math.round(c * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return resolve(vars, inkExpr, dark);
}

const PALETTES = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4));

/** Read a declaration out of a real rule block, so the test tracks the stylesheet. */
function decl(block, prop) {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`);
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

describe('journey stage labels clear AA on the stage ribbon they sit on', () => {
  test('the stage ribbon and the portrait stage name both paint the stage token pair', () => {
    // The surface fact, asserted independently of the sweep below (see header). If a
    // consumer stops using the pair, this sweep is measuring something unshipped.
    const ribbon = /section\.journey \.journey-stage \{([^}]*)\}/.exec(CSS);
    assert.ok(ribbon, 'could not find the landscape .journey-stage rule');
    assert.equal(decl(ribbon[1], 'background'), 'var(--journey-stage-bg)');
    assert.equal(decl(ribbon[1], 'color'), 'var(--journey-stage-fg)');

    const vstage = /section\.journey \.journey-vstage-name \{([^}]*)\}/.exec(CSS);
    assert.ok(vstage, 'could not find the portrait .journey-vstage-name rule');
    assert.equal(decl(vstage[1], 'background'), 'var(--journey-stage-bg)');
    assert.equal(decl(vstage[1], 'color'), 'var(--journey-stage-fg)');
  });

  test('the two declaration sites agree — :root and section.print.journey', () => {
    // journey.styles.css declares the whole derived block TWICE: once at :root, and
    // again on `section.print.journey` so it re-resolves against the print band (a
    // :root-declared custom property cannot see a section-scoped remap). A fix applied
    // to one site only is half a fix, and that is exactly the shape #1702 shipped in.
    const printAt = CSS.indexOf('section.print.journey {');
    assert.notEqual(printAt, -1, 'could not find the section.print.journey block');
    const printBlock = CSS.slice(printAt, CSS.indexOf('\n}', printAt));
    const root = componentRoot();
    const print = tokenMap(printBlock);
    for (const tok of ['journey-stage-bg', 'journey-stage-fg']) {
      assert.ok(root[tok], `--${tok} is not declared at :root`);
      assert.equal(print[tok], root[tok],
        `--${tok} differs between :root and section.print.journey — the print band re-declares ` +
        'the block to re-resolve it, so the two must stay byte-identical');
    }
  });

  test('the stage fill is still the canvas-derived recipe this test scores against', () => {
    // Pinned, because the whole judgment below is "canvas-derived ink for a
    // canvas-derived fill". Push this mix toward --surface-inverse and the right ink
    // changes with it — the assertion should be re-argued, not silently re-passed.
    assert.equal(componentRoot()['journey-stage-bg'],
      'color-mix(in oklab, var(--bg-alt) 70%, var(--surface-inverse))',
      'the stage fill recipe changed — re-derive which ink tier belongs on it (#1702)');
  });

  test(`stage label ink clears ${AA}:1 on every palette, both schemes`, () => {
    const root = componentRoot();
    const inkExpr = root['journey-stage-fg'];
    const bgExpr = root['journey-stage-bg'];
    assert.ok(inkExpr && bgExpr, 'the stage token pair is not declared at :root');

    const failures = [];
    let pairs = 0;
    for (const name of PALETTES) {
      const vars = { ...tokenMap(paletteSource(name)), ...root };
      if (!vars['bg-alt'] || !vars['surface-inverse']) continue;
      for (const dark of [false, true]) {
        const bg = resolve(vars, bgExpr, dark);
        if (!bg) continue;
        const fg = flatten(inkExpr, vars, dark, bg);
        if (!fg) continue;
        pairs += 1;
        const ratio = contrast(fg, bg);
        if (ratio < AA) failures.push(`${name} ${dark ? 'dark' : 'light'}: ${ratio.toFixed(2)}:1 (${fg} on ${bg})`);
      }
    }
    assert.ok(pairs >= 60, `only ${pairs} pairs measured — the palette walk is not reaching the shipped set`);
    assert.deepEqual(failures, [],
      `stage label below AA on ${failures.length} of ${pairs} pairs:\n  ${failures.slice(0, 12).join('\n  ')}`);
  });
});
