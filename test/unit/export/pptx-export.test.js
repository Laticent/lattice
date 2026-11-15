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

const { writePptx } = require('../../../lib/export/pptx-export');
const { removeTags } = require('@laticent/markup');

// A minimal valid 1×1 PNG — enough to embed as slide media.
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
    // Three identical pictures are one media part, related from every slide.
    assert.equal(media.length, 1, `expected 1 media part for 3 identical pictures, got ${media.length}`);
    for (const n of slides) {
      const rels = await zip.file(n.replace('slides/', 'slides/_rels/') + '.rels').async('string');
      assert.match(rels, /relationships\/image" Target="\.\.\/media\/[0-9a-f]{16}\.png"/, `${n} has its picture`);
    }
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
    // "Slide N" (never a file name such as "preencoded.png", which a screen reader reads aloud).
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

    // Assert the NOTE TEXT survives export for the noted slides and never fabricates a
    // note from `null`; a slide with no note has no notes page.
    const all = (await notesText(out)).join('\n');
    assert.match(all, /Say this on the opener/, 'opener note missing from notes slides');
    assert.match(all, /Close with the ask/, 'closing note missing from notes slides');
    assert.doesNotMatch(all, /null/, 'a null note must not be stringified into the deck');
  });

  test('no notes argument leaves the notes text empty (back-compat)', async () => {
    const out = tmpFile();
    const count = await writePptx(out, [ONE_PX_PNG, ONE_PX_PNG], { title: 'No Notes' });
    assert.equal(count, 2);
    // The call succeeds and no author copy is injected: no authored WORDS leak in when
    // notes are absent.
    const bodies = await notesText(out);
    // Strip to a fixed point (removeTags), not a one-pass `<[^>]+>` (js/incomplete-multi-character-
    // sanitization, #1958 §3, §7); the shared strip is what every production path already uses.
    const authored = removeTags(bodies.join('')).trim();
    assert.doesNotMatch(authored, /[A-Za-z]/, `expected no authored note words, got: ${authored.slice(0, 80)}`);
  });

  // PptxGenJS 3.12 listed the notes master after the slide list and declared a slide master
  // per slide; the ISO 29500 schema and a strict reader reject both. Calco writes neither.
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

  // A U+0001 in a note once made the notes part unreadable (and the same in a title or an
  // alt text). Calco's `xmlSafe` strips the characters XML 1.0 forbids; every part must
  // still parse, and the words around them survive.
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

  describe('slide aspect from @size geometry', () => {
    const slideSize = async (width, height) => {
      const out = tmpFile();
      await writePptx(out, [ONE_PX_PNG], { title: 'Aspect', width, height });
      const pres = await (await require('jszip').loadAsync(fs.readFileSync(out))).file('ppt/presentation.xml').async('string');
      const [, cx, cy] = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
      return [Number(cx) / 914400, Number(cy) / 914400].map((n) => Math.round(n * 1000) / 1000);
    };

    test('16:9 (HD / 4K) and missing geometry are PowerPoint\'s wide slide', async () => {
      assert.deepEqual(await slideSize(1280, 720), [13.333, 7.5]);
      assert.deepEqual(await slideSize(3840, 2160), [13.333, 7.5]);
      assert.deepEqual(await slideSize(undefined, undefined), [13.333, 7.5]);
    });

    test('portrait/square keep the deck aspect, longest edge 13.333in', async () => {
      assert.deepEqual(await slideSize(1080, 1920), [7.5, 13.333]); // 9:16
      assert.deepEqual(await slideSize(1080, 1080), [13.333, 13.333]); // 1:1
      assert.deepEqual(await slideSize(1080, 1350), [10.666, 13.333]); // 4:5
    });
  });
});
