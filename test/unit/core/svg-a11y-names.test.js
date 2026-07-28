/**
 * Unit: lib/core/svg-a11y-names.js — the document-level pass that makes every named
 * chart graphic reliably announced.
 *
 * WHY THESE ARE STRING-LEVEL ASSERTIONS, not DOM ones. The first version of this kernel
 * emitted `</svg></svg>` — it sliced the element body to the index PAST the closing tag
 * and then appended another close. Every existing test passed and the rendered pixels
 * were identical, because browsers and jsdom silently drop a stray unmatched close tag.
 * A DOM-based test cannot see malformed markup; only comparing the STRING can. So the
 * tag balance is asserted here directly.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applyToHtml } = require('../../../lib/core/svg-a11y-names');

/** Every `<svg` has exactly one matching close — the invariant a DOM test cannot see. */
function balanced(html) {
  return (html.match(/<svg\b/g) || []).length === (html.match(/<\/svg\s*>/g) || []).length;
}

describe('svg-a11y-names — applyToHtml', () => {
  test('references a graphic\'s own <title>/<desc> by id', () => {
    const out = applyToHtml('<svg class="x" role="img"><title>Funnel chart</title><desc>Stages — a, b</desc><g/></svg>');
    assert.match(out, /<svg[^>]*aria-labelledby="lat-svgt-1"/);
    assert.match(out, /<svg[^>]*aria-describedby="lat-svgd-1"/);
    assert.match(out, /<title id="lat-svgt-1">Funnel chart<\/title>/);
    assert.match(out, /<desc id="lat-svgd-1">Stages — a, b<\/desc>/);
  });

  test('emits well-formed markup — no duplicated closing tag', () => {
    // The regression this file exists for. See the header.
    const src = '<p>before</p><svg role="img"><title>T</title><desc>D</desc><g/></svg><p>after</p>';
    const out = applyToHtml(src);
    assert.ok(balanced(out), `unbalanced <svg> tags: ${out}`);
    assert.equal((out.match(/<\/svg>/g) || []).length, 1);
    assert.ok(out.includes('<p>after</p>'), 'content after the graphic survives');
    assert.ok(out.startsWith('<p>before</p>'), 'content before the graphic survives');
  });

  test('appends its attributes — it never reorders the existing ones', () => {
    // Several matchers in this repo anchor on `<svg class="…"` as a PREFIX; prepending
    // reordered the attributes and broke the piechart parity test.
    const out = applyToHtml('<svg class="piechart-svg" viewBox="0 0 377 200" role="img"><title>Pie chart</title></svg>');
    assert.match(out, /^<svg class="piechart-svg" viewBox="0 0 377 200" role="img" aria-labelledby=/);
  });

  test('numbers multiple graphics independently and uniquely', () => {
    const out = applyToHtml('<svg role="img"><title>A</title></svg><svg role="img"><title>B</title></svg>');
    assert.ok(balanced(out));
    const ids = [...out.matchAll(/<title id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['lat-svgt-1', 'lat-svgt-2']);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  });

  test('an <svg> with no <title> is untouched — this pass never invents a name', () => {
    const src = '<svg role="img"><g/></svg>';
    assert.equal(applyToHtml(src), src);
  });

  test('an existing accessible name always wins', () => {
    for (const src of [
      '<svg role="img" aria-label="Contact QR code"><title>QR</title></svg>',
      '<svg role="img" aria-labelledby="mermaid-title"><title>Flowchart</title></svg>',
    ]) {
      assert.equal(applyToHtml(src), src, 'an authored/upstream name must not be overridden');
    }
  });

  test('a decorative or unroled <svg> is left alone', () => {
    const src = '<svg class="journey-face" aria-hidden="true"><title>x</title></svg>';
    assert.equal(applyToHtml(src), src);
  });

  test('a <title> nested inside a shape is a TOOLTIP, not the graphic\'s name', () => {
    // The map emits a <title> per region. Promoting one would rename the whole graphic
    // after whichever shape happened to come first.
    const src = '<svg role="img"><path d="M0 0"><title>Kenya</title></path></svg>';
    assert.equal(applyToHtml(src), src, 'a non-direct-child <title> is not a name');
  });

  test('a malformed id is not reused — it is an injection surface, not a reference', () => {
    const out = applyToHtml('<svg role="img"><title id="a&quot; onload=x">T</title></svg>');
    assert.match(out, /aria-labelledby="lat-svgt-1"/, 'falls back to a minted id');
    assert.doesNotMatch(out, /aria-labelledby="[^"]*onload/, 'never reflects a malformed id');
    assert.ok(balanced(out));
  });

  test('re-identifying a titled node leaves exactly one id attribute', () => {
    const out = applyToHtml('<svg role="img"><title id="radar-mini-3">Radar</title></svg>');
    assert.equal((out.match(/<title[^>]*\sid=/g) || []).length, 1, 'no duplicate id attribute');
    assert.match(out, /<title id="lat-svgt-1">Radar<\/title>/);
  });

  test('is idempotent — a second pass changes nothing', () => {
    const once = applyToHtml('<svg role="img"><title>T</title><desc>D</desc></svg>');
    assert.equal(applyToHtml(once), once);
  });

  test('tolerates a spaced closing tag and a `>` inside an attribute value', () => {
    for (const src of [
      '<svg role="img"><title>T</title></svg >',
      '<svg role="img" data-x="a>b"><title>T</title></svg>',
    ]) {
      const out = applyToHtml(src);
      assert.ok(balanced(out), `unbalanced for ${src}: ${out}`);
    }
  });

  test('an id already present in the document cannot steal a chart\'s name', () => {
    // The critical defect this guard exists for. `aria-labelledby` resolves to whichever
    // node owns the id, so an element declaring the id we were about to mint wins by
    // being first — and the Studio renders UNTRUSTED shared/AI-generated markdown, whose
    // `id` and `aria-*` the sanitizer preserves verbatim. Untrusted content could dictate
    // what a screen reader says a chart is, with a pixel-identical render.
    const out = applyToHtml('<span id="lat-svgt-1" hidden>PROFITS UP 400%</span><svg role="img"><title>Funnel chart</title></svg>');
    const ref = out.match(/aria-labelledby="([^"]+)"/)[1];
    assert.notEqual(ref, 'lat-svgt-1', 'must not reference the squatted id');
    assert.match(out, new RegExp(`<title id="${ref}">Funnel chart</title>`), 'the reference resolves to OUR title');
  });

  test('an id in the SOURCE is never referenced — only ours is', () => {
    // No engine kernel emits a `<title id=…>`, so the only reachable input to an
    // id-reuse branch was author HTML: it existed solely to let authored content choose
    // what we point at.
    const out = applyToHtml('<svg role="img"><title id="author-chosen">Real name</title></svg>');
    assert.doesNotMatch(out, /aria-labelledby="author-chosen"/);
    assert.match(out, /aria-labelledby="lat-svgt-1"/);
    assert.match(out, /<title id="lat-svgt-1">Real name<\/title>/, 'the node is re-identified, its text untouched');
  });

  test('a self-closing <svg/> is left alone — rewriting it re-parents its sibling', () => {
    // Stripping the `/` turns it into an OPEN tag, and in HTML5 foreign content `<svg/>`
    // legitimately self-closes — so the next sibling gets pulled INTO the graphic. That
    // is a real DOM change, not a cosmetic one.
    const src = '<svg role="img"/><p>sibling</p>';
    assert.equal(applyToHtml(src), src);
  });

  test('html with no <svg> is returned untouched', () => {
    const src = '<p>no graphics here</p>';
    assert.equal(applyToHtml(src), src);
  });
});
