/**
 * The runtime draws a code block's copy buttons only on a surface a person reads, at reading size.
 *
 * `data-lattice-live-media` says a person reads the frame (the Studio preview, the Playground,
 * Present); a capture frame and a print document are built without it. A chromeless frame
 * (`data-lattice-chromeless`: every tile in the Studio's preview pool, and Present's slide, next-slide
 * tile and audience window) and a catalog specimen (`data-lattice-specimen`) are watched, not read:
 * nobody acts on a copy button there. lib/core/code-copy.mjs; engineering/decisions/2026-10-15-code-plugin.md.
 *
 * Loads the BUILT bundle (`npm run build` regenerates dist/), the same file a frame loads.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

// The runtime boots on DOMContentLoaded, which jsdom fires in a LATER task than the constructor, and it
// draws the buttons inside that boot. So the count waits for the boot's own mark (`data-lattice-runtime`)
// and, when buttons are expected, for them, under a deadline — not a fixed delay a loaded runner can miss
// (a 50 ms sleep failed once in the merge queue for #2786). A frame that should get none still waits for
// the boot, so a 0 means the runtime ran and drew nothing, not that it had not run yet.
const DEADLINE_MS = 5000;

// AN ERROR THAT ESCAPES A TEST. The merge-queue failure printed only the file's `'test failed'`, which
// the dot reporter shows for an uncaught exception or an unhandled rejection outside any test, never
// for a failed assertion (that prints its diff). So every error from outside a test, and every error
// jsdom reports from inside the window, is kept here, and the last test prints them.
const escaped = [];
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => escaped.push(`${ev}: ${e?.stack || e}`));
}

async function buttonsOn(htmlAttrs, expected) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => escaped.push(`jsdomError on <html ${htmlAttrs}>: ${e?.stack || e}`));
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttrs}><body><article class="lattice"><section><pre data-copy class="lat-code"><code class="language-ts">const a = 1;</code></pre></section></article></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole },
  );
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  const count = () => w.document.querySelectorAll('pre[data-copy] .lat-code-copy-btn').length;
  const booted = () => w.document.documentElement.getAttribute('data-lattice-runtime') === 'loaded';
  const start = Date.now();
  while (!(booted() && (expected === 0 || count() >= expected)) && Date.now() - start < DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const state = { buttons: count(), booted: booted(), readyState: w.document.readyState, waitedMs: Date.now() - start };
  w.close();
  return state;
}

async function assertButtons(htmlAttrs, expected) {
  const s = await buttonsOn(htmlAttrs, expected);
  assert.ok(s.booted, `the runtime never booted on <html ${htmlAttrs}> within ${DEADLINE_MS} ms: ${JSON.stringify(s)}`);
  assert.equal(s.buttons, expected, `<html ${htmlAttrs}> drew ${s.buttons} copy buttons, expected ${expected}: ${JSON.stringify(s)}`);
}

test('a frame a person reads gets the two buttons', { skip }, async () => {
  await assertButtons('data-lattice-live-media', 2);
});

test('a capture or print document gets none', { skip }, async () => {
  await assertButtons('', 0);
});

test('a chromeless frame (a tile, or Present) gets none', { skip }, async () => {
  await assertButtons('data-lattice-live-media data-lattice-chromeless', 0);
});

test('a catalog specimen gets none', { skip }, async () => {
  await assertButtons('data-lattice-live-media data-lattice-specimen', 0);
});

test('no error escaped the runtime, before or after its window closed', { skip }, async () => {
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(escaped, [], escaped.join('\n'));
});
