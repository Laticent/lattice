/**
 * Unit: Calco's slide pictures (docs/src/lib/calco/picture.ts). A slide is stored as PNG, or as
 * JPEG when it is a photograph; the helpers name the type from the bytes and set when a JPEG is
 * worth it, and both writers name the part by what the bytes are.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { imageMime, imageExt, worthTryingJpeg, jpegWins, PICTURE_FLAT_BYTES, writeOdp, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, ONE_PX_JPEG, style, frame } = require('./_fixtures');

const deckOf = (image) => ({ width: 1280, height: 720, slides: [{ image, frames: [frame([[{ text: 'Hi', style: style() }]])] }] });

describe('calco picture — helpers', () => {
  test('the type comes from the bytes: JPEG starts FF D8, everything else is called PNG', () => {
    assert.equal(imageMime(ONE_PX_JPEG), 'image/jpeg');
    assert.equal(imageExt(ONE_PX_JPEG), 'jpg');
    assert.equal(imageMime(ONE_PX_PNG), 'image/png');
    assert.equal(imageExt(ONE_PX_PNG), 'png');
    assert.equal(imageMime(new Uint8Array(0)), 'image/png', 'no bytes is not a crash');
  });

  test('a flat PNG is kept; a JPEG must clearly win, not marginally', () => {
    assert.equal(worthTryingJpeg(PICTURE_FLAT_BYTES), false, 'at the threshold it is still flat');
    assert.equal(worthTryingJpeg(PICTURE_FLAT_BYTES + 1), true);
    assert.equal(jpegWins(3_000_000, 300_000), true, 'a photograph');
    assert.equal(jpegWins(1_000_000, 900_000), false, 'a 10% saving is not worth a lossy picture');
    assert.equal(jpegWins(1_000_000, 1_200_000), false);
  });
});

describe('calco picture — the writers name the part by its bytes', () => {
  test('.odp: a JPEG slide is Pictures/slide001.jpg typed image/jpeg; a PNG slide is unchanged', async () => {
    const jpg = await JSZip.loadAsync(await writeOdp(JSZip, deckOf(ONE_PX_JPEG), 'nodebuffer'));
    assert.ok(jpg.file('Pictures/slide001.jpg'));
    assert.equal(jpg.file('Pictures/slide001.png'), null);
    const manifest = await jpg.file('META-INF/manifest.xml').async('string');
    assert.match(manifest, /full-path="Pictures\/slide001\.jpg" manifest:media-type="image\/jpeg"/);
    assert.match(await jpg.file('content.xml').async('string'), /xlink:href="Pictures\/slide001\.jpg"/);
    const png = await JSZip.loadAsync(await writeOdp(JSZip, deckOf(ONE_PX_PNG), 'nodebuffer'));
    assert.ok(png.file('Pictures/slide001.png'));
    assert.match(await png.file('META-INF/manifest.xml').async('string'), /slide001\.png" manifest:media-type="image\/png"/);
  });

  test('.pptx: a JPEG slide is an image/jpeg part with a jpeg content type', async () => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deckOf(ONE_PX_JPEG), 'nodebuffer', JSZip));
    const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/[^/]+\.\w+$/.test(n));
    assert.equal(media.length, 1);
    assert.match(media[0], /\.jpe?g$/);
    assert.match(await zip.file('[Content_Types].xml').async('string'), /Extension="jpe?g" ContentType="image\/jpe?g"/);
    const png = await JSZip.loadAsync(await writePptx(PptxGenJS, deckOf(ONE_PX_PNG), 'nodebuffer', JSZip));
    assert.ok(Object.keys(png.files).some((n) => /^ppt\/media\/.*\.png$/.test(n)));
  });
});
