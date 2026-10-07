/**
 * Unit: the owned image-per-slide PPTX writer (lib/export/pptx-export.js).
 *
 * Exercises the OOXML assembly directly with tiny PNG buffers — no Chromium,
 * no marp. Asserts the produced .pptx is a real OOXML zip carrying one slide
 * part and one media image per input buffer, and that an empty input is
 * rejected. The CLI's screenshot→PNG rasterization is covered by
 * test/integration/export/export-formats.test.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const { writePptx, pptxLayout } = require('../../../lib/export/pptx-export');

// A minimal valid 1×1 PNG — enough for pptxgenjs to embed as slide media.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

describe('pptx-export', () => {
  function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-pptx-'));
    return path.join(dir, 'out.pptx');
  }

  test('writes a valid OOXML zip with one slide + one image per buffer', async () => {
    const out = tmpFile();
    const count = await writePptx(out, [ONE_PX_PNG, ONE_PX_PNG, ONE_PX_PNG], {
      title: 'Test Deck',
    });
    assert.equal(count, 3);
    assert.ok(fs.existsSync(out), 'pptx file should exist');

    // A .pptx is a zip whose first bytes are the local-file-header magic "PK\x03\x04".
    const head = fs.readFileSync(out).subarray(0, 4);
    assert.equal(head.toString('hex'), '504b0304', 'output is not a zip (PK header missing)');

    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files);
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const media  = names.filter((n) => /^ppt\/media\/.+\.(png|jpg|jpeg)$/i.test(n));
    assert.equal(slides.length, 3, `expected 3 slide parts, got ${slides.length}`);
    assert.equal(media.length, 3, `expected 3 media images, got ${media.length}`);
    // OOXML sanity: the content-types part must be present and name the deck.
    assert.ok(names.includes('[Content_Types].xml'), 'missing [Content_Types].xml');
  });

  test('rejects an empty slide set', async () => {
    const out = tmpFile();
    await assert.rejects(() => writePptx(out, []), /no slide images/i);
  });

  test('writes accessibility descriptions as image alt text, skipping empty ones', async () => {
    const out = tmpFile();
    // Three slides; only slides 1 and 3 carry a description (slide 2 is null).
    await writePptx(
      out,
      [ONE_PX_PNG, ONE_PX_PNG, ONE_PX_PNG],
      { title: 'Described Deck' },
      [], // no notes
      ['Revenue rose 40 percent over three quarters', null, 'A pie chart with three equal slices'],
    );
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const slideParts = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
    const xml = await Promise.all(slideParts.map((n) => zip.files[n].async('string')));
    // OOXML alt text lands in the picture's cNvPr @descr. Assert the described
    // slides carry their alt, the undescribed slide falls back to a neutral
    // "Slide N" (NOT pptxgenjs's junk "preencoded.png" filename default).
    assert.match(xml[0], /descr="[^"]*Revenue rose 40 percent/, 'slide 1 alt text missing');
    assert.match(xml[2], /descr="[^"]*three equal slices/, 'slide 3 alt text missing');
    assert.match(xml[1], /descr="Slide 2"/, 'slide 2 should fall back to a neutral alt');
    assert.doesNotMatch(xml.join(''), /descr="preencoded/, 'must never ship the image filename as alt');
  });

  // Read every notesSlide part's text, index-aligned by the notesSlideN filename.
  async function notesText(out) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const parts = Object.keys(zip.files)
      .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
    return Promise.all(parts.map((n) => zip.files[n].async('string')));
  }

  test('writes speaker notes into the notes slide and skips empty notes', async () => {
    const out = tmpFile();
    // Three slides; only slides 1 and 3 carry a note (slide 2 is null).
    const count = await writePptx(
      out,
      [ONE_PX_PNG, ONE_PX_PNG, ONE_PX_PNG],
      { title: 'Notes Deck' },
      ['Say this on the opener', null, 'Close with the ask'],
    );
    assert.equal(count, 3);

    // pptxgenjs emits a notesSlide part per slide regardless; assert the NOTE TEXT
    // survives export for the noted slides and never fabricates a note from `null`.
    const all = (await notesText(out)).join('\n');
    assert.match(all, /Say this on the opener/, 'opener note missing from notes slides');
    assert.match(all, /Close with the ask/, 'closing note missing from notes slides');
    assert.doesNotMatch(all, /null/, 'a null note must not be stringified into the deck');
  });

  test('no notes argument leaves the notes text empty (back-compat)', async () => {
    const out = tmpFile();
    const count = await writePptx(out, [ONE_PX_PNG, ONE_PX_PNG], { title: 'No Notes' });
    assert.equal(count, 2);
    // The call succeeds and no author copy is injected. pptxgenjs still emits the
    // notesSlide parts with their slide-number field, so the only text is digits —
    // assert no authored WORDS leak in when notes are absent.
    const bodies = await notesText(out);
    const authored = bodies.join('').replace(/<[^>]+>/g, '').trim();
    assert.doesNotMatch(authored, /[A-Za-z]/, `expected no authored note words, got: ${authored.slice(0, 80)}`);
  });

  // PptxGenJS 3.12 lists the notes master after the slide list and declares a slide master
  // per slide; the ISO 29500 schema and a strict reader reject both. Calco's tidy mends them.
  test('the package is schema-tidy: notes master before the slide list, no phantom overrides', async () => {
    const out = tmpFile();
    await writePptx(out, [ONE_PX_PNG, ONE_PX_PNG, ONE_PX_PNG], { title: 'Tidy' }, ['A note', null, 'Another']);
    const zip = await require('jszip').loadAsync(fs.readFileSync(out));
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const notes = pres.indexOf('<p:notesMasterIdLst>');
    assert.ok(notes > 0, 'the notes master is listed');
    assert.ok(notes > pres.indexOf('</p:sldMasterIdLst>') && notes < pres.indexOf('<p:sldIdLst>'), 'p:notesMasterIdLst sits between the slide-master and slide lists');
    const types = await zip.file('[Content_Types].xml').async('string');
    const phantom = [...types.matchAll(/PartName="\/([^"]+)"/g)].map((m) => m[1]).filter((part) => !zip.file(part));
    assert.deepEqual(phantom, [], 'every content-type override names a part the package holds');
  });

  // PptxGenJS escapes markup but not the characters XML 1.0 forbids, so a U+0001 in a note
  // made the notes part unreadable (and the same in a title or an alt text). Calco's
  // `xmlSafe` strips them; every part must still parse, and the words around them survive.
  test('control characters in a title, note or alt text leave every XML part parseable', async () => {
    const out = tmpFile();
    await writePptx(out, [ONE_PX_PNG], { title: 'Deck\u0001 name', subject: 'Sub\u0003' }, ['Say \u0001this'], ['Alt\u0002 text']);
    const zip = await require('jszip').loadAsync(fs.readFileSync(out));
    const parser = new (new (require('jsdom').JSDOM)('').window.DOMParser)();
    const parts = Object.keys(zip.files).filter((n) => /\.(xml|rels)$/.test(n));
    for (const name of parts) {
      const doc = parser.parseFromString(await zip.file(name).async('string'), 'application/xml');
      assert.equal(doc.getElementsByTagName('parsererror').length, 0, `${name} does not parse`);
    }
    const notes = (await notesText(out)).join('\n');
    assert.match(notes, /Say this/, 'the note keeps its words');
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(slide, /descr="Alt text"/, 'the alt text keeps its words');
    assert.match(await zip.file('docProps/core.xml').async('string'), /Deck name/);
  });

  test('an alt text or title made only of control characters falls back, never to the filename', async () => {
    const out = tmpFile();
    await writePptx(out, [ONE_PX_PNG], { title: '\u0001' }, [], ['\u0002']);
    const zip = await require('jszip').loadAsync(fs.readFileSync(out));
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /descr="Slide 1"/);
    assert.match(await zip.file('docProps/core.xml').async('string'), /<dc:title>deck<\/dc:title>/);
  });

  describe('pptxLayout — slide aspect from @size geometry', () => {
    // Stub just enough of a pptx instance to capture defineLayout.
    function stub() {
      const defs = [];
      return { defs, defineLayout(d) { defs.push(d); } };
    }

    test('16:9 (HD / 4K) and missing geometry keep the built-in LAYOUT_WIDE (unchanged)', () => {
      const a = stub();
      assert.equal(pptxLayout(a, 1280, 720), 'LAYOUT_WIDE');
      assert.equal(pptxLayout(a, 3840, 2160), 'LAYOUT_WIDE');
      assert.equal(pptxLayout(a, undefined, undefined), 'LAYOUT_WIDE');
      assert.equal(a.defs.length, 0, 'no custom layout defined for 16:9 / absent');
    });

    test('portrait/square define a custom layout at the deck aspect, longest edge 13.333in', () => {
      const story = stub();
      assert.equal(pptxLayout(story, 1080, 1920), 'LATTICE'); // 9:16
      assert.deepEqual(story.defs[0], { name: 'LATTICE', width: 7.5, height: 13.333 });

      const square = stub();
      pptxLayout(square, 1080, 1080); // 1:1
      assert.deepEqual(square.defs[0], { name: 'LATTICE', width: 13.333, height: 13.333 });

      const portrait = stub();
      pptxLayout(portrait, 1080, 1350); // 4:5
      assert.deepEqual(portrait.defs[0], { name: 'LATTICE', width: 10.666, height: 13.333 });
    });
  });
});
