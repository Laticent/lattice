/**
 * Integration: the browser runtime's inline-code mirror never re-reads a plugin's drawing.
 *
 * `transformInlinePills` dispatches every `section code`, so a zip plugin that wrote
 * `<code>^{database}</code>` into its figure got a real icon within seconds (shown in the real Studio,
 * engineering/decisions/2026-10-16-media-plugins.md § 4.5). For an icon that is harmless; for a kind that
 * carries an address (`@video{https://attacker…}`) it is the leak. The mirror skips `[data-lattice-plugin]`.
 * Drives the bundled dist/lattice-runtime.js in jsdom, the same surface the front-matter re-fire test uses.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { closeQuietly } = require(path.join(__dirname, '..', '..', 'helpers', 'jsdom-close'));

const RUNTIME_SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'), 'utf8');

test('a pill in the author\'s text draws; the same text inside a plugin figure stays literal code', async () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body><section class="content"><h2>T</h2>'
    + '<p><code>{LIVE}</code></p>'
    + '<div data-lattice-plugin="x"><p><code>{LEAK}</code></p></div></section></body></html>',
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  const { document } = dom.window;
  dom.window.fetch = () => Promise.resolve({ ok: false, text: () => Promise.resolve('') });
  const s = document.createElement('script');
  s.textContent = RUNTIME_SRC;
  document.body.appendChild(s);
  await new Promise((r) => setTimeout(r, 400));
  const outside = document.querySelector('section p:not([data-lattice-plugin] p)');
  assert.equal(outside.querySelector('code'), null, 'control: the author\'s {LIVE} became a pill, so the mirror ran');
  const inside = document.querySelector('[data-lattice-plugin] code');
  assert.ok(inside, 'the plugin\'s span is still literal code');
  assert.equal(inside.textContent, '{LEAK}');
  closeQuietly(dom.window);
});
