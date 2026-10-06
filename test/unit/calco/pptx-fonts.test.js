/**
 * Unit: Calco's PPTX font embedding (docs/src/lib/calco/sfnt.ts and `embedPptxFonts` in
 * pptx.ts). A real shipped face is renamed and wrapped as Embedded OpenType; the written
 * `.pptx` carries it in `ppt/fonts/`, lists it in `p:embeddedFontLst`, and asks for it by
 * its per-weight family name.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { canEmbedAsEot, embeddingAllowed, familyNameOf, planEmbedding, pptxFaceName, renameFace, toEot, writePptx } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, ttf } = require('./_fixtures');

/** The OpenType checksum of a whole font, which a valid head.checkSumAdjustment makes 0xB1B0AFBA. */
function wholeSum(bytes) {
  const padded = new Uint8Array((bytes.length + 3) & ~3);
  padded.set(bytes);
  const v = new DataView(padded.buffer);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return sum;
}

describe('calco sfnt', () => {
  test('renameFace gives a face its own family, as that family\'s regular face', async () => {
    const face = await ttf();
    const renamed = renameFace(face, 'Outfit SemiBold');
    assert.equal(familyNameOf(renamed), 'Outfit SemiBold');
    assert.equal(wholeSum(renamed), 0xb1b0afba, 'head.checkSumAdjustment is recomputed');
    const v = new DataView(renamed.buffer, renamed.byteOffset);
    const n = v.getUint16(4);
    const off = (tag) => {
      for (let i = 0; i < n; i++) {
        const r = 12 + i * 16;
        if (String.fromCharCode(...renamed.subarray(r, r + 4)) === tag) return v.getUint32(r + 8);
      }
      return -1;
    };
    assert.equal(v.getUint16(off('OS/2') + 62) & 0x61, 0x40, 'fsSelection: REGULAR, not bold, not italic');
    assert.equal(v.getUint16(off('head') + 44), 0, 'macStyle cleared');
  });

  test('toEot writes an uncompressed EOT 2.1 header, then the face unchanged', async () => {
    const face = renameFace(await ttf(), 'Outfit Medium');
    const eot = toEot(face, { family: 'Outfit Medium' });
    const v = new DataView(eot.buffer, eot.byteOffset);
    assert.equal(v.getUint32(0, true), eot.length, 'EOTSize');
    assert.equal(v.getUint32(4, true), face.length, 'FontDataSize');
    assert.equal(v.getUint32(8, true), 0x00020001, 'version 2.1');
    assert.equal(v.getUint32(12, true), 0, 'no compression, no XOR');
    assert.equal(v.getUint16(34, true), 0x504c, 'magic number');
    const nameLen = v.getUint16(82, true);
    assert.equal(Buffer.from(eot.subarray(84, 84 + nameLen)).toString('utf16le'), 'Outfit Medium');
    assert.deepEqual(eot.subarray(eot.length - face.length), face);
  });

  test('renameFace keeps the records it does not own: the copyright, and names STAT points at', async () => {
    const face = await ttf();
    const ids = (bytes) => {
      const v = new DataView(bytes.buffer, bytes.byteOffset);
      const n = v.getUint16(4);
      for (let i = 0; i < n; i++) {
        const r = 12 + i * 16;
        if (String.fromCharCode(...bytes.subarray(r, r + 4)) !== 'name') continue;
        const at = v.getUint32(r + 8);
        const count = v.getUint16(at + 2);
        return new Set(Array.from({ length: count }, (_, k) => v.getUint16(at + 6 + k * 12 + 6)));
      }
      return new Set();
    };
    const before = ids(face);
    const after = ids(renameFace(face, 'Outfit Light'));
    for (const id of before) if (id === 0 || id >= 256) assert.ok(after.has(id), `name ID ${id} kept`);
    assert.ok(before.has(0), 'the fixture face carries a copyright to keep');
  });

  test('canEmbedAsEot: TrueType with OS/2 and head only', async () => {
    const face = await ttf();
    assert.equal(canEmbedAsEot(face), true);
    const cff = face.slice();
    cff.set([0x4f, 0x54, 0x54, 0x4f], 0); // 'OTTO'
    assert.equal(canEmbedAsEot(cff), false);
    assert.equal(canEmbedAsEot(new Uint8Array(8)), false);
  });

  test('embeddingAllowed refuses a bitmap-only face (fsType bit 9)', async () => {
    const face = (await ttf()).slice();
    const v = new DataView(face.buffer);
    const n = v.getUint16(4);
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16;
      if (String.fromCharCode(...face.subarray(r, r + 4)) === 'OS/2') v.setUint16(v.getUint32(r + 8) + 8, 0x0200);
    }
    assert.equal(embeddingAllowed(face), false);
  });

  test('pptxFaceName names each weight PowerPoint has no slot for', () => {
    assert.equal(pptxFaceName({ family: 'Outfit', weight: 400, italic: false }), 'Outfit');
    assert.equal(pptxFaceName({ family: 'Outfit', weight: 600, italic: false }), 'Outfit SemiBold');
    assert.equal(pptxFaceName({ family: 'Playfair Display', weight: 700, italic: true }), 'Playfair Display Bold Italic');
  });
});

