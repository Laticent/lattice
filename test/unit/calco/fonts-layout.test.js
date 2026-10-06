/**
 * Unit: Calco's font helpers and the placement maths (docs/src/lib/calco/fonts.ts,
 * layout.ts). The placement is the part that makes an office suite draw a line where the
 * browser did, so the numbers are pinned here against the rule in layout.ts's header.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { readFontMetrics, facesUsed, faceFor, prepareFonts, placeFrame, applyTransform } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, ttf } = require('./_fixtures');

describe('calco fonts', () => {
  test('readFontMetrics reads the typographic metrics a USE_TYPO_METRICS face declares', async () => {
    // Outfit: typo ascender 1000, descender -260, 1000 units per em.
    assert.deepEqual(readFontMetrics(await ttf('outfit-400')), { ascent: 1, descent: 0.26 });
    assert.equal(readFontMetrics(new Uint8Array([1, 2, 3])), null);
    assert.equal(readFontMetrics(new TextEncoder().encode('not a font at all, really')), null);
  });

  test('facesUsed dedupes faces and drops ligatures if ANY run of the face turned them off', () => {
    const deck = { width: 1, height: 1, slides: [{ image: ONE_PX_PNG, frames: [frame([[
      { text: 'a', style: style({ family: 'JetBrains Mono' }) },
      { text: '<!--', style: style({ family: 'JetBrains Mono', ligatures: false }) },
      { text: 'b', style: style() },
    ]])] }] };
    const faces = facesUsed(deck);
    assert.equal(faces.length, 2);
    assert.equal(faces.find((f) => f.family === 'JetBrains Mono').ligatures, false);
    assert.equal(faces.find((f) => f.family === 'Outfit').ligatures, true);
  });

  test('faceFor picks the same family and slant at the nearest weight', () => {
    const fonts = [400, 700].map((weight) => ({ family: 'Outfit', weight, italic: false, bytes: ONE_PX_PNG }));
    assert.equal(faceFor({ family: 'Outfit', weight: 600, italic: false }, fonts).weight, 700);
    assert.equal(faceFor({ family: 'Outfit', weight: 500, italic: true }, fonts), null);
  });

  test('prepareFonts loads and pins each face once, and skips what the host cannot load', async () => {
    const calls = [];
    const deck = { width: 1, height: 1, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'a', style: style() }, { text: 'b', style: style() }, { text: 'c', style: style({ family: 'System Only' }) }]])] }] };
    const fonts = await prepareFonts(deck, {
      load: (f) => (f.family === 'Outfit' ? new Uint8Array([7]) : null),
      pin: (_bytes, opts) => { calls.push(opts); return new Uint8Array([9]); },
    });
    assert.equal(fonts.length, 1);
    assert.deepEqual(calls, [{ weight: 400, ligatures: true }]);
  });
});

describe('calco layout', () => {
  const metrics = { ascent: 1, descent: 0.26 };

  test('the box is placed from the browser baseline, so all the leading sits above (LibreOffice)', () => {
    // 28px Outfit: glyph box 35.28px, baseline 28px below its top. Line pitch 47.6px.
    const f = frame([[{ text: 'x', style: style() }], [{ text: 'y', style: style() }]], { y: 400, firstLineHeight: 35.28, lineHeight: 47.6 });
    const box = placeFrame(f, 1280, metrics, 28);
    const baseline = 400 + 28;
    assert.ok(Math.abs(box.y - (baseline - (47.6 - 0.26 * 28))) < 1e-9);
    assert.equal(box.h, 47.6 * 2);
  });

  test('a single line with no leading starts at the glyph top', () => {
    const f = frame([[{ text: 'x', style: style() }]], { y: 300, firstLineHeight: 35.28, lineHeight: 35.28 });
    assert.ok(Math.abs(placeFrame(f, 1280, metrics, 28).y - 300) < 1e-9);
  });

  test('spare width grows on the alignment side and never off the slide', () => {
    const base = { w: 400, lines: [[{ text: 'x', style: style() }]] };
    const left = placeFrame(frame(base.lines, { ...base, x: 100 }), 1280, metrics, 28);
    assert.equal(left.x, 100);
    assert.ok(left.w > 400);
    const center = placeFrame(frame(base.lines, { ...base, x: 440, align: 'center' }), 1280, metrics, 28);
    assert.ok(Math.abs(center.x + center.w / 2 - 640) < 1e-9, 'stays centered');
    const tight = placeFrame(frame(base.lines, { ...base, x: 878 }), 1280, metrics, 28);
    assert.ok(tight.x + tight.w <= 1280 + 1e-9, 'kept on the slide');
  });

  test('applyTransform follows CSS text-transform', () => {
    assert.equal(applyTransform('every slide', 'uppercase'), 'EVERY SLIDE');
    assert.equal(applyTransform('Every Slide', 'lowercase'), 'every slide');
    assert.equal(applyTransform('every slide', 'capitalize'), 'Every Slide');
    assert.equal(applyTransform('as is', 'none'), 'as is');
  });
});
