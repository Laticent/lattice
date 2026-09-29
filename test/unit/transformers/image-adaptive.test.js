const { test } = require('node:test');
const assert = require('node:assert/strict');
const imageAdaptive = require('../../../lib/transformers/image-adaptive');

// ── Minimal fake DOM ─────────────────────────────────────────────────────────
// Enough surface for the transformer: getAttribute/setAttribute, className,
// querySelector for the `.lattice-bg` panel, and a root with querySelectorAll.
function makeSection({ className = 'image', orientation, bgStyle } = {}) {
  const attrs = {};
  if (orientation) attrs['data-orientation'] = orientation;
  const bg = bgStyle ? { style: { backgroundImage: bgStyle } } : null;
  return {
    className,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = v; },
    hasAttribute: (k) => k in attrs,
    removeAttribute: (k) => { delete attrs[k]; },
    querySelector: () => bg,
    _attrs: attrs,
  };
}
const rootOf = (sections) => ({ querySelectorAll: () => sections });

test('bgUrl pulls the asset out of the .lattice-bg inline style', () => {
  const s = makeSection({ bgStyle: "url('photo.svg')" });
  assert.equal(imageAdaptive.bgUrl(s), 'photo.svg');
  assert.equal(imageAdaptive.bgUrl(makeSection()), null);
});

test('no asset → Clean floor, stamped synchronously', () => {
  const s = makeSection({ className: 'image' });
  imageAdaptive.applyToDom(rootOf([s]));
  assert.equal(s._attrs['data-img-composition'], 'clean');
});

test('explicit author class wins with no measurement (no asset)', () => {
  const s = makeSection({ className: 'image gallery' });
  imageAdaptive.applyToDom(rootOf([s]));
  assert.equal(s._attrs['data-img-composition'], 'gallery');
});

test('measures the asset and resolves bucket × orientation', () => {
  // Stub the browser Image: setting .src fires onload with a fixed natural size.
  const prev = global.Image;
  global.Image = class { set src(_v) { this.naturalWidth = 800; this.naturalHeight = 1200; this.onload?.(); } };
  try {
    const s = makeSection({ className: 'image', bgStyle: "url('tall.svg')" }); // 0.67 → tall
    imageAdaptive.applyToDom(rootOf([s]));
    assert.equal(s._attrs['data-img-bucket'], 'tall');
    assert.equal(s._attrs['data-img-composition'], 'split'); // tall + landscape → split
  } finally { global.Image = prev; }
});

test('a load error falls to the Clean floor', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.onerror?.(); } };
  try {
    const s = makeSection({ className: 'image', bgStyle: "url('broken.svg')" });
    imageAdaptive.applyToDom(rootOf([s]));
    assert.equal(s._attrs['data-img-composition'], 'clean');
  } finally { global.Image = prev; }
});

test('skips an already-resolved section (idempotent)', () => {
  const s = makeSection();
  s._attrs['data-img-composition'] = 'spotlight';
  imageAdaptive.applyToDom(rootOf([s]));
  assert.equal(s._attrs['data-img-composition'], 'spotlight'); // untouched
});

// ── A late size fades; nothing waits on the probe (followup 2412-p2) ─────────
// The preview reveals on its faces alone. A section being measured holds its own text back, so
// nothing is published for a reveal to wait on; a probe that lands after the reveal and changes
// the composition re-fades that slide's text (`data-img-relayout`), never the whole frame.
// A LIVE PREVIEW is a gated document that opted in as on-screen (`<html data-lattice-live-media>`,
// lib/core/image-painting.js); `optIn: false` is the Studio's export capture frame, which carries the
// gate but must never hold text, paint or re-fade (the checker's reproduction on PR #2471).
function fakeView(settled, { optIn = true } = {}) {
  const events = [];
  return {
    document: { documentElement: { hasAttribute: (k) => optIn && k === 'data-lattice-live-media' } },
    __latticeFontsSettled: settled,
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent(e) { events.push(e.type); },
    events,
  };
}
const rootIn = (sections, view) => ({ querySelectorAll: () => sections, ownerDocument: { defaultView: view } });

test('a probe started before the reveal publishes nothing for a gate to wait on', () => {
  const prev = global.Image;
  let fire;
  global.Image = class { set src(_v) { fire = () => { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); }; } };
  try {
    const view = fakeView(false);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.deepEqual(Object.keys(view).filter((k) => /Probe/i.test(k)), [], 'no probe list on the window');
    fire();
    assert.equal(s._attrs['data-img-bucket'], 'wide');
    assert.deepEqual(view.events, [], 'no late event before the reveal');
  } finally { global.Image = prev; }
});

