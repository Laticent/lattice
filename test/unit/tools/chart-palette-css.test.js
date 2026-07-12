/**
 * Unit / gate: the static chart-palette compiler (tools/build-chart-palette-css.js).
 *
 * This is the anti-rot spine of the "delete the @supports fork" refactor
 * (2026-07-12-chart-color-static-palette.md). It locks:
 *
 *   1. NO LEAK, NO VAR — every compiled plane is FLAT literals: zero
 *      `light-dark()` / `color-mix()` (would break old WebKit / smart-TV Chromium)
 *      AND zero residual `var()` (the recipe is resolved to a literal, so nothing
 *      depends on a token that might be undefined on the target). A leak is the
 *      exact bug the compilation exists to end.
 *   2. NO @supports FORK — the planes are the PRIMARY paint (modern == old), so
 *      nothing may hide behind `@supports`; a stray fork is the invisible arm that
 *      let #925/#936 regress unseen.
 *   3. TWO PLANES, RIGHT DEFAULT — a light theme defaults to light literals with a
 *      DARK override on subject anchors; a `*-dark` theme defaults to DARK. The
 *      override keys off the per-slide class + the player's `data-lp-scheme` + the
 *      strict OS `system` arm — never OS `@media` alone, never `:not([=light])`.
 *   4. FIGURE == SECTION — the default plane paints on the bare `.chart-frame`
 *      too, so the Read·Article <figure> re-host resolves identically to a slide.
 *   5. COMPLETENESS — the compiled planes DEFINE every recipe token (a dropped
 *      token now blacks out modern as well, a compile-time tripwire).
 *
 * Runs across a spread of themes (light, dark, a11y) so the `@import` cascade and
 * per-theme resolution are exercised, not just the default palette.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  chartPaletteCssForTheme, recipeTokenNames, scannedFiles,
} = require('../../../tools/build-chart-palette-css');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
const THEMES = fs.readdirSync(path.join(ROOT, 'themes'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.replace(/\.css$/, ''));

describe('chart-palette-css compiler', () => {
  test('every theme compiles to FLAT planes — zero modern-function or var() leaks', () => {
    const failures = [];
    for (const theme of THEMES) {
      const css = chartPaletteCssForTheme(theme, BASE);
      const modern = (css.match(/light-dark\(|color-mix\(/g) || []).length;
      const vars = (css.match(/var\(/g) || []).length;
      if (modern > 0 || vars > 0) failures.push(`${theme}: modern=${modern} var=${vars}`);
    }
    assert.equal(failures.length, 0, `unflattened chart palette:\n${failures.join('\n')}`);
  });

  test('NO @supports fork — the planes are the primary paint (modern == old)', () => {
    for (const theme of ['indaco', 'indaco-dark', 'a11y-deuteranopia']) {
      assert.doesNotMatch(chartPaletteCssForTheme(theme, BASE), /@supports/,
        `${theme}: a static-compilation plane must never hide behind @supports`);
    }
  });

  test('brace-balanced output', () => {
    for (const theme of THEMES) {
      const css = chartPaletteCssForTheme(theme, BASE);
      let depth = 0;
      for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      assert.equal(depth, 0, `${theme}: unbalanced braces in the compiled planes`);
    }
  });

  test('default plane paints on the bare .chart-frame (figure == section)', () => {
    const css = chartPaletteCssForTheme('indaco', BASE);
    assert.match(css, /section\.chart-frame,[^{]*,\s*\.chart-frame\s*\{/,
      'the default plane must include the bare .chart-frame so the Read·Article figure re-host resolves');
  });

  test('a light theme defaults to LIGHT with a DARK subject-anchored override + strict OS arm', () => {
    const css = chartPaletteCssForTheme('indaco', BASE);
    // Override on the per-slide class AND the player attribute, subject-anchored.
    assert.match(css, /\.chart-frame\.dark\b/, 'per-slide dark override');
    assert.match(css, /\[data-lp-scheme=dark\]\s+\.chart-frame\b/, 'player dark override (descendant-subject)');
    // Strict OS arm — matches the exported player: keys on =system, never :not([=light]).
    assert.match(css, /@media \(prefers-color-scheme:dark\)\s*\{\s*:root\[data-lp-scheme=system\]\s+\.chart-frame/,
      'strict OS-dark arm (system receiver only)');
    assert.doesNotMatch(css, /:not\(\[data-lp-scheme/, 'must not use the loose :not([=light]) form');
  });

  test('diagram plane is SCOPED to diagram/chart roots — it never seizes core tokens deck-wide', () => {
    // The diagram group flattens CORE engine tokens (`--bg`, `--text-heading`, `--accent`, …) because
    // Mermaid reads them directly in an SVG paint. Those flat literals MUST be scoped to where diagram/
    // chart content renders — NOT a bare `section, figure`, which would freeze the whole engine's colour
    // to build-time literals on every slide and take core colour off the theme's live `:root light-dark()`.
    const css = chartPaletteCssForTheme('indaco', BASE);
    assert.match(css, /\.chart-frame, section\.diagram, \.lp-figure, section\.math, section\.word-cloud \{/,
      'diagram base plane on the FULL viz-root union (chart-frame + diagram + lp-figure + math + word-cloud)');
    assert.doesNotMatch(css, /(^|[,{}])\s*section, ?figure\s*\{/m, 'must NOT emit any plane on the deck-wide `section, figure`');
    // Phase A: the shared --viz-* structural tokens are emitted (the bounded ink/surface an
    // SVG paint reads instead of raw core), so no chart/diagram SVG paint reads --text-*/--bg.
    for (const viz of ['--viz-ink', '--viz-ink-muted', '--viz-surface', '--viz-hairline', '--viz-accent']) {
      assert.match(css, new RegExp(`${viz}:\\s*#`), `${viz} must be emitted as a flat literal on the viz-root union`);
    }
    // The core tokens live ONLY inside the scoped diagram plane, never on a bare `section`/`figure`.
    for (const core of ['--bg', '--text-heading', '--accent']) {
      const onBareSection = new RegExp(`(^|[,{}])\\s*(section|figure)\\s*\\{[^}]*${core}\\s*:`, 'm');
      assert.doesNotMatch(css, onBareSection, `${core} must not be redefined on a bare section/figure (deck-wide seizure)`);
    }
  });

  test('RESTORE-BASE arm — a per-slide base-scheme class wins over an opposite deck pin (red-team P1)', () => {
    // A `_class: light` slide on a `color-mode: dark` deck (light theme) must paint LIGHT, even though
    // the deck-wide `[data-lp-scheme=dark] section/.chart-frame` override (0,1,1) beats the base plane
    // (0,0,1). The restore arm re-emits the BASE tokens on `[data-lp-scheme=dark] .chart-frame.light`
    // at (0,2,1). Without it, the light slide silently rendered dark on modern AND old engines.
    const css = chartPaletteCssForTheme('indaco', BASE);
    assert.match(css, /\[data-lp-scheme=dark\]\s+\.chart-frame\.light\b/, 'chart-group restore-base arm (deck pin)');
    // The diagram group is SCOPED to diagram/chart roots (not deck-wide `section`); a Mermaid slide is
    // `section.diagram`, so its restore arm is `section.diagram.light` — NOT a bare `section.light`.
    assert.match(css, /\[data-lp-scheme=dark\]\s+section\.diagram\.light\b/, 'diagram-group restore-base arm (deck pin)');
    assert.doesNotMatch(css, /(^|[,{])\s*section, ?figure\s*\{/m, 'diagram plane must NOT paint deck-wide on bare `section, figure`');
    // The restore arm carries the LIGHT (base) --chart-cat-base, not black — a light theme's base is --bg.
    const m = css.match(/\[data-lp-scheme=dark\]\s+\.chart-frame\.light[^{]*\{[^}]*--chart-cat-base:\s*([^;}]+)/);
    assert.ok(m && m[1].trim().toLowerCase() !== 'black', `restore arm must carry the LIGHT base, got ${m?.[1]}`);
    // A *-dark theme's restore arm is the mirror: base-DARK on `[data-lp-scheme=light] .chart-frame.dark`.
    const darkCss = chartPaletteCssForTheme('indaco-dark', BASE);
    assert.match(darkCss, /\[data-lp-scheme=light\]\s+\.chart-frame\.dark\b/, 'dark theme mirror restore arm');
  });

  test('a *-dark theme defaults to its DARK literals with a LIGHT override (regression: F1)', () => {
    const css = chartPaletteCssForTheme('indaco-dark', BASE);
    // --chart-cat-base flips --bg (light) → black (dark); a dark theme's DEFAULT is black.
    const m = css.match(/section\.chart-frame,[^{]*\{[^}]*--chart-cat-base:\s*([^;}]+)/);
    assert.ok(m, 'expected --chart-cat-base in the default plane');
    assert.equal(m[1].trim().toLowerCase(), 'black', `dark default should be black, got ${m?.[1]}`);
    assert.match(css, /\.chart-frame\.light\b/, 'a *-dark theme overrides toward light on section.light');
    assert.match(css, /@media \(prefers-color-scheme:light\)/, 'a *-dark theme uses the light OS arm');
  });

  test('the light and dark themes are NOT byte-identical', () => {
    assert.notEqual(chartPaletteCssForTheme('indaco', BASE), chartPaletteCssForTheme('indaco-dark', BASE));
  });

  test('COMPLETENESS — the compiled planes define every recipe token (both planes)', () => {
    const names = recipeTokenNames();
    assert.ok(names.length >= 100, `expected the full expanded recipe, got ${names.length}`);
    for (const theme of ['indaco', 'indaco-dark']) {
      const css = chartPaletteCssForTheme(theme, BASE);
      const missing = names.filter((n) => !new RegExp(`--${n}\\s*:`).test(css));
      assert.deepEqual(missing, [], `${theme}: recipe tokens absent from the compiled planes: ${missing.join(', ')}`);
    }
    // Independent spot-check (hardcoded expected names, so it does not derive from the
    // module's own extractor): specific tokens the paints consume MUST resolve to a
    // literal. Catches a broken `@expand` template expander — which would silently
    // drop a whole slot/state family that recipeTokenNames() would also stop listing.
    const ind = chartPaletteCssForTheme('indaco', BASE);
    for (const t of [
      'chart-cat-1-solid', 'chart-cat-8-fillgrad', 'chart-cat-3-g1', 'chart-cat-5-edge',
      'state-pass-fillgrad', 'state-warn-pillgrad', 'state-mute-edge',
      'chart-neutral-fillgrad', 'chart-spine-body', 'chart-muted-key', 'chart-hairline-accent',
    ]) {
      assert.match(ind, new RegExp(`--${t}\\s*:\\s*[^;}]`), `expected token --${t} in the compiled planes`);
    }
  });

  test('scannedFiles enumerates the chart+math+mermaid paint surface', () => {
    const files = scannedFiles();
    assert.ok(files.length > 10, 'expected many chart component paint files');
    assert.ok(files.some((f) => f.endsWith('mermaid.css')), 'mermaid.css is in the compiled set');
    assert.ok(files.some((f) => f.endsWith('math.styles.css')), 'math.styles.css is in the compiled set');
  });
});
