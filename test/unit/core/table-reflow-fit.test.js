const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { holdUnfitReflow, HOLD_UNFIT_REFLOW_SRC, HELD_CLASS } = require('../../../lib/core/table-reflow-fit.js');

// jsdom measures no layout, so the overflow probe is a stand-in and "switched" is a stylesheet
// that lays the body rows out as blocks, the way base.table-reflow.css does inside its query.
function page({ switched = true, flow = null, held = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html${flow ? ` data-lattice-flow="${flow}"` : ''}><head><style>
    ${switched ? 'table.lat-reflow-cards:not(.lat-reflow-held) tr { display: block; }' : ''}
  </style></head><body>
    <section data-lattice-slide="1"><div class="cell-stage"><table class="lat-reflow-cards${held ? ` ${HELD_CLASS}` : ''}"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></section>
    <section data-lattice-slide="2"><div class="cell-stage"><table class="lat-reflow-cards"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></section>
  </body></html>`);
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  return dom.window.document;
}
const overOn = (pages) => (s) => ({ over: pages.includes(+s.getAttribute('data-lattice-slide')) });

test('a slide that overflows with a switched table holds it in table form; one that fits keeps the cards', () => {
  const doc = page();
  assert.deepEqual(holdUnfitReflow(doc, overOn([1]), '', '', 12), [1]);
  const [a, b] = doc.querySelectorAll('table');
  assert.ok(a.classList.contains(HELD_CLASS), 'the overflowing slide is held');
  assert.ok(!b.classList.contains(HELD_CLASS), 'the slide that fits keeps its narrow layout');
});

test('a table whose narrow layout is not active is never held, whatever the slide measures', () => {
  const doc = page({ switched: false });
  assert.deepEqual(holdUnfitReflow(doc, overOn([1, 2]), '', '', 12), []);
});

test('a continuous host skips the pass: the page grows, so the narrow layout stands', () => {
  const doc = page({ flow: 'continuous' });
  assert.deepEqual(holdUnfitReflow(doc, overOn([1, 2]), '', '', 12), []);
});

test('the pass is idempotent: a held table is not judged again', () => {
  const doc = page({ held: true });
  assert.deepEqual(holdUnfitReflow(doc, overOn([1, 2]), '', '', 12), [2]);
});

test('the injected source runs on its own, as the CLI ships it', () => {
  const doc = page();
  const hold = new Function(`return (${HOLD_UNFIT_REFLOW_SRC})`)();
  assert.deepEqual(hold(doc, overOn([2]), '', '', 12), [2]);
});

test('no document, no work', () => {
  assert.deepEqual(holdUnfitReflow(null), []);
});
