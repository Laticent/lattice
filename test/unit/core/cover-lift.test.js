/**
 * Unit: a split cover that runs into its footer moves its subtitle, then its lede, to the top of
 * the run's first body page (lib/core/cover-lift.js). jsdom has no layout, so each element's box
 * is stubbed from a height table: the cover stacks its parts from y=0, and the footer starts at
 * `floor`. The real-browser check is the export check deck at square (slide 9).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { liftCoverText } = require('../../../lib/core/cover-lift');

function deck({ heights, floor, room = 500 }) {
  const dom = new JSDOM(`<body>
    <section data-split-role="cover" data-lattice-slide="9">
      <div class="split-feat-h">Title</div><div class="split-feat-sub">Sub</div>
      <div class="split-feat-lede">Lede</div><div class="split-cover-lead">Lead</div>
      <div class="cell-footer">F</div>
    </section>
    <section data-split-role="body" data-lattice-slide="9.2"><div class="cell-stage"><ul><li>a</li></ul></div></section>
    <section data-split-role="body" data-lattice-slide="9.3"><div class="cell-stage"><ul><li>b</li></ul></div></section>
  </body>`);
  const { document, HTMLElement } = dom.window;
  HTMLElement.prototype.getBoundingClientRect = function rect() {
    const cover = document.querySelector('section[data-split-role="cover"]');
    if (this.classList.contains('cell-footer')) return { top: floor, bottom: floor + 40 };
    if (this.parentElement === cover) {
      let y = 0;
      for (const el of cover.children) {
        if (el.classList.contains('cell-footer')) continue;
        const h = heights[el.className] || 0;
        if (el === this) return { top: y, bottom: y + h };
        y += h;
      }
    }
    return { top: 0, bottom: 0 };
  };
  // Each body page's stage has `room` px of height and, in this stub, content of height 0.
  for (const stage of document.querySelectorAll('.cell-stage')) Object.defineProperty(stage, 'clientHeight', { value: room });
  return document;
}

test('a cover that fits keeps everything', () => {
  const doc = deck({ heights: { 'split-feat-h': 100, 'split-feat-sub': 40, 'split-feat-lede': 40, 'split-cover-lead': 40 }, floor: 400 });
  assert.equal(liftCoverText(doc), 0);
  assert.ok(doc.querySelector('[data-split-role="cover"] .split-feat-sub'));
});

test('the subtitle moves first, and only as much as the cover needs', () => {
  const doc = deck({ heights: { 'split-feat-h': 300, 'split-feat-sub': 60, 'split-feat-lede': 40, 'split-cover-lead': 40 }, floor: 400 });
  assert.equal(liftCoverText(doc), 1);
  const page = doc.querySelector('[data-lattice-slide="9.2"] > .cell-stage');
  assert.equal(page.firstElementChild.className, 'split-lifted', 'it lands above the members');
  assert.ok(page.querySelector('.split-lifted > .split-feat-sub'));
  assert.ok(doc.querySelector('[data-split-role="cover"] .split-feat-lede'), 'the lede stays: the cover fits without moving it');
  assert.ok(!doc.querySelector('[data-lattice-slide="9.3"] .split-lifted'), 'only the first body page takes it');
  assert.equal(liftCoverText(doc), 0, 'a second pass moves nothing');
});

test('the lede follows the subtitle when the cover still runs into its footer', () => {
  const doc = deck({ heights: { 'split-feat-h': 340, 'split-feat-sub': 40, 'split-feat-lede': 60, 'split-cover-lead': 40 }, floor: 400 });
  assert.equal(liftCoverText(doc), 2);
  const held = [...doc.querySelector('.split-lifted').children].map((e) => e.className);
  assert.deepEqual(held, ['split-feat-sub', 'split-feat-lede'], 'in reading order');
});

test('a first page with no room keeps the text on the cover', () => {
  const doc = deck({ heights: { 'split-feat-h': 300, 'split-feat-sub': 60, 'split-feat-lede': 40, 'split-cover-lead': 40 }, floor: 400, room: 30 });
  assert.equal(liftCoverText(doc), 0);
  assert.ok(doc.querySelector('[data-split-role="cover"] .split-feat-sub'));
});
