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
    const deck = { width: 1280, height: 720, title: 'Deck\u0001 name', subject: 'Sub\u0003', slides: [{ image: ONE_PX_PNG, notes: 'bell\u0001note', frames: [frame([[{ text: 'ctrl\u0001text', style: evil }]])] }] };
    const { zip, xml } = await slideXml(deck);
    const core = await zip.file('docProps/core.xml').async('string');
    assert.ok(![...core].some((c) => c.charCodeAt(0) < 9), 'none in the document properties');
    assert.match(core, /Deck name/);
    assert.match(xml, /<a:latin typeface="Evilbx"/);
    assert.match(xml, /<a:t>ctrltext<\/a:t>/);
    assert.ok(![...xml].some((c) => c.charCodeAt(0) < 9), 'no control characters in the slide');
    const notes = Object.keys(zip.files).find((n) => /notesSlide\d+\.xml$/.test(n));
    assert.ok(![...(await zip.file(notes).async('string'))].some((c) => c.charCodeAt(0) < 9), 'none in the notes');
  });

  test('xmlSafe turns a missing value into an empty string, not the word', async () => {
    const { xmlSafe } = require('@laticent/calco');
    assert.equal(xmlSafe(undefined), '');
    assert.equal(xmlSafe(null), '');
    assert.equal(xmlSafe('a\u0001b'), 'ab');
  });

  test('boxes do not re-wrap: lines are already broken where the browser broke them', async () => {
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'one', style: style() }]])] }] };
    const { xml } = await slideXml(deck);
    assert.match(xml, /wrap="none"/);
  });

  test('with JSZip the package is schema-shaped: one pPr per paragraph, notes master in order, no phantom parts', async () => {
    // Two runs on one line, and two slides: PptxGenJS 3.12 writes a pPr before each run, puts
    // notesMasterIdLst after sldIdLst and overrides a slide master per slide (one exists).
    const twoRuns = frame([[{ text: 'import', style: style({ italic: true }) }, { text: ' x', style: style() }], [{ text: 'next', style: style() }]]);
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [twoRuns], notes: 'n' }, { image: ONE_PX_PNG, frames: [twoRuns] }] };
    const check = async (bytes) => {
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const paras = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => m[0]);
      const pres = await zip.file('ppt/presentation.xml').async('string');
      const types = await zip.file('[Content_Types].xml').async('string');
      return {
        paras,
        maxPPr: Math.max(...paras.map((p) => (p.match(/<a:pPr\b/g) || []).length)),
        notesFirst: pres.indexOf('<p:notesMasterIdLst>') < pres.indexOf('<p:sldIdLst>'),
        phantoms: [...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]).filter((n) => !zip.file(n)),
      };
    };
    const raw = await check(await writePptx(PptxGenJS, deck, 'nodebuffer'));
    assert.ok(raw.maxPPr > 1 && !raw.notesFirst && raw.phantoms.length, 'PptxGenJS still writes all three; if not, tidyPptx can go');
    const tidy = await check(await writePptx(PptxGenJS, deck, 'nodebuffer', JSZip));
    assert.equal(tidy.paras.length, raw.paras.length, 'no paragraph is lost');
    assert.equal(tidy.maxPPr, 1);
    assert.ok(tidy.notesFirst, 'p:notesMasterIdLst sits before p:sldIdLst');
    assert.deepEqual(tidy.phantoms, []);
    assert.match(tidy.paras[0], /<a:pPr[^>]*>[\s\S]*?<\/a:pPr><a:r>[\s\S]*>import<\/a:t>[\s\S]*> x<\/a:t>/, 'the kept pPr comes first, both runs follow');
  });
});


