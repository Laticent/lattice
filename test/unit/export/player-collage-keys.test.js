// The exported player's collage lightbox, run for real in JSDOM: the inlined script executes, so
// these catch what a source-level check cannot (a handler that fires when it should not).
// `:focus-visible` is not implemented by JSDOM, so "Space reopens a mouse-focused photo" is a
// real-browser check (see the PR evidence); here the guard falls back to allowing the key.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const tile = (a) => `<li class="collage-tile" data-label="${a}"><img src="${PNG}" alt="${a}"></li>`;
const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>D</title></head><body>
<section data-lattice-slide="1" id="1" class="collage"><h1>A</h1><ul class="collage-list" data-collage="packed">${tile('one')}${tile('two')}</ul></section>
<section data-lattice-slide="2" id="2"><h2>B</h2></section>
<section data-lattice-slide="3" id="3"><h2>C</h2></section></body></html>`;

async function player() {
  const { html } = await buildPlayerHtml({ docHtml, source: '---\ntheme: indaco\n---\n\n# A\n', now: 0 });
  const errs = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/',
    beforeParse(w) {
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
      w.onerror = (m) => errs.push(m);
    },
  });
  await new Promise((r) => setTimeout(r, 100));
  const w = dom.window;
  const d = w.document;
  const idx = () => [...d.querySelectorAll('.lp-frame')].findIndex((f) => f.classList.contains('lp-active'));
  const key = (k) => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { w, d, idx, key, errs };
}

test('the player stamps the photo, not the list item, as the button', async () => {
  const { d, errs } = await player();
  assert.deepEqual(errs, []);
  const li = d.querySelector('.collage-tile');
  const img = li.querySelector('img');
  assert.equal(li.getAttribute('tabindex'), null, 'the <li> keeps its list semantics');
  assert.equal(li.getAttribute('role'), null);
  assert.equal(img.getAttribute('tabindex'), '0');
  assert.equal(img.getAttribute('role'), 'button');
  assert.equal(img.getAttribute('aria-label'), 'Enlarge: one');
});

test('a click opens the photo; Home, End and n do not move the deck while it is open', async () => {
  const { w, d, idx, key } = await player();
  const img = d.querySelector('.collage-tile img');
  img.focus();
  img.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  assert.ok(d.querySelector('.collage-lightbox'), 'the lightbox opened');
  const before = idx();
  for (const k of ['End', 'Home', 'n', 'ArrowRight', ' ']) key(k);
  assert.equal(idx(), before, 'the deck did not move');
});

test('a click that ends a drag does not open a photo', async () => {
  const { w, d } = await player();
  const img = d.querySelector('.collage-tile img');
  img.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
  img.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 4 }));
  assert.equal(d.querySelector('.collage-lightbox'), null, 'a 120 px drag is a swipe, not a tap');
});