test('a probe that errors marks the panel unloaded', () => {
  const prev = global.Image;
  let fail;
  global.Image = class { set src(_v) { fail = () => this.onerror(); } };
  try {
    const view = fakeView(false);
    const s = makeSection({ bgStyle: "url('gone.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    fail();
    assert.ok(s.hasAttribute('data-img-unloaded'));
    assert.equal(s._attrs['data-img-composition'], 'clean', 'the floor stays');
  } finally { global.Image = prev; }
});

// A live preview's view: a reveal gate (`__latticeFontsSettled`) and timers the test drives by
// hand. `ticks` counts poll firings, so a test can prove the poll STOPS.
function timedView(settled, opts) {
  const view = fakeView(settled, opts);
  const timers = new Map();
  let id = 0;
  view.ticks = 0;
  view.setTimeout = (fn) => { timers.set(++id, { fn, every: false }); return id; };
  view.setInterval = (fn) => { timers.set(++id, { fn, every: true }); return id; };
  view.clearTimeout = view.clearInterval = (n) => { timers.delete(n); };
  view.tick = (every) => {
    for (const [n, t] of [...timers]) {
      if (t.every !== every) continue;
      if (!every) timers.delete(n); else view.ticks++;
      t.fn();
    }
  };
  view.live = () => timers.size;
  return view;
}
// A probe whose size the test reveals by hand: `header()` is the header arriving mid-download.
function heldImage() {
  const held = {};
  const Image = class {
    constructor() { held.probe = this; this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(_v) {}
  };
  held.header = (w, h) => { held.probe.naturalWidth = w; held.probe.naturalHeight = h; };
  return { Image, held };
}

// THE TEXT WAITS FOR THE PHOTO (the owner's model, #2412). A section being measured carries
// `data-img-pending`, which hides its text (image.styles.css), so a size that lands after the
// reveal moves nothing on screen and needs no fade.
test('a section is pending while its photo is measured, and a landing after the reveal does not fade', () => {
  const prev = global.Image;
  const { Image, held } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(false);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.ok(s.hasAttribute(imageAdaptive.PENDING), 'the text is held while the size is unknown');
    view.__latticeFontsSettled = true; // the gate's cap revealed the slide first
    held.header(1200, 800);
    held.probe.onload();
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false, 'the text shows once the size is in');
    assert.equal(s._attrs['data-img-bucket'], 'wide');
    assert.deepEqual(view.events, [], 'nothing was on screen to move');
    assert.equal(view.live(), 0, 'the poll and the cap are both cleared');
  } finally { global.Image = prev; }
});

// A slide patched in after the reveal whose photo the host had not measured (a navigation to it):
// the host can learn the size for the next visit.
test('a probe started after the reveal resolves the slide, and the host learns the size', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); } };
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(s._attrs['data-img-bucket'], 'wide', 'it still resolves the composition');
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false);
    assert.equal(view[imageAdaptive.BUCKETS]['venue.png'], 'wide', 'the host can learn the size');
  } finally { global.Image = prev; }
});

// The Playground re-creates a section on every keystroke. A cached photo has its size the moment
// `src` is set, so the section is sized in the same task and never shows the placeholder.
test('a photo already in the cache is sized in the same task, with no poll and no cap', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.naturalWidth = 800; this.naturalHeight = 1200; } };
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('cached.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(s._attrs['data-img-bucket'], 'tall');
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false);
    assert.equal(view.live(), 0, 'no timer was armed');
  } finally { global.Image = prev; }
});

test('the size is taken from the image header, before the download finishes, and the poll stops', () => {
  const prev = global.Image;
  const { Image, held } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('tall.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    view.tick(true);
    assert.ok(s.hasAttribute(imageAdaptive.PENDING), 'no header yet');
    held.header(800, 1200); // the header arrived; no onload yet
    view.tick(true);
    assert.equal(s._attrs['data-img-bucket'], 'tall');
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false, 'the text shows on the header');
    const ticks = view.ticks;
    view.tick(true);
    assert.equal(view.ticks, ticks, 'the poll is cleared once the size is in');
    held.probe.onload(); // the full load re-applies nothing
    assert.deepEqual(view.events, []);
  } finally { global.Image = prev; }
});

