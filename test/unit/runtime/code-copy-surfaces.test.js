/**
 * The runtime draws a code block's copy buttons only on a surface a person reads, at reading size.
 *
 * `data-lattice-live-media` says a person reads the frame (the Studio preview, the Playground,
 * Present); a capture frame and a print document are built without it. A thumbnail
 * (`data-lattice-thumbnail`, every tile in the Studio's preview pool) and a catalog specimen
 * (`data-lattice-specimen`) are read-only miniatures: two buttons there are unreadable, untappable
 * chrome. lib/core/code-copy.mjs; engineering/decisions/2026-10-15-code-plugin.md.
 *
 * Loads the BUILT bundle (`npm run build` regenerates dist/), the same file a frame loads.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

async function buttonsOn(htmlAttrs) {
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttrs}><body><article class="lattice"><section><pre data-copy class="lat-code"><code class="language-ts">const a = 1;</code></pre></section></article></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  await new Promise((r) => setTimeout(r, 50));
  const n = w.document.querySelectorAll('pre[data-copy] .lat-code-copy-btn').length;
  w.close();
  return n;
}

test('a frame a person reads gets the two buttons', { skip }, async () => {
  assert.equal(await buttonsOn('data-lattice-live-media'), 2);
});

test('a capture or print document gets none', { skip }, async () => {
  assert.equal(await buttonsOn(''), 0);
});

test('a thumbnail of the author\'s own slide gets none', { skip }, async () => {
  assert.equal(await buttonsOn('data-lattice-live-media data-lattice-thumbnail'), 0);
});

test('a catalog specimen gets none', { skip }, async () => {
  assert.equal(await buttonsOn('data-lattice-live-media data-lattice-specimen'), 0);
});
