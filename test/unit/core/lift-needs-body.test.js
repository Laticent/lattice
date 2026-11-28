// LFM 1.0 §3.1: on a LIFT_NEEDS_BODY layout (lib/core/slot-label-lift.js) the engine sets an item's lead as its
// title only when a body is nested under it. A one-line item keeps the weight its author wrote. Both render paths
// hold it: the engine's markdown-it plugin and the runtime (which a Marp render runs instead).
// Failing arm: drop the `needsBody` check from the plugin (or the runtime's `LIFT_NEEDS_BODY` line) and the
// one-line row is lifted, which the first (or third) test reports. Born from the PR #3554 red team: adding inventory
// to SLOT_LAYOUTS lifted one-line rows into H3 titles.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { render } = require('../../../lib/engine');
const { closeQuietly } = require('../../helpers/jsdom-close');

const DECK = [
  '<!-- @meta{layout=inventory} -->',
  '',
  '## Parts',
  '',
  '- Titled row',
  '  - Its body.',
  '- A plain row with a **key** word and no body.',
  '',
].join('\n');

function items(html) {
  const dom = new JSDOM(html);
  const out = [...dom.window.document.querySelectorAll('section.inventory li')]
    .filter((li) => li.parentElement.parentElement.tagName !== 'LI')
    .map((li) => li.innerHTML.replace(/\s+/g, ' ').trim());
  closeQuietly(dom.window);
  return out;
}

test('the engine lifts an inventory row with a body and leaves a one-line row as written', () => {
  const [titled, plain] = items(render(DECK).html);
  assert.match(titled, /^<strong>Titled row<\/strong>/);
  assert.doesNotMatch(plain, /^<strong>/, plain);
  assert.match(plain, /A plain row with a <strong>key<\/strong> word/);
});

test('a list inside a blockquote in the item is not its body, as the runtime reads it', () => {
  const html = render(['<!-- @meta{layout=inventory} -->', '', '## Parts', '', '- Quoted row', '  > - x', ''].join('\n')).html;
  assert.doesNotMatch(html, /<strong>Quoted row/);
});

test('a layout outside LIFT_NEEDS_BODY still lifts a one-line item', () => {
  const html = render(['<!-- @meta{layout=kpi} -->', '', '## KPIs', '', '- Revenue', ''].join('\n')).html;
  assert.match(html, /<li><strong>Revenue<\/strong>/);
});

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

test('the runtime (Marp path) lifts the row with a body and leaves the one-line row', { skip }, async () => {
  const section = '<section class="inventory"><h2>Parts</h2><ul><li>Titled row<ul><li>Its body.</li></ul></li><li>A plain row.</li></ul></section>';
  const dom = new JSDOM(`<!doctype html><html><body><div class="marpit"><svg data-marpit-svg=""><foreignObject>${section}</foreignObject></svg></div></body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.warn = () => {};
  w.console.log = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  // A signal, not a duration (HARD RULE #32): the runtime's passes run on `load`.
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r, { once: true }));
  await Promise.resolve();
  const lis = [...w.document.querySelectorAll('section.inventory .cell-stage > ul > li')].map((li) => li.innerHTML);
  closeQuietly(w);
  assert.match(lis[0], /^<strong>Titled row<\/strong>/);
  assert.equal(lis[1], 'A plain row.');
});