test('a photo that hangs shows its text at the cap, and a later landing re-fades only the text', () => {
  const prev = global.Image;
  const { Image, held } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('slow.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    view.tick(false); // PENDING_CAP_MS elapsed
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false, 'the text shows on the floor');
    assert.equal(view.live(), 0, 'the cap also stops the poll');
    held.header(1200, 800);
    held.probe.onload();
    assert.ok(s.hasAttribute(imageAdaptive.RELAYOUT), 'the text was on screen, so it hides for the relayout');
    assert.deepEqual(view.events, [], 'and only the text: the frame is not faded through');
    view.tick(false);
    assert.equal(s.hasAttribute(imageAdaptive.RELAYOUT), false, 'then fades back in, in place');
  } finally { global.Image = prev; }
});

test('a probe whose slide was turned away does not fade the slide that replaced it', () => {
  const prev = global.Image;
  const { Image, held } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('slow.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    view.tick(false); // the cap showed its text
    s.isConnected = false; // the reader turned the slide; this section left the document
    held.header(1200, 800);
    held.probe.onload();
    assert.deepEqual(view.events, []);
    assert.equal(s.hasAttribute(imageAdaptive.RELAYOUT), false, 'nothing is re-faded on a slide that left');
    assert.equal(view[imageAdaptive.BUCKETS]['slow.jpg'], 'wide', 'the size is still learned for the next visit');
  } finally { global.Image = prev; }
});

test('a photo that fails shows its hatch and its text at once', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.onerror(); } };
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('gone.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.ok(s.hasAttribute('data-img-unloaded'));
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false);
  } finally { global.Image = prev; }
});

// A download cut off after its header errors. The size read from the header must not be
// remembered, or the next visit is stamped final with an empty panel and no hatch.
test('an error after a header read forgets the size, so the next visit measures again', () => {
  const prev = global.Image;
  const { Image, held } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(true);
    const s = makeSection({ bgStyle: "url('cut.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    held.header(1200, 800);
    view.tick(true);
    held.probe.onerror();
    assert.equal(view[imageAdaptive.BUCKETS]['cut.jpg'], null);
    assert.ok(s.hasAttribute('data-img-unloaded'));
  } finally { global.Image = prev; }
});

// Only a live preview holds text back. A document with no reveal gate (the Studio's export
// capture, a player, the fluid viewer) keeps the Clean floor and its old bytes.
test('a document with no reveal gate never goes pending', () => {
  const prev = global.Image;
  const { Image } = heldImage();
  global.Image = Image;
  try {
    const view = timedView(true);
    delete view.__latticeFontsSettled;
    const s = makeSection({ bgStyle: "url('p.jpg')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false);
    assert.equal(view.live(), 0);
  } finally { global.Image = prev; }
});

// A host stamps pending on a provisional section (lib/core/image-aspect.js). If this pass finds
// no url to measure on the section's own panel, nothing would ever clear it, and its text
// would stay hidden for good.
test('a host pending stamp is cleared on a section this pass does not measure', () => {
  const view = timedView(true);
  const s = makeSection({ bgStyle: 'background-color: red' });
  s.setAttribute('data-img-composition', 'clean');
  s.setAttribute('data-img-provisional', '');
  s.setAttribute(imageAdaptive.PENDING, '');
  imageAdaptive.applyToDom(rootIn([s], view));
  assert.equal(s.hasAttribute(imageAdaptive.PENDING), false);
});

// A host stamps an unmeasured slide PROVISIONAL (the Clean floor, so it never paints
// composition-less); the browser pass still measures it, and a final stamp is left alone.
test('a provisional stamp is measured; a final one is not', () => {
  const prev = global.Image;
  let probes = 0;
  global.Image = class { set src(_v) { probes++; this.naturalWidth = 800; this.naturalHeight = 1200; this.onload(); } };
  try {
    const provisional = makeSection({ bgStyle: "url('t.png')" });
    provisional.setAttribute('data-img-composition', 'clean');
    provisional.setAttribute('data-img-provisional', '');
    const final = makeSection({ bgStyle: "url('w.png')" });
    final.setAttribute('data-img-composition', 'clean');
    final.setAttribute('data-img-bucket', 'wide');
    imageAdaptive.applyToDom(rootOf([provisional, final]));
    assert.equal(probes, 1);
    assert.equal(provisional._attrs['data-img-composition'], 'split');
    assert.equal('data-img-provisional' in provisional._attrs, false);
    assert.equal(final._attrs['data-img-bucket'], 'wide');
  } finally { global.Image = prev; }
});

test('a probe that changes nothing after the reveal stays quiet', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.onload(); } }; // no natural size -> no bucket, still clean
  try {
    const view = fakeView(true);
    imageAdaptive.applyToDom(rootIn([makeSection({ bgStyle: "url('venue.png')" })], view));
    assert.deepEqual(view.events, []);
  } finally { global.Image = prev; }
});

