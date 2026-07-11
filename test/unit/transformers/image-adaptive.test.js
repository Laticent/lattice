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
