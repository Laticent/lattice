/**
 * Unit: the containment tier is legible in every theme, in both schemes.
 *
 * WHY THIS GATE EXISTS. `--c-container` shipped in the 91-token contract with
 * ZERO readers for its whole life — every theme author curated it and nothing
 * rendered it. The moment #1311 pointed Mermaid's `clusterBkg` at it, two latent
 * defects surfaced at once:
 *
 *   - onyx's dark arms were `#020202` / `#0B0B0B` — a 2/255 "step up" from its
 *     `#000000` canvas. The subgraph box was invisible (1.01:1), and so was it on
 *     the four a11y palettes that `@import` onyx.
 *   - The box was outlined in `--diagram-stroke`, a flat saturated DARK hex that
 *     does not flip with color-scheme. On a light container it reads 8-18:1; on a
 *     dark one it is dark-on-dark. No edge of a dark cluster box reached 3:1 in
 *     12 of the 14 themes.
 *
 * Neither was caught by anything, because "the token is declared" was the only
 * thing under test (`token-parity`). Declaring a colour is not the same as it
 * being usable. This asserts the tier is actually READABLE:
 *
 *   ink  >= 4.5:1 on the surface it sits on   — WCAG 1.4.3, it is label text
 *   edge >= 3.0:1 on the fill it outlines     — WCAG 1.4.11, the box boundary
 *                                               carries the GROUPING semantic;
 *                                               lose it and the diagram's
 *                                               structure is unreadable
 *
 * The fill itself is deliberately low-contrast against the canvas (it is a
 * surface, not an accent), which is exactly why the EDGE has to carry
 * perceivability and is gated instead.
 *
 * Both schemes are checked because `light-dark()` means one token is two colours
 * and a theme can be correct on one arm and broken on the other — which is
 * precisely how onyx shipped.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

const ROOT = path.join(__dirname, '..', '..', '..');

// The base themes — every other palette (`*-dark`, the a11y family) reaches
// these through `@import`, so fixing a base fixes its dependants.
const THEMES = [
  'ardesia', 'atelier', 'brina', 'burgundy', 'carbone', 'carta', 'concrete',
  'crepuscolo', 'cuoio', 'indaco', 'laguna', 'magnolia', 'mustard', 'onyx',
];

// ink-on-surface is body-size label text; edge-on-fill is a graphical object.
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3.0;

/** Raw `:root` token map — mirrors the emulator's own extraction. */
function rawRootVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const block of stripped.match(/:root\s*\{[^}]*\}/g) || []) {
    for (const decl of block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []) {
      const m = decl.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

function toRgb(value) {
  let h = String(value).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function relativeLuminance(rgb) {
  const a = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrast(a, b) {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  assert.ok(ra, `not a resolvable colour: ${a}`);
  assert.ok(rb, `not a resolvable colour: ${b}`);
  const [hi, lo] = [relativeLuminance(ra), relativeLuminance(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BASE_VARS = rawRootVars(fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'));

/** Every containment token in `theme`, resolved for one colour scheme. */
function resolveTier(theme, isDark) {
  const themeCss = fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8');
  const vars = { ...BASE_VARS, ...rawRootVars(themeCss) };
  const get = (token) => {
    assert.ok(vars[token], `themes/${theme}.css does not define --${token}`);
    return resolveTokenExpr(vars[token], vars, isDark);
  };
  return {
    container: get('c-container'),
    subcontainer: get('c-subcontainer'),
    containerEdge: get('c-container-edge'),
    subcontainerEdge: get('c-subcontainer-edge'),
    onContainer: get('c-on-container'),
    onSubcontainer: get('c-on-subcontainer'),
  };
}

describe('containment-contrast', () => {
  for (const theme of THEMES) {
    for (const isDark of [false, true]) {
      const scheme = isDark ? 'dark' : 'light';

      test(`${theme} / ${scheme}: label ink clears AA on both containment rungs`, () => {
        const t = resolveTier(theme, isDark);
        const onContainer = contrast(t.onContainer, t.container);
        const onSub = contrast(t.onSubcontainer, t.subcontainer);
        assert.ok(onContainer >= AA_TEXT,
          `--c-on-container ${t.onContainer} on --c-container ${t.container} is ${onContainer.toFixed(2)}:1, needs ${AA_TEXT}`);
        assert.ok(onSub >= AA_TEXT,
          `--c-on-subcontainer ${t.onSubcontainer} on --c-subcontainer ${t.subcontainer} is ${onSub.toFixed(2)}:1, needs ${AA_TEXT}`);
      });

      test(`${theme} / ${scheme}: the box edge is perceivable against the fill it outlines`, () => {
        // The fill is deliberately a barely-there step from the canvas, so the
        // EDGE is what makes the grouping readable. This is the assertion that
        // would have caught `--diagram-stroke` going dark-on-dark.
        const t = resolveTier(theme, isDark);
        const edge = contrast(t.containerEdge, t.container);
        const subEdge = contrast(t.subcontainerEdge, t.subcontainer);
        assert.ok(edge >= AA_NON_TEXT,
          `--c-container-edge ${t.containerEdge} on --c-container ${t.container} is ${edge.toFixed(2)}:1, needs ${AA_NON_TEXT}`);
        assert.ok(subEdge >= AA_NON_TEXT,
          `--c-subcontainer-edge ${t.subcontainerEdge} on --c-subcontainer ${t.subcontainer} is ${subEdge.toFixed(2)}:1, needs ${AA_NON_TEXT}`);
      });
    }
  }

  test('the ladder is monotonic — the second rung never steps back toward the canvas', () => {
    // The tier's doc comment promises "a monotonic luminance ladder away from the
    // canvas". Direction is NOT asserted as light-steps-down / dark-steps-up:
    // that reads the deck, not the token, and two themes break the shortcut —
    // concrete's light canvas is a mid grey (#B8B8B5) and carbone is dark-canvas
    // on BOTH arms. What must hold regardless is that the two rungs move the same
    // way: a subcontainer stepping back toward the canvas inverts the nesting cue
    // and reads as a box floating above its own parent. (Perceptibility is the
    // edge gate's job above — the fill is meant to be subtle, so a small step is
    // fine as long as the boundary carries.)
    for (const theme of THEMES) {
      for (const isDark of [false, true]) {
        const scheme = isDark ? 'dark' : 'light';
        const t = resolveTier(theme, isDark);
        const vars = { ...BASE_VARS, ...rawRootVars(fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8')) };
        const canvas = resolveTokenExpr(vars.bg, vars, isDark);
        const [lc, l1, l2] = [canvas, t.container, t.subcontainer]
          .map((c) => relativeLuminance(toRgb(c)));
        assert.notEqual(l1, lc,
          `${theme}/${scheme}: --c-container ${t.container} is the canvas ${canvas} — no ladder at all`);
        assert.ok((l1 - lc) * (l2 - l1) > 0,
          `${theme}/${scheme}: --c-subcontainer ${t.subcontainer} steps back toward the canvas `
          + `(canvas ${canvas} → container ${t.container} → sub ${t.subcontainer})`);
      }
    }
  });
});
