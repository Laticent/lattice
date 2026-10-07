/**
 * Self-policing gate for the universal token system (the "no magic, enforced
 * by CI" promise of engineering/decisions/2026-06-11-universal-token-system.md).
 *
 * Each group introduced a self-describing vocabulary. This test asserts every
 * one of those names is DEFINED and RESOLVES to a non-empty value in the
 * shipped engine + a representative theme, so a dropped name (or a half-done
 * flip) fails the build instead of silently regressing a render path.
 *
 * Since the canonical flip (groups 1–5) this IS the only vocabulary the engine
 * + themes declare — the old names are retired. This gate guards the new names;
 * contrast / token-parity / mermaid-var-map cover their values + AA.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadPalette } = require('../../helpers/palette');

// The universal vocabulary, phase by phase. Add a phase's names here when it
// lands; the flip later removes the corresponding old names elsewhere.
const VOCAB = {
  'phase 1 · categorical': [
    ...Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-fill`),
    ...Array.from({ length: 12 }, (_, i) => `cat-${i + 1}-mark`),
    'cat-on-fill', 'cat-on-mark',
  ],
  'phase 2 · diagram-structural': ['diagram-stroke', 'diagram-line', 'diagram-accent-warm'],
  'phase 3 · status': ['status-pass', 'status-warn', 'status-fail', 'status-info', 'status-mute'],
  'phase 3 · diagram lifecycle': [
    'diagram-active', 'diagram-active-mark', 'diagram-done', 'diagram-done-mark',
    'diagram-critical', 'diagram-critical-mark', 'diagram-today', 'diagram-note',
  ],
  'phase 4 · surfaces / scheme': [
    'surface-inverse',
    'scheme-dark-bg', 'scheme-dark-bg-alt', 'scheme-dark-border',
    'scheme-dark-text-heading', 'scheme-dark-text-body', 'scheme-dark-text-display',
  ],
  'phase 5 · sequential': Array.from({ length: 10 }, (_, i) => `seq-${[50, 100, 200, 300, 400, 500, 600, 700, 800, 900][i]}`),
  // Phase 6 (chart categorical, --chart-cat-*) is intentionally NOT here: it is
  // scoped to `section.chart-frame` (Tier-3 component scope), not :root, so the
  // :root parser can't see it — that scoping is the system working as designed.
  // Its resolution + AA is gated by test/unit/palette/chart-contrast.test.js.
};

describe('universal token vocabulary', () => {
  for (const theme of ['indaco', 'cuoio']) {
    const { vars } = loadPalette(theme);
    for (const [phase, names] of Object.entries(VOCAB)) {
      test(`${theme}: ${phase} — every name is defined and resolves`, () => {
        const missing = names.filter((n) => !vars[n] || String(vars[n]).trim() === '');
        assert.deepEqual(missing, [],
          `themes/${theme}/${theme}.css + dist/lattice.css do not resolve: ${missing.join(', ')}\n` +
          `A universal-token alias was dropped or a flip left a name undefined.`);
      });
    }
  }
});