describe('calco pptx — labels', () => {
  const label = (shape) => frame([[{ text: 'Tag', style: style({ color: '#ffffff' }) }]], { shape });
  const slideOf = async (deck) => {
    const zip = await JSZip.loadAsync(await writePptx(PptxGenJS, deck, 'nodebuffer', JSZip));
    return zip.file('ppt/slides/slide1.xml').async('string');
  };
  const deckOf = (...frames) => ({ width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames }] });

  test('each label is a p:grpSp holding its shape, then its text box; a plain frame is not grouped', async () => {
    const xml = await slideOf(deckOf(label({ x: 90, y: 190, w: 200, h: 50, radii: [0, 0, 0, 0], fill: { color: '#2e608a', alpha: 1 } }), frame([[{ text: 'plain', style: style() }]])));
    const groups = xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g) || [];
    assert.equal(groups.length, 1);
    assert.match(groups[0], /<p:cNvPr id="\d+" name="Calco Label 1\.1"\/>[\s\S]*<p:sp>[\s\S]*name="Calco Label 1\.1"[\s\S]*<\/p:sp><p:sp>[\s\S]*name="Calco Label 1\.1 Text"[\s\S]*>Tag<\/a:t>/);
    const ids = Array.from(xml.matchAll(/<p:cNvPr id="(\d+)"/g), (m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'every id on the slide is unique');
  });

  test('the group box encloses both children, in their own coordinates', async () => {
    const xml = await slideOf(deckOf(label({ x: 90, y: 190, w: 200, h: 50, radii: [0, 0, 0, 0], fill: { color: '#2e608a', alpha: 1 } })));
    const g = xml.match(/name="Calco Label 1\.1"\/><p:cNvGrpSpPr\/><p:nvPr\/><\/p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/><a:chOff x="(\d+)" y="(\d+)"\/><a:chExt cx="(\d+)" cy="(\d+)"\/>/);
    assert.ok(g, 'the group has an xfrm with child space');
    assert.deepEqual(g.slice(1, 5), g.slice(5, 9), 'child space is the group box itself');
    for (const m of xml.matchAll(/<p:sp>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<\/p:sp>/g)) {
      if (!/Calco Label/.test(m[0])) continue;
      assert.ok(+m[1] >= +g[1] && +m[2] >= +g[2] && +m[1] + +m[3] <= +g[1] + +g[3] && +m[2] + +m[4] <= +g[2] + +g[4]);
    }
  });

  test('square corners are a rect, equal corners a roundRect, mixed corners custom geometry', async () => {
    const box = { x: 90, y: 190, w: 200, h: 50, fill: { color: '#2e608a', alpha: 1 } };
    assert.match(await slideOf(deckOf(label({ ...box, radii: [0, 0, 0, 0] }))), /name="Calco Label 1\.1"[\s\S]*?<a:prstGeom prst="rect">/);
    assert.match(await slideOf(deckOf(label({ ...box, radii: [12, 12, 12, 12] }))), /name="Calco Label 1\.1"[\s\S]*?<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj"/);
    const mixed = await slideOf(deckOf(label({ ...box, radii: [10, 0, 6, 0] })));
    assert.match(mixed, /name="Calco Label 1\.1"[\s\S]*?<a:custGeom>/);
    assert.equal((mixed.match(/<a:arcTo /g) || []).length, 2, 'one arc per rounded corner');
  });

  test('a label states no fill and no outline outright, and a border is a line', async () => {
    const outline = await slideOf(deckOf(label({ x: 90, y: 190, w: 200, h: 50, radii: [0, 0, 0, 0], stroke: { width: 2, color: '#7b772d', alpha: 1 } })));
    assert.match(outline, /name="Calco Label 1\.1"[\s\S]*?<a:noFill\/><a:ln w="\d+"><a:solidFill><a:srgbClr val="7B772D"\/>/);
    const filled = await slideOf(deckOf(label({ x: 90, y: 190, w: 200, h: 50, radii: [0, 0, 0, 0], fill: { color: '#2e608a', alpha: 0.5 } })));
    assert.match(filled, /name="Calco Label 1\.1"[\s\S]*?<a:srgbClr val="2E608A"><a:alpha val="50000"\/><\/a:srgbClr><\/a:solidFill><a:ln><a:noFill\/><\/a:ln>/);
  });
});
