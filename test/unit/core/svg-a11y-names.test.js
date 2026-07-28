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
const { applyToHtml, associateCaptions } = require('../../../lib/core/svg-a11y-names');

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

  test('a well-formed existing id IS reused, so the reference points at the real node', () => {
    const out = applyToHtml('<svg role="img"><title id="radar-mini-3">Radar</title></svg>');
    assert.match(out, /aria-labelledby="radar-mini-3"/);
    assert.doesNotMatch(out, /<title id="radar-mini-3" id=/, 'no duplicate id attribute');
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

  test('html with no <svg> is returned untouched', () => {
    const src = '<p>no graphics here</p>';
    assert.equal(applyToHtml(src), src);
  });
});

describe('svg-a11y-names — associateCaptions', () => {
  test('appends an authored caption to the graphic\'s description list', () => {
    const named = applyToHtml('<div class="map-figure"><svg role="img"><title>Map</title><desc>Key</desc></svg></div>');
    const out = associateCaptions(`${named}<p class="chart-caption">Where growth came from.</p>`);
    assert.match(out, /aria-describedby="lat-svgd-1 lat-cap-1"/, 'the caption is APPENDED, not substituted');
    assert.match(out, /<p class="chart-caption" id="lat-cap-1">/);
  });

  test('leaves a caption with no preceding named graphic alone', () => {
    const src = '<p class="chart-caption">orphan</p>';
    assert.equal(associateCaptions(src), src);
  });

  test('html with no caption is returned untouched', () => {
    const src = '<svg role="img" aria-describedby="d"><desc id="d">x</desc></svg>';
    assert.equal(associateCaptions(src), src);
  });
});
