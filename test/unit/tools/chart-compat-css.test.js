/**
 * Unit / gate: the old-browser chart-colour fallback generator
 * (tools/build-chart-compat-css.js).
 *
 * Two things this locks:
 *   1. NO LEAK — the generated `@supports` body must contain zero modern colour
 *      functions (`light-dark()` / `color-mix()`) and zero unresolved colour
 *      `var()`. A leak means a declaration the old engine still can't parse — the
 *      exact bug the fallback exists to fix. This is the regression tripwire: add
 *      a chart colour the generator can't flatten and CI goes red.
 *   2. COVERAGE — the components that render solid black today (pie, gantt,
 *      journey, map, quadrant) each have at least one flattened rule, so a future
 *      refactor that silently drops a component's coverage fails here.
 *
 * Runs against a spread of themes (light, dark, a11y) so the `@import` cascade and
 * per-theme resolution are exercised, not just the default palette.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chartCompatCssForTheme, coverageSites } = require('../../../tools/build-chart-compat-css');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
const THEMES = fs.readdirSync(path.join(ROOT, 'themes'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.replace(/\.css$/, ''));

// Length / geometry tokens that are FINE on an old engine (calc/clamp/cqi are far
// older than color-mix). A `var()` to one of these in the fallback body is not a
// colour leak. Deliberately an EXACT-NAME list of non-colour tokens (not a broad
// `chart-accent*` prefix, which would also mask a colour token named `--chart-
// accent-…` — the blind spot the checker flagged): every entry here is a length.
const SAFE_VAR = /^--(chart-hairline|chart-accent-lg|chart-fill-accent|_sec-1cqi)$|^--(sp|radius|fs|pill-fs|pill-pad|lh|frame-inset|frame-page)/;

/** The @supports body with the guard line (which legitimately contains
 *  `light-dark(`) stripped, so leak scans see only generated rules. */
function body(css) {
  return css.replace(/@supports[^{]*\{/, '');
}

describe('chart-compat-css generator', () => {
  test('every theme flattens with ZERO modern-function or colour-var leaks', () => {
    const failures = [];
    for (const theme of THEMES) {
      const b = body(chartCompatCssForTheme(theme, BASE));
      const modern = (b.match(/light-dark\(|color-mix\(/g) || []).length;
      const colourVars = (b.match(/var\(\s*--[a-z0-9-]+/gi) || [])
        .map((m) => m.replace(/var\(\s*/, ''))
        .filter((v) => !SAFE_VAR.test(v));
      if (modern > 0 || colourVars.length > 0) {
        failures.push(`${theme}: modern=${modern} colourVars=${[...new Set(colourVars)].slice(0, 5).join(',')}`);
      }
    }
    assert.equal(failures.length, 0, `unflattened colour in fallback:\n${failures.join('\n')}`);
  });

  test('the @supports guard + color-scheme dark override are present and balanced', () => {
    // Light theme: default = light, override scoped to section.dark (the per-slide
    // dark modifier — Lattice is color-scheme-driven, NOT prefers-color-scheme).
    const light = chartCompatCssForTheme('indaco', BASE);
    assert.match(light, /@supports not \(color: light-dark\(#000, #fff\)\)/);
    assert.match(light, /section\.dark /);
    assert.doesNotMatch(light, /prefers-color-scheme/,
      'must not key off OS preference — modern render is color-scheme-driven');
    // Dark theme: default = DARK, override scoped to section.light (per-slide light).
    const dark = chartCompatCssForTheme('indaco-dark', BASE);
    assert.match(dark, /section\.light /);
    assert.notEqual(light, dark, 'a *-dark theme must not emit the light theme\'s fallback');
    for (const css of [light, dark]) {
      let depth = 0;
      for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      assert.equal(depth, 0, 'unbalanced braces in generated block');
    }
  });

  test('a *-dark theme defaults to its DARK literals (regression: F1)', () => {
    // The chart-fill mix target flips --bg (light) → black (dark). A *-dark theme's
    // DEFAULT (non-override) branch must carry the dark value.
    const dark = chartCompatCssForTheme('indaco-dark', BASE);
    const m = dark.match(/--chart-cat-base:\s*([^;}]+)/);
    assert.ok(m, 'expected --chart-cat-base in the fallback');
    assert.equal(m[1].trim().toLowerCase(), 'black', `dark default should be black, got ${m && m[1]}`);
  });

  test('the black-rendering components each get a flattened rule', () => {
    const css = chartCompatCssForTheme('indaco', BASE);
    const required = [
      /\.wedge:nth-of-type\(6n\+1\)\s*\{[^}]*fill:[^}]*!important/, // piechart
      /\.gantt-bar\[data-s="on-track"\][^{]*\{[^}]*background:[^}]*linear-gradient/, // gantt bars
      /--journey-mood-5:\s*#[0-9a-f]{6}/i, // journey mood ramp (setter-flatten)
      /\.map-region\b[^{]*\{[^}]*fill:\s*#[0-9a-f]{6}[^}]*!important/i, // map regions
      /\.quadrant-tint\[data-cell="0"\][^{]*\{[^}]*fill:[^}]*!important/, // quadrant tints
    ];
    for (const re of required) {
      assert.match(css, re, `missing fallback coverage for ${re}`);
    }
  });

  test('modern-browser safety: every generated rule is inside the @supports guard', () => {
    // Nothing may leak OUTSIDE the guard — a stray rule would change modern render.
    const css = chartCompatCssForTheme('indaco', BASE).trim();
    assert.ok(css.startsWith('@supports'), 'fallback must open with @supports');
    // After removing the one top-level @supports block, nothing remains.
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf('{'); i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.equal(css.slice(end + 1).trim(), '', 'content found outside the @supports block');
  });

  test('coverageSites enumerates a non-trivial set (the audit surface)', () => {
    assert.ok(coverageSites().length > 50, 'expected many chart colour sites');
  });
});
