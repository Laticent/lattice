/**
 * Unit: palette resolution.
 *
 * Every palette must define the categorical cycle (--cN-light/--cN-dark
 * for N=1..12) and the structural diagram tokens (stroke, line, state,
 * note, error) consumed by the renderer bridges and the
 * palette-blind overrides in lattice-diagram.css.
 *
 * test/unit/mermaid-var-map.test.js cross-checks the emulator's
 * MERMAID_VAR_MAP against the palette tokens automatically; this file
 * is the source-of-truth required list.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadPalette } = require('../../helpers/palette');

describe('palette', () => {
  const REQUIRED_DIAGRAM_VARS = [
    // Brand primitives consumed by the renderer
    'bg', 'bg-alt', 'text-heading',

    // Non-flipping ink: paired with --cN-light fills (dark) and --cN-dark
    // fills (white-ish). Themes can override --cat-on-mark to a cream
    // off-white if pure #FFFFFF feels icy on warm-deep slots.
    'cat-on-fill', 'cat-on-mark',

    // Categorical cycle (12 paired slots)
    'cat-1-fill',  'cat-2-fill',  'cat-3-fill',  'cat-4-fill',
    'cat-5-fill',  'cat-6-fill',  'cat-7-fill',  'cat-8-fill',
    'cat-9-fill',  'cat-10-fill', 'cat-11-fill', 'cat-12-fill',
    'cat-1-mark',   'cat-2-mark',   'cat-3-mark',   'cat-4-mark',
    'cat-5-mark',   'cat-6-mark',   'cat-7-mark',   'cat-8-mark',
    'cat-9-mark',   'cat-10-mark',  'cat-11-mark',  'cat-12-mark',

    // Structural (per-theme: saturated brand stroke, edge line, secondary
    // warm accent)
    'diagram-stroke', 'diagram-line', 'diagram-accent-warm',

    // (Quadrant charts — native + Mermaid — now read the cN categorical
    // palette directly; the former --c-quadrant-* slot tokens are retired.)

    // Universal semantic palette (status-signaling — defaults in lattice.css,
    // themes override as needed)
    'diagram-active',  'diagram-active-mark',
    'diagram-done',  'diagram-done-mark',
    'diagram-critical',       'diagram-critical-mark',
    'diagram-today',
    'diagram-note',
  ];

  for (const name of ['indaco', 'cuoio']) {
    test(`palette: ${name} defines all ${REQUIRED_DIAGRAM_VARS.length} required palette tokens`, () => {
      const p = loadPalette(name);
      const missing = REQUIRED_DIAGRAM_VARS.filter(v => !p.vars[v]);
      assert.deepEqual(missing, [], `missing vars in themes/${name}/${name}.css: ${missing.join(', ')}`);
    });

    test(`palette: ${name} no longer carries the legacy MERMAID THEME CSS sentinel`, () => {
      const p = loadPalette(name);
      assert.equal(
        p.raw.indexOf('===== MERMAID THEME CSS ====='),
        -1,
        `themes/${name}/${name}.css still contains the legacy sentinel comment; the post-sentinel CSS now lives in lattice-diagram.css`,
      );
    });

    test(`palette: ${name} no longer declares legacy --mermaid-* tokens`, () => {
      const p = loadPalette(name);
      const legacy = Object.keys(p.vars).filter(v => v.startsWith('mermaid-'));
      assert.deepEqual(legacy, [], `themes/${name}/${name}.css still declares legacy tokens: ${legacy.join(', ')}`);
    });
  }
});
