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

// ── The preview reveal waits for the probe (followup 2358-p2) ────────────────
// Until the photo loads its aspect is a guess, so each probe is published as a promise the
// preview's reveal gate (lib/core/preview-font-gate.mjs) waits on; a probe that lands after the
// reveal and changes the composition announces `lattice:layout-late` so the frame fades through.
function fakeView(settled) {
  const events = [];
  return {
    __latticeFontsSettled: settled,
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent(e) { events.push(e.type); },
    events,
  };
}
const rootIn = (sections, view) => ({ querySelectorAll: () => sections, ownerDocument: { defaultView: view } });

test('a probe is published while the first reveal is pending, and settles on load', async () => {
  const prev = global.Image;
  let fire;
  global.Image = class { set src(_v) { fire = () => { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); }; } };
  try {
    const view = fakeView(false);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(view[imageAdaptive.PROBES].length, 1, 'the gate has one probe to wait on');
    let done = false;
    view[imageAdaptive.PROBES][0].then(() => { done = true; });
    await Promise.resolve();
    assert.equal(done, false, 'pending until the photo loads');
    fire();
    await Promise.resolve();
    assert.equal(done, true);
    assert.equal(s._attrs['data-img-bucket'], 'wide');
    assert.deepEqual(view.events, [], 'no late event before the reveal');
  } finally { global.Image = prev; }
});

test('a probe that errors still settles, so the gate is never held by a dead image', async () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { queueMicrotask(() => this.onerror()); } };
  try {
    const view = fakeView(false);
    imageAdaptive.applyToDom(rootIn([makeSection({ bgStyle: "url('gone.png')" })], view));
    await view[imageAdaptive.PROBES][0];
  } finally { global.Image = prev; }
});

test('a probe started BEFORE the reveal that lands after it says layout-late', () => {
  const prev = global.Image;
  let fire;
  global.Image = class { set src(_v) { fire = () => { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); }; } };
  try {
    const view = fakeView(false);
    imageAdaptive.applyToDom(rootIn([makeSection({ bgStyle: "url('venue.png')" })], view));
    view.__latticeFontsSettled = true; // the gate's cap revealed the slide first
    fire();
    assert.deepEqual(view.events, [imageAdaptive.LATE_EVENT]);
  } finally { global.Image = prev; }
});

// A slide patched in after the reveal whose photo the host had not measured (a navigation to it):
// the probe is not published to the gate, but a layout change fades through rather than jumps.
// An EDIT never gets here — the host stamps an edited slide from `__latticeImageBuckets`.
test('a probe started after the reveal is not published, and a change it makes fades through', () => {
  const prev = global.Image;
  global.Image = class { set src(_v) { this.naturalWidth = 1200; this.naturalHeight = 800; this.onload(); } };
  try {
    const view = fakeView(true);
    const s = makeSection({ bgStyle: "url('venue.png')" });
    imageAdaptive.applyToDom(rootIn([s], view));
    assert.equal(view[imageAdaptive.PROBES], undefined, 'nothing reads the list after the reveal');
    assert.equal(s._attrs['data-img-bucket'], 'wide', 'it still resolves the composition');
    assert.deepEqual(view.events, [imageAdaptive.LATE_EVENT]);
    assert.equal(view[imageAdaptive.BUCKETS]['venue.png'], 'wide', 'the host can learn the size');
  } finally { global.Image = prev; }
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
