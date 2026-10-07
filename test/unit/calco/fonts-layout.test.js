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
    assert.deepEqual(readFontMetrics(await ttf('outfit-400')), { ascent: 1, descent: 0.26, lineGap: 0 });
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
      pin: (_bytes, opts) => { calls.push(opts); return synthFont(); },
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

  test('proportional spacing: the multiple is pitch over the natural line, and the box top is baseline minus multiple × ascent', () => {
    const { spacingMultiple } = require('@laticent/calco');
    const f = frame([[{ text: 'x', style: style() }], [{ text: 'y', style: style() }]], { y: 400, firstLineHeight: 35.28, lineHeight: 47.6 });
    const m = spacingMultiple(f, metrics, 28);
    assert.ok(Math.abs(m - 47.6 / (1.26 * 28)) < 1e-9);
    const box = placeFrame(f, 1280, metrics, 28, 'proportional');
    assert.ok(Math.abs(box.y - (400 + 28 - m * 28)) < 1e-9, `top ${box.y}`);
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

/**
 * A minimal sfnt with only head, hhea and OS/2 — enough for the metric and license reads.
 * `hhea` and the typographic metrics DIFFER, so a read from the wrong table (or offset)
 * fails the test, which the real Outfit face (hhea == typo) could not show.
 */
function synthFont({ useTypo = true, fsType = 0, headAt, hheaAt } = {}) {
  const tables = { head: 54, hhea: 36, 'OS/2': 78 };
  const names = Object.keys(tables);
  const dirLen = 12 + names.length * 16;
  const offsets = {};
  let at = dirLen;
  for (const n of names) { offsets[n] = at; at += tables[n]; }
  const buf = new Uint8Array(at);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, names.length);
  names.forEach((n, i) => {
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) buf[rec + k] = n.charCodeAt(k);
    const off = n === 'head' && headAt !== undefined ? headAt : n === 'hhea' && hheaAt !== undefined ? hheaAt : offsets[n];
    v.setUint32(rec + 8, off);
    v.setUint32(rec + 12, tables[n]);
  });
  v.setUint16(offsets.head + 18, 2000); // unitsPerEm
  v.setInt16(offsets.hhea + 4, 1800); // hhea ascent  → 0.9
  v.setInt16(offsets.hhea + 6, -400); // hhea descent → 0.2
  v.setUint16(offsets['OS/2'] + 8, fsType);
  v.setUint16(offsets['OS/2'] + 62, useTypo ? 0x80 : 0); // fsSelection USE_TYPO_METRICS
  v.setInt16(offsets['OS/2'] + 68, 1600); // typo ascender  → 0.8
  v.setInt16(offsets['OS/2'] + 70, -600); // typo descender → 0.3
  return buf;
}

describe('calco fonts — table reads', () => {
  const { embeddingAllowed } = require('@laticent/calco');

  test('USE_TYPO_METRICS picks the OS/2 typographic metrics; without it, hhea', () => {
    assert.deepEqual(readFontMetrics(synthFont()), { ascent: 0.8, descent: 0.3, lineGap: 0 });
    assert.deepEqual(readFontMetrics(synthFont({ useTypo: false })), { ascent: 0.9, descent: 0.2, lineGap: 0 });
  });

  test('a hostile table offset returns null instead of throwing', () => {
    assert.equal(readFontMetrics(synthFont({ headAt: 0x7ffffff0 })), null);
    assert.equal(readFontMetrics(synthFont({ hheaAt: 0x7ffffff0 })), null);
  });

  test('fsType: restricted-license faces are refused, every other kind embeds', () => {
    assert.equal(embeddingAllowed(synthFont({ fsType: 0x0002 })), false, 'restricted');
    for (const fsType of [0x0000, 0x0004, 0x0008]) assert.equal(embeddingAllowed(synthFont({ fsType })), true, `fsType ${fsType}`);
    assert.equal(embeddingAllowed(new Uint8Array(4)), false, 'unreadable');
  });

  test('prepareFonts drops a face whose license forbids embedding', async () => {
    const deck = { width: 1, height: 1, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'a', style: style() }]])] }] };
    const fonts = await prepareFonts(deck, { load: () => new Uint8Array([1]), pin: () => synthFont({ fsType: 0x0002 }) });
    assert.deepEqual(fonts, []);
  });
});