// A photo that will not load (gone, offline, or refused by the preview's policy) marks its section,
// so the panel draws the hatched stand-in instead of an empty box that reads as broken.
test('a photo that fails to load marks the section unloaded; a later load clears it', () => {
  const prev = global.Image;
  try {
    global.Image = class { set src(_v) { this.onerror(); } };
    const s = makeSection({ bgStyle: "url('gone.png')" });
    imageAdaptive.applyToDom(rootOf([s]));
    assert.equal('data-img-unloaded' in s._attrs, true);
    global.Image = class { set src(_v) { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); } };
    s.setAttribute('data-img-provisional', '');
    imageAdaptive.applyToDom(rootOf([s]));
    assert.equal('data-img-unloaded' in s._attrs, false);
    assert.equal(s._attrs['data-img-bucket'], 'wide');
  } finally { global.Image = prev; }
});

// THE PANEL PAINTS UNTIL THE PICTURE DOES (the owner's iPhone, PR #2471): the size frees the text
// long before the photo paints, and the panel showed as an empty card for ~3 s in between. The
// panel carries `data-lattice-painting` (the Underpainting) until the photo has DECODED.
test('the panel paints until the photo decodes, not just until its size is known', async () => {
  const prev = global.Image;
  let decoded;
  const panel = { style: { backgroundImage: "url('venue.png')" }, attrs: new Map() };
  panel.setAttribute = (k, v) => panel.attrs.set(k, v);
  panel.removeAttribute = (k) => panel.attrs.delete(k);
  panel.hasAttribute = (k) => panel.attrs.has(k);
  panel.getAttribute = (k) => (panel.attrs.has(k) ? panel.attrs.get(k) : null);
  global.Image = class {
    constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; }
    set src(_v) {}
    decode() { return new Promise((r) => { decoded = r; }); }
  };
  try {
    const view = timedView(false);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    s.querySelector = () => panel;
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(panel.getAttribute('data-lattice-painting'), '', 'the panel paints while the photo loads');
    decoded();
    await new Promise((r) => setImmediate(r));
    assert.equal(panel.getAttribute('data-lattice-painting'), 'done', 'it fades once the photo has decoded');
  } finally { global.Image = prev; }
});

// A host that already knew the size stamped the section FINAL, so nothing is measured — but the
// panel still paints until the picture decodes, unless it is known not to load.
function paintablePanel(url) {
  const panel = { style: { backgroundImage: `url('${url}')` }, attrs: new Map() };
  panel.setAttribute = (k, v) => panel.attrs.set(k, v);
  panel.removeAttribute = (k) => panel.attrs.delete(k);
  panel.hasAttribute = (k) => panel.attrs.has(k);
  panel.getAttribute = (k) => (panel.attrs.has(k) ? panel.attrs.get(k) : null);
  return panel;
}
const loadingImage = () => class {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  decode() { return new Promise(() => {}); }
};

test('a section a host stamped final still paints until its picture decodes, unless it will not load', () => {
  const prev = global.Image;
  global.Image = loadingImage();
  try {
    const view = timedView(false);
    const s = makeSection({ bgStyle: "url('known.png')" });
    s._attrs['data-img-composition'] = 'clean';
    s._attrs['data-img-bucket'] = 'wide';
    const panel = paintablePanel('known.png');
    s.querySelector = () => panel;
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(panel.getAttribute('data-lattice-painting'), '', 'the panel paints');
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false, 'the size is known, so the text is not held');

    const gone = makeSection({ bgStyle: "url('gone.png')" });
    gone._attrs['data-img-composition'] = 'clean';
    gone._attrs['data-img-unloaded'] = '';
    const gonePanel = paintablePanel('gone.png');
    gone.querySelector = () => gonePanel;
    imageAdaptive.applyToDom(rootIn([gone], view));
    assert.equal(gonePanel.hasAttribute('data-lattice-painting'), false, 'its hatch shows instead');
  } finally { global.Image = prev; }
});

test('the export capture frame (gated, not opted in) never holds text, paints or re-fades', () => {
  const prev = global.Image;
  global.Image = loadingImage();
  try {
    const view = timedView(false, { optIn: false });
    const s = makeSection({ bgStyle: "url('venue.png')" });
    const panel = paintablePanel('venue.png');
    s.querySelector = () => panel;
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(s.hasAttribute(imageAdaptive.PENDING), false, 'no held text in an export');
    assert.equal(panel.hasAttribute('data-lattice-painting'), false, 'no painting in an export');
    assert.equal(view.live(), 0, 'and no poll or cap running');
  } finally { global.Image = prev; }
});
