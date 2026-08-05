/**
 * Unit: the journey mood badges are legible on the surface they actually sit
 * on — every shipped palette, both color schemes.
 *
 * THE BUG THIS EXISTS TO CATCH. `journey` has two variants and each paints a
 * small bold badge over a mood-tinted chip, but they sit on DIFFERENT surfaces:
 *
 *   heatmap   `.journey-task::after` sets `background: var(--bg)` — the badge is
 *             a disc on the slide canvas, so `--cat-N-ink` (solved against --bg
 *             and --bg-alt) is exactly the right token and clears everywhere.
 *   weighted  `.journey-task::after` has NO background — the number sits
 *             directly on the chip, `color-mix(--mood-bg 28%, --bg-alt)`. That
 *             is a THIRD surface the ink tier is not solved against.
 *
 * #1263 moved the heatmap badge onto the ink tier and, in the same edit, pointed
 * the weighted badge at `var(--mood-ink, …)` — a token the weighted rules never
 * set, so the change was inert and the badge kept painting the 3:1 mark as small
 * text: 137 of 320 pairs below AA, worst 1.27:1. Wiring the token would not have
 * fixed it either (110 of 320 still short, worst 3.04:1), because the chip is not
 * a surface any categorical ink is gated against. The weighted badge therefore
 * takes `--text-heading`, which clears every pair (worst 4.79:1) and is the
 * honest token for a number whose subject is VOLUME — the mood is already
 * carried by the chip's border-top and its tint.
 *
 * WHY THE SURFACE TABLE IS STATED HERE. Same reasoning as
 * diagram-ink-contrast.test.js: a gate that derives the surface from whatever
 * token the CSS happens to name cannot fail, because re-pointing the ink also
 * re-points what it is judged against. WHERE each badge is drawn is a fact about
 * the component's box model, so it is asserted independently below; the inks are
 * then read out of the real stylesheet. Point a badge at the wrong token and
 * this bites.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr, mixSrgb } = require('../../../lib/core/resolve-token-expr');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(REPO, 'themes');
const JOURNEY_CSS = path.join(REPO, 'lib', 'components', 'chart', 'journey', 'journey.styles.css');
const AA = 4.5;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

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

/**
 * The mood scale is declared by the COMPONENT (journey.styles.css `:root`), not
 * by any palette — it is a derivation over the palette's categorical tier. Read
 * it from the component's own `:root` block so the test tracks the real recipe
 * instead of restating it.
 */
function moodScale() {
  const at = CSS.indexOf(':root {');
  assert.notEqual(at, -1, 'journey.styles.css has no :root block');
  const end = CSS.indexOf('\n}', at);
  return tokenMap(CSS.slice(at, end));
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

// ── What the stylesheet actually says ────────────────────────────────────────
const CSS = stripComments(fs.readFileSync(JOURNEY_CSS, 'utf8'));

/** The `color:` of a variant's `::after` badge, read from the real rule. */
function badgeInk(variant) {
  const re = new RegExp(`section\\.journey\\.${variant}\\s+\\.journey-task::after\\s*\\{([^}]*)\\}`);
  const block = re.exec(CSS);
  assert.ok(block, `could not find the ${variant} badge rule — this test is looking at the wrong selector`);
  const color = /(?:^|[;{\s])color\s*:\s*([^;]+);/.exec(block[1]);
  assert.ok(color, `the ${variant} badge rule declares no color`);
  return { value: color[1].trim(), block: block[1] };
}

/** The mood scale, read from the real declarations rather than restated. */
function moodExpr(vars, n, dark) {
  const v = vars[`journey-mood-${n}`];
  assert.ok(v, `--journey-mood-${n} is not declared`);
  return resolve(vars, v, dark);
}

const PALETTES = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.slice(0, -4));

describe('journey mood badges clear AA on the surface they sit on', () => {
  // The surface fact, stated independently of the CSS (see header).
  const SURFACES = {
    // The heatmap badge paints itself a `--bg` disc, so it lands on the canvas.
    heatmap:  { on: (vars, _mood, dark) => resolve(vars, 'var(--bg)', dark) },
    // The weighted badge has no background: it lands on the tinted chip.
    weighted: {
      on: (vars, mood, dark) => {
        const bgAlt = resolve(vars, 'var(--bg-alt)', dark);
        return bgAlt && mood ? mixSrgb(mood, bgAlt, 0.72) : null; // 28% mood + 72% bg-alt
      },
    },
  };

  test('the surface table matches the stylesheet (a badge that gains or loses a background invalidates it)', () => {
    const heat = badgeInk('heatmap');
    const weighted = badgeInk('weighted');
    assert.match(heat.block, /background\s*:\s*var\(--bg\)/,
      'the heatmap badge no longer paints itself a --bg disc — SURFACES.heatmap is stale');
    assert.doesNotMatch(weighted.block, /(?:^|[;{\s])background\s*:/,
      'the weighted badge gained a background — SURFACES.weighted (bare chip) is stale');
    assert.match(weighted.block, /background\s*:/.test(weighted.block) ? /$^/ : /color\s*:/,
      'sanity: the weighted badge still declares a color');
  });

  test('the weighted chip recipe matches SURFACES.weighted', () => {
    const chip = /section\.journey\.weighted\s+\.journey-task\s*\{([^}]*)\}/.exec(CSS);
    assert.ok(chip, 'could not find the weighted chip rule');
    assert.match(chip[1], /background:\s*color-mix\(in oklab,\s*var\(--mood-bg\)\s*28%,\s*var\(--bg-alt\)\)/,
      'the weighted chip mix changed — the 28%/72% blend in SURFACES.weighted is stale');
  });

  for (const variant of ['heatmap', 'weighted']) {
    test(`${variant} badge ink clears ${AA}:1 on every palette, both schemes, all five moods`, () => {
      const ink = badgeInk(variant).value;
      const moods = moodScale();
      const failures = [];
      let pairs = 0;
      for (const name of PALETTES) {
        const vars = { ...tokenMap(paletteSource(name)), ...moods };
        if (!vars['cat-2-mark']) continue;
        for (const dark of [false, true]) {
          for (const n of [1, 2, 3, 4, 5]) {
            const mood = moodExpr(vars, n, dark);
            const surface = SURFACES[variant].on(vars, mood, dark);
            // The heatmap badge resolves --mood-ink per mood; substitute it so the
            // declaration is evaluated exactly as the cascade would.
            const scoped = { ...vars, 'mood-ink': vars[`journey-mood-${n}-ink`], 'mood-bg': vars[`journey-mood-${n}`] };
            const fg = resolve(scoped, ink, dark);
            if (!fg || !surface) continue;
            pairs += 1;
            const ratio = contrast(fg, surface);
            if (ratio < AA) failures.push(`${name} ${dark ? 'dark' : 'light'} mood${n}: ${ratio.toFixed(2)}:1 (${fg} on ${surface})`);
          }
        }
      }
      assert.ok(pairs >= 300, `only ${pairs} pairs measured — the palette walk is not reaching the shipped set`);
      assert.deepEqual(failures, [],
        `${variant} badge below AA on ${failures.length} of ${pairs} pairs:\n  ${failures.slice(0, 12).join('\n  ')}`);
    });
  }
});
