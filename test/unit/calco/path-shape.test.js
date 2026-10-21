/**
 * Unit: a `path` shape (a check, a cross, a dash lifted from a pseudo-element's CSS mask) in
 * both writers. It is a real freeform shape with a stroke, round ends and round corners, so it
 * stays a recolorable object in the office suite.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { writeOdp, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, ONE_PX_JPEG } = require('./_fixtures');

// A check mark, 24 px wide: M6 12.6 l4 4 8-9, stroked 2.5 px, round.
const check = {
  kind: 'path',
  x: 100,
  y: 200,
  w: 12,
  h: 8.5,
  path: [['M', 0, 4.1], ['L', 4, 8.1], ['L', 12, 0]],
  closed: false,
  stroke: { color: '#16a34a', alpha: 1, width: 2.5 },
  cap: 'round',
  join: 'round',
};
const deck = (shape) => ({ width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [], shapes: [shape] }] });

describe('calco path shape', () => {
  test('.pptx: a freeform with a stroke, a round cap and a round join, and no fill', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck(check), 'nodebuffer', JSZip));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const sp = xml.match(/<p:sp>(?:(?!<\/p:sp>).)*name="Mark 1\.1"(?:(?!<\/p:sp>).)*<\/p:sp>/s)[0];
    assert.match(sp, /<a:custGeom>/);
    assert.match(sp, /<a:ln w="\d+" cap="rnd">/);
    assert.match(sp, /<a:round\/><\/a:ln>/);
    assert.match(sp, /<a:srgbClr val="16A34A"/);
    assert.doesNotMatch(sp, /calco-round/, 'the marker is gone from the name');
    assert.match(sp, /<a:noFill\/>/, 'an open mark is never filled');
  });

  test('.odp: a custom shape with a round stroke cap and join', async () => {
    const zip = await JSZip.loadAsync(await writeOdp(JSZip, deck(check), 'nodebuffer'));
    const content = await zip.file('content.xml').async('string');
    assert.match(content, /draw:name="Mark 1\.1"/);
    assert.match(content, /svg:stroke-linecap="round" draw:stroke-linejoin="round"/);
    assert.match(content, /draw:enhanced-path="M 0 410 L 400 810 L 1200 0 F N"/);
  });

  test('a mark with no cap keeps the default butt ends, and a picture-only deck is untouched', async () => {
    const plain = { ...check, cap: undefined, join: undefined };
    const odp = await JSZip.loadAsync(await writeOdp(JSZip, deck(plain), 'nodebuffer'));
    assert.match(await odp.file('content.xml').async('string'), /svg:stroke-linecap="butt"(?! draw:stroke-linejoin)/);
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, { width: 1280, height: 720, slides: [{ image: ONE_PX_JPEG, frames: [] }] }, 'nodebuffer', JSZip));
    assert.doesNotMatch(await zip.file('ppt/slides/slide1.xml').async('string'), /cap="rnd"/);
  });
});
