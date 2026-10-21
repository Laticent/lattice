/**
 * Unit: Calco's ODP writer (docs/src/lib/calco/odp.ts), both modes. Builds the package
 * from tiny PNGs and hand-made frames — no browser, no `soffice`. Asserts the package rules
 * LibreOffice enforces (a STORED first `mimetype`, a complete manifest, an `<office:styles>`
 * element), one page and picture per slide, alt text, notes, and for editable slides the
 * text boxes, their styles and the embedded fonts. LibreOffice's rendering of the result is
 * checked by test/integration/export/export-formats.test.js and the decision note's
 * measurements (2026-10-06-calco-office-export-library.md).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { buildOdp, writeOdp, odpPageSize, ODP_MIMETYPE } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, ttf } = require('./_fixtures');

const picture = (n, extra = {}) => ({ width: 1280, height: 720, slides: Array.from({ length: n }, () => ({ image: ONE_PX_PNG, frames: [] })), ...extra });

async function open(deck) {
  const bytes = Buffer.from(await writeOdp(JSZip, deck, 'nodebuffer'));
  return { bytes, zip: await JSZip.loadAsync(bytes) };
}
const read = (zip, name) => zip.file(name).async('string');

describe('calco odp — package', () => {
  test('mimetype is the first entry, STORED, and the manifest lists every part', async () => {
    const { bytes, zip } = await open(picture(2));
    assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
    assert.equal(bytes.readUInt16LE(8), 0, 'mimetype must be stored, not deflated');
    assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
    assert.equal(bytes.subarray(38, 38 + ODP_MIMETYPE.length).toString(), ODP_MIMETYPE);
    const names = Object.keys(zip.files);
    assert.ok(!names.some((n) => n.endsWith('/')), `no directory entries: ${names}`);
    const manifest = await read(zip, 'META-INF/manifest.xml');
    for (const part of names.filter((n) => n !== 'mimetype' && n !== 'META-INF/manifest.xml')) {
      assert.ok(manifest.includes(`manifest:full-path="${part}"`), `${part} is in the manifest`);
    }
  });

  test('styles.xml carries <office:styles>, without which LibreOffice ignores the page size', async () => {
    const { zip } = await open(picture(1));
    const styles = await read(zip, 'styles.xml');
    assert.match(styles, /<office:styles>/);
    assert.match(styles, /fo:page-width="33.867cm" fo:page-height="19.05cm"/);
  });

  test('one page with one full-bleed picture per slide; alt text falls back to "Slide N"', async () => {
    const deck = picture(3);
    deck.slides[0].description = 'A chart of "Q3" <revenue>';
    const { zip } = await open(deck);
    const content = await read(zip, 'content.xml');
    assert.equal(content.match(/<draw:page /g).length, 3);
    assert.equal(content.match(/<draw:image /g).length, 3);
    const descs = [...content.matchAll(/<svg:desc>([^<]*)<\/svg:desc>/g)].map((m) => m[1]);
    assert.deepEqual(descs, ['A chart of &quot;Q3&quot; &lt;revenue&gt;', 'Slide 2', 'Slide 3']);
  });

  test('notes land on the notes page, a paragraph per line; empty notes add none', async () => {
    const deck = picture(2);
    deck.slides[0].notes = 'Open warm\nthen R&D';
    const { zip } = await open(deck);
    const content = await read(zip, 'content.xml');
    assert.equal(content.match(/<presentation:notes>/g).length, 1);
    assert.match(content, /<text:p>Open warm<\/text:p><text:p>then R&amp;D<\/text:p>/);
  });

  test('meta carries title and provenance, escaped; forbidden XML characters are dropped', async () => {
    const deck = picture(1, { title: ' Q3 & <plan> ', company: 'Lattice · indaco' });
    deck.slides[0].notes = 'bell\u0007here';
    const { zip } = await open(deck);
    const meta = await read(zip, 'meta.xml');
    assert.match(meta, /<dc:title>Q3 &amp; &lt;plan&gt;<\/dc:title>/);
    assert.match(meta, /meta:name="Company">Lattice · indaco</);
    assert.match(await read(zip, 'content.xml'), /<text:p>bellhere<\/text:p>/);
  });

  test('a picture-only deck embeds no fonts and adds no text boxes', async () => {
    const { zip } = await open(picture(1));
    assert.ok(!Object.keys(zip.files).some((n) => n.startsWith('Fonts/')));
    assert.doesNotMatch(await read(zip, 'content.xml'), /<draw:text-box>/);
  });

  test('rejects an empty deck and a slide with no image', () => {
    assert.throws(() => buildOdp(JSZip, { width: 1280, height: 720, slides: [] }), /no slides/);
    assert.throws(() => buildOdp(JSZip, { width: 1280, height: 720, slides: [{ image: new Uint8Array(), frames: [] }] }), /no image/);
  });

  test('odpPageSize keeps the deck aspect at a 33.867cm longest edge', () => {
    assert.deepEqual(odpPageSize(1280, 720), { w: 33.867, h: 19.05 });
    assert.deepEqual(odpPageSize(1080, 1920), { w: 19.05, h: 33.867 });
    assert.deepEqual(odpPageSize(0, 0), { w: 33.867, h: 19.05 });
  });
});

describe('calco odp — editable text', () => {
  test('a frame becomes a text box with one span per run and a line break per line', async () => {
    const deck = picture(1);
    deck.slides[0].frames = [frame([[{ text: 'Revenue ', style: style() }, { text: 'grew', style: style({ weight: 700 }) }], [{ text: 'by  40%', style: style() }]])];
    const { zip } = await open(deck);
    const content = await read(zip, 'content.xml');
    assert.equal(content.match(/<draw:text-box>/g).length, 1);
    assert.match(content, /Revenue <\/text:span><text:span text:style-name="T2">grew<\/text:span><text:line-break\/>/);
    assert.match(content, /by <text:s text:c="1"\/>40%/, 'a run of spaces survives');
  });

  test('styles carry size, weight, slant, color, letter-spacing, transform and decoration', async () => {
    const deck = picture(1);
    deck.slides[0].frames = [frame([[{ text: 'Label', style: style({ size: 16, weight: 600, italic: true, letterSpacing: 2.4, transform: 'uppercase', underline: true, strike: true }) }]])];
    const { zip } = await open(deck);
    const content = await read(zip, 'content.xml');
    // 16px at 33.867cm per 1280px = 12pt.
    assert.match(content, /fo:font-size="12.00pt"/);
    assert.match(content, /fo:font-weight="600"/);
    assert.match(content, /fo:font-style="italic"/);
    assert.match(content, /fo:letter-spacing="0.0635cm"/);
    assert.match(content, /fo:text-transform="uppercase"/);
    assert.match(content, /style:text-underline-style="solid"/);
    assert.match(content, /style:text-line-through-style="solid"/);
  });

  test('translucent text prefers its blended color; opacity only when there is none', async () => {
    const deck = picture(1);
    deck.slides[0].frames = [
      frame([[{ text: 'flat', style: style({ alpha: 0.76, color: '#ffffff', flatColor: '#c2cad3', letterSpacing: 2 }) }]]),
      frame([[{ text: 'loose', style: style({ alpha: 0.5, color: '#ffffff' }) }]], { y: 400 }),
    ];
    const content = await read((await open(deck)).zip, 'content.xml');
    assert.match(content, /fo:color="#c2cad3"(?! loext)/, 'the blended color, no opacity');
    assert.match(content, /fo:color="#ffffff" loext:opacity="50%"/);
  });

  test('alignment maps to start / center / end', async () => {
    const deck = picture(1);
    deck.slides[0].frames = ['left', 'center', 'right'].map((align, i) => frame([[{ text: align, style: style() }]], { align, y: 100 + i * 100 }));
    const content = await read((await open(deck)).zip, 'content.xml');
    for (const a of ['start', 'center', 'end']) assert.match(content, new RegExp(`fo:text-align="${a}"`));
  });

  test('fonts a run uses are embedded, each as a family of its own, and listed in the manifest', async () => {
    const deck = picture(1);
    const bytes = await ttf('outfit-400');
    deck.fonts = [
      { family: 'Outfit', weight: 400, italic: false, bytes },
      { family: 'Outfit', weight: 700, italic: false, bytes },
      { family: 'Unused Face', weight: 400, italic: false, bytes },
    ];
    deck.slides[0].frames = [frame([[{ text: 'a', style: style() }, { text: 'b', style: style({ weight: 700 }) }]])];
    const { zip } = await open(deck);
    const fonts = Object.keys(zip.files).filter((n) => n.startsWith('Fonts/'));
    assert.equal(fonts.length, 2, 'only faces a run draws with');
    const content = await read(zip, 'content.xml');
    assert.match(content, /style:name="Outfit" svg:font-family="'Outfit'" svg:font-weight="normal"/);
    assert.match(content, /style:name="Outfit Bold" svg:font-family="'Outfit Bold'" svg:font-weight="normal"/);
    assert.match(content, /style:font-name="Outfit Bold"[^/]*fo:font-weight="normal"/, 'the face is the weight: no synthetic bold');
    // iOS matches by the names INSIDE the font, so the file carries the declared family.
    const { familyNameOf } = require('@laticent/calco');
    const families = await Promise.all(fonts.map(async (f) => familyNameOf(new Uint8Array(await zip.file(f).async('uint8array')))));
    assert.deepEqual(families.sort(), ['Outfit', 'Outfit Bold']);
    const manifest = await read(zip, 'META-INF/manifest.xml');
    for (const f of fonts) assert.match(manifest, new RegExp(`full-path="${f}" manifest:media-type="application/x-font-ttf"`));
    assert.match(await read(zip, 'settings.xml'), /"EmbedFonts" config:type="boolean">true/);
  });

  test('small caps become fo:font-variant', async () => {
    const deck = picture(1);
    deck.slides[0].frames = [frame([[{ text: 'Pain', style: style({ smallCaps: true }) }]])];
    assert.match(await read((await open(deck)).zip, 'content.xml'), /fo:font-variant="small-caps"/);
  });

  test('a run with no embedded face names its family instead', async () => {
    const deck = picture(1);
    deck.slides[0].frames = [frame([[{ text: 'x', style: style({ family: 'Georgia' }) }]])];
    assert.match(await read((await open(deck)).zip, 'content.xml'), /fo:font-family="Georgia"/);
  });
});

describe('calco odp — layouts, roles and the locked picture', () => {
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

  test('a master page per layout carries the background; a picture background is stored once and referenced by name', async () => {
    const { zip } = await open(deck());
    const styles = await read(zip, 'styles.xml');
    assert.equal((styles.match(/<style:master-page /g) || []).length, 2);
    assert.match(styles, /draw:fill="solid" draw:fill-color="#003d66"/);
    assert.match(styles, /<draw:fill-image draw:name="Bg1" xlink:href="Pictures\/background002\.png"/);
    assert.match(styles, /draw:fill="bitmap" draw:fill-image-name="Bg1"/);
    assert.ok(zip.file('Pictures/background002.png'), 'the picture is in the package');
    assert.equal(zip.file('Pictures/background001.png'), null, 'a flat color has no picture');
    assert.match(await read(zip, 'META-INF/manifest.xml'), /Pictures\/background002\.png/);
  });

  test('slides name their master page; shared chrome is on the master as a page-number field and a header', async () => {
    const { zip } = await open(deck());
    const content = await read(zip, 'content.xml');
    assert.match(content, /draw:master-page-name="Layout1"/);
    assert.match(content, /draw:master-page-name="Layout2"/);
    const styles = await read(zip, 'styles.xml');
    assert.match(styles, /<text:page-number text:select-page="current">/);
    assert.match(styles, /draw:name="Header"/);
    assert.doesNotMatch(content, /draw:name="Header 1"/, 'the header is not repeated on the slide');
    assert.match(content, /<text:page-number text:select-page="current">3<\/text:page-number>/, 'an unshared number is still a field');
  });

  test('a title is a presentation title object, and the content picture is protected', async () => {
    const { zip } = await open(deck());
    const content = await read(zip, 'content.xml');
    assert.match(content, /presentation:class="title"/);
    assert.match(content, /draw:name="Title 1"/);
    assert.match(content, /style:name="grPic" style:family="graphic"><style:graphic-properties style:protect="position size"\/>/);
    assert.match(content, /<draw:frame draw:style-name="grPic" draw:name="Slide 1"/);
    // Master-page objects look their styles up in styles.xml.
    assert.match(await read(zip, 'styles.xml'), /style:name="gr1" style:family="graphic"/);
  });

  test('picture mode (no roles, no backgrounds) is unchanged: the one Default master, no protection', async () => {
    const { zip } = await open(picture(2));
    const styles = await read(zip, 'styles.xml');
    assert.match(styles, /<style:master-page style:name="Default"/);
    assert.doesNotMatch(await read(zip, 'content.xml'), /protect/);
    assert.doesNotMatch(styles, /style:name="gr1"/, 'styles.xml gains nothing in picture mode');
  });

  test('a page number that is not the slide position stays text, so a split run keeps its printed number', async () => {
    const d = deck();
    d.slides[1].frames[2] = frame([[{ text: '2.2', style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20, align: 'right' });
    const { zip } = await open(d);
    const content = await read(zip, 'content.xml');
    assert.match(content, /<text:span[^>]*>2\.2<\/text:span>/);
    assert.doesNotMatch(content, /<text:page-number[^>]*>2\.2</);
  });
});

describe('calco odp — a text highlight', () => {
  test('a highlighted run gets its own character style with a background; the same run without one does not share it', async () => {
    const plain = style();
    const lit = { ...style(), highlight: '#e6f0f5' };
    const { zip } = await open({ width: 1280, height: 720, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'a ', style: plain }, { text: 'code', style: lit }]])] }] });
    const content = await read(zip, 'content.xml');
    assert.equal((content.match(/fo:background-color="#e6f0f5"/g) || []).length, 1, 'one style carries the background');
    const spans = [...content.matchAll(/<text:span text:style-name="(T\d+)">([^<]*)<\/text:span>/g)];
    const styleOf = (text) => spans.find((m) => m[2].includes(text))[1];
    assert.notEqual(styleOf('a'), styleOf('code'));
  });
});
