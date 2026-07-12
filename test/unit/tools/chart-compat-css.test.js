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
    assert.equal(m[1].trim().toLowerCase(), 'black', `dark default should be black, got ${m?.[1]}`);
  });

  test('the black-rendering components each get a flattened rule', () => {
    const css = chartCompatCssForTheme('indaco', BASE);
    const required = [
      /\.wedge:nth-of-type\(6n\+1\)\s*\{[^}]*fill:[^}]*!important/, // piechart
      /\.gantt-bar\[data-s="on-track"\][^{]*\{[^}]*background:[^}]*linear-gradient/, // gantt bars
      /--journey-mood-5:\s*#[0-9a-f]{6}/i, // journey mood ramp (setter-flatten)
      // Choropleth (--on) AND highlight (--hl) map regions — the `--hl` rule was
      // silently missing (its --region-hue is inline-only); assert it EXPLICITLY so
      // the `\b`-matches-`--on` blind spot can't return.
      /\.map-region--on\b[^{]*\{[^}]*fill:\s*#[0-9a-f]{6}[^}]*!important/i,
      /\.map-region--hl\b[^{]*\{[^}]*fill:\s*#[0-9a-f]{6}[^}]*!important/i,
      /\.quadrant-tint\[data-cell="0"\][^{]*\{[^}]*fill:[^}]*!important/, // quadrant tints
    ];
    for (const re of required) {
      assert.match(css, re, `missing fallback coverage for ${re}`);
    }
  });

  test('inline-kernel categorical locals get a coarse fallback (not skipped)', () => {
    // --region-hue / --series-color / --actor-color are set inline by the kernel
    // with no CSS setter. They must still resolve to a literal (a representative
    // on-brand tone) — the class of gap the maker-checker/red-team caught. Assert
    // the fallback body references none of them unresolved.
    const b = body(chartCompatCssForTheme('indaco', BASE));
    for (const local of ['region-hue', 'series-color', 'actor-color']) {
      assert.doesNotMatch(b, new RegExp(`var\\(\\s*--${local}\\b`),
        `--${local} left unresolved in the fallback (inline-kernel local skipped)`);
    }
  });

  test('per-slide scheme override selectors are well-formed (no phantom section)', () => {
    // The override must merge the modifier class onto a section-rooted selector
    // (`section.chart-frame.dark`), NOT concatenate a second element
    // (`section.darksection.chart-frame` → phantom `.darksection` class).
    for (const theme of ['indaco', 'indaco-dark']) {
      const css = chartCompatCssForTheme(theme, BASE);
      assert.doesNotMatch(css, /section\.(dark|light)section/,
        `${theme}: phantom concatenated section in an override selector`);
      assert.doesNotMatch(css, /section\.(dark|light) section\.(chart-frame|journey|map|math)\b/,
        `${theme}: dead descendant override (sections are not nested)`);
    }
    // A light theme flips section.dark slides via a MERGED class.
    assert.match(chartCompatCssForTheme('indaco', BASE), /section\.chart-frame\.dark\b/);
    // A *-dark theme flips section.light slides via a MERGED class.
    assert.match(chartCompatCssForTheme('indaco-dark', BASE), /section\.chart-frame\.light\b/);
  });

  test('a `:is(section.X, figure.X)`-broadened component emits NO bare `:is` arm (regression)', () => {
    // Chart component CSS broadens `section.<comp>` → `:is(section.<comp>, figure.<comp>)` so the
    // layout also paints in the Read·Article <figure> re-host. The generator's selector splitting
    // is not `:is()`-aware, so it used to break the inner `section.X, figure.X` on its comma and
    // emit a bogus bare `:is` arm — and in a comma selector LIST one invalid arm drops the WHOLE
    // rule, silently losing the compat colour. unbroadenIsFigure() normalizes to the section arm.
    for (const theme of ['indaco', 'indaco-dark', 'a11y-deuteranopia']) {
      const css = chartCompatCssForTheme(theme, BASE);
      // A bare `:is` (pseudo-class with no argument list) — invalid, rule-dropping.
      assert.doesNotMatch(css, /:is(?!\s*\()/,
        `${theme}: a bare \`:is\` arm invalidates its whole flattened rule`);
      // And the figure arm must be gone entirely (compat CSS is a slide fallback only).
      assert.doesNotMatch(css, /figure\.(chart-frame|roadmap|gantt|kanban|progress)/,
        `${theme}: the figure re-host arm must not leak into the slide compat CSS`);
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
