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

  test('a malformed id is never reflected — the graphic is skipped, not rewritten', () => {
    const src = '<svg role="img"><title id="a&quot; onload=x">T</title></svg>';
    const out = applyToHtml(src);
    assert.equal(out, src, 'an author-owned id means hands off');
    assert.doesNotMatch(out, /aria-labelledby/, 'never reflects a malformed id, in any position');
    assert.ok(balanced(out));
  });

  test('an author id is NEVER overwritten — that would dangle references to it', () => {
    // An element has exactly one id, so "add ours as well" is not available. Overwriting
    // silently breaks every reference elsewhere in the document; the button below loses
    // its accessible name outright. Skipping costs this ONE graphic the durable naming —
    // which is the state it was already in — and costs nothing else.
    const src = '<svg role="img"><title id="radar-mini-3">Radar</title></svg>' +
      '<button aria-labelledby="radar-mini-3">go</button>';
    const out = applyToHtml(src);
    assert.equal(out, src, 'the graphic is left exactly as authored');
    assert.match(out, /id="radar-mini-3"/, 'the referenced id still has an owner');
  });

  test('an author id on <desc> costs the description, not the name', () => {
    // Finer-grained than the <title> case: we can still mint the name and simply omit
    // aria-describedby, so the graphic keeps a reliable name.
    const out = applyToHtml('<svg role="img"><title>T</title><desc id="mine">D</desc></svg>');
    assert.match(out, /aria-labelledby="lat-svgt-1"/, 'still named');
    assert.doesNotMatch(out, /aria-describedby/, 'no reference to an id we do not own');
    assert.match(out, /<desc id="mine">D<\/desc>/, 'the author id survives untouched');
  });

  test('the id-squat guard validates the prefix it actually returns', () => {
    // The guard used to test the PREVIOUS candidate and bail at a fixed count, so the last
    // prefix it assigned was returned unchecked: 32 decoy tokens as plain text plus a squat
    // on the 33rd defeated it, and the chart announced the attacker's string on a real
    // Chrome accessibility tree. The loop condition is now the invariant.
    const decoys = ['lat-svg', ...Array.from({ length: 31 }, (_, i) => `lat-x${i}-svg`)].join(' ');
    const out = applyToHtml(
      `<p>${decoys}</p><span id="lat-x31-svgt-1" hidden>Squatted</span>` +
      '<svg role="img"><title>Real chart</title></svg>',
    );
    const ref = out.match(/aria-labelledby="([^"]+)"/)[1];
    assert.notEqual(ref, 'lat-x31-svgt-1', 'must not land on the squatted id');
    assert.equal((out.match(new RegExp(`id="${ref}"`, 'g')) || []).length, 1, 'exactly one owner');
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

  test('an id in the SOURCE is never referenced — and never destroyed either', () => {
    // No engine kernel emits a `<title id=…>`, so this is reachable only from author HTML.
    // Referencing it would let authored content (UNTRUSTED, in the Studio) dictate what a
    // chart announces as; overwriting it dangles every reference to it. Skip is the only
    // move that does neither.
    const src = '<svg role="img"><title id="author-chosen">Real name</title></svg>';
    const out = applyToHtml(src);
    assert.doesNotMatch(out, /aria-labelledby/, 'we do not point at an id the source chose');
    assert.equal(out, src, 'and we do not take the id away from it');
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
