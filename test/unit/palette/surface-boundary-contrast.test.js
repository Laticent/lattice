/**
 * Unit: a CARD HAS A VISIBLE EDGE — every shipped palette, both color schemes.
 *
 * THE DEFECT THIS EXISTS TO CATCH. `--border` draws the boundary of nearly every
 * framed thing the engine paints — the card, the table rule, the kanban lane, the
 * math frame, the image and video chrome, the code panel, the kpi tile, the chart
 * hairline: 150 read sites across 52 files. Every brand palette declared it as a
 * pale hairline one or two steps off its own canvas. Measured before the fix, a
 * card had NO edge reaching 3:1 in 50 of 64 palette-modes — not its border against
 * the canvas, not its border against its own fill, and not its fill against the
 * canvas. `indaco` was the worst at 1.11:1: a card boundary that is, to a contrast
 * meter, not there at all.
 *
 * THE SPLIT IS WHY IT SURVIVED SO LONG. The 14 palette-modes that DID clear were
 * `onyx` and the five a11y palettes that `@import` it — 17-21:1, because onyx
 * authors a deliberate heavy rule (`/* heavy black border light-mode *\/`). So the
 * accessibility family looked like proof the token was fine, when it was actually
 * the only family holding the line. A spot check of onyx reports 17:1 and moves on.
 *
 * WHY NO EXISTING GATE SAW IT. `theme-surface-aa.test.js` runs the `contrast-audit`
 * PAIRS over all 32 themes, but that matrix is INK on SURFACE — `--border` is
 * neither, so it was never a member. And `check-slide-contrast.js`, the rendered-DOM
 * gate, does not merely skip `--border`: it EXEMPTS it, resolving the token to add
 * its color to `exemptInks` so runs painted with it are bucketed as decorative. The
 * one gate that measures real pixels was told, by construction, to look away.
 *
 * WHAT IS ASSERTED, and why it is the border rather than the fill. A card is a fill
 * plus a boundary, and only one of those can carry the load. The fill cannot: a card
 * tint that separated from the canvas at 3:1 would be a dark slab, not a card, and
 * `--bg-alt` sits at ~1.08:1 against `--bg` on every palette by design. So the
 * BORDER owes the contrast, against BOTH surfaces it touches — the canvas outside it
 * and the card fill inside it. Clearing only one leaves an edge that dissolves on
 * the other side.
 *
 * SCOPE HONESTLY STATED. This reads the declared token values, so it judges the
 * boundary the palette SHIPS, not the one a given component composes. A component
 * that paints its own edge from a categorical token (`kanban`'s lane, `journey`'s
 * stage) is outside this gate and belongs to its own; a component that tints
 * `--border` down with `color-mix` renders below what this reports. Like the diagram
 * non-text gate, this never reports a failure that is not real, and it can miss one.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(REPO, 'themes');
const LAYOUT_CSS = fs.readFileSync(path.join(REPO, 'dist', 'lattice.css'), 'utf8');
const THEMES = fs
  .readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css') && !f.includes('audit'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

/** WCAG 2.1 SC 1.4.11 Non-text Contrast. A boundary is a graphical object. */
const NON_TEXT_FLOOR = 3;

/** The two surfaces a card border touches: the canvas outside, the fill inside. */
const SURFACES = [
  ['bg', 'the canvas outside the card'],
  ['bg-alt', 'the card fill inside it'],
];

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

function tokensFor(theme, dark) {
  const raw = declaredVars(`${LAYOUT_CSS}\n${paletteSource(theme)}`);
  return (name) => resolveTokenExpr(raw[name], raw, dark) ?? '';
}

describe('a card boundary clears the 3:1 non-text floor', () => {
  test('the theme set is whole', () => {
    // Derived from the filesystem so a new palette is covered the day it lands —
    // and floored so the sweep cannot quietly shrink to a passing subset. This is
    // the guard `chart-contrast` learned the hard way, where a hardcoded list of 13
    // names silently omitted `carta`.
    assert.ok(THEMES.length >= 30, `expected the full theme set, saw ${THEMES.length}`);
  });

  for (const theme of THEMES) {
    for (const dark of [false, true]) {
      const scheme = dark ? 'dark' : 'light';
      test(`${theme} · ${scheme}`, () => {
        const get = tokensFor(theme, dark);
        const border = get('border');
        const failures = [];
        let judged = 0;

        for (const [surface, role] of SURFACES) {
          const bg = get(surface);
          if (!isHex(border) || !isHex(bg)) continue;
          judged += 1;
          const r = contrast(border, bg);
          if (r < NON_TEXT_FLOOR) {
            failures.push(
              `--border (${border}) on --${surface} (${bg}) = ${r.toFixed(2)}:1 — ${role}`,
            );
          }
        }

        // Without this, an unresolvable token turns the row into a silent pass —
        // the exact failure mode where a gate reports green over a surface it never
        // actually measured.
        assert.equal(judged, SURFACES.length,
          `${theme} (${scheme}): expected to judge ${SURFACES.length} surfaces, judged ${judged} — ` +
          '`--border`, `--bg` or `--bg-alt` did not resolve to a hex value.');

        assert.deepEqual(failures, [],
          `${theme} (${scheme}) ships a card boundary below the ${NON_TEXT_FLOOR}:1 non-text floor:\n  ` +
          `${failures.join('\n  ')}\n` +
          'A card is a fill plus a boundary, and the fill cannot carry it — `--bg-alt` sits near 1.08:1 ' +
          'against `--bg` on every palette by design, because a card tint that separated at 3:1 would be ' +
          'a slab. So the border owes the contrast against BOTH surfaces it touches. Curate `--border` ' +
          'toward a mid-tone in the palette\'s own hue (preserve hue and chroma, move lightness) until it ' +
          'clears the canvas and the card fill alike.');
      });
    }
  }
});
