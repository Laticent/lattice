/**
 * Unit: an exported Marp bundle's deck-wide settings reach EVERY slide, live, in the hosts that run
 * none of Lattice's build code (engineering/decisions/2026-11-03-marp-bundle-live-front-matter.md).
 *
 * The defect: a bundle carried its front matter twice — the top, which Marp reads, and a baked copy
 * the runtime read. Editing the top gave the export's answer, and `class:` came out half-applied
 * because Marp lets a slide's `_class` drop it. The bundle now keeps Lattice's keys in ONE settings
 * block under the front matter, which every host renders from the open buffer; the runtime reads it,
 * re-reads it when a host re-renders, and (in VS Code's preview) also follows the top as saved.
 *
 * Drives the BUILT runtime (dist/lattice-runtime.js) in jsdom, as host-swap-layout.test.js does.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { closeQuietly } = require('../../helpers/jsdom-close');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

// A deck the way Marp renders a bundle: the settings block lands inside slide 1, and a slide's own
// `_class` REPLACED any deck class Marp knew about (so Marp stamped nothing on those slides).
const slides = (settings) => [
  `<section class="title">${settings}<h1>T</h1></section>`,
  '<section class="divider"><h1>Part one</h1></section>',
  '<section><h1>Plain</h1><p>p</p></section>',
  '<section class="content"><h1>Own class</h1><p>p</p></section>',
  '<section class="content with-progress"><h1>Opted back in</h1><p>p</p></section>',
  '<section class="divider"><h1>Part two</h1></section>',
  '<section class="content"><h1>Later</h1><p>p</p></section>',
].join('');
// Every settings block also says `progress-rail: on`: seven slides in two sections is below the
// rail's default floor (progress.transform.js `railWanted`), and these tests are about how a deck's
// settings reach the slides, not about the floor. Deck-level, as an author writes it.
const block = (yaml) => `<script type="application/lattice-settings">\nprogress-rail: on\n${yaml}\n</script>`;

async function boot(bodyHtml, { head = '', fetchImpl, url } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${bodyHtml}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, ...(url ? { url } : {}) });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  if (fetchImpl) w.fetch = fetchImpl;
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  await new Promise((r) => setTimeout(r, 120));
  return w;
}

const rails = (w) => [...w.document.querySelectorAll('section')]
  .filter((s) => !s.classList.contains('divider') && !s.classList.contains('title'))
  .map((s) => `${s.querySelector('h1').textContent}:${s.querySelector('.tile-progress') ? 'rail' : '-'}`);

test('a deck class in the settings block reaches every slide, and with-progress overrides it', { skip }, async () => {
  const w = await boot(`<article class="lattice">${slides(block('class: no-progress'))}</article>`);
  assert.equal(w.document.querySelectorAll('script[type="application/lattice-settings"]').length, 0, 'the block is read and removed');
  assert.deepEqual(rails(w), ['Plain:-', 'Own class:-', 'Opted back in:rail', 'Later:-']);
  // The deck's no-progress reaches every slide; the one that says with-progress keeps only that (the
  // settle drops the switch's losing token, so a stylesheet keyed on .no-progress sees the winner).
  for (const s of w.document.querySelectorAll('section')) {
    const back = s.classList.contains('with-progress');
    assert.ok(back ? !s.classList.contains('no-progress') : s.classList.contains('no-progress'), s.className);
  }
  closeQuietly(w);
});

test('a host that re-renders with a CHANGED settings block is followed (Marp for VS Code, on every edit)', { skip }, async () => {
  const w = await boot(`<article class="lattice">${slides(block('class: no-progress'))}</article>`);
  assert.deepEqual(rails(w), ['Plain:-', 'Own class:-', 'Opted back in:rail', 'Later:-']);
  // The author deletes the line; the host writes the whole deck again.
  w.document.querySelector('.lattice').innerHTML = slides(block('split: rule'));
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(rails(w), ['Plain:rail', 'Own class:rail', 'Opted back in:rail', 'Later:rail']);
  closeQuietly(w);
});

test('VS Code preview: a class typed at the TOP lands once saved, and leaves again once saved', { skip }, async () => {
  let saved = '---\nmarp: true\ntheme: indaco\nprogress-rail: on\nclass: no-progress\n---\n# T\n';
  const fetchImpl = async () => ({ ok: true, text: async () => saved });
  // The two things VS Code's Markdown preview writes that the runtime keys on.
  const head = '<base href="https://file+.vscode-resource.vscode-cdn.net/ws/deck.md">'
    + '<meta id="vscode-markdown-preview-data" data-settings="{}">';
  const w = await boot(`<article class="lattice">${slides(block('split: rule'))}</article>`, { head, fetchImpl });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(rails(w), ['Plain:-', 'Own class:-', 'Opted back in:rail', 'Later:-'],
    'the saved top class reaches the slides Marp\'s `_class` rule would have skipped');
  // Saved WITHOUT the line. VS Code does not re-render on a save, so the watcher has to see it.
  saved = '---\nmarp: true\ntheme: indaco\nprogress-rail: on\n---\n# T\n';
  await new Promise((r) => setTimeout(r, 1400));
  assert.deepEqual(rails(w), ['Plain:rail', 'Own class:rail', 'Opted back in:rail', 'Later:rail']);
  // Only the runtime's OWN token is taken back: the slide's class list is otherwise intact.
  assert.ok(w.document.querySelectorAll('section')[3].classList.contains('content'));
  closeQuietly(w);
});

// A host may patch a slide IN PLACE (VS Code's preview diffs the new HTML onto the old elements), so
// the same <section> can carry a deck token the runtime stamped and, after the author's edit, the same
// token as the slide's own `_class`. The runtime must then never take the author's token back.
// (Found by the maker-checker pass: the provenance records outlived the patch.)
test('VS Code preview: a token the slide wrote itself survives the deck dropping the same token', { skip }, async () => {
  let saved = '---\nmarp: true\nprogress-rail: on\nclass: no-progress\n---\n# T\n';
  const fetchImpl = async () => ({ ok: true, text: async () => saved });
  const head = '<base href="https://file+.vscode-resource.vscode-cdn.net/ws/deck.md">'
    + '<meta id="vscode-markdown-preview-data" data-settings="{}">';
  const w = await boot(`<article class="lattice">${slides(block('split: rule'))}</article>`, { head, fetchImpl });
  await new Promise((r) => setTimeout(r, 300));
  const plain = w.document.querySelectorAll('section')[2];
  assert.ok(plain.classList.contains('no-progress'), 'the deck stamped it');
  // The author adds `<!-- _class: no-progress -->` to this slide; the host patches the element in
  // place — morphdom sets its attributes to the new HTML's, which carry only the author's class — and
  // writes a fresh settings block.
  for (const a of [...plain.attributes]) plain.removeAttribute(a.name);
  plain.setAttribute('class', 'no-progress');
  w.document.querySelector('section').insertAdjacentHTML('afterbegin', block('split: rule'));
  await new Promise((r) => setTimeout(r, 500));
  // Then removes `class:` from the top and saves.
  saved = '---\nmarp: true\nprogress-rail: on\n---\n# T\n';
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(plain.classList.contains('no-progress'), 'the slide\'s own token is kept');
  assert.equal(plain.querySelector('.tile-progress'), null, 'and the slide still opts out of the rail');
  assert.ok(w.document.querySelectorAll('section')[3].querySelector('.tile-progress'), 'while a slide that relied on the deck gets it back');
  closeQuietly(w);
});

test('in a Marp render the page number follows the switch: Marp\'s own attribute, on every layer', { skip }, async () => {
  // Marp's CSS pipeline comments out `content` on `section…::after`, so no stylesheet can hide its page number;
  // the runtime writes the attribute Marp draws from instead (lib/runtime/index.js syncMarpPagination).
  const svg = (inner) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">${inner}</foreignObject></svg>`;
  const body = `<div class="marpit">${[
    svg(`<section class="title" data-marpit-pagination="1">${block('class: no-pagination')}<h1>T</h1></section>`),
    svg('<section class="content" data-marpit-pagination="2" data-marpit-pagination-total="4"><h1>Deck off</h1></section>'),
    // A slide whose `with-pagination` was typed after the export: Marp numbered nothing here.
    svg('<section class="content with-pagination"><h1>Back on</h1></section>'
      + '<section class="content with-pagination" data-marpit-advanced-background="pseudo"></section>'),
    svg('<section class="content silent with-pagination"><h1>Silent keep</h1></section>'),
  ].join('')}</div>`;
  const w = await boot(body);
  const num = (i) => [...w.document.querySelectorAll('svg[data-marpit-svg]')[i].querySelectorAll('section')]
    .map((s) => s.getAttribute('data-marpit-pagination'));
  assert.deepEqual(num(1), [null], 'the deck no-pagination removes Marp\'s number');
  assert.deepEqual(num(2), ['3', '3'], 'with-pagination writes it, on every layer, numbered as Marp counts');
  assert.deepEqual(num(3), ['4'], 'with-pagination beats silent');
  closeQuietly(w);
});

test('in a Marp render the heading period follows the switch, from the engine\'s own rule', { skip }, async () => {
  const svg = (inner) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">${inner}</foreignObject></svg>`;
  const body = `<div class="marpit">${[
    svg(`<section class="title">${block('class: no-period')}<h1>Title.</h1></section>`),
    svg('<section class="content"><h1>Stripped.</h1><h2>Sub <em>head.</em></h2></section>'),
    svg('<section class="content with-period"><h1>Added</h1><h2>Asked?</h2><h3>Ends <code>x</code></h3></section>'),
  ].join('')}</div>`;
  const w = await boot(body);
  const heads = (i) => [...w.document.querySelectorAll('svg[data-marpit-svg]')[i].querySelectorAll('h1, h2, h3')].map((h) => h.textContent);
  assert.deepEqual(heads(1), ['Stripped', 'Sub head'], 'the deck no-period strips, inside inline markup too');
  // A heading that ends in code gets no period (the engine's rule; it used to land as `Ends .x`).
  assert.deepEqual(heads(2), ['Added.', 'Asked?', 'Ends x'], 'with-period beats the deck');
  closeQuietly(w);
});

test('in a Marp render, a pagination switch REMOVED after export brings the number back (red team)', { skip }, async () => {
  // The export baked `_paginate: false` for the deck's `no-pagination`; the recipient then deleted it from the
  // block. With the deck's `paginate:` visible (the top front matter, as marp-cli writes it), the runtime decides
  // every slide by the engine's rule, so the baked "off" no longer holds the number back.
  const { frontMatterBlock } = require('../../../lib/core/deck-front-matter');
  const top = frontMatterBlock('---\nmarp: true\npaginate: true\n---\n');
  const svg = (inner) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">${inner}</foreignObject></svg>`;
  const body = `<div class="marpit">${[
    svg(`<section class="title">${block('class: lead')}<h1>T</h1></section>`),
    svg('<section class="content"><h1>Was off</h1></section>'),
    svg('<section class="content"><h1>Also off</h1></section>'),
  ].join('')}</div>${top}`;
  const w = await boot(body);
  const num = (i) => w.document.querySelectorAll('svg[data-marpit-svg]')[i].querySelector('section').getAttribute('data-marpit-pagination');
  assert.equal(num(0), null, 'a title slide shows none, as the engine decides');
  assert.equal(num(1), '2');
  assert.equal(num(2), '3');
  closeQuietly(w);
});

test('an author\'s settings block on a later slide is not the deck\'s in a Marp render (red team)', { skip }, async () => {
  const svg = (inner) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">${inner}</foreignObject></svg>`;
  const body = `<div class="marpit">${[
    svg('<section class="content"><h1>One</h1></section>'),
    svg(`<section class="content">${block('class: silent')}<h1>Two</h1></section>`),
  ].join('')}</div>`;
  const w = await boot(body);
  for (const s of w.document.querySelectorAll('section')) assert.ok(!s.classList.contains('silent'), s.className);
  closeQuietly(w);
});

test('in the VS Code preview the deck\'s paginate: comes from the SAVED file, so slides get their numbers (pins 5f14f15)', { skip }, async () => {
  // Marp for VS Code hides the top front matter; the runtime fetches the saved deck (the preview's base URL)
  // and must keep its `paginate:` as the synchronous answer `syncMarpPagination` reads. Without that, a slide
  // whose switch was removed after export kept the export's baked "off" (found by re-driving real VS Code).
  const saved = '---\nmarp: true\npaginate: true\n---\n<script type="application/lattice-settings">\nclass: lead\n</script>\n\n# T\n';
  const svg = (inner) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">${inner}</foreignObject></svg>`;
  // The preview's marker as VS Code writes it: a <meta> in <head> (measured, VS Code 1.145.2), the only form the runtime reads.
  const head = '<meta id="vscode-markdown-preview-data" data-settings="{}">';
  const body = `<div class="marpit">${[
    svg(`<section class="title">${block('class: lead')}<h1>T</h1></section>`),
    svg('<section class="content"><h1>Was off</h1></section>'),
  ].join('')}</div>`;
  const fetchImpl = () => Promise.resolve({ ok: true, text: () => Promise.resolve(saved) });
  const w = await boot(body, { head, fetchImpl, url: 'file:///work/deck.md' });
  await new Promise((r) => setTimeout(r, 200));
  const num = (i) => w.document.querySelectorAll('svg[data-marpit-svg]')[i].querySelector('section').getAttribute('data-marpit-pagination');
  assert.equal(num(1), '2', 'the content slide is numbered from the saved file\'s paginate: true');
  assert.equal(num(0), null, 'the title slide stays unnumbered');
  closeQuietly(w);
});
