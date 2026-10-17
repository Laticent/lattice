/**
 * `opts.scoping: 'scope'` — the preview sheet delivered with native `@scope (article.lattice)`
 * instead of the pack's selector rewriting (lib/engine/css.js `scopeTheme`).
 *
 * The pack prefixes every selector with `article.lattice > section` and treats only a literal
 * leading `section` as the slide, so a rule that names the slide any other way becomes a slide
 * inside a slide (#2705, #2720, #2735). `@scope` gives the same containment without touching a
 * selector. These tests pin the three things that make that safe: selectors are NOT rewritten
 * (except a leading `:root`), the `:root` mapping keeps `:root`'s specificity, and the opt-in
 * changes nothing for a caller that does not ask (the default sheet and the FLAT export sheet).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scopeTheme, packTheme } = require('../../../lib/engine/css.js');
const { createEngine } = require('../../../lib/engine');

const body = (css) => css.replace(/^[\s\S]*?@scope \(article\.lattice\) \{\n/, '').replace(/\n\}\s*$/, '');

describe('scopeTheme', () => {
  test('wraps style rules in one @scope block and keeps @media inside it', () => {
    const out = scopeTheme('section h2{a:1}@media print{section p{b:2}}');
    assert.match(out, /@scope \(article\.lattice\) \{/);
    assert.equal(body(out).trim(), 'section h2{a:1}\n@media print{section p{b:2}}');
  });

  test('at-rules that are not style rules hoist OUT of @scope, in order', () => {
    const out = scopeTheme('@font-face{font-family:F;src:url(x)}@property --p{syntax:"<length>";inherits:false;initial-value:0px}@keyframes k{from{a:1}to{a:2}}section{c:3}');
    const at = out.indexOf('@scope');
    for (const needle of ['@font-face', '@property --p', '@keyframes k']) {
      const i = out.indexOf(needle);
      assert.ok(i >= 0 && i < at, `${needle} must sit before the @scope block`);
    }
    assert.ok(out.indexOf('@font-face') < out.indexOf('@property') && out.indexOf('@property') < out.indexOf('@keyframes'));
    assert.equal(body(out).trim(), 'section{c:3}');
  });

  test('a keyframe step is not mistaken for a selector', () => {
    assert.match(scopeTheme('@keyframes k{from{opacity:0}50%{opacity:.5}to{opacity:1}}'), /@keyframes k\{from\{opacity:0\}50%\{opacity:\.5\}to\{opacity:1\}\}/);
  });

  test('a leading :root becomes the slide, at :root\'s specificity (0,1,0)', () => {
    // The never-matching `:not([\20 root])` is what holds it below `section.dark` (0,1,1). A bare
    // `:scope > section` ties it, and a theme's later `:root` pin then beats `section.dark`
    // (a11y's `color-scheme: light`: 7 of 120 gallery slides rendered light instead of dark).
    for (const sel of [':root', 'section:root', ':root[data-x="1"]']) {
      assert.match(body(scopeTheme(`${sel}{--a:1}`)), /^:where\(:scope > section\):not\(\[\\20 root\]\)/, sel);
    }
  });

  test(':where(:root) is left alone: a document default cannot match inside @scope, and must not', () => {
    // The host owns <html>. A `color-scheme` moved onto the slide would stop it inheriting a
    // forced dark mode (engineering/gotchas/lattice-internals.md).
    assert.equal(body(scopeTheme(':where(:root){color-scheme:light}')).trim(), ':where(:root){color-scheme:light}');
  });

  test('every shape the pack turns into a slide inside a slide is written as the author wrote it', () => {
    for (const sel of [
      ':where(section.finish) .panel',
      ':where(.lattice-exporting) section.finish',
      ':where(.a) > section.x',
      '.x section.x',
      ':is(section.map, figure.chart-frame) .map-region',
      'section.x :where(.y)',
    ]) {
      assert.equal(body(scopeTheme(`${sel}{a:1}`)).trim(), `${sel}{a:1}`, sel);
    }
  });

  test('the Marpit pagination mask still applies to a slide-own ::after', () => {
    const out = scopeTheme('section::after{content:"x";color:red}');
    assert.match(out, /\/\* content: "x"; \*\//);
    assert.match(out, /color:red/);
  });
});

describe("render(…, { scoping: 'scope' })", () => {
  const BASE = '/* @theme lattice\n * @size hd 1280px 720px */\n:root{--bg:#fff}\nsection{color:#111}\n:where(:root){color-scheme:light}';
  const THEME = '/* @theme t */\n@import "lattice";\n:root{--bg:#eee}';
  const engine = () => {
    const e = createEngine();
    e.addThemes([BASE, THEME]);
    return e;
  };
  const MD = '# Hi\n\n---\n\n## Two\n';

  test('the opt-in changes the scoped css, and ONLY that', () => {
    const eng = engine();
    const packed = eng.render(MD, 't', { styles: 'flat' });
    const scoped = eng.render(MD, 't', { styles: 'flat', scoping: 'scope' });
    assert.match(scoped.css, /@scope \(article\.lattice\)/);
    assert.doesNotMatch(packed.css, /@scope/);
    assert.equal(scoped.html, packed.html, 'the markup is identical');
    assert.equal(scoped.flatCss, packed.flatCss, 'the FLAT (exported) sheet is byte-identical');
    assert.equal(scoped.width, packed.width);
    assert.equal(scoped.height, packed.height);
  });

  test('the default is the pack, and an unknown value is the pack too', () => {
    const eng = engine();
    const a = eng.render(MD, 't').css;
    assert.equal(eng.render(MD, 't', { scoping: 'pack' }).css, a);
    assert.equal(eng.render(MD, 't', { scoping: 'nonsense' }).css, a);
  });

  test('the sheet cache keeps the two deliveries apart on one engine', () => {
    const eng = engine();
    const first = eng.render(MD, 't', { scoping: 'scope' }).css;
    const packed = eng.render(MD, 't').css;
    const second = eng.render(MD, 't', { scoping: 'scope' }).css;
    assert.notEqual(first, packed);
    assert.equal(second, first);
  });

  test('pack mode is unchanged by the option existing', () => {
    assert.equal(packTheme(':root{a:1}h2{b:2}'), 'article.lattice > :where(section):not([\\20 root]){a:1}article.lattice > section h2{b:2}');
  });
});
