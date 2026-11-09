/**
 * One page per step (the CLI's `--steps`, the Studio's "One page per step"): `expandStepPages` copies each stepping
 * slide once per step and paints each copy at its step; `expandStepPagesHtml` is its string twin for the bookkeeping
 * that counts pages from the HTML. They must agree on WHICH slides expand and by how much, or the notes and captions
 * land on the wrong page. engineering/decisions/2026-11-09-steps-as-a-behavior.md.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const { expandStepPagesHtml } = require(path.join(ROOT, 'lib/core/step-rescope.js'));
const load = async () => ({
  ...(await import(path.join(ROOT, 'lib/core/step-pages.mjs'))),
  applyStepAt: (await import(path.join(ROOT, 'lib/core/step-state.mjs'))).applyStepAt,
});

const DECK = [
  '<section data-lattice-slide="1" data-lattice-pagination="1"><h1>Title</h1></section>',
  '<section data-lattice-slide="2" data-lattice-pagination="2" data-steps="3" data-step-kind="build"><ul><li data-step="1">a</li><li data-step="2">b</li><li data-step="3">c</li></ul></section>',
  '<section data-lattice-slide="3" data-lattice-pagination="3" data-steps="2" data-step-kind="focus" data-step-axes="row row" data-step-styles="- -"><p data-step="1" data-step-recede="2">x</p><p data-step="2" data-step-recede="1">y</p></section>',
  '<section data-lattice-slide="4" data-lattice-hidden="true" data-steps="2" data-step-kind="build"><p data-step="1">h</p><p data-step="2">i</p></section>',
  '<section data-lattice-slide="5" data-lattice-pagination="4"><h1>End</h1></section>',
].join('');

function domOf(html) {
  return new JSDOM(`<!doctype html><body><div class="lattice">${html}</div></body>`).window.document.querySelector('.lattice');
}

test('a build of 3 and a focus of 2 become 3 and 2 pages; a hidden or plain slide stays one', async () => {
  const { expandStepPages, applyStepAt } = await load();
  const root = domOf(DECK);
  assert.deepEqual(expandStepPages(root, applyStepAt), [1, 3, 2, 1, 1]);
  const secs = [...root.querySelectorAll(':scope > section')];
  assert.equal(secs.length, 8);
  // Every copy keeps its slide's stamps: the page number is the slide's, not the page's (S3).
  assert.deepEqual(secs.map((s) => s.getAttribute('data-lattice-slide')), ['1', '2', '2', '2', '3', '3', '4', '5']);
  assert.deepEqual(secs.map((s) => s.getAttribute('data-lattice-pagination')), ['1', '2', '2', '2', '3', '3', null, '4']);
  assert.deepEqual(secs.map((s) => s.getAttribute('data-step-page')), [null, '1', '2', '3', '1', '2', null, null]);
});

test('each page is painted at its step: a build reveals one more item, a focus walk lights the next unit', async () => {
  const { expandStepPages, applyStepAt } = await load();
  const root = domOf(DECK);
  expandStepPages(root, applyStepAt);
  const secs = [...root.querySelectorAll(':scope > section')];
  const built = (s) => [...s.querySelectorAll('li')].map((li) => (li.classList.contains('lat-built') ? 'v' : 'h')).join('');
  assert.deepEqual([1, 2, 3].map((i) => built(secs[i])), ['vhh', 'vvh', 'vvv']);
  const lit = (s) => [...s.querySelectorAll('p')].map((p) => (p.classList.contains('lat-focus') ? 'F' : p.classList.contains('lat-recede') ? 'r' : '.')).join('');
  assert.deepEqual([4, 5].map((i) => lit(secs[i])), ['Fr', 'rF']);
  assert.deepEqual([4, 5].map((i) => secs[i].getAttribute('data-step-at')), ['1', '2']);
});

test('a deck with no stepping slide is left alone, and the counts say so', async () => {
  const { expandStepPages, applyStepAt } = await load();
  const html = '<section data-lattice-slide="1"><h1>A</h1></section><section data-lattice-slide="2"><h1>B</h1></section>';
  const root = domOf(html);
  assert.deepEqual(expandStepPages(root, applyStepAt), [1, 1]);
  assert.equal(root.innerHTML, html);
  assert.equal(expandStepPagesHtml(html), html);
});

test('the string twin expands the same slides by the same amount, and keeps the head', async () => {
  const head = '<!doctype html><html><head><title>t</title></head><body><div class="lattice">';
  const out = expandStepPagesHtml(`${head}${DECK}</div></body></html>`);
  assert.ok(out.startsWith(head));
  const doc = new JSDOM(out).window.document;
  const secs = [...doc.querySelectorAll('.lattice > section')];
  assert.deepEqual(secs.map((s) => s.getAttribute('data-lattice-slide')), ['1', '2', '2', '2', '3', '3', '4', '5']);
  assert.deepEqual(secs.map((s) => s.getAttribute('data-step-page')), [null, '1', '2', '3', '1', '2', null, null]);
});
