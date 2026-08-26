/**
 * lib/core/dom-provider — the parse/serialize round-trip the transformer
 * unification depends on.
 *
 * THE TWO CASES THAT NEARLY SHIPPED A SILENT CORRUPTION, both pinned below:
 *
 *   1. FRAGMENT PARSING IS LOSSY. The engine emits `<article class="lattice">…`
 *      with no `<html>`/`<body>`, and parsers disagree about where that lands.
 *      A first cut picked "whichever root has children" and, on linkedom, that
 *      silently deleted the outermost element from every document. The smoke test
 *      passed because it asserted the edit had landed and never looked at what had
 *      gone missing. The provider now always wraps in a document skeleton.
 *
 *   2. SVG ELEMENT NAMES ARE CASE-SENSITIVE. linkedom lowercases them —
 *      `<radialGradient>` → `<radialgradient>`, `<clipPath>` → `<clippath>`,
 *      `<foreignObject>` → `<foreignobject>` — which are not SVG elements at all.
 *      Every chart gradient, every clip path and every Mermaid node label (a
 *      `<foreignObject>`) would have stopped rendering with the suite green. That
 *      is why the Node branch is jsdom and not the parser that benchmarked 17×
 *      faster. These assertions are the guard on that choice: swap the parser for
 *      a quicker one and this file is what refuses.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { domProvider, withDom, __resetDomProvider } = require('../../../lib/core/dom-provider');

describe('domProvider — which parser answers', () => {
  test('resolves to jsdom under Node', () => {
    __resetDomProvider();
    assert.equal(domProvider().name, 'jsdom');
  });

  test('the resolution is memoized', () => {
    __resetDomProvider();
    assert.equal(domProvider(), domProvider());
  });
});

describe('withDom — round-trip fidelity', () => {
  const identical = (html) => assert.equal(withDom(html, () => {}), html, html);

  test('an engine fragment keeps its outermost element', () => {
    // Case 1 above. `<article>` is the engine's own wrapper; losing it loses the deck.
    identical('<article class="lattice"><section class="x"><p>hi</p></section></article>');
  });

  test('attributes, ids and data-* survive verbatim', () => {
    identical('<section id="1" data-class="title" class="title"><h2 id="a">T</h2></section>');
  });

  test('highlight.js span markup survives verbatim', () => {
    identical('<pre><code class="language-bash"><span class="hljs-meta">#!/bin/sh</span></code></pre>');
  });

  test('a style attribute carrying custom properties survives', () => {
    identical('<div style="--x: 1px; background-image:url(&quot;a.png&quot;)"></div>');
  });
});

describe('withDom — SVG is the dangerous part', () => {
  // Element NAMES are the assertion, not byte equality: jsdom expands `<rect/>` to
  // `<rect></rect>`, which is the same element. A lowercased name is a different
  // element, and a dead one.
  const keepsTag = (html, tag) => {
    const out = withDom(html, () => {});
    assert.ok(out.includes(`<${tag}`), `${tag} was mangled to: ${out}`);
  };

  test('radialGradient keeps its capital G', () => {
    keepsTag('<svg viewBox="0 0 10 10"><defs><radialGradient id="g"><stop offset="0%"/></radialGradient></defs></svg>', 'radialGradient');
  });

  test('linearGradient keeps its capital G', () => {
    keepsTag('<svg><linearGradient id="l" gradientUnits="userSpaceOnUse"/></svg>', 'linearGradient');
  });

  test('clipPath keeps its capital P', () => {
    keepsTag('<svg><clipPath id="c"><rect width="1" height="1"/></clipPath></svg>', 'clipPath');
  });

  test('textPath keeps its capital P', () => {
    keepsTag('<svg><text><textPath href="#p">x</textPath></text></svg>', 'textPath');
  });

  test('foreignObject keeps its capital O — every Mermaid node label is one', () => {
    keepsTag('<svg><foreignObject width="10" height="10"><div>hi</div></foreignObject></svg>', 'foreignObject');
  });

  test('camelCase SVG ATTRIBUTES survive too', () => {
    const out = withDom('<svg><radialGradient gradientUnits="userSpaceOnUse"/></svg>', () => {});
    assert.match(out, /gradientUnits="userSpaceOnUse"/);
  });

  test('viewBox keeps its capital B', () => {
    assert.match(withDom('<svg viewBox="0 0 35 35"></svg>', () => {}), /viewBox="0 0 35 35"/);
  });
});

describe('withDom — the callback edits the real DOM', () => {
  test('a mutation is reflected in the serialized output', () => {
    const out = withDom('<section><p>before</p></section>', (root) => {
      root.querySelector('p').textContent = 'after';
    });
    assert.match(out, /<p>after<\/p>/);
  });

  test('the callback receives a queryable root scoped to the content', () => {
    withDom('<section class="a"></section><section class="b"></section>', (root) => {
      assert.equal(root.querySelectorAll('section').length, 2);
    });
  });
});

describe('withDom — fails closed, never throws', () => {
  test('a throwing callback returns the input unchanged', () => {
    const html = '<section><p>x</p></section>';
    assert.equal(withDom(html, () => { throw new Error('boom'); }), html);
  });

  test('non-string and empty input pass straight through', () => {
    assert.equal(withDom('', () => {}), '');
    assert.equal(withDom(null, () => {}), null);
    assert.equal(withDom(undefined, () => {}), undefined);
  });
});
