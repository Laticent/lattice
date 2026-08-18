/**
 * Unit: a baked Mermaid diagram's GRAPHICAL objects are visible — every shipped
 * palette, both color schemes.
 *
 * THE BUG THIS EXISTS TO CATCH. `--diagram-stroke` drew the outline of fourteen
 * different things (node border, actor border, gantt bar border, pie outer stroke,
 * the quadrant frame, both xy axis rules, …) and every palette declared it as a
 * flat, mode-invariant literal — `#000000` on onyx, `#1F4A6E` on indaco. On a light
 * canvas that is a dark line on a white page; on a DARK canvas it is a dark line on
 * a dark page. Measured before the fix: a flowchart node, gantt bar, pie slice and
 * sequence actor had NO discernible edge in 24 of 64 palette-modes, worst 1.55:1,
 * and the quadrant frame and both xy axis rules sat at exactly 1.00:1 on the a11y
 * family — black on black.
 *
 * NOTHING CAUGHT IT, AND THE NEAR MISS IS THE POINT. `containment-contrast.test.js`
 * gates one of those fourteen sites — the subgraph cluster — and its own docblock
 * names this exact defect, because the cluster is where it was first found. The
 * fix moved that ONE key to `--c-container-edge` and left thirteen behind, so the
 * cluster became the only clean row in a table of failures. A gate that covers one
 * member of a family reads, from the outside, exactly like a gate that covers the
 * family.
 *
 * WHY THE INK GATE COULD NOT SEE IT. `diagram-ink-contrast.test.js` is built as
 * *ink key → the surface that ink lands on*, at the 4.5:1 text floor. A stroke is
 * not ink and has no such pairing, so the whole tier was outside its shape. The two
 * gates deliberately do not overlap: text there, graphics here.
 *
 * WHAT "VISIBLE" MEANS, and why it is not a single ratio. See
 * `test/helpers/diagram-surfaces.js` — a shape passes if ANY of its three candidate
 * edges clears the floor, because a node with an invisible border but a fill that
 * separates from the canvas is perfectly legible. Judging border-vs-fill alone
 * would fail shapes that read fine and teach the next person to "fix" them.
 *
 * SCOPE HONESTLY STATED. This judges the BAKED `themeVariables` — the colors
 * Mermaid resolves to literal hex before the SVG reaches the page. It is therefore
 * OPTIMISTIC: `mermaid.css` puts `stroke-opacity` below 1 on several strokes (the
 * radar graticule at 0.20, its axis lines at 0.5) and a translucent stroke blends
 * toward whatever is under it, so a pair passing here at 3.05:1 can still render
 * below the floor. This gate never reports a failure that is not real; it can miss
 * one.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDiagramTheme, MERMAID_VAR_MAP } = require('../../../lib/core/mermaid-theme-map');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');
const { SHAPES, LINES, NON_TEXT_FLOOR } = require('../../helpers/diagram-surfaces');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(REPO, 'themes');
const LAYOUT_CSS = fs.readFileSync(path.join(REPO, 'dist', 'lattice.css'), 'utf8');
const THEMES = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css') && !f.includes('audit'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

/** Every palette, with its `@import` chain flattened (base first, then overrides). */
function paletteSource(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  const file = path.join(THEMES_DIR, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${paletteSource(m[1], seen)}\n`;
  return out + css;
}

function declaredVars(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const m of stripped.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)[;}]/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function relativeLuminance(hex) {
  const c = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => Number.parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = ch.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/**
 * No Mermaid round-trip here, deliberately. Every key these tables name is one the
 * engine SETS, and mermaid's `base.getThemeVariables` only derives the keys we
 * leave unstated — so running our own `buildDiagramTheme` output through it is a
 * no-op for this gate, and importing an ESM build chunk whose filename carries a
 * build hash would make a unit test depend on mermaid's bundling. The on-demand
 * audit does take that round-trip, because its lever census needs the derived keys.
 */
function themeFor(theme, dark) {
  const raw = declaredVars(`${LAYOUT_CSS}\n${paletteSource(theme)}`);
  return buildDiagramTheme((name) => resolveTokenExpr(raw[name], raw, dark) ?? '');
}

describe('baked diagram graphics clear the 3:1 non-text floor', () => {
  test('every key the tables name is a real key in the map', () => {
    // Without this, a rename in the map turns a row into a silent no-op — the pair
    // resolves to undefined, `isHex` rejects it, and the gate skips the very
    // surface it was written to hold.
    const named = new Set();
    for (const [, ...edges] of SHAPES) for (const [a, b] of edges) { named.add(a); named.add(b); }
    for (const [, a, b] of LINES) { named.add(a); named.add(b); }
    const exists = (key) => {
      const [head, nested] = key.split('.');
      const entry = MERMAID_VAR_MAP[head];
      if (!entry) return false;
      return nested === undefined ? true : Boolean(entry.nested?.[nested]);
    };
    assert.deepEqual([...named].filter((k) => !exists(k)), [],
      'these keys are named by the surface tables but are not in MERMAID_VAR_MAP');
  });

  test('the tables cover a substantial surface', () => {
    // A cheap backstop against the tables being gutted to make a failure go away.
    assert.ok(SHAPES.length >= 9, `expected at least 9 shapes, got ${SHAPES.length}`);
    assert.ok(LINES.length >= 14, `expected at least 14 lines, got ${LINES.length}`);
  });

  for (const theme of THEMES) {
    for (const dark of [false, true]) {
      const scheme = dark ? 'dark' : 'light';
      test(`${theme} · ${scheme}`, () => {
        const vars = themeFor(theme, dark);
        const failures = [];

        for (const [name, ...edges] of SHAPES) {
          const ratios = [];
          for (const [aKey, bKey] of edges) {
            const a = get(vars, aKey);
            const b = get(vars, bKey);
            if (isHex(a) && isHex(b)) ratios.push({ r: contrast(a, b), aKey, bKey, a, b });
          }
          if (!ratios.length) continue;
          const best = ratios.reduce((m, x) => (x.r > m.r ? x : m));
          if (best.r < NON_TEXT_FLOOR) {
            failures.push(
              `${name}: NO edge clears ${NON_TEXT_FLOOR}:1 — best is ${best.aKey} (${best.a}) on ` +
              `${best.bKey} (${best.b}) = ${best.r.toFixed(2)}:1`,
            );
          }
        }

        for (const [name, aKey, bKey] of LINES) {
          const a = get(vars, aKey);
          const b = get(vars, bKey);
          if (!isHex(a) || !isHex(b)) continue;
          const r = contrast(a, b);
          if (r < NON_TEXT_FLOOR) {
            failures.push(`${name}: ${aKey} (${a}) on ${bKey} (${b}) = ${r.toFixed(2)}:1`);
          }
        }

        assert.deepEqual(failures, [],
          `${theme} (${scheme}) bakes diagram graphics below the ${NON_TEXT_FLOOR}:1 non-text floor:\n  ` +
          `${failures.join('\n  ')}\n` +
          'A Mermaid SVG bakes its colors, so no CSS can rescue this after the fact. Either the key is ' +
          'fed from the wrong tier in lib/core/mermaid-theme-map.js — a stroke drawn on the CANVAS wants ' +
          'a canvas-curated token, one drawn on a categorical FILL wants --cat-on-fill — or the palette ' +
          'needs to curate the token so it clears both of its canvases.');
      });
    }
  }
});
