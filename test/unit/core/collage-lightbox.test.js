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
  kernel = { keyAction: t.keyAction, swipeAction: t.swipeAction, digitAction: t.digitAction, createWheelGate: t.createWheelGate, createZoomGesture: t.createZoomGesture, zoomStep: t.zoomStep };
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
const scaleOf = (root) => {
  const t = root.querySelector('img').style.transform;
  const m = /scale\(([\d.]+)\)/.exec(t);
  return m ? Number(m[1]) : 1;
};
const pillOf = (root) => root.querySelector('button:last-of-type');

test('zoom: ctrl + wheel (a trackpad pinch) zooms about the cursor and shows the percentage pill', () => {
  const { root, win } = stepper();
  assert.equal(scaleOf(root), 1);
  root.dispatchEvent(new win.WheelEvent('wheel', { deltaY: -400, ctrlKey: true, bubbles: true, cancelable: true }));
  assert.ok(scaleOf(root) > 1.5, `zoomed in: ${scaleOf(root)}`);
  const pill = pillOf(root);
  assert.notEqual(pill.style.display, 'none');
  assert.match(pill.textContent, /^\d+%$/);
  assert.match(pill.getAttribute('aria-label'), /Reset zoom to fit/);
  const plain = new win.WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true });
  const before = scaleOf(root);
  root.dispatchEvent(plain);
  assert.equal(plain.defaultPrevented, true, 'a plain wheel does not scroll what is behind');
  assert.equal(scaleOf(root), before, 'a plain wheel does not zoom');
});

test('zoom: + and - step it, 0 and the pill return to fit, and it never goes past the bounds', () => {
  const { root, key, doc } = stepper();
  key('+');
  key('=');
  assert.ok(scaleOf(root) > 1.5);
  key('-');
  key('-');
  key('-');
  assert.equal(scaleOf(root), 1, 'zoom out stops at fit');
  assert.equal(pillOf(root).style.display, 'none');
  for (let i = 0; i < 30; i++) key('+');
  assert.ok(scaleOf(root) <= 5 + 1e-9, `capped at 500%: ${scaleOf(root)}`);
  key('0');
  assert.equal(scaleOf(root), 1);
  key('+');
  pillOf(root).click();
  assert.equal(scaleOf(root), 1, 'the pill resets');
  assert.ok(doc.querySelector('.collage-lightbox'), 'the pill does not close it');
});

test('zoom: stepping to another photo, and closing, return to fit first', async () => {
  const { root, key, h } = stepper();
  key('+');
  assert.ok(scaleOf(root) > 1);
  key('ArrowRight');
  assert.equal(scaleOf(root), 1, 'a new photo opens at fit');
  key('+');
  h.close();
  assert.equal(scaleOf(root), 1, 'a close starts from fit');
  await new Promise((r) => setTimeout(r, 30));
});

test('zoom: a double click toggles between fit and zoomed', () => {
  const { root, win } = stepper();
  const img = root.querySelector('img');
  img.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  assert.ok(scaleOf(root) > 2);
  img.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  assert.equal(scaleOf(root), 1);
});

test('zoom: a pinch (two fingers apart) zooms and does not step; one finger then pans, not swipes', () => {
  const { root, win, h } = stepper();
  root.dispatchEvent(touch(win, 'touchstart', [[100, 200], [140, 200]]));
  root.dispatchEvent(touch(win, 'touchmove', [[60, 200], [180, 200]]));
  root.dispatchEvent(touch(win, 'touchend', [], [[60, 200], [180, 200]]));
  assert.ok(scaleOf(root) > 1.5, `pinched: ${scaleOf(root)}`);
  assert.equal(h.index(), 0);
  // zoomed in: a one-finger horizontal move pans and must not turn to the next photo
  root.dispatchEvent(touch(win, 'touchstart', [[200, 200]]));
  root.dispatchEvent(touch(win, 'touchmove', [[40, 205]]));
  root.dispatchEvent(touch(win, 'touchend', [], [[40, 205]]));
  assert.equal(h.index(), 0, 'a pan while zoomed is not a swipe');
});


test('zoom has no private copy: the opener carries no pinch or pan math of its own', () => {
  // The gesture machine is `createZoomGesture` in lib/core/present-transport.mjs, handed in as
  // `kernel`. A distance between two fingers (Math.hypot) or a clamp of the scale here would be a second copy.
  const src = open.toString();
  assert.ok(!/Math\.hypot|Math\.exp/.test(src), 'no pinch distance or zoom-rate math in the opener');
  assert.ok(/K\.createZoomGesture/.test(src) && /K\.zoomStep/.test(src), 'it reads both from the kernel');
});

test('zoom: a resize re-clamps the pan, and the pill is a corner control that hands focus back when it hides', () => {
  const { root, win, key, doc } = stepper();
  key('+');
  const pill = root.querySelector('button:last-of-type');
  assert.match(pill.style.cssText, /top:\s*12px/, 'the pill sits in the corner, off the counter');
  pill.focus();
  pill.click();
  assert.equal(doc.activeElement.getAttribute('aria-label'), 'Close photo', 'focus moves to Close before the pill hides');
  key('+');
  win.dispatchEvent(new win.Event('resize'));
  assert.ok(scaleOf(root) > 1, 'a resize leaves the zoom in place');
});

