// The collage lightbox core: DOM only, so JSDOM exercises the parts that do not need layout —
// the source allowlist, caption safety, the close paths, scroll lock and focus return. The glide
// math needs real rects and is driven in a real browser (see the PR's evidence section).
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let open;
test.before(async () => {
  ({ openCollageLightbox: open } = await import('../../../lib/core/collage-lightbox.mjs'));
});

function page() {
  const dom = new JSDOM('<!doctype html><body><button id="t">tile</button></body>', { pretendToBeVisual: true });
  const doc = dom.window.document;
  return { dom, doc, win: dom.window };
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('refuses a source outside the allowlist', () => {
  const { doc } = page();
  for (const src of ['javascript:alert(1)', 'data:text/html,<b>', 'file:///etc/passwd', '//evil.test/a.png', '', 'vbscript:x']) {
    assert.equal(open(doc, { src, reducedMotion: true }), null, src);
  }
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('accepts http, https, blob and data:image sources', () => {
  for (const src of ['http://a.test/x.jpg', 'https://a.test/x.jpg', 'blob:https://a.test/1', PNG]) {
    const { doc } = page();
    const h = open(doc, { src, reducedMotion: true });
    assert.ok(h, src);
    assert.equal(doc.querySelector('.collage-lightbox img').getAttribute('src'), src);
  }
});

test('the caption is text, never markup', () => {
  const { doc } = page();
  const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
  open(doc, { src: PNG, alt: hostile, reducedMotion: true });
  const p = doc.querySelector('.collage-lightbox p');
  assert.equal(p.textContent, hostile);
  assert.equal(p.children.length, 0);
  assert.equal(doc.querySelectorAll('.collage-lightbox img').length, 1, 'only the photo itself');
  assert.equal(doc.querySelectorAll('script').length, 0);
});

test('Escape closes it, returns focus and restores scroll', async () => {
  const { doc, win } = page();
  doc.getElementById('t').focus();
  doc.documentElement.style.overflow = 'auto';
  let closed = 0;
  open(doc, { src: PNG, alt: 'x', reducedMotion: true, onClose: () => closed++ });
  assert.equal(doc.documentElement.style.overflow, 'hidden');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector('.collage-lightbox'), null);
  assert.equal(doc.documentElement.style.overflow, 'auto');
  assert.equal(doc.activeElement.id, 't');
  assert.equal(closed, 1, 'onClose fires once');
});

test('the close button closes it; a click on the photo does not', async () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  doc.querySelector('.collage-lightbox img').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelector('.collage-lightbox'), 'photo click leaves it open');
  doc.querySelector('.collage-lightbox button').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('a backdrop click inside the first 400 ms is the opening gesture\'s ghost click and is ignored', () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  doc.querySelector('.collage-lightbox').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelector('.collage-lightbox'));
});

test('while open it consumes Space and arrows so the deck behind does not advance', () => {
  const { doc, win } = page();
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  for (const key of [' ', 'ArrowRight', 'ArrowLeft', 'PageDown']) {
    const e = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    doc.dispatchEvent(e);
    assert.equal(e.defaultPrevented, true, key);
  }
});

