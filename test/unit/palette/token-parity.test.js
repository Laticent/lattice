/**
 * Unit: token-parity contract — every palette must SELF-DEFINE every variable
 * in the contract, not lean on the lattice.css cascade fallback.
 *
 * design/theming.md § "The variable contract": *Every palette must define every
 * variable below. A missing variable falls through to the cascade root
 * (typically unstyled).* This test locks that in across all 13 shipped themes so
 * a new theme — or a regression that deletes a token expecting the engine to
 * cover it — fails here instead of shipping a half-themed palette.
 *
 * The contract list and the parse mirror tools/theme-scorecard.js (which the
 * `scorecard:check` script runs). Engine-DERIVED tiers (--on-accent-secondary
 * /ghost/watermark, --accent-soft-body) are intentionally excluded — they
 * derive by opacity from a seam (--on-accent / --text-body) the theme owns.
 *
 * If this fails: the named theme is missing a curated token. Define it in
 * themes/<name>.css with the palette's own value — do not rely on the fallback.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');

const THEMES = [
  'cuoio', 'indaco', 'onyx', 'ardesia', 'atelier', 'brina', 'burgundy',
  'carbone', 'concrete', 'crepuscolo', 'laguna', 'magnolia', 'mustard', 'sakura',
];

const CONTRACT = [
  'bg', 'bg-alt', 'surface-inverse', 'border', 'text-display', 'text-heading',
  'text-body', 'text-secondary', 'text-label', 'text-muted', 'accent',
  'accent-soft', 'on-accent', 'code-text',
  'pass', 'fail', 'warn', 'pass-bg', 'fail-bg', 'warn-bg',
  'scheme-dark-bg', 'scheme-dark-bg-alt', 'scheme-dark-border', 'scheme-dark-text-heading',
  'scheme-dark-text-body', 'scheme-dark-text-display', 'scheme-dark-text-secondary',
  'scheme-dark-text-label', 'scheme-dark-text-muted',
  'hljs-comment', 'hljs-keyword', 'hljs-built_in', 'hljs-number',
  'hljs-literal', 'hljs-string', 'hljs-title', 'hljs-type', 'hljs-variable',
  'hljs-params', 'hljs-tag', 'hljs-punctuation',
  ...Array.from({ length: 12 }, (_, i) => [`cat-${i + 1}-fill`, `cat-${i + 1}-mark`]).flat(),
  'diagram-stroke', 'diagram-line', 'cat-on-fill', 'cat-on-mark', 'diagram-active',
  'diagram-active-mark', 'diagram-done', 'diagram-done-mark', 'diagram-critical', 'diagram-today', 'diagram-note',
  'c-container', 'c-subcontainer',
  'chart-cat1', 'chart-cat2', 'chart-cat3', 'chart-cat4', 'chart-cat5',
  'chart-cat6', 'chart-cat7', 'chart-cat8', 'chart-state-pass',
  'chart-state-warn', 'chart-state-fail', 'chart-state-info', 'chart-state-mute',
];

function ownTokens(name) {
  const stripped = fs
    .readFileSync(path.join(THEMES_DIR, `${name}.css`), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const set = new Set();
  for (const m of stripped.matchAll(/--([a-z0-9_-]+)\s*:/gi)) set.add(m[1]);
  return set;
}

describe('token parity — every palette self-defines the full contract', () => {
  for (const theme of THEMES) {
    test(`${theme} defines all ${CONTRACT.length} contract tokens (no fallback)`, () => {
      const own = ownTokens(theme);
      const missing = CONTRACT.filter((t) => !own.has(t));
      assert.deepEqual(
        missing,
        [],
        `${theme} relies on the lattice fallback for: ${missing.map((t) => `--${t}`).join(', ')}`,
      );
    });
  }
});
