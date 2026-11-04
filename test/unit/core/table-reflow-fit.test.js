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
    <section data-lattice-slide="1"><div class="cell-stage"><table class="lat-reflow-cards${held ? ` ${HELD_CLASS}` : ''}" data-lat-reflow="cards"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></section>
    <section data-lattice-slide="2"><div class="cell-stage"><table class="lat-reflow-cards" data-lat-reflow="cards"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></section>
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

test('a table a component declares (data-lat-reflow, no engine class) is held the same way', () => {
  const dom = new JSDOM(`<!doctype html><html><head><style>table[data-lat-reflow="pairs"]:not(.lat-reflow-held) tr { display: block; }</style></head><body>
    <section data-lattice-slide="1"><table class="glossary-terms" data-lat-reflow="pairs"><tbody><tr><td>A</td><td>B</td></tr></tbody></table></section></body></html>`);
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  const doc = dom.window.document;
  assert.deepEqual(holdUnfitReflow(doc, () => ({ over: true }), '', '', 12), [1]);
  assert.ok(doc.querySelector('table').classList.contains(HELD_CLASS));
});

test('a table that names no narrow layout is never held', () => {
  const dom = new JSDOM(`<!doctype html><html><head><style>tr { display: block; }</style></head><body>
    <section data-lattice-slide="1"><table data-lat-reflow="none"><tbody><tr><td>A</td></tr></tbody></table></section></body></html>`);
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  assert.deepEqual(holdUnfitReflow(dom.window.document, () => ({ over: true }), '', '', 12), []);
});

test('a hold that does not bring the table form back is removed, and the slide is not reported', () => {
  // A component rule that stacks whatever the fit check says (glossary on the mobile `strip`
  // canvas): holding it changes nothing a reader sees, so the hold is taken back.
  const dom = new JSDOM(`<!doctype html><html><head><style>tr { display: block; }</style></head><body>
    <section data-lattice-slide="1"><table class="glossary-terms" data-lat-reflow="pairs"><tbody><tr><td>A</td><td>B</td></tr></tbody></table></section></body></html>`);
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  const doc = dom.window.document;
  assert.deepEqual(holdUnfitReflow(doc, () => ({ over: true }), '', '', 12), []);
  assert.ok(!doc.querySelector('table').classList.contains(HELD_CLASS));
});

test('a card list whose narrow form is active (--lat-narrow: 1) is held like a table, and released if the hold changes nothing', () => {
  const css = `.cell-stage > ul:not(.lat-reflow-held) { --lat-narrow: 1; }`;
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>
    <section data-lattice-slide="1"><div class="cell-stage"><ul><li>A</li></ul></div></section></body></html>`);
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  const doc = dom.window.document;
  assert.deepEqual(holdUnfitReflow(doc, () => ({ over: true }), '', '', 12), [1]);
  assert.ok(doc.querySelector('ul').classList.contains(HELD_CLASS));
  // A list that keeps its narrow form under a hold: the hold is taken back.
  const dom2 = new JSDOM(`<!doctype html><html><head><style>.cell-stage > ul { --lat-narrow: 1; }</style></head><body>
    <section data-lattice-slide="1"><div class="cell-stage"><ul><li>A</li></ul></div></section></body></html>`);
  global.getComputedStyle = dom2.window.getComputedStyle.bind(dom2.window);
  assert.deepEqual(holdUnfitReflow(dom2.window.document, () => ({ over: true }), '', '', 12), []);
  assert.ok(!dom2.window.document.querySelector('ul').classList.contains(HELD_CLASS));
});
