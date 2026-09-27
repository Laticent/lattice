/**
 * A host swap gets its layout in the same task as the write.
 *
 * The Studio preview and the Playground filmstrip write engine HTML into a live frame and
 * stamp `data-lattice-swap` on `.lattice` first. The runtime's content transforms are what
 * place that HTML's text (the Form stamp, masthead-lift's cells, the `image` text column).
 * When they ran only on the runtime's 150ms debounce, every slide change painted the raw slide
 * and then moved its heading into place: in WebKit at iPhone size, an `image` slide's heading
 * sat at x=102 width 563 on the first frame and at x=205 width 294 about 110ms later.
 *
 * So the observer runs the transforms in its microtask for a stamped write, before the frame
 * paints. An unstamped write (the runtime's own, or a host that does not stamp) keeps the
 * debounce, which is the control arm below.
 *
 * Loads the BUILT bundle (`npm run build` regenerates dist/), the same file a frame loads.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RUNTIME = path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js');

async function bootFrame() {
  const dom = new JSDOM(
    '<!doctype html><html><body><article class="lattice"><section class="image"><h2>A</h2><p>a</p></section></article></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const w = dom.window;
  w.console.log = () => {};
  w.console.warn = () => {};
  w.eval(fs.readFileSync(RUNTIME, 'utf8'));
  await new Promise((r) => setTimeout(r, 50));
  return w;
}

// The next frame paints after the microtasks the write queued, so this is what it sees.
const afterMicrotasks = async () => { await Promise.resolve(); await Promise.resolve(); };

test('a stamped host swap is laid out before the next frame', { skip: !fs.existsSync(RUNTIME) && 'dist/ not built' }, async () => {
  const w = await bootFrame();
  const lat = w.document.querySelector('.lattice');
  lat.setAttribute('data-lattice-swap', 'reflow');
  lat.innerHTML = '<section class="image"><h2>B</h2><p>b</p></section>';
  await afterMicrotasks();
  const s = lat.querySelector('section');
  assert.ok(s.hasAttribute('data-lattice-slide'), 'the Form stamp landed in the microtask');
  assert.ok(s.querySelector(':scope > .image-text > h2'), 'the heading is in its text column before paint');
  w.close();
});

test('an unstamped write keeps the debounced schedule', { skip: !fs.existsSync(RUNTIME) && 'dist/ not built' }, async () => {
  const w = await bootFrame();
  const lat = w.document.querySelector('.lattice');
  lat.innerHTML = '<section class="image"><h2>B</h2><p>b</p></section>';
  await afterMicrotasks();
  const s = lat.querySelector('section');
  assert.ok(!s.hasAttribute('data-lattice-slide'), 'no transform ran in the microtask');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(s.hasAttribute('data-lattice-slide'), 'the debounced pass still lays it out');
  w.close();
});