describe('calco pptx — embedded fonts', () => {
  async function written(withZip) {
    const face = await ttf();
    const deck = {
      width: 1280, height: 720,
      fonts: [{ family: 'Outfit', weight: 600, italic: false, bytes: face }],
      slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'Hello', style: style({ weight: 600 }) }]])] }],
    };
    return JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer', withZip ? JSZip : undefined));
  }

  test('the face rides in ppt/fonts as EOT, listed, related and typed', async () => {
    const zip = await written(true);
    const fonts = Object.keys(zip.files).filter((n) => n.startsWith('ppt/fonts/'));
    assert.equal(fonts.length, 1);
    assert.match(fonts[0], /\.fntdata$/);
    const pres = await zip.file('ppt/presentation.xml').async('string');
    assert.match(pres, /embedTrueTypeFonts="1"/);
    assert.match(pres, /<p:notesSz[^>]*\/><p:embeddedFontLst><p:embeddedFont><p:font typeface="Outfit SemiBold"[^>]*\/><p:regular r:id="(rIdCalcoFont\d+)"\/><\/p:embeddedFont><\/p:embeddedFontLst>/);
    const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    assert.match(rels, /Id="rIdCalcoFont\d+" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/font" Target="fonts\/calco-font\d+\.fntdata"/);
    assert.match(await zip.file('[Content_Types].xml').async('string'), /Extension="fntdata" ContentType="application\/x-fontdata"/);
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(slide, /<a:latin typeface="Outfit SemiBold"/);
    assert.doesNotMatch(slide, / b="1"/, 'the weight is in the family, not a synthetic bold');
  });

  test('without JSZip the faces are named, bold or not, as before', async () => {
    const zip = await written(false);
    assert.equal(Object.keys(zip.files).filter((n) => n.startsWith('ppt/fonts/')).length, 0);
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(slide, /<a:latin typeface="Outfit"/);
    assert.match(slide, / b="1"/);
  });

  const deckWith = async (fonts, weights) => ({
    width: 1280, height: 720, fonts,
    slides: [{ image: ONE_PX_PNG, frames: weights.map((w, i) => frame([[{ text: `w${w}`, style: style({ weight: w }) }]], { y: 100 + i * 60 })) }],
  });

  test('a run whose exact face is not embedded names its family, with bold, never a stand-in', async () => {
    const face = await ttf();
    const cff = face.slice();
    cff.set([0x4f, 0x54, 0x54, 0x4f], 0);
    // 600 is CFF (cannot be embedded); 700 is missing altogether.
    const deck = await deckWith([{ family: 'Outfit', weight: 400, italic: false, bytes: face }, { family: 'Outfit', weight: 600, italic: false, bytes: cff }], [400, 600, 700]);
    const plan = planEmbedding(deck);
    assert.deepEqual(plan.faces.map((f) => f.name), ['Outfit']);
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer', JSZip));
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    const runs = [...slide.matchAll(/<a:rPr([^>]*)>[\s\S]*?<a:latin typeface="([^"]+)"/g)].map((m) => `${m[2]}${/ b="1"/.test(m[1]) ? ' bold' : ''}`);
    assert.deepEqual(runs, ['Outfit', 'Outfit bold', 'Outfit bold']);
  });

  test('two weights that round to one name get distinct families', async () => {
    const face = await ttf();
    const deck = await deckWith([{ family: 'Outfit', weight: 700, italic: false, bytes: face }, { family: 'Outfit', weight: 720, italic: false, bytes: face.slice() }], [700, 720]);
    const names = planEmbedding(deck).faces.map((f) => f.name);
    assert.deepEqual(names, ['Outfit Bold', 'Outfit 720']);
  });

  test('every PptxGenJS output type still works with fonts embedded', async () => {
    const face = await ttf();
    const deck = await deckWith([{ family: 'Outfit', weight: 400, italic: false, bytes: face }], [400]);
    const b64 = await writePptx(PptxGenJS, deck, 'base64', JSZip);
    const zip = await JSZip.loadAsync(b64, { base64: true });
    assert.ok(zip.file('ppt/fonts/calco-font1.fntdata'));
    assert.ok((await writePptx(PptxGenJS, deck, 'arraybuffer', JSZip)) instanceof ArrayBuffer);
  });
});
