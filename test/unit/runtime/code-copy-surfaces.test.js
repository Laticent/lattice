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

// The runtime boots on DOMContentLoaded and draws the buttons inside that boot. The count waits for the
// boot's own mark (`data-lattice-runtime`) and, when buttons are expected, for them, under a deadline,
// rather than sleeping a fixed time. A frame that should get none still waits for the boot, so a 0 means
// the runtime ran and drew nothing, not that it had not run yet.
const DEADLINE_MS = 5000;

// AN ERROR THAT ESCAPES A TEST. The merge-queue failure printed only the file's `'test failed'`, which
// the dot reporter shows for an uncaught exception or an unhandled rejection outside any test, never
// for a failed assertion (that prints its diff). So every error from outside a test, and every error
// jsdom reports from inside the window, is kept here, and the last test prints them.
const escaped = [];
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => escaped.push(`${ev}: ${e?.stack || e}`));
}

// THE CAUSE of the merge-queue failure. `w.close()` empties the document, the runtime's MutationObserver
// sees that and asks for animation frames on the closed window, and `pretendToBeVisual` runs frames from
// a plain Node `setInterval` that the close does not clear (jsdom 29). The frame then runs on a torn-down
// window and jsdom's own error report throws `Cannot read properties of null (reading '_location')` in
// Node, outside any test. The runtime starts observing from a later timer, so on an idle machine the old
// 50 ms wait closed the window first; on a slow runner it did not. So the window refuses new frames and
// cancels the outstanding ones before it closes. A browser does not empty a closed frame's document,
// so this is the harness's teardown, not the runtime's.
function closeQuietly(w, frames) {
  frames.closing = true;
  for (const h of frames.pending) w.cancelAnimationFrame(h);
  w.close();
}

function trackFrames(w) {
  const frames = { pending: new Set(), closing: false };
  const request = w.requestAnimationFrame.bind(w);
  const cancel = w.cancelAnimationFrame.bind(w);
  w.requestAnimationFrame = (fn) => {
    if (frames.closing) return 0;
    const h = request((t) => {
      frames.pending.delete(h);
      fn(t);
    });
    frames.pending.add(h);
    return h;
  };
  w.cancelAnimationFrame = (h) => {
    frames.pending.delete(h);
    cancel(h);
  };
  return frames;
}

async function buttonsOn(htmlAttrs, expected, holdMs = 0) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => escaped.push(`jsdomError on <html ${htmlAttrs}>: ${e?.stack || e}`));
  const dom = new JSDOM(
    `<!doctype html><html ${htmlAttrs}><body><article class="lattice"><section><pre data-copy class="lat-code"><code class="language-ts">const a = 1;</code></pre></section></article></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole },
  );
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  const frames = trackFrames(w);
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  const count = () => w.document.querySelectorAll('pre[data-copy] .lat-code-copy-btn').length;
  const booted = () => w.document.documentElement.getAttribute('data-lattice-runtime') === 'loaded';
  const start = Date.now();
  while (!(booted() && (expected === 0 || count() >= expected)) && Date.now() - start < DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, 10));
  }
  if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
  const state = { buttons: count(), booted: booted(), readyState: w.document.readyState, waitedMs: Date.now() - start };
  closeQuietly(w, frames);
  return state;
}

async function assertButtons(htmlAttrs, expected, holdMs) {
  const s = await buttonsOn(htmlAttrs, expected, holdMs);
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

test('a window closed after the runtime starts observing closes cleanly', { skip }, async () => {
  // Held open past the runtime's 150 ms and 800 ms timers, so its observer is live when the window
  // closes. Without closeQuietly that throws in Node, and the last test below reports it.
  await assertButtons('data-lattice-live-media', 2, 1000);
});

test('no error escaped the runtime, before or after its window closed', { skip }, async () => {
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(escaped, [], escaped.join('\n'));
});
