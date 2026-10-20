/**
 * Unit: tools/style-needs.js — which style modules a document needs.
 *
 * The scanner's one hard rule is zero false negatives: it may load a module a document does not
 * use, never skip one it does. These tests pin each way a selector could be misread into a miss.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildIndex, scanDocument, neededModules, askableOf } = require('../../../tools/style-needs');
const csstree = require('css-tree');

const mods = (o) => Object.entries(o).map(([id, text]) => ({ id, text }));
const docOf = (html) => new JSDOM(html).window.document;
const need = (css, html, opts, runtime) => {
  const index = buildIndex(mods(css), opts);
  const doc = docOf(html);
  const flags = neededModules(index, scanDocument(doc.documentElement), opts?.selectors ? doc : undefined, runtime);
  return Object.fromEntries(Object.keys(css).map((id, i) => [id, flags[i]]));
};

describe('style-needs', () => {
  test('a class selector needs its class; a missing class skips the module', () => {
    const css = { a: 'section.a { color: red }', b: 'section.b { color: red }' };
    assert.deepEqual(need(css, '<section class="a"></section>'), { a: true, b: false });
  });

  test('every token of a compound must be present (attribute name, tag, id)', () => {
    const css = { x: 'section[data-form="2d"] > h2.lead#t { color: red }' };
    assert.equal(need(css, '<section data-form="2d"><h2 class="lead" id="t"></h2></section>').x, true);
    assert.equal(need(css, '<section data-form="2d"><h2 class="lead"></h2></section>').x, false, 'id missing');
    assert.equal(need(css, '<section><h2 class="lead" id="t"></h2></section>').x, false, 'attribute missing');
  });

  test(':is() and :where() are alternatives, not requirements', () => {
    const css = { x: ':where(.a, .b) .c { color: red }' };
    assert.equal(need(css, '<i class="b"></i><i class="c"></i>').x, true);
    assert.equal(need(css, '<i class="c"></i>').x, false);
  });

  test(':not() and :has() arguments never add a requirement', () => {
    const css = { x: '.a:not(.never) { color: red }', y: '.a:has(.never) { color: red }' };
    assert.deepEqual(need(css, '<i class="a"></i>'), { x: true, y: true });
  });

  test('a universal or :root rule makes its module unconditional', () => {
    const css = { x: ':root { --t: 1 }', y: '* { box-sizing: border-box }' };
    assert.deepEqual(need(css, '<i></i>'), { x: true, y: true });
  });

  test('a module with no selectors (banner, @layer statement) is kept', () => {
    assert.equal(need({ x: '/* banner */', y: '@layer a, b;' }, '<i></i>').x, true);
    assert.equal(need({ x: '/* banner */', y: '@layer a, b;' }, '<i></i>').y, true);
  });

  test('a named definition is needed only when a needed module mentions the name', () => {
    const css = {
      anim: '@keyframes spin { to { transform: rotate(1turn) } }',
      user: 'section.u { animation: spin 1s }',
      other: 'section.o { color: red }',
    };
    assert.deepEqual(need(css, '<section class="u"></section>'), { anim: true, user: true, other: false });
    assert.deepEqual(need(css, '<section class="o"></section>'), { anim: false, user: false, other: true });
  });

  test('@property and @font-face definitions follow the same name edge', () => {
    const css = {
      p: '@property --gap { syntax: "<length>"; inherits: true; initial-value: 0px }',
      f: '@font-face { font-family: "Fancy"; src: url(x.woff2) }',
      u: 'section.u { margin-top: var(--gap); font-family: Fancy }',
    };
    assert.deepEqual(need(css, '<section class="u"></section>'), { p: true, f: true, u: true });
    assert.deepEqual(need(css, '<section></section>'), { p: false, f: false, u: false });
  });

  test('a ::highlight() rule is runtime-requested: no document scan satisfies it', () => {
    const css = { x: '::highlight(said) { background: red }' };
    assert.equal(need(css, '<i></i>').x, false);
  });

  test('verify mode asks the document about met alternatives only', () => {
    const css = { x: 'section svg path { fill: red }' };
    const html = '<section><svg></svg></section><div><path></path></div>';
    assert.equal(need(css, html).x, true, 'tokens alone cannot tell the combinator failed');
    assert.equal(need(css, html, { selectors: true }).x, false, 'the selector does not match');
    assert.equal(need(css, '<section><svg><path></path></svg></section>', { selectors: true }).x, true);
  });

  test('verify mode keeps a module whose selector the engine cannot parse', () => {
    const css = { x: 'section.a:fake-pseudo(1) { color: red }' };
    assert.equal(need(css, '<section class="a"></section>', { selectors: true }).x, true);
  });

  describe('what the checker broke (each case was a real false negative)', () => {
    const ask = (sel, nested = false) => {
      const ast = csstree.parse(`${sel}{}`);
      const first = ast.children.first.prelude.children.first;
      return askableOf(first, nested);
    };

    test('askable keeps the whole name of :focus-visible and :focus-within', () => {
      assert.equal(ask('.btn:focus-visible'), '.btn');
      assert.equal(ask('.f:focus-within .g'), '.f .g');
      assert.equal(ask('.a:hover'), '.a');
    });

    test('a state pseudo-class inside :not() / :is() / :has() is not askable', () => {
      assert.equal(ask('.x:not(.a:hover)'), null);
      assert.equal(ask('.btn:is(:hover, :focus)'), null);
      assert.equal(ask('.a:has(:focus-within)'), null);
    });

    test('nested, @scope-relative, leading-combinator and legacy-pseudo selectors are not askable', () => {
      assert.equal(ask('.a', true), null);
      assert.equal(ask('&>.b'), null);
      assert.equal(ask(':scope>img'), null);
      assert.equal(ask('.a:before'), null);
    });

    test('verify keeps a module whose only met selector carries a state pseudo', () => {
      const css = { x: '.btn:focus-visible { outline: 1px solid red }', y: '.x:not(.a:hover) { color: red }' };
      assert.deepEqual(need(css, '<i class="btn x a"></i>', { selectors: true }), { x: true, y: true });
    });

    test('rules inside @scope or nested in a rule are kept, not dropped', () => {
      const css = { x: '@scope (.card) { :scope > img { width: 1px } }', y: '.p { & > .b { color: red } }' };
      assert.deepEqual(need(css, '<div class="card"><img></div><i class="p"><i class="b"></i></i>', { selectors: true }), { x: true, y: true });
    });

    test('escaped names, namespaces and case are normalized', () => {
      assert.equal(need({ x: '.a\\:b { color: red }' }, '<i class="a:b"></i>').x, true);
      assert.equal(need({ x: '.\\31 0 { color: red }' }, '<i class="10"></i>').x, true);
      assert.equal(need({ x: '[*|lang] { color: red }' }, '<i lang="en"></i>').x, true);
      assert.equal(need({ x: '.Foo { color: red }' }, '<i class="foo"></i>').x, true);
    });

    test('every module that defines a name counts, and font names ignore case', () => {
      const css = {
        k1: '@keyframes x { to { opacity: 0 } }',
        k2: '@keyframes x { to { opacity: 1 } }',
        f: '@font-face { font-family: Fancy; src: url(a.woff2) }',
        u: 'section.u { animation: x 1s; font-family: fancy }',
      };
      assert.deepEqual(need(css, '<section class="u"></section>'), { k1: true, k2: true, f: true, u: true });
    });

    test('the document itself can mention a defined name (inline style)', () => {
      const css = { k: '@keyframes spin { to { opacity: 0 } }' };
      assert.equal(need(css, '<i style="animation: spin 1s"></i>').k, true);
      assert.equal(need(css, '<i></i>').k, false);
    });

    test('runtime tokens count as present and are never verified', () => {
      const css = { x: 'section[data-guide] .y { color: red }', z: '.later:hover { color: red }' };
      const html = '<section><i class="y"></i></section>';
      assert.deepEqual(need(css, html, { selectors: true }, { a: ['data-guide'] }), { x: true, z: false });
      assert.deepEqual(need(css, html, { selectors: true }), { x: false, z: false });
    });

    test('a selector the parser cannot read keeps its module instead of throwing', () => {
      assert.doesNotThrow(() => buildIndex(mods({ x: '.a:is(.b,) { color: red }', y: '.a, 12px .b { color: red }' })));
      assert.deepEqual(need({ x: '.a, 12px .b { color: red }' }, '<i></i>'), { x: true });
    });
  });

  test('the token index drops subsumed alternatives and answers the same', () => {
    // `.a` is met whenever `.a.b` is, so the longer alternative adds nothing; `.c` stays.
    const css = { m: '.a { color: red } .a.b { color: blue } .a .b .d { color: green } .c { color: red }' };
    const pruned = buildIndex(mods(css));
    assert.equal(pruned[0].alts.length, 2);
    for (const html of ['<i class="a"></i>', '<i class="b"></i>', '<i class="c"></i>', '<i class="a b d"></i>', '<i></i>']) {
      const doc = docOf(html);
      const tokens = scanDocument(doc.documentElement);
      const full = buildIndex(mods(css), { selectors: true }); // unpruned (each alternative carries its selector)
      assert.deepEqual(neededModules(pruned, tokens), neededModules(full, tokens), html);
    }
  });
});