test('while open NO key reaches the deck behind it (Home, End, n, digits)', () => {
  const { doc, win } = page();
  const seen = [];
  win.addEventListener('keydown', (e) => seen.push(e.key));
  open(doc, { src: PNG, alt: 'x', reducedMotion: true });
  for (const key of ['Home', 'End', 'n', 'N', '3', 'f', ' ', 'ArrowRight']) {
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  assert.deepEqual(seen, [], 'a window-level listener (the deck transport) saw nothing');
});

test('closeNow tears down at once and restores scroll, so a second open cannot stack locks', () => {
  const { doc } = page();
  doc.documentElement.style.overflow = 'auto';
  const a = open(doc, { src: PNG, alt: 'a', reducedMotion: true });
  a.closeNow();
  assert.equal(doc.querySelector('.collage-lightbox'), null);
  assert.equal(doc.documentElement.style.overflow, 'auto');
  const b = open(doc, { src: PNG, alt: 'b', reducedMotion: true });
  b.closeNow();
  assert.equal(doc.documentElement.style.overflow, 'auto', 'the page is scrollable again');
});

test('closing twice is safe and onClose still fires once', async () => {
  const { doc } = page();
  let closed = 0;
  const h = open(doc, { src: PNG, reducedMotion: true, onClose: () => closed++ });
  h.close();
  h.close();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(closed, 1);
  assert.equal(doc.querySelector('.collage-lightbox'), null);
});

test('the core closes over nothing at module scope, so .toString() inlining holds', async () => {
  const src = open.toString();
  // Re-create the function from its own source in a bare scope: any module-level reference throws.
  const rebuilt = new Function(`return (${src})`)();
  const { doc } = page();
  assert.ok(rebuilt(doc, { src: PNG, reducedMotion: true }));
});

// ── tap versus drag (lib/core/collage-tap.mjs, shared by the Studio and the exported player) ──
test('collageDragged: travel past 8 px (|dx| + |dy|) is a drag; less, or no press, is a tap', async () => {
  const { collageDragged, COLLAGE_TAP_SLOP } = await import('../../../lib/core/collage-tap.mjs');
  assert.equal(COLLAGE_TAP_SLOP, 8);
  const down = { x: 100, y: 100 };
  assert.equal(collageDragged(down, 100, 100), false, 'a still click is a tap');
  assert.equal(collageDragged(down, 104, 104), false, 'exactly 8 px is a tap');
  assert.equal(collageDragged(down, 105, 104), true, '9 px is a drag');
  assert.equal(collageDragged(down, 40, 100), true, 'a drag to the left');
  assert.equal(collageDragged(down, 100, 160), true, 'a drag downward');
  assert.equal(collageDragged(null, 500, 500), false, 'no recorded press: never a drag');
  assert.equal(collageDragged(undefined, 0, 0), false);
});

test('the exported player takes its drag slop from the shared number', async () => {
  const { buildPlayerHtml } = require('../../../lib/export/html-player.js');
  const { COLLAGE_TAP_SLOP } = await import('../../../lib/core/collage-tap.mjs');
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const docHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>D</title></head><body>
<section data-lattice-slide="1" id="1" class="collage"><h1>A</h1><ul class="collage-list" data-collage="packed"><li class="collage-tile"><img src="${png}" alt="x"></li></ul></section></body></html>`;
  const { html } = await buildPlayerHtml({ docHtml, source: '---\ntheme: indaco\n---\n\n# A\n', now: 0 });
  assert.ok(html.includes(`Math.abs(e.clientY-down.y)>${COLLAGE_TAP_SLOP})return;`), 'the player compares against the shared slop');
});

// ── stepping and swipe (#2641 P5) ──────────────────────────────────────────────
// The input RULES live in lib/core/present-transport.mjs and are handed in as `o.kernel`; these tests
// pass the real kernel, so a rule changed there changes what is tested here.
let kernel;
test.before(async () => {
  const t = await import('../../../lib/core/present-transport.mjs');
  kernel = { keyAction: t.keyAction, swipeAction: t.swipeAction, createZoomGesture: t.createZoomGesture, zoomStep: t.zoomStep };
});

const SET = ['https://a.test/1.jpg', 'https://a.test/2.jpg', 'https://a.test/3.jpg', 'https://a.test/4.jpg'].map((src, i) => ({ src, alt: `Photo ${i + 1}` }));
const stepper = (extra = {}) => {
  const p = page();
  const h = open(p.doc, { items: SET, index: 0, reducedMotion: true, kernel, ...extra });
  const root = p.doc.querySelector('.collage-lightbox');
  const key = (k, init = {}) => {
    const e = new p.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    p.doc.dispatchEvent(e);
    return e;
  };
  const shown = () => ({ src: root.querySelector('img').getAttribute('src'), caption: root.querySelector('p').textContent, count: root.querySelectorAll('p')[1].textContent });
  return { ...p, h, root, key, shown };
};

test('stepping: arrows, page keys, Home and End walk the photos in written order and wrap', () => {
  const { key, shown, h } = stepper();
  assert.deepEqual(shown(), { src: SET[0].src, caption: 'Photo 1', count: '1 / 4' });
  key('ArrowRight');
  assert.deepEqual(shown(), { src: SET[1].src, caption: 'Photo 2', count: '2 / 4' });
  key('PageDown');
  assert.equal(h.index(), 2);
  key('ArrowLeft');
  key('PageUp');
  assert.equal(h.index(), 0);
  key('ArrowLeft');
  assert.equal(h.index(), 3, 'previous from the first wraps to the last');
  key('ArrowRight');
  assert.equal(h.index(), 0, 'next from the last wraps to the first');
  key('End');
  assert.equal(h.index(), 3);
  key('Home');
  assert.equal(h.index(), 0);
});

test('stepping: step() ignores a bad number, and a call with no options opens nothing', () => {
  const p = page();
  const h = open(p.doc, { items: SET, reducedMotion: true, kernel });
  h.step(NaN);
  h.step(1.5);
  assert.ok(h.index() >= 0 && h.index() <= 3);
  assert.equal(open(p.doc), null);
});

test('stepping: it opens at the photo that was clicked, and a modified chord does not step', () => {
  const p = page();
  const h = open(p.doc, { items: SET, index: 2, reducedMotion: true, kernel });
  assert.equal(h.index(), 2);
  const e = new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
  p.doc.dispatchEvent(e);
  assert.equal(h.index(), 2, 'Ctrl+Arrow is the browser\'s, not a step');
});

test('stepping: Space and the keys of the deck behind never reach it, and Space does not step', () => {
  const p = page();
  const seen = [];
  p.win.addEventListener('keydown', (e) => seen.push(e.key));
  const h = open(p.doc, { items: SET, index: 0, reducedMotion: true, kernel });
  const press = (k) => p.doc.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  press(' ');
  press('n');
  assert.equal(h.index(), 0, 'Space and n do not step');
  press('ArrowRight');
  press('Home');
  assert.deepEqual(seen, [], 'no key reached the deck behind');
});

test('stepping: the two arrow buttons exist only with more than one photo, and step', () => {
  const one = page();
  open(one.doc, { items: [SET[0]], reducedMotion: true, kernel });
  assert.equal(one.doc.querySelector('[aria-label="Next photo"]'), null);
  assert.equal(one.doc.querySelectorAll('.collage-lightbox p')[1].style.display, 'none', 'no counter for a single photo');
  const { doc, h } = stepper();
  doc.querySelector('[aria-label="Next photo"]').click();
  assert.equal(h.index(), 1);
  doc.querySelector('[aria-label="Previous photo"]').click();
  doc.querySelector('[aria-label="Previous photo"]').click();
  assert.equal(h.index(), 3);
  assert.ok(doc.querySelector('.collage-lightbox'), 'a button click does not close it');
});

test('stepping: a photo with a disallowed source is dropped from the set, not reachable by stepping', () => {
  const p = page();
  const items = [SET[0], { src: 'javascript:alert(1)', alt: 'bad' }, SET[1], { src: 'file:///etc/passwd', alt: 'bad' }, SET[2]];
  const h = open(p.doc, { items, index: 2, reducedMotion: true, kernel });
  assert.equal(h.index(), 1, 'the clicked photo keeps its place among the survivors');
  assert.equal(p.doc.querySelectorAll('.collage-lightbox p')[1].textContent, '2 / 3');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(p.doc.querySelector('.collage-lightbox img').getAttribute('src'));
    p.doc.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  }
  assert.ok(seen.every((s) => /^https:/.test(s)), seen.join(' '));
  assert.equal(open(p.doc, { items: [{ src: 'javascript:x' }], reducedMotion: true, kernel }), null, 'no allowed photo: nothing opens');
});

test('stepping: the caption stays text for every photo it steps to', () => {
  const p = page();
  const hostile = '<img src=x onerror="window.pwned=1">';
  const h = open(p.doc, { items: [SET[0], { src: SET[1].src, alt: hostile }], reducedMotion: true, kernel });
  h.step('next');
  const cap = p.doc.querySelector('.collage-lightbox p');
  assert.equal(cap.textContent, hostile);
  assert.equal(cap.children.length, 0);
  assert.equal(p.doc.querySelectorAll('.collage-lightbox img').length, 1);
});

test('stepping: a close glides back to the tile of the photo it is on', async () => {
  const p = page();
  const asked = [];
  const items = SET.map((s, i) => ({ ...s, getFrom: () => { asked.push(i); return null; } }));
  const h = open(p.doc, { items, index: 0, reducedMotion: true, kernel });
  h.step(2);
  h.close();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(asked, [2]);
});

test('without the kernel the buttons still step, and the keys do not', () => {
  const p = page();
  const h = open(p.doc, { items: SET, reducedMotion: true });
  p.doc.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(h.index(), 0);
  p.doc.querySelector('[aria-label="Next photo"]').click();
  assert.equal(h.index(), 1);
});

test('Tab cycles through the visible controls and never leaves the overlay', () => {
  const { doc, win } = stepper();
  const order = ['Close photo', 'Previous photo', 'Next photo'];
  const tab = (shiftKey) => {
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
    return doc.activeElement.getAttribute('aria-label');
  };
  assert.equal(doc.activeElement.getAttribute('aria-label'), order[0]);
  assert.equal(tab(false), order[1]);
  assert.equal(tab(false), order[2]);
  assert.equal(tab(false), order[0], 'wraps');
  assert.equal(tab(true), order[2], 'Shift+Tab wraps backward');
});

// A touch event JSDOM does not build for us: a plain Event carrying `touches` and `changedTouches`.
function touch(win, type, pts, changed = pts) {
  const e = new win.Event(type, { bubbles: true, cancelable: true });
  const mk = (list) => list.map(([clientX, clientY]) => ({ clientX, clientY, identifier: 0 }));
  Object.defineProperty(e, 'touches', { value: mk(pts) });
  Object.defineProperty(e, 'changedTouches', { value: mk(changed) });
  return e;
}

test('swipe: a decisive horizontal one-finger move steps; a vertical or short one does not', () => {
  const { root, win, h } = stepper();
  const swipe = (from, to) => {
    root.dispatchEvent(touch(win, 'touchstart', [from]));
    root.dispatchEvent(touch(win, 'touchmove', [to]));
    root.dispatchEvent(touch(win, 'touchend', [], [to]));
  };
  swipe([300, 200], [150, 205]); // left: next
  assert.equal(h.index(), 1);
  swipe([150, 200], [300, 204]); // right: prev
  assert.equal(h.index(), 0);
  swipe([200, 100], [205, 300]); // vertical
  swipe([200, 200], [220, 200]); // short
  assert.equal(h.index(), 0);
});

test('swipe: a pinch never steps, even when one finger lifts first', () => {
  const { root, win, h } = stepper();
  root.dispatchEvent(touch(win, 'touchstart', [[100, 200]]));
  root.dispatchEvent(touch(win, 'touchstart', [[100, 200], [200, 200]]));
  root.dispatchEvent(touch(win, 'touchmove', [[40, 200], [260, 200]]));
  root.dispatchEvent(touch(win, 'touchend', [[260, 200]], [[40, 200]]));
  root.dispatchEvent(touch(win, 'touchend', [], [[260, 200]]));
  assert.equal(h.index(), 0, 'a two-finger gesture is a pinch');
});

test('the core still closes over nothing at module scope with the kernel passed in', async () => {
  const rebuilt = new Function(`return (${open.toString()})`)();
  const { doc } = page();
  const h = rebuilt(doc, { items: SET, reducedMotion: true, kernel });
  assert.ok(h);
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.equal(h.index(), 1);
});
