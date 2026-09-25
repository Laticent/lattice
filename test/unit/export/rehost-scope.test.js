/**
 * The Studio Reading view's deck stylesheet (2026-09-24-one-style-delivery-spine.md §8 step 3).
 *
 * The view renders Read · Article in the app's TOP-LEVEL document, so the deck's flat pack
 * cannot ship there whole: ~0.9 MB of deck CSS would restyle the app around the article.
 * `scopeReHostedCss` prunes it to the rules the article uses and fences the rest inside
 * by selector. These pin the four properties the view relies on, and the one fallback that
 * differs from the player's prune: it FAILS CLOSED.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scopeReHostedCss } = require('../../../lib/export/player-prune.js');

const O = { root: '.st-read-article', within: '.lp-figure' };
const FENCE = ':where(.lp-figure,.lp-figure *)';
const all = () => true;

describe('scopeReHostedCss', () => {
  test('fences every selector to a figure of the article, and moves :root tokens onto the figure', () => {
    const { css, applied } = scopeReHostedCss(':root{--a:red}figure.chart-frame .x::before{color:var(--a)}', all, O);
    assert.equal(applied, true);
    assert.ok(css.includes(`:where(.st-read-article) .lp-figure${FENCE}{--a:red}`), 'the tokens sit on each figure, not on the app <html>');
    // The re-host arm starts AT the figure, so the figure itself must stay matchable; the
    // fence rides the subject, before its pseudo-element. (`@scope` could not do this.)
    assert.ok(css.includes(`:where(.st-read-article) figure.chart-frame .x${FENCE}::before{`), css);
    assert.doesNotMatch(css, /:root/);
  });

  // The Studio's engine bundle minifies lattice.css, which writes `::before` as `:before`.
  // css-tree reads that as a pseudo-CLASS; treated as one, the base asked querySelector for
  // `.x:before`, matched nothing, and every state marker in the Reading view was pruned.
  test('treats the one-colon pseudo-elements as pseudo-elements: kept by the prune, fenced before them', () => {
    const { collectBaseSelectors } = require('../../../lib/export/player-prune.js');
    assert.deepEqual(collectBaseSelectors('.a .b:before{c:d}.a:first-letter{e:f}', { legacyPseudoElements: true }), ['.a .b', '.a']);
    // Opt-in: the player's own prune keeps its current behavior until the CLI convergence
    // (decision 2026-09-24 §8 step 4) carries it with the export sign-off it owes.
    assert.deepEqual(collectBaseSelectors('.a .b:before{c:d}'), ['.a .b:before']);
    const used = new Set(['.a .b']);
    const { css } = scopeReHostedCss('.a .b:before{c:d}', (b) => used.has(b), O);
    assert.ok(css.includes(`:where(.st-read-article) .a .b${FENCE}:before{c:d}`), css);
  });

  test('fences before the FIRST pseudo-element, so a trailing user-action pseudo-class stays valid', () => {
    const { css } = scopeReHostedCss('.a, .b::-webkit-scrollbar-thumb:hover{c:d}', all, O);
    assert.ok(css.includes(`.b${FENCE}::-webkit-scrollbar-thumb:hover{c:d}`), css);
    assert.ok(css.includes(`.a${FENCE},`), 'the neighbor in the list is not voided');
  });

  test('unwraps a @layer block (its rules are fenceable), and drops a layer statement', () => {
    const { css } = scopeReHostedCss('@layer p,q;@layer foo{.y{g:h}@media print{.z{i:j}}}', all, O);
    assert.ok(!css.includes('@layer'), css);
    assert.ok(css.includes(`.y${FENCE}{g:h}`) && css.includes(`@media print{:where(.st-read-article) .z${FENCE}{i:j}}`), css);
  });

  test('adds no specificity: both fences are :where()', () => {
    const { css } = scopeReHostedCss('.a .b{c:d}', all, O);
    assert.equal(css, `:where(.st-read-article) .lp-figure{color:var(--text-body)}:where(.st-read-article) .a .b${FENCE}{c:d}`);
  });

  test('prunes the rules the article does not use', () => {
    const used = new Set([':root', 'figure.chart-frame .x']);
    const { css } = scopeReHostedCss(':root{--a:red}figure.chart-frame .x{color:red}section h2{color:blue}', (b) => used.has(b), O);
    assert.doesNotMatch(css, /section h2/);
    assert.match(css, /figure\.chart-frame \.x/);
  });

  // RED TEAM, 2026-09-25: a selector fence cannot hold a NAME. Each of these was observed
  // reaching the app's own document in Chromium 131, so each is dropped, at any depth.
  test('drops every global-namespace at-rule instead of passing it through', () => {
    const { css } = scopeReHostedCss(
      '@font-face{font-family:AppSans;src:url(x.woff2);unicode-range:U+53}' + // app-text oracle
        '@keyframes spin{to{opacity:0}}' + // replaces the app's own `spin`
        '@property --background{syntax:"<color>";inherits:false;initial-value:red}' + // recolors app chrome
        '@counter-style c{system:cyclic;symbols:x}@font-feature-values F{@styleset{a:1}}' +
        '@media screen{@keyframes k{to{a:b}}.x{c:d}}' + // nested is still document-global
        '@layer base,components;@import url(x.css);@page{margin:0}.y{e:f}',
      all,
      O,
    );
    for (const at of ['@font-face', '@keyframes', '@property', '@counter-style', '@font-feature-values', '@layer', '@import', '@page']) {
      assert.ok(!css.includes(at), `${at} must not reach the app document: ${css}`);
    }
    assert.ok(css.includes(`.x${FENCE}{c:d}`) && css.includes(`.y${FENCE}{e:f}`), 'the style rules survive, fenced');
  });

  // The Studio's top-level document has no subresource CSP, so a deck url() would fetch from the
  // app's origin when the view opens (red team finding 4).
  test('drops a declaration naming a remote resource, keeps data: and relative urls', () => {
    const { css } = scopeReHostedCss(
      '.a{background:url(https://e/o);color:red}.b{background:url(//e/o)}.c{background:url( "HTTPS://e" )}' +
        '.d{--i:url("https://e")}.e{background-image:image-set("https://e/a" 1x)}' +
        `.f{--mark:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'></svg>")}` +
        '.g{background:url(img/a.png)}',
      all,
      O,
    );
    assert.ok(!/https?:\/\/e|\/\/e\/o/i.test(css), css);
    assert.ok(css.includes('color:red'), 'the rest of the rule stays');
    assert.ok(css.includes("xmlns='http://www.w3.org/2000/svg'"), 'a data: url is judged as a unit: the mark tokens survive');
    assert.ok(css.includes('url(img/a.png)'), 'a relative url resolves same-origin and stays');
  });

  test('pins color-scheme on each figure so light-dark() follows the deck mode', () => {
    assert.ok(scopeReHostedCss('.x{color:light-dark(red,blue)}', all, { ...O, colorScheme: 'dark' }).css.includes(':where(.st-read-article) .lp-figure{color:var(--text-body);color-scheme:dark}'));
    assert.doesNotMatch(scopeReHostedCss('.x{a:b}', all, { ...O, colorScheme: 'x;y' }).css, /color-scheme/);
  });

  test('fails CLOSED: without a root and a fence it yields an empty sheet, never the full one', () => {
    assert.deepEqual(scopeReHostedCss('.x{a:b}', all, { root: '.st-read-article' }), { css: '', applied: false, totalRules: 0, keptRules: 0 });
    assert.equal(scopeReHostedCss('.x{a:b}', all, O).applied, true);
  });
});

describe('rehostContainerCss', () => {
  test('the player writes exactly the same container rules under #lp-article', async () => {
    const { playerCss, rehostContainerCss } = await import('../../../lib/export/player-core.mjs');
    const player = playerCss();
    for (const line of rehostContainerCss('#lp-article').split('\n')) {
      assert.ok(player.includes(line), `playerCss() must carry ${line}`);
    }
  });
});