// ── wheel stepping (#2641 P2) and digit jumps (#2635 P3) ───────────────────────────────────────
const wheel = (win, root, init) => {
  const e = new win.WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  root.dispatchEvent(e);
  return e;
};

test('wheel: a decisive plain flick steps, the gate\'s cooldown holds a burst to one step, and it cannot scroll behind', () => {
  const { root, win, h } = stepper();
  const clock = { t: 10000 };
  win.performance.now = () => clock.t;
  const first = wheel(win, root, { deltaY: 120 });
  assert.equal(h.index(), 1, 'a downward flick is next');
  assert.equal(first.defaultPrevented, true);
  wheel(win, root, { deltaY: 120 });
  wheel(win, root, { deltaY: 300 });
  assert.equal(h.index(), 1, 'the rest of the burst, inside the cooldown, does not skip photos');
  clock.t += 500;
  wheel(win, root, { deltaY: -120 });
  assert.equal(h.index(), 0, 'after the cooldown an upward flick is previous');
  clock.t += 500;
  wheel(win, root, { deltaX: 90, deltaY: 5 });
  assert.equal(h.index(), 1, 'a horizontal trackpad flick steps too (dominant axis)');
});

test('wheel: a small scroll does not step, and a line-mode wheel is measured in pixels', () => {
  const { root, win, h } = stepper();
  win.performance.now = () => 20000;
  wheel(win, root, { deltaY: 10 });
  assert.equal(h.index(), 0, 'under the gate threshold is a reflexive scroll, not a flick');
  wheel(win, root, { deltaY: 3, deltaMode: 1 });
  assert.equal(h.index(), 1, 'three lines is 48 px, past the threshold');
});

test('wheel: ctrl or cmd + wheel zooms and never steps, even in a burst', () => {
  const { root, win, h } = stepper();
  win.performance.now = () => 30000;
  wheel(win, root, { deltaY: -400, ctrlKey: true });
  wheel(win, root, { deltaY: 400, metaKey: true });
  wheel(win, root, { deltaY: 400, ctrlKey: true });
  assert.equal(h.index(), 0, 'a trackpad pinch (ctrl + wheel) never steps');
});

test('wheel: a zoomed photo keeps the wheel; without the gate a plain wheel is only blocked', () => {
  const z = stepper();
  z.win.performance.now = () => 40000;
  wheel(z.win, z.root, { deltaY: -400, ctrlKey: true });
  wheel(z.win, z.root, { deltaY: 200 });
  assert.equal(z.h.index(), 0, 'stepping would drop the zoom the reader chose');
  const bare = stepper({ kernel: { keyAction: kernel.keyAction } });
  const e = wheel(bare.win, bare.root, { deltaY: 200 });
  assert.equal(bare.h.index(), 0);
  assert.equal(e.defaultPrevented, true);
});

test('wheel: each open gets its own gate, so one lightbox\'s cooldown never mutes the next', () => {
  const a = stepper();
  a.win.performance.now = () => 50000;
  wheel(a.win, a.root, { deltaY: 200 });
  assert.equal(a.h.index(), 1);
  a.h.closeNow();
  const b = open(a.doc, { items: SET, reducedMotion: true, kernel });
  wheel(a.win, a.doc.querySelector('.collage-lightbox'), { deltaY: 200 });
  assert.equal(b.index(), 1, 'the second lightbox steps at the same instant');
});

test('digits: 1 to 6 jump to that photo, past the set is ignored, and 0 and 7 to 9 are not jumps', () => {
  const { key, h } = stepper();
  key('3');
  assert.equal(h.index(), 2);
  key('1');
  assert.equal(h.index(), 0);
  key('4');
  assert.equal(h.index(), 3);
  key('5');
  key('6');
  assert.equal(h.index(), 3, 'a four-photo set ignores 5 and 6 instead of clamping');
  for (const k of ['7', '8', '9']) key(k);
  assert.equal(h.index(), 3);
  key('0');
  assert.equal(h.index(), 3, '0 stays the zoom reset');
});

test('digits: a modified digit is the browser\'s, and a single photo or no kernel ignores them', () => {
  const { key, h } = stepper();
  key('3', { ctrlKey: true });
  key('3', { metaKey: true });
  key('3', { altKey: true });
  assert.equal(h.index(), 0, 'Ctrl/Cmd/Alt + digit switches tabs, not photos');
  const bare = stepper({ kernel: { keyAction: kernel.keyAction } });
  bare.key('3');
  assert.equal(bare.h.index(), 0, 'without the kernel there is no digit verb');
});

test('digits: no collision with the deck - open swallows them, closed leaves them to the deck', async () => {
  const { doc, win } = page();
  const seen = [];
  win.addEventListener('keydown', (e) => seen.push(e.key));
  const h = open(doc, { items: SET, reducedMotion: true, kernel });
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
  assert.deepEqual(seen, [], 'while open the deck never hears the digit');
  assert.equal(h.index(), 1);
  h.closeNow();
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
  assert.deepEqual(seen, ['2'], 'once closed the lightbox is gone and the digit is the deck\'s again');
});

test('the opener reads the digit and wheel rules from the kernel, with no private copy', () => {
  const src = open.toString();
  assert.ok(/K\.digitAction/.test(src) && /K\.createWheelGate/.test(src));
  assert.ok(!/\[1-6\]/.test(src), 'the 1 to 6 range lives in the kernel');
  assert.ok(!/Math\.abs\(e\.delta/.test(src), 'the flick threshold lives in the kernel');
});
