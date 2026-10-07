/**
 * Unit: Calco's editable PPTX writer (docs/src/lib/calco/pptx.ts). Builds a deck through
 * the real PptxGenJS and reads the OOXML back: the slide picture with its alt text, one
 * text box per frame with its runs, and what OOXML cannot carry (numeric weight, a
 * transform) mapped the way the module header says.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { writePptx, pptxPageSize } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame } = require('./_fixtures');

async function slideXml(deck, n = 1) {
  const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer'));
  return { zip, xml: await zip.file(`ppt/slides/slide${n}.xml`).async('string') };
}

describe('calco pptx', () => {
  test('picture with alt text, then one text box per frame', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, description: 'Title slide', frames: [frame([[{ text: 'Hello', style: style() }]]), frame([[{ text: 'World', style: style() }]], { y: 400 })] }] };
    const { xml } = await slideXml(deck);
    assert.match(xml, /descr="Title slide"/);
    assert.equal(xml.match(/<p:sp>/g).length, 2);
    assert.match(xml, /<a:t>Hello<\/a:t>/);
    assert.match(xml, /<a:latin typeface="Outfit"/);
  });

  test('600+ is bold, uppercase is baked into the text, letter-spacing and color carry', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'eyebrow', style: style({ weight: 600, transform: 'uppercase', letterSpacing: 2, color: '#0b3d6e' }) }]])] }] };
    const { xml } = await slideXml(deck);
    assert.match(xml, /<a:t>EYEBROW<\/a:t>/);
    assert.match(xml, / b="1"/);
    assert.match(xml, / spc="\d+"/);
    assert.match(xml, /<a:srgbClr val="0B3D6E"/);
  });

  test('a multi-line frame keeps the browser line breaks and a fixed line pitch', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'one', style: style() }], [{ text: 'two', style: style() }]])] }] };
    const { xml } = await slideXml(deck);
    assert.match(xml, /one/);
    assert.match(xml, /two/);
    // Proportional, not exact: Google Slides reads an exact spcPts as a multiple of the size
    // and spreads every line ~26% (measured on the owner's device).
    assert.match(xml, /<a:lnSpc><a:spcPct val="\d+"\/><\/a:lnSpc>/);
    assert.doesNotMatch(xml, /<a:spcPts/);
  });

  test('notes are written; the alt text never falls back to the file name', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [], notes: 'Say this' }] };
    const { zip, xml } = await slideXml(deck);
    assert.match(xml, /descr="Slide 1"/);
    const notes = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    assert.equal(notes.length, 1);
    assert.match(await zip.file(notes[0]).async('string'), /Say this/);
  });

  test('small caps ride as cap="small"; the picture spans the exact slide width', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'Pain', style: style({ smallCaps: true }) }, { text: ' plain', style: style() }]])] }] };
    const { zip, xml } = await slideXml(deck);
    assert.match(xml, /<a:rPr lang="en-US" cap="small"[^>]*>(?:(?!<\/a:r>).)*<a:t>Pain<\/a:t>/s);
    assert.equal((xml.match(/cap="small"/g) || []).length, 1, 'only the small-caps run');
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const slideCx = pres.match(/<p:sldSz cx="(\d+)"/)[1];
    assert.equal(xml.match(/<p:pic>.*?<a:ext cx="(\d+)"/s)[1], slideCx, 'no 1px sliver at the right edge');
  });

  test('pptxPageSize: 16:9 is LAYOUT_WIDE, other aspects keep a 13.333in longest edge', () => {
    assert.deepEqual(pptxPageSize(1280, 720), { w: 13.333, h: 7.5, wide: true });
    assert.deepEqual(pptxPageSize(1080, 1920), { w: 7.5, h: 13.333, wide: false });
  });
});

describe('calco pptx — what PptxGenJS does not escape', () => {
  test('a hostile font family and control characters still give well-formed XML', async () => {
    const evil = style({ family: 'Ev"il<b>&x' });
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, notes: 'bell\u0001note', frames: [frame([[{ text: 'ctrl\u0001text', style: evil }]])] }] };
    const { zip, xml } = await slideXml(deck);
    assert.match(xml, /<a:latin typeface="Evilbx"/);
    assert.match(xml, /<a:t>ctrltext<\/a:t>/);
    assert.ok(![...xml].some((c) => c.charCodeAt(0) < 9), 'no control characters in the slide');
    const notes = Object.keys(zip.files).find((n) => /notesSlide\d+\.xml$/.test(n));
    assert.ok(![...(await zip.file(notes).async('string'))].some((c) => c.charCodeAt(0) < 9), 'none in the notes');
  });

  test('boxes do not re-wrap: lines are already broken where the browser broke them', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'one', style: style() }]])] }] };
    const { xml } = await slideXml(deck);
    assert.match(xml, /wrap="none"/);
  });
});
