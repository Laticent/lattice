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
const { virtualClock } = require('../../helpers/runtime-boot');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');
const skip = !fs.existsSync(RUNTIME) && 'dist/ not built';

// The runtime boots on DOMContentLoaded and draws the buttons inside that boot. The window's timers and animation
// frames are a virtual clock (test/helpers/runtime-boot.js), so the count is read once the runtime's own queue has run
// dry: every timer it armed (the 150 ms and 800 ms ones included) has fired. A frame that should get none has still
// booted, so a 0 means the runtime ran and drew nothing, not that it had not run yet (HARD RULE #32: a signal, where
// this file used to poll on the real clock under a deadline).

// AN ERROR THAT ESCAPES A TEST. The merge-queue failure printed only the file's `'test failed'`, which
// the dot reporter shows for an uncaught exception or an unhandled rejection outside any test, never
// for a failed assertion (that prints its diff). So every error from outside a test, and every error
// jsdom reports from inside the window, is kept here, and the last test prints them.
const escaped = [];
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => escaped.push(`${ev}: ${e?.stack || e}`));
}

// THE CAUSE of that merge-queue failure. `w.close()` empties the document, the runtime's MutationObserver
// sees that and asks for animation frames on the closed window, and `pretendToBeVisual` ran frames from
// a plain Node `setInterval` that the close does not clear (jsdom 29). The frame then ran on a torn-down
// window and jsdom's own error report threw `Cannot read properties of null (reading '_location')` in
// Node, outside any test, on whichever runner was slow enough. On the virtual clock no frame or timer of
// the window ever runs on its own: the test fires them, and stops firing them before it closes the
// window, so nothing can run on a torn-down one. A browser does not empty a closed frame's document, so
// this was the harness's teardown, not the runtime's.

async function buttonsOn(htmlAttrs) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => escaped.push(`jsdomError on <html ${htmlAttrs}>: ${e?.stack || e}`));
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttrs}><body><article class="lattice"><section><pre data-copy class="lat-code"><code class="language-ts">const a = 1;</code></pre></section></article></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole },
  );
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  const clock = virtualClock(w);
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  await clock.settle();
  const count = () => w.document.querySelectorAll('pre[data-copy] .lat-code-copy-btn').length;
  const booted = () => w.document.documentElement.getAttribute('data-lattice-runtime') === 'loaded';
  const state = { buttons: count(), booted: booted(), readyState: w.document.readyState, ranTo: clock.now() };
  w.close();
  return state;
}

async function assertButtons(htmlAttrs, expected) {
  const s = await buttonsOn(htmlAttrs);
  assert.ok(s.booted, `the runtime never booted on <html ${htmlAttrs}>: ${JSON.stringify(s)}`);
  assert.equal(s.buttons, expected, `<html ${htmlAttrs}> drew ${s.buttons} copy buttons, expected ${expected}: ${JSON.stringify(s)}`);
  return s;
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

test('a window closed after the runtime starts observing closes cleanly', { skip }, async () => {
  // Run past the runtime's 150 ms and 800 ms timers, so its observer is live when the window closes.
  const s = await assertButtons('data-lattice-live-media', 2);
  assert.ok(s.ranTo >= 800, `the runtime's timers ran to ${s.ranTo} ms of window time before the close`);
});

test('no error escaped the runtime, before or after its window closed', { skip }, async () => {
  // The closes above queue observer callbacks and promise jobs; one macrotask turn runs every one of them.
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(escaped, [], escaped.join('\n'));
});
