/**
 * A plugin's list item must not leave its box (the red team on the slide-text address gate, 2026-11-09).
 *
 * An `<li>` start tag closes the nearest open `<li>`, walking up past a `<div>`. A fence the author wrote inside a bullet
 * is drawn into `<li>…<div data-lattice-plugin>…</div></li>`, so a bare `<li>` in the plugin's output closed the AUTHOR's
 * item, popped the plugin root with it, and landed as an ordinary bullet of the author's list. There, every mask and
 * `closest('[data-lattice-plugin]')` saw author text, and the runtime's `qr` pass encoded the plugin's URL.
 * `doorFinishFence` (both doors) refuses an `<li>` outside `ul`/`ol`/`menu` and a `<dd>`/`<dt>` outside `dl`.
 * The parse arms below run parse5 (jsdom), a spec-conformant HTML parser, so they show the mechanism, not a model of it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const doc = new JSDOM('').window.document;
const pass = (s) => s; // the sanitizer is not under test: the refusal runs on what it returns
// A plain marker, not a URL: the test is about WHERE the parser puts the plugin's item, and a URL here read to CodeQL as
// substring sanitization (alerts 536-538 on #3110).
const ITEM = 'PLUGIN-ITEM-MARKER';
/** Where a fence in a bullet lands, parsed as a browser parses a page. */
const landed = (output) => new JSDOM(`<section><ul><li><p>Our plan:</p><div data-lattice-plugin="gp">${output}</div></li></ul></section>`).window.document;

test('the mechanism: an orphan <li> leaves the plugin root; one inside its own list stays', () => {
  const out = landed(`<span>chart</span><li>${ITEM}</li>`);
  assert.equal(out.querySelector('[data-lattice-plugin]').textContent.includes(ITEM), false, 'it left the root');
  assert.ok([...out.querySelectorAll('section > ul > li')].some((li) => li.textContent === ITEM), 'and became the author\'s bullet');
  const kept = landed(`<ul><li>${ITEM}</li></ul>`);
  assert.ok(kept.querySelector('[data-lattice-plugin]').textContent.includes(ITEM));
  const dl = new JSDOM(`<section><dl><dt>a</dt><dd><div data-lattice-plugin="gp"><dd>${ITEM}</dd></div></dd></dl></section>`).window.document;
  assert.equal(dl.querySelector('[data-lattice-plugin]').textContent.includes(ITEM), false, 'a <dd> leaves the same way');
});

test('doorFinishFence refuses an orphan <li>, <dd> or <dt>, at any depth outside its own list', async () => {
  const { doorFinishFence } = await import('../../../lib/core/door-attr.mjs');
  for (const html of [`<li>${ITEM}</li>`, `<span>x</span><li>${ITEM}</li>`, `<div><li>${ITEM}</li></div>`, `<dd>${ITEM}</dd>`, `<p><dt>x</dt></p>`, `<ul><li><div><dd>x</dd></div></li></ul>`]) {
    const out = doorFinishFence(doc, pass, html, 'p');
    assert.ok('error' in out, `${html}: refused`);
    assert.match(out.error, /outside its own list, which the page would move out of the plugin's box/);
  }
});

test('a list item inside its own list is kept: <ul>, <ol>, <menu>, and <dl> with or without a <div> group', async () => {
  const { doorFinishFence } = await import('../../../lib/core/door-attr.mjs');
  for (const html of ['<ul><li>a</li></ul>', '<ol><li>a<ul><li>b</li></ul></li></ol>', '<menu><li>a</li></menu>', '<dl><dt>a</dt><dd>b</dd></dl>', '<dl><div><dt>a</dt><dd>b</dd></div></dl>']) {
    assert.deepEqual(doorFinishFence(doc, pass, html, 'p'), { html }, html);
  }
});
