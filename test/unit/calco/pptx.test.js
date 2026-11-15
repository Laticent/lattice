/**
 * Unit: Calco's PPTX writer (docs/src/lib/calco/pptx.ts). Builds a deck and reads the OOXML
 * back: the slide picture with its alt text, one text box per frame with its runs, and what
 * OOXML cannot carry (numeric weight, a transform) mapped the way the module header says.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { writePptx, pptxPageSize } = require('@laticent/calco');
const { ONE_PX_PNG, ONE_PX_JPEG, style, frame } = require('./_fixtures');

async function slideXml(deck, n = 1) {
  const zip = await JSZip.loadAsync(await writePptx(JSZip, deck, 'nodebuffer'));
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
    assert.match(xml, /<a:rPr [^>]*cap="small"[^>]*>(?:(?!<\/a:r>).)*<a:t>Pain<\/a:t>/s);
    assert.doesNotMatch(xml, /altLang/, 'a real attribute, not a ride in an unescaped lang');
    assert.equal((xml.match(/cap="small"/g) || []).length, 1, 'only the small-caps run');
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const slideCx = pres.match(/<p:sldSz cx="(\d+)"/)[1];
    assert.equal(xml.match(/<p:pic>.*?<a:ext cx="(\d+)"/s)[1], slideCx, 'no 1px sliver at the right edge');
  });

  test('a near-16:9 deck drawn on the wide slide: its picture covers the slide exactly, never past the edge', async () => {
    const zip = await JSZip.loadAsync(await writePptx(JSZip, { width: 1280, height: 722, slides: [{ image: ONE_PX_PNG, frames: [] }] }, 'nodebuffer'));
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const [, cx, cy] = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(xml, new RegExp(`<p:pic>.*?<a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/>`, 's'));
  });

  test('pptxPageSize: 16:9 is LAYOUT_WIDE, other aspects keep a 13.333in longest edge', () => {
    assert.deepEqual(pptxPageSize(1280, 720), { w: 13.333, h: 7.5, wide: true });
    assert.deepEqual(pptxPageSize(1080, 1920), { w: 7.5, h: 13.333, wide: false });
  });
});

describe('calco pptx — escaping', () => {
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

  test('the package is schema-shaped: one pPr per paragraph, notes master in order, no phantom parts', async () => {
    const twoRuns = frame([[{ text: 'import', style: style({ italic: true }) }, { text: ' x', style: style() }], [{ text: 'next', style: style() }]]);
    const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [twoRuns], notes: 'n' }, { image: ONE_PX_PNG, frames: [twoRuns] }] };
    const zip = await JSZip.loadAsync(await writePptx(JSZip, deck, 'nodebuffer'));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const paras = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => m[0]);
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const types = await zip.file('[Content_Types].xml').async('string');
    assert.equal(paras.length, 2, 'one paragraph per browser line');
    assert.equal(Math.max(...paras.map((p) => (p.match(/<a:pPr\b/g) || []).length)), 1);
    assert.ok(pres.indexOf('<p:notesMasterIdLst>') < pres.indexOf('<p:sldIdLst>'), 'p:notesMasterIdLst sits before p:sldIdLst');
    assert.deepEqual([...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]).filter((n) => !zip.file(n)), []);
    assert.match(paras[0], /<a:pPr[^>]*>[\s\S]*?<\/a:pPr><a:r>[\s\S]*>import<\/a:t>[\s\S]*> x<\/a:t>/, 'the pPr comes first, both runs follow');
  });
});


describe('calco pptx — layouts, roles and the locked picture', () => {
  const header = (text) => frame([[{ text, style: style({ size: 12 }) }]], { role: 'header', x: 30, y: 24, w: 400, h: 20 });
  const num = (n) => frame([[{ text: String(n), style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20, align: 'right' });
  const title = (text) => frame([[{ text, style: style({ size: 40 }) }]], { role: 'title', x: 64, y: 90, w: 900, h: 60 });
  const deck = () => ({
    width: 1280,
    height: 720,
    backgrounds: [{ color: '#003d66' }, { image: ONE_PX_PNG }],
    slides: [
      { image: ONE_PX_PNG, background: 0, frames: [title('One'), header('Deck'), num(1)] },
      { image: ONE_PX_PNG, background: 0, frames: [title('Two'), header('Deck'), num(2)] },
      { image: ONE_PX_PNG, background: 1, frames: [title('Three'), num(3)] },
    ],
  });
  const open = async () => {
    const zip = await JSZip.loadAsync(await writePptx(JSZip, deck(), 'nodebuffer'));
    const text = (n) => zip.file(n).async('string');
    return { zip, text };
  };
  const names = (xml) => [...xml.matchAll(/<p:cNvPr id="\d+" name="([^"]*)"/g)].map((m) => m[1]);

  test('each shared background is written once, on a layout, and the slides point at layouts', async () => {
    const { zip, text } = await open();
    const layouts = Object.keys(zip.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n));
    const withBg = [];
    for (const n of layouts) if (/<p:cSld name="Layout \d+"/.test(await text(n))) withBg.push(await text(n));
    assert.ok(withBg.every((x) => /<p:bg>/.test(x)));
    assert.equal(withBg.length, 2, 'one per background, none per slide');
    assert.ok(withBg.some((x) => /<a:srgbClr val="003D66"\/>/.test(x)), 'a flat color is a solid fill');
    assert.ok(withBg.some((x) => /<a:blip /.test(x)), 'a picture background is an image fill');
    for (let i = 1; i <= 3; i++) assert.doesNotMatch(await text(`ppt/slides/slide${i}.xml`), /<p:bg>/, 'the slide itself paints no background');
  });

  test('a title is the slide title placeholder, drawn where the browser drew it, with no stray empty placeholders', async () => {
    const { text } = await open();
    const xml = await text('ppt/slides/slide1.xml');
    assert.match(xml, /<p:ph type="title"\/>/);
    assert.equal((xml.match(/type="title"/g) || []).length, 1, 'one title, not the layout copy as well');
    assert.doesNotMatch(xml, /hasCustomPrompt/);
    assert.ok(names(xml).includes('Title 1'));
    assert.doesNotMatch(xml, /calco-/, 'no tag leaks into the file');
  });

  test('a header and page number two slides share live on the layout; a lone page number is a slide-number field', async () => {
    const { text } = await open();
    const s1 = await text('ppt/slides/slide1.xml');
    assert.ok(!names(s1).includes('Header 1'), 'the header moved to the layout');
    assert.match(s1, /type="sldNum"/);
    const layout = (await text('ppt/slideLayouts/slideLayout1.xml')) + (await text('ppt/slideLayouts/slideLayout2.xml'));
    assert.match(layout, /name="Header"/);
    assert.match(layout, /<a:t>Deck<\/a:t>/);
    const s3 = await text('ppt/slides/slide3.xml');
    assert.match(s3, /<a:fld [^>]*type="slidenum">/, 'unshared number is still a field');
    assert.ok(names(s3).includes('Slide number 3'));
  });

  test('a page number that is not the slide position stays text, so a split run keeps its printed number', async () => {
    const d = deck();
    d.slides[2].frames[1] = frame([[{ text: '2.2', style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20, align: 'right' });
    const zip = await JSZip.loadAsync(await writePptx(JSZip, d, 'nodebuffer'));
    const xml = await zip.file('ppt/slides/slide3.xml').async('string');
    assert.match(xml, /<a:t>2\.2<\/a:t>/);
    assert.doesNotMatch(xml, /type="slidenum"/);
  });

  test('the layout\'s title placeholder sits where the slide\'s own title is, not a card\'s', async () => {
    const carded = frame([[{ text: 'In a card', style: style({ size: 40 }) }]], { role: 'title', x: 900, y: 600, w: 300, h: 60, group: 0 });
    const d = { width: 1280, height: 720, backgrounds: [{ color: '#003d66' }], slides: [{ image: ONE_PX_PNG, background: 0, frames: [carded, title('Real')], shapes: [{ kind: 'box', x: 880, y: 580, w: 340, h: 100, radii: [0, 0, 0, 0], fill: { color: '#ffffff', alpha: 1 }, group: 0 }] }] };
    const zip = await JSZip.loadAsync(await writePptx(JSZip, d, 'nodebuffer'));
    const layout = await zip.file('ppt/slideLayouts/slideLayout1.xml').async('string');
    const x = Number(layout.match(/<p:ph type="title"[^>]*\/>[\s\S]*?<a:off x="(\d+)"/)[1]);
    assert.ok(x < 100 * 9525, `the placeholder is at x=${x / 9525}px, near the real title at 64px`);
  });

  test('the slide content picture is locked against moving and resizing', async () => {
    const { text } = await open();
    assert.match(await text('ppt/slides/slide1.xml'), /<a:picLocks noChangeAspect="1" noMove="1" noResize="1"\/>/);
  });

  test('a deck with no roles and no backgrounds is written as before: no layouts, no lock', async () => {
    const plain = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'Hi', style: style() }]])] }] };
    const zip = await JSZip.loadAsync(await writePptx(JSZip, plain, 'nodebuffer'));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.doesNotMatch(xml, /noMove/);
    assert.equal(Object.keys(zip.files).filter((n) => /slideLayout\d+\.xml$/.test(n)).length, 1);
  });
});

describe('calco pptx — every master has its own theme', () => {
  // PowerPoint refuses ("Sorry, PowerPoint can't read") a package whose slide master and notes master share
  // one theme part once p:notesMasterIdLst is in its schema position. PptxGenJS 3.12 wrote exactly that.
  const deck = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'Hi', style: style() }]])], notes: 'Say this' }] };
  const themeOf = async (zip, rels) => {
    const xml = await zip.file(rels).async('string');
    return xml.match(/Type="[^"]*\/theme"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/theme"/).slice(1).find(Boolean);
  };
  const check = async (zip) => {
    const slide = await themeOf(zip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels');
    const notes = await themeOf(zip, 'ppt/notesMasters/_rels/notesMaster1.xml.rels');
    assert.notEqual(slide, notes, 'the notes master must not share the slide master theme');
    assert.ok(zip.file(`ppt/theme/${notes.split('/').pop()}`), 'the notes theme part exists');
    const types = await zip.file('[Content_Types].xml').async('string');
    assert.match(types, new RegExp(`PartName="/ppt/theme/${notes.split('/').pop()}"`), 'and has a content type');
    const pres = await zip.file('ppt/presentation.xml').async('string');
    assert.ok(pres.indexOf('<p:notesMasterIdLst>') < pres.indexOf('<p:sldIdLst>'), 'the schema order is kept');
  };

  test('the editable writer gives the notes master a theme of its own', async () => {
    await check(await JSZip.loadAsync(await writePptx(JSZip, deck, 'nodebuffer')));
  });

  test('the picture-only package (no frames, no layouts) does too', async () => {
    const pictures = { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [], notes: 'Say this' }] };
    await check(await JSZip.loadAsync(await writePptx(JSZip, pictures, 'nodebuffer')));
  });
});

describe('calco pptx — media are named by what their bytes are', () => {
  // PptxGenJS 3.12 wrote a layout's background image as <layout>-image-1.png whatever it held.
  test('a JPEG layout background is a .jpeg part, and its relationship follows the rename', async () => {
    const deck = {
      width: 1280,
      height: 720,
      backgrounds: [{ image: ONE_PX_JPEG }],
      slides: [{ image: ONE_PX_PNG, background: 0, frames: [frame([[{ text: 'Hi', style: style() }]], { role: 'title' })] }],
    };
    const zip = await JSZip.loadAsync(await writePptx(JSZip, deck, 'nodebuffer'));
    const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/[^/]+\.\w+$/.test(n));
    const jpeg = media.filter((n) => /\.jpe?g$/.test(n));
    assert.equal(jpeg.length, 1, 'the background is a .jpeg');
    assert.deepEqual(media.filter((n) => /\.png$/.test(n)).length, 1, 'the slide picture stays a .png');
    for (const n of media) {
      const head = await zip.file(n).async('uint8array');
      const isJpeg = head[0] === 0xff && head[1] === 0xd8;
      assert.equal(/\.jpe?g$/.test(n), isJpeg, `${n} is named by its bytes`);
    }
    const rels = (await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith('.rels')).map((n) => zip.file(n).async('string')))).join('');
    assert.match(rels, new RegExp(jpeg[0].split('/').pop().replace('.', '\\.')), 'a relationship names the renamed part');
  });
});

describe('calco pptx — a text highlight', () => {
  test('a highlighted run writes a:highlight with the color', async () => {
    const JSZip = require('jszip');
    const { writePptx } = require('@laticent/calco');
    const { ONE_PX_PNG, style, frame } = require('./_fixtures');
    const lit = { ...style(), highlight: '#e6f0f5' };
    const bytes = await writePptx(JSZip, { width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'code', style: lit }]])] }] }, 'nodebuffer');
    const xml = await (await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml').async('string');
    assert.match(xml, /<a:highlight><a:srgbClr val="E6F0F5"\/><\/a:highlight>/);
  });
});

describe('calco pptx — unique shape ids', () => {
  test('every shape on a slide or layout has its own id, the page-number placeholder included', async () => {
    const zip = await JSZip.loadAsync(await writePptx(JSZip, require('./_rich-deck')(), 'nodebuffer'));
    for (const n of Object.keys(zip.files).filter((x) => /^ppt\/(slides|slideLayouts)\/[^/]+\.xml$/.test(x))) {
      const ids = [...(await zip.file(n).async('string')).matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, n);
    }
  });
});
