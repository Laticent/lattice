/**
 * Unit: the docs site reads the deck themes' tokens, not copies of them.
 *
 * tools/build-docs-portal.js `paletteCss()` writes docs/src/styles/lattice-tokens.generated.css,
 * the one sheet the docs site, the Playground and the Studio chrome theme from. These tests hold
 * the four things engineering/decisions/2026-11-28-site-token-fidelity.md fixed:
 *   1. every token family the site paints with is emitted WHOLE, on every palette and mode;
 *   2. the first-paint fallback is the site default palette's own values, generated;
 *   3. the on-dark ramp and the font stacks come from the engine base, not a hand copy;
 *   4. no site stylesheet types a palette value back in.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { paletteCss, tokenDecls, resolvePalettes, PORTAL_TOKENS, PORTAL_OPTIONAL_TOKENS, listBasePalettes } = require('../../../tools/build-docs-portal');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function blocks(css) {
  const out = new Map();
  for (const m of css.matchAll(/html\[data-palette="([^"]+)"\]\[data-mode="(light|dark)"\]\{([^}]*)\}/g)) {
    const set = {};
    for (const d of m[3].matchAll(/--([\w-]+):([^;]+);/g)) set[d[1]] = d[2].trim();
    out.set(`${m[1]}/${m[2]}`, set);
  }
  return out;
}
function declsOf(body) {
  const set = {};
  for (const d of body.matchAll(/--([\w-]+):([^;]+);/g)) set[d[1]] = d[2].trim();
  return set;
}

const css = paletteCss();
const sets = blocks(css);

describe('site token fidelity', () => {
  test('every family the site paints with reaches every palette and mode', () => {
    const families = [
      ...['pass', 'warn', 'fail', 'info', 'mute'].flatMap((s) => [s, `${s}-mark`, `${s}-on-mark`]),
      'pass-bg', 'warn-bg', 'fail-bg',
      ...Array.from({ length: 12 }, (_, i) => ['fill', 'mark', 'ink'].map((t) => `cat-${i + 1}-${t}`)).flat(),
      'cat-on-fill', 'cat-on-mark',
      'text-secondary', 'text-label', 'text-display',
      'spectrum-end',
    ];
    for (const t of families) assert.ok(PORTAL_TOKENS.includes(t), `PORTAL_TOKENS is missing --${t}`);
    assert.equal(sets.size, listBasePalettes().length * 2);
    for (const [key, set] of sets) {
      for (const t of families) assert.ok(set[t], `${key} does not emit --${t}`);
    }
  });

  test('the first-paint fallback is the site default palette, both faces, generated', () => {
    const def = /export const DEFAULT_PALETTE\s*=\s*'([\w-]+)'/.exec(read('docs/src/lib/site-chrome.ts'))[1];
    const light = /^:root\{(color-scheme:[^}]*)\}$/m.exec(css);
    const dark = /^@media \(prefers-color-scheme:dark\)\{:root\{([^}]*)\}\}$/m.exec(css);
    assert.ok(light && dark, 'both fallback blocks are emitted');
    const sansOptional = (set) => Object.fromEntries(Object.entries(set).filter(([k]) => !PORTAL_OPTIONAL_TOKENS.includes(k)));
    assert.deepEqual(declsOf(light[1]), sansOptional(sets.get(`${def}/light`)));
    assert.deepEqual(declsOf(dark[1]), sansOptional(sets.get(`${def}/dark`)));
  });

  test('an optional token never enters the fallback, so it cannot leak into palettes that lack it', () => {
    // onyx declares --spectrum-solid; indaco does not. Were onyx the default, a fallback carrying it
    // would paint onyx's red on indaco too (a palette block never unsets a token it lacks).
    const onyx = resolvePalettes().find((p) => p.name === 'onyx');
    assert.ok(onyx.light['spectrum-solid'], 'onyx is the case that bites: it declares --spectrum-solid');
    assert.match(tokenDecls(onyx.light), /--spectrum-solid:/);
    for (const t of PORTAL_OPTIONAL_TOKENS) {
      assert.doesNotMatch(tokenDecls(onyx.light, { fallback: true }), new RegExp(`--${t}:`));
      assert.doesNotMatch(tokenDecls(onyx.dark, { fallback: true }), new RegExp(`--${t}:`));
    }
  });

  test('the on-dark ramp and the font stacks are the engine base, read not copied', () => {
    const base = read('lib/base/base.tokens.css');
    for (const rung of ['primary', 'secondary', 'ghost', 'watermark']) {
      const want = new RegExp(`--on-dark-${rung}:\\s*([^;]+);`).exec(base)[1].trim();
      assert.ok(css.includes(`--on-dark-${rung}:${want};`), `--on-dark-${rung} is not the engine's ${want}`);
    }
    // Every engine face, in the engine's order, with the site's metric fallback after the lead face.
    for (const role of ['display', 'body', 'mono']) {
      const engine = new RegExp(`--font-${role}:\\s*([^;]+);`).exec(base)[1].split(',').map((f) => f.trim());
      const site = new RegExp(`--font-${role}:([^;]+);`).exec(css)[1].split(',').map((f) => f.trim());
      assert.equal(site[0], engine[0]);
      assert.match(site[1], /Fallback'$/);
      assert.deepEqual(site.slice(2), engine.slice(1), `--font-${role} drifted from the engine stack`);
    }
    assert.ok(css.includes('--font-label:var(--font-mono);'));
  });

  test('no site stylesheet types a palette value or a font stack back in', () => {
    // Every token the sheet generates, derived rather than listed, so a new family is covered.
    const owned = [
      ...PORTAL_TOKENS, ...PORTAL_OPTIONAL_TOKENS, 'spectrum',
      'on-dark-primary', 'on-dark-secondary', 'on-dark-ghost', 'on-dark-watermark',
      'font-display', 'font-body', 'font-mono', 'font-label',
      // Retired site copies, held out: the old on-dark pair and the invented destructive ramp.
      'on-dark', 'on-dark-muted', 'lx-ui-destructive', 'lx-ui-destructive-foreground',
    ];
    const dir = path.join(ROOT, 'docs/src/styles');
    const sheets = fs.readdirSync(dir).filter((f) => f.endsWith('.css') && !f.includes('.generated.'));
    assert.ok(sheets.includes('landing.css') && sheets.includes('lattice.css'));
    for (const f of sheets) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const t of owned) {
        assert.doesNotMatch(src, new RegExp(`(^|[;{\\s])--${t}\\s*:`, 'm'), `${f} declares --${t}; it is generated`);
      }
      if (f !== 'fonts.css') {
        assert.doesNotMatch(src, /'Outfit Fallback'|'Playfair Fallback'|'JetBrains Mono Fallback'/, `${f} hand-types a font stack`);
      }
    }
  });
});
