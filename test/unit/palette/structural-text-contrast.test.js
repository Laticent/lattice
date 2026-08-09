/**
 * Unit: structural text-token contrast.
 *
 * Guards the token-structure audit (engineering/decisions/2026-06-05-
 * token-structure-audit.md). Every base palette must give the secondary
 * content tier and the label/eyebrow tier their OWN tokens, each a
 * light-dark() pair, hitting WCAG AA (4.5:1) on BOTH the light and dark
 * canvas. This is the regression guard for the "subtitle rides the
 * decorative --text-muted token" bug — re-borrowing a decorative token
 * for content text drops it below AA and fails here.
 *
 * --text-muted itself is intentionally exempt (chrome only:
 * pagination/header/footer) and is NOT asserted for contrast.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadPalette, baseThemeNames } = require('../../helpers/palette');

// Scope from the manifests — this array had 13 names and omitted `carta`.
const BASE_THEMES = baseThemeNames();

// Resolve a token to a concrete #hex for one color-scheme side.
function resolveSide(vars, name, side, depth = 0) {
  if (depth > 8 || !vars[name]) return null;
  let val = String(vars[name]).trim();
  const ld = val.match(/^light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
  if (ld) val = (side === 'light' ? ld[1] : ld[2]).trim();
  const ref = val.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (ref) return resolveSide(vars, ref[1], side, depth + 1);
  return parseHex(val);
}
function parseHex(h) {
  const m = String(h).match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) };
}
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe('structural text-token contrast', () => {
  for (const name of BASE_THEMES) {
    const { vars } = loadPalette(name);

    test(`${name}: defines independent secondary token (+ dark variant)`, () => {
      assert.ok(vars['text-secondary'], `${name} missing --text-secondary`);
      assert.ok(
        vars['scheme-dark-text-secondary'] || !/light-dark/.test(vars['text-secondary']),
        `${name} uses light-dark for --text-secondary but is missing --scheme-dark-text-secondary`,
      );
    });

    for (const side of ['light', 'dark']) {
      const bg = resolveSide(vars, 'bg', side);
      for (const role of ['text-secondary', 'text-label']) {
        test(`${name} [${side}]: ${role} ≥ AA on canvas`, () => {
          const fg = resolveSide(vars, role, side);
          assert.ok(fg, `${name} ${role} (${side}) did not resolve to a hex`);
          assert.ok(bg, `${name} bg (${side}) did not resolve to a hex`);
          const ratio = contrast(fg, bg);
          assert.ok(
            ratio >= AA,
            `${name} ${role} (${side}) contrast ${ratio.toFixed(2)}:1 < ${AA}:1`,
          );
        });
      }
    }
  }
});
