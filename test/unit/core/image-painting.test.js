// The Underpainting's runtime (lib/core/image-painting.js): what a live preview shows where a
// picture has not painted yet. The owner's iPhone (PR #2471) showed ~3 s of an EMPTY panel beside
// finished text, because the size (which frees the text) lands long before the picture paints.

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { paintUntilDecoded, PAINTING, PAINTING_CAP_MS } = require('../../../lib/core/image-painting');

function el() {
  const attrs = new Map();
  return {
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    hasAttribute: (k) => attrs.has(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  };
}
function view() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn, ms) => timers.push({ fn, ms, live: true }),
    clearTimeout: (n) => { if (timers[n - 1]) timers[n - 1].live = false; },
    run(ms) { for (const t of timers) if (t.live && t.ms === ms) { t.live = false; t.fn(); } },
  };
}
function probe({ cached = false, src = 'a.jpg' } = {}) {
  let res;
  let rej;
  const p = { src, complete: cached, naturalWidth: cached ? 1200 : 0, decode: () => new Promise((a, b) => { res = a; rej = b; }) };
  p.land = () => { p.complete = true; p.naturalWidth = 1200; res(); };
  p.fail = () => { p.complete = true; rej(new Error('gone')); };
  return p;
}
const flush = () => new Promise((r) => setImmediate(r));

describe('the Underpainting', () => {
  it('paints until the picture decodes, fades, then hands the element back', async () => {
    const e = el();
    const v = view();
    const p = probe();
    assert.equal(paintUntilDecoded(e, p, v), true);
    assert.equal(e.getAttribute(PAINTING), '', 'painting while the picture is on its way');
    p.land();
    await flush();
    assert.equal(e.getAttribute(PAINTING), 'done', 'the painting fades away over the picture');
    for (const t of v.timers.filter((x) => x.live)) t.fn();
    assert.equal(e.hasAttribute(PAINTING), false);
  });

  it('a picture resumed in a re-created element does not replay the sweep', () => {
    const v = view();
    const first = el();
    paintUntilDecoded(first, probe({ src: 'x.jpg' }), v);
    assert.equal(first.getAttribute(PAINTING), '');
    const again = el();
    paintUntilDecoded(again, probe({ src: 'x.jpg' }), v);
    assert.equal(again.getAttribute(PAINTING), 'again');
  });

  it('a held picture with no intrinsic size (an SVG) is still "held": no painting flash', () => {
    const e = el();
    const p = probe();
    p.complete = true; // naturalWidth stays 0
    assert.equal(paintUntilDecoded(e, p, view()), false);
    assert.equal(e.hasAttribute(PAINTING), false);
  });

  it('a picture already held never shows the painting', () => {
    const e = el();
    assert.equal(paintUntilDecoded(e, probe({ cached: true }), view()), false);
    assert.equal(e.hasAttribute(PAINTING), false);
  });

  it('a picture that fails keeps the painting, muted and still: one placeholder, never the hatch', async () => {
    const e = el();
    const p = probe();
    paintUntilDecoded(e, p, view());
    p.fail();
    await flush();
    assert.equal(e.getAttribute(PAINTING), 'still');
  });

  it('a still painting gives way when the picture is loaded after all', () => {
    const e = el();
    e.setAttribute(PAINTING, 'still');
    assert.equal(paintUntilDecoded(e, probe(), view()), true);
    assert.equal(e.getAttribute(PAINTING), '', 'painting again, animated, while it loads');
  });

  it('recognizes the blocked-web-image hatch, and nothing else, as a picture not coming', () => {
    const { isBlockedHatch } = require('../../../lib/core/image-painting');
    const withBg = (v) => ({ style: { backgroundImage: v } });
    assert.equal(isBlockedHatch(withBg('repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 22%, transparent) 0px, 0px 1px, transparent 1px, transparent 10px)')), true);
    assert.equal(isBlockedHatch(withBg('url("a.jpg")')), false);
    assert.equal(isBlockedHatch(withBg('')), false);
  });

  it('a picture that hangs goes still at the cap, and still gives way if it lands after all', async () => {
    const e = el();
    const v = view();
    const p = probe();
    paintUntilDecoded(e, p, v);
    v.run(PAINTING_CAP_MS);
    assert.equal(e.getAttribute(PAINTING), 'still', 'never an empty card');
    p.land();
    await flush();
    assert.equal(e.getAttribute(PAINTING), 'done', 'the late picture still fades in');
  });

  it('a second pass leaves a painting in flight alone, even mid-fade', async () => {
    const e = el();
    const p = probe();
    paintUntilDecoded(e, p, view());
    p.land();
    await flush();
    assert.equal(e.getAttribute(PAINTING), 'done');
    paintUntilDecoded(e, probe(), view());
    assert.equal(e.getAttribute(PAINTING), 'done', 'not brought back while it fades');
  });
});

// The look is shared (#1): both surfaces that carry a picture as their own background take the
// same attribute, and one stylesheet draws it. Pin that the drawing stays palette-blind and has
// the reduced-motion arm.
describe('the Underpainting stylesheet', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
  const block = css.slice(css.indexOf('THE UNDERPAINTING'), css.indexOf('/* Marp Core converts unicode emoji'));
  it('is drawn from the deck tokens only, with no hex colors', () => {
    assert.ok(block.length > 500, 'the block is there');
    assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b/i);
    assert.match(block, /var\(--accent\)/);
  });
  it('moves its brushwork by position inside the box, and stops for reduced motion', () => {
    assert.match(block, /@keyframes lattice-paint-brush[\s\S]*?mask-position/);
    assert.doesNotMatch(block, /width: 300%/, 'no layer wider than the element: it would trip the overflow probe');
    assert.match(block, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/);
  });
});

// WHO PAINTS is an opt-in on the document, not the reveal gate (PR #2471's checker): the Studio's
// export capture frame and Print document carry the gate too. Pin the census: the three on-screen
// builders opt in, and neither export builder does.
describe('who paints', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.join(__dirname, '../../..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const { paintsLoading, LIVE_MEDIA } = require('../../../lib/core/image-painting');

  it('reads the opt-in from the document root, and nothing else', () => {
    const withIt = { document: { documentElement: { hasAttribute: (k) => k === LIVE_MEDIA } } };
    const without = { __latticeFontsSettled: false, document: { documentElement: { hasAttribute: () => false } } };
    assert.equal(paintsLoading(withIt), true);
    assert.equal(paintsLoading(without), false, 'the reveal gate alone does not paint');
    assert.equal(paintsLoading({}), false);
  });

  for (const f of ['docs/src/lib/single-slide-render.ts', 'docs/src/playground/deck-render.js', 'docs/src/components/studio/present/stage-window.js']) {
    it(`${f} opts in as a live preview`, () => {
      assert.match(read(f), /data-lattice-live-media[ >]/);
    });
  }
  for (const f of ['docs/src/playground/deck-preview.js', 'docs/src/components/studio/export/deck-export.js', 'docs/src/components/studio/PrintOptionsPanel.tsx']) {
    it(`${f} (the shared builder, the export capture, Print) never opts in`, () => {
      assert.doesNotMatch(read(f), /data-lattice-live-media/);
    });
  }
});
