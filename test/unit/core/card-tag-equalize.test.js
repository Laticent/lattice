/**
 * Every boxed card tag on a slide takes one size (lib/core/card-tag-equalize.js).
 *
 * jsdom has no layout, so each test stands in for the browser's computed style with the
 * metrics a real render reports (measured in Chromium on examples/card-tags.md). What is under
 * test is the kernel's arithmetic and its settle behavior, not layout:
 *
 *   1. the shims pad each tag to the widest width and the tallest height, and the section
 *      carries the equalized border-box height;
 *   2. a `border-box` tag (the band) is measured by its content box, so a shimmed tag does not
 *      read as tall as the tallest — which made the first cut add, then remove, its own shim;
 *   3. a second run writes nothing (the runtime calls it from an observer that watches style);
 *   4. a tag that is not boxed (an `axis` label) or not laid out (a hidden slide) is left alone.
 *
 * The same kernel runs on the real surface in both paths; examples/card-tags.pdf is the artifact.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { equalizeCardTags, EQUALIZE_CARD_TAGS_SRC } = require(path.join(__dirname, '..', '..', '..', 'lib/core/card-tag-equalize.js'));

const decision = (cls, labels) => `<section class="decision ${cls}"><div class="cell-stage"><ul>${
  labels.map((l) => `<li><strong>${l}</strong><ul><li>body</li></ul></li>`).join('')}</ul></div></section>`;

/**
 * A document whose computed styles come from `metrics(el, pseudo, shims)`. The shims the kernel
 * wrote are handed back, so a border-box tag can report padding that includes them — as a
 * browser does.
 */
function page(markup, metrics) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${markup}</body>`);
  const { window } = dom;
  window.getComputedStyle = (el, pseudo) => {
    const host = pseudo ? el : el.parentElement;
    const shim = (n) => parseFloat(host.style.getPropertyValue(n)) || 0;
    return metrics(el, pseudo, { x: shim('--card-tag-shim-x'), y: shim('--card-tag-shim-y') });
  };
  return window.document;
}

const content = (w, h, extra) => ({
  position: 'absolute', display: 'block', boxSizing: 'content-box',
  width: `${w}px`, height: `${h}px`,
  paddingTop: '5.39px', paddingBottom: '5.39px', paddingLeft: '12.58px', paddingRight: '11.38px',
  borderTopWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px', borderRightWidth: '0px',
  ...extra,
});

test('corner: every tag takes the widest width and the tallest height', () => {
  // BUILD, a label that wrapped to two lines, WHY NOT DELAY — the owner's screenshot.
  const sizes = { BUILD: [49.7, 14.98], 'WHY NOT BUY FROM EITHER SHORTLISTED VENDOR': [342.1, 29.95], 'WHY NOT DELAY': [131.2, 14.98] };
  const doc = page(decision('', Object.keys(sizes)), (el) => content(...sizes[el.textContent]));
  assert.ok(equalizeCardTags(doc) > 0);
  const lis = [...doc.querySelectorAll('section > .cell-stage > ul > li')];
  const shim = (li, n) => parseFloat(li.style.getPropertyValue(n));
  assert.deepEqual(lis.map((li) => shim(li, '--card-tag-shim-x')), [292.4, 0, 210.9]);
  assert.deepEqual(lis.map((li) => shim(li, '--card-tag-shim-y')), [7.49, 0, 7.49]);
  // The equalized border box: the tallest content plus its own padding.
  assert.equal(doc.querySelector('section').style.getPropertyValue('--card-tag-block'), '40.73px');
});

test('band: measured by the content box, so its shims settle instead of flipping', () => {
  const lines = { BUILD: 1, 'WHY NOT BUY FROM EITHER SHORTLISTED VENDOR': 2, 'WHY NOT DELAY': 1 };
  // A border-box band reports its padding in its height — shims included, as a browser does.
  const doc = page(decision('banner-tag', Object.keys(lines)), (el, _p, shim) => {
    const pad = 8.99 + shim.y;
    return content(366, 17.97 * lines[el.textContent] + 2 * pad, {
      position: 'static', boxSizing: 'border-box',
      paddingTop: `${pad}px`, paddingBottom: `${pad}px`, paddingLeft: '24px', paddingRight: '22.8px',
    });
  });
  equalizeCardTags(doc);
  const ys = () => [...doc.querySelectorAll('section > .cell-stage > ul > li')].map((li) => li.style.getPropertyValue('--card-tag-shim-y'));
  assert.deepEqual(ys(), ['8.98px', '0px', '8.98px']);
  assert.equal(equalizeCardTags(doc), 0, 'a second run must write nothing');
  assert.deepEqual(ys(), ['8.98px', '0px', '8.98px'], 'and must not remove the shims it added');
  // A band spans the card already, so it takes no width shim.
  for (const li of doc.querySelectorAll('section > .cell-stage > ul > li')) {
    assert.equal(li.style.getPropertyValue('--card-tag-shim-x'), '0px');
  }
});

test('a second run on a settled slide writes nothing', () => {
  const doc = page(decision('', ['A', 'BBBB']), (el) => content(el.textContent.length * 10, 15));
  assert.ok(equalizeCardTags(doc) > 0);
  assert.equal(equalizeCardTags(doc), 0);
});

test('unboxed and unlaid-out tags are left alone', () => {
  // An in-flow label (compare-prose `axis`, or any static tag outside a band) is not a tag box.
  const staticDoc = page(decision('', ['A', 'BBBB']), (el) => content(el.textContent.length * 10, 15, { position: 'static' }));
  assert.equal(equalizeCardTags(staticDoc), 0);
  // A hidden slide reports no size; writing zeros there would shrink it when it shows.
  const hidden = page(decision('', ['A', 'BBBB']), () => content(0, 0));
  assert.equal(equalizeCardTags(hidden), 0);
  // compare-prose `axis` is out by selector.
  const axis = page(decision('', ['A']).replace('decision', 'compare-prose axis'), () => content(10, 15));
  assert.equal(equalizeCardTags(axis), 0);
});

test('a pseudo-element tag (the number) is measured on ::before', () => {
  const markup = '<section class="cards-grid"><div class="cell-stage"><ol><li>a</li><li>b</li></ol></div></section>';
  const seen = [];
  const doc = page(markup, (el, pseudo) => { seen.push(pseudo); return content(el.textContent === 'a' ? 7.9 : 10.2, 15); });
  equalizeCardTags(doc);
  assert.deepEqual([...new Set(seen)], ['::before']);
  assert.equal(doc.querySelector('li').style.getPropertyValue('--card-tag-shim-x'), '2.3px');
});

test('the export injects the same function it exports', () => {
  // eslint-disable-next-line no-new-func
  const fromSrc = new Function(`return (${EQUALIZE_CARD_TAGS_SRC});`)();
  const doc = page(decision('', ['A', 'BBBB']), (el) => content(el.textContent.length * 10, 15));
  assert.ok(fromSrc(doc) > 0, 'the serialized source closes over nothing');
});
