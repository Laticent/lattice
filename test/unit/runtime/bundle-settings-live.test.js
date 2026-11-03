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
const block = (yaml) => `<script type="application/lattice-settings">\n${yaml}\n</script>`;

async function boot(bodyHtml, { head = '', fetchImpl } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${bodyHtml}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
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
  for (const s of w.document.querySelectorAll('section')) assert.ok(s.classList.contains('no-progress'), s.className);
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
  let saved = '---\nmarp: true\ntheme: indaco\nclass: no-progress\n---\n# T\n';
  const fetchImpl = async () => ({ ok: true, text: async () => saved });
  // The two things VS Code's Markdown preview writes that the runtime keys on.
  const head = '<base href="https://file+.vscode-resource.vscode-cdn.net/ws/deck.md">'
    + '<meta id="vscode-markdown-preview-data" data-settings="{}">';
  const w = await boot(`<article class="lattice">${slides(block('split: rule'))}</article>`, { head, fetchImpl });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(rails(w), ['Plain:-', 'Own class:-', 'Opted back in:rail', 'Later:-'],
    'the saved top class reaches the slides Marp\'s `_class` rule would have skipped');
  // Saved WITHOUT the line. VS Code does not re-render on a save, so the watcher has to see it.
  saved = '---\nmarp: true\ntheme: indaco\n---\n# T\n';
  await new Promise((r) => setTimeout(r, 1400));
  assert.deepEqual(rails(w), ['Plain:rail', 'Own class:rail', 'Opted back in:rail', 'Later:rail']);
  // Only the runtime's OWN token is taken back: the slide's class list is otherwise intact.
  assert.ok(w.document.querySelectorAll('section')[3].classList.contains('content'));
  closeQuietly(w);
});
