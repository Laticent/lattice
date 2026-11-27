/**
 * Unit: the live runtime marks a code or math slide `keeps-laptop` as the markdown-it kernel does, and takes the
 * marker back when the deck's venue changes (lib/core/resolve-venue.js `laptopKeepingToken`; owner, 2026-11-16;
 * fit-everywhere-model.md §25).
 *
 * The runtime's deck-class merge is a second copy of the kernel's, for hosts that run none of Lattice's build
 * (a Marp bundle, VS Code's preview). The checker found two gaps: a deck with no settings never reached the merge,
 * and a marker outlived a live `venue: phone` because it was not the runtime's own token. Cases, on the built
 * runtime in jsdom:
 *   NO-SETTINGS  a Marp render with no settings block: the code slide is marked, the prose slide is not
 *   SETTINGS     a settings block with other keys: still marked
 *   (each case also checks a split page whose class names no component, `content compare-code-split`: it is
 *    marked from its authored `data-class`)
 *   LIVE         VS Code saves `venue: phone` at the top: the code slide takes `venue-phone` and loses the
 *                marker; saved without it, the marker comes back
 *
 * FALSIFIABLE: without the runtime's no-settings branch NO-SETTINGS is unmarked; without the merge taking the
 * marker off and deriving it again on every pass, LIVE keeps it beside `venue-phone` (it was stamped before the
 * settings arrived, and read as the slide's own); without `authoredClassOf` the split page is unmarked.
 * Drives the BUILT runtime (dist/lattice-runtime.js), as bundle-settings-live.test.js does.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { closeQuietly } = require('../../helpers/jsdom-close');
const { virtualClock } = require('../../helpers/runtime-boot');
const { skipUnlessCI } = require('../../helpers/chrome');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = skipUnlessCI(!fs.existsSync(RUNTIME), 'dist/ not built');

const slides = (settings = '') => [
  `<section class="title">${settings}<h1>T</h1></section>`,
  '<section class="code" data-class="code"><h1>A listing</h1><pre><code>const a = 1;</code></pre></section>',
  '<section class="content compare-code-split compare-code-block form" data-class="compare-code"><h1>Split page</h1><pre><code>b</code></pre></section>',
  '<section><h1>Plain</h1><p>p</p></section>',
].join('');
const block = (yaml) => `<script type="application/lattice-settings">\n${yaml}\n</script>`;

async function boot(bodyHtml, { head = '', fetchImpl, url } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${bodyHtml}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, ...(url ? { url } : {}) });
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  if (fetchImpl) w.fetch = fetchImpl;
  const clock = virtualClock(w);
  w.clock = clock;
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  if (head.includes('vscode-markdown-preview-data')) await clock.advance(120);
  else await clock.settle();
  return w;
}

const state = (w) => [...w.document.querySelectorAll('section')].slice(1).map((s) => {
  const venue = [...s.classList].filter((c) => c.startsWith('venue-')).join(',') || '-';
  return `${s.querySelector('h1').textContent}:${s.classList.contains('keeps-laptop') ? 'keeps' : '-'}:${venue}`;
});

test('NO-SETTINGS: a Marp render with no settings block marks the code slides and not the prose', { skip }, async () => {
  const w = await boot(`<article class="lattice">${slides()}</article>`);
  assert.deepEqual(state(w), ['A listing:keeps:-', 'Split page:keeps:-', 'Plain:-:-']);
  closeQuietly(w);
});

test('SETTINGS: a settings block with other keys still marks them', { skip }, async () => {
  const w = await boot(`<article class="lattice">${slides(block('lift: on'))}</article>`);
  assert.deepEqual(state(w), ['A listing:keeps:-', 'Split page:keeps:-', 'Plain:-:-']);
  closeQuietly(w);
});

test('LIVE: VS Code saves venue: phone, the marker goes; saved without it, the marker comes back', { skip }, async () => {
  let saved = '---\nmarp: true\ntheme: indaco\nvenue: phone\n---\n# T\n';
  const fetchImpl = async () => ({ ok: true, text: async () => saved });
  const head = '<base href="https://file+.vscode-resource.vscode-cdn.net/ws/deck.md">'
    + '<meta id="vscode-markdown-preview-data" data-settings="{}">';
  const w = await boot(`<article class="lattice">${slides(block('lift: on'))}</article>`, { head, fetchImpl });
  await w.clock.advance(300);
  assert.deepEqual(state(w), ['A listing:-:venue-phone', 'Split page:-:venue-phone', 'Plain:-:venue-phone'],
    'the deck said phone, so no slide keeps laptop');
  saved = '---\nmarp: true\ntheme: indaco\n---\n# T\n';
  await w.clock.advance(1400);
  assert.deepEqual(state(w), ['A listing:keeps:-', 'Split page:keeps:-', 'Plain:-:-'], 'the marker is derived again');
  closeQuietly(w);
});
