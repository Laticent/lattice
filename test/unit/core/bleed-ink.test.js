/**
 * A `bleed` slide picks its ink from its photo (lib/core/bleed-ink.mjs), and its two hosts write it in: the CLI before its page
 * renders (lib/export/bleed-ink-stamp.js) and the Export-to-Marp bundle's Markdown (lib/export/marp-bleed-ink.js). The pixel
 * reading is each host's; these tests hand in pixels and hold the decision and the rewrite.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ink = require('../../../lib/core/bleed-ink.js');
const { stampBleedInk } = require('../../../lib/export/bleed-ink-stamp.js');
const { bleedInkSlides, withBleedInk, bakeBleedInk, keyOf } = require('../../../lib/export/marp-bleed-ink.js');

/** RGBA pixels of one solid color. */
const solid = (rgb, n = 16) => Array.from({ length: n }, () => [...rgb, 255]).flat();
const DUSK = [40, 52, 80];
const DAY = [235, 230, 210];

describe('the decision (lib/core/bleed-ink.mjs)', () => {
  test('a dark photo takes light ink, a light photo dark ink', () => {
    assert.equal(ink.bleedInkFor(DUSK), 'light');
    assert.equal(ink.bleedInkFor(DAY), 'dark');
    assert.equal(ink.bleedInkOfPixels(solid(DUSK)), 'light');
    assert.equal(ink.bleedInkOfPixels([0, 0, 0, 0]), null, 'no opaque pixel, no decision');
  });

  test('only a bleed slide whose own class names no color mode picks its ink', () => {
    assert.equal(ink.picksBleedInk('content bleed', 'content bleed'), true);
    assert.equal(ink.picksBleedInk('content bleed dark', 'content bleed'), true, 'a deck-wide mode is not the author\'s word about this photo');
    assert.equal(ink.picksBleedInk('content bleed dark', 'content dark bleed'), false, 'the author\'s own dark wins');
    assert.equal(ink.picksBleedInk('content bleed light', 'content bleed light'), false, 'the author\'s own light wins');
    assert.equal(ink.picksBleedInk('collage bleed', 'collage bleed'), false);
    assert.equal(ink.picksBleedInk('image bleed', ''), false);
    assert.equal(ink.picksBleedInk('content', ''), false);
    assert.equal(ink.picksBleedInk('content bleed', 'content bleed color-light'), false, 'any mode token of the author\'s wins');
    assert.equal(ink.picksBleedInk('content bleed print', 'content bleed'), false, 'a print deck keeps print\'s ink');
  });

  test('light ink is the theme\'s dark mode, dark ink its color-light mode, and any other mode class goes', () => {
    assert.deepEqual(ink.classesWithInk('content bleed form', 'light'), ['content', 'bleed', 'form', 'dark']);
    assert.deepEqual(ink.classesWithInk('content dark bleed', 'dark'), ['content', 'bleed', 'color-light']);
    assert.deepEqual(ink.classesWithInk('content bleed color-light', 'light'), ['content', 'bleed', 'dark'], 'a deck\'s color-light goes, or it would win on source order');
    assert.deepEqual(ink.classesWithInk('content bleed color-system', 'dark'), ['content', 'bleed', 'color-light']);
    assert.deepEqual(ink.classesWithInk('divider light bleed', 'light'), ['divider', 'light', 'bleed', 'dark'], 'a bare light may be the layout\'s variant: it stays');
  });

  test('a layout that centers its words reads the middle of the photo', () => {
    assert.deepEqual(ink.bleedBandFor('content bleed'), { top: 0, height: ink.BLEED_BAND });
    const mid = ink.bleedBandFor('divider bleed');
    assert.equal(mid.height, ink.BLEED_BAND);
    assert.ok(Math.abs(mid.top + mid.height / 2 - 0.5) < 1e-9, 'centered on the slide');
    const r = ink.bleedSampleRect(1600, 900, 16, 9, mid);
    assert.equal(Math.round(r.y), Math.round(900 * mid.top));
  });

  test('the sample is the heading band, as cover cropping puts the photo on the slide', () => {
    // A 3200 x 1200 panorama on a 16:9 slide: cropped at the sides, the full height shown, the band its top 45%.
    const r = ink.bleedSampleRect(3200, 1200, 16, 9);
    assert.equal(Math.round(r.y), 0);
    assert.equal(Math.round(r.h), Math.round(1200 * ink.BLEED_BAND));
    assert.ok(r.x > 0 && r.w < 3200, 'the sides are cropped away');
    assert.equal(ink.bleedSampleRect(0, 10), null);
  });
});

describe('the CLI writes the ink before its page renders (lib/export/bleed-ink-stamp.js)', () => {
  const host = (rgb) => ({
    slideW: 16,
    slideH: 9,
    readPhoto: (url) => (url.startsWith('file:') ? { bytes: Buffer.from('x'), mime: 'image/jpeg', width: 1600, height: 900 } : null),
    samplePixels: async () => solid(rgb),
  });
  const panel = (url) => `<div class="lattice-bg lattice-bg-full" data-lattice-media="image" style="background-image:url('${url}')"></div>`;

  test('a bleed slide over a dark photo gets the dark mode class and a data-bleed-ink stamp', async () => {
    const html = `<section data-class="content bleed" class="content bleed form"><h2>T</h2><div class="cell-stage">${panel('file:///d/p.jpg')}</div></section>`;
    const out = await stampBleedInk(html, host(DUSK));
    assert.match(out, /<section data-bleed-ink="light"[^>]*class="content bleed form dark"/);
  });

  test('over a light photo the slide takes the light mode, replacing a deck-wide dark', async () => {
    const html = `<section data-class="content bleed" class="content bleed dark">${panel('file:///d/p.jpg')}</section>`;
    assert.match(await stampBleedInk(html, host(DAY)), /class="content bleed color-light"/);
  });

  test('the author\'s own mode, a web photo and a slide that is not bleed are left alone', async () => {
    const html = [
      `<section data-class="content dark bleed" class="content dark bleed">${panel('file:///d/p.jpg')}</section>`,
      `<section data-class="content bleed" class="content bleed">${panel('https://x.test/p.jpg')}</section>`,
      `<section data-class="content" class="content">${panel('file:///d/p.jpg')}</section>`,
    ].join('');
    assert.equal(await stampBleedInk(html, host(DAY)), html);
  });
});

describe('Export-to-Marp writes the ink into the slide\'s own class (lib/export/marp-bleed-ink.js)', () => {
  const md = [
    '---', 'theme: indaco', '---', '',
    '<!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', '', '---', '',
    '<!-- _class: content dark bleed -->', '## B', '', '![bg](assets/q.jpg)', '', '---', '',
    '<!-- class: content bleed -->', '## C', '', '![bg](assets/r.jpg)', '',
  ].join('\n');
  const inks = (pairs) => new Map(pairs.map(([cls, url, v]) => [keyOf(cls.split(' '), url), v]));

  test('the slides that pick their ink, and only those', () => {
    assert.deepEqual(bleedInkSlides(md).map((s) => s.url), ['assets/p.jpg', 'assets/r.jpg']);
  });

  test('the mode joins the slide\'s own `_class`, or a spot `_class` holds the carried class plus the mode', () => {
    const out = withBleedInk(md, inks([['content bleed', 'assets/p.jpg', 'light'], ['content bleed', 'assets/r.jpg', 'dark']]));
    assert.match(out, /<!-- _class: content bleed dark -->\n## A/);
    assert.match(out, /<!-- _class: content dark bleed -->\n## B/, 'the author\'s own dark is untouched');
    assert.match(out, /<!-- _class: content bleed color-light -->\n\n<!-- class: content bleed -->\n## C/);
  });

  test('a carried mode is the author\'s', () => {
    const carried = ['<!-- class: content bleed dark -->', '## A', '', '![bg](assets/p.jpg)', ''].join('\n');
    assert.deepEqual(bleedInkSlides(carried), [], 'a carried dark is as much the author\'s choice as a spot one');
  });

  // A bundle's Lattice keys live in its settings block, directly under the front matter (lib/export/marp-bundle.js).
  const bundle = (settings, body) => ['---', 'marp: true', '---', '<script type="application/lattice-settings">', ...settings, '</script>', '', ...body].join('\n');

  test('a deck-wide bleed in the settings block is seen, and a new spot class goes BELOW the block so it still folds', () => {
    const { foldSettingsBlock } = require('../../../lib/core/settings-block-fold.js');
    const md = bundle(['class: bleed', 'color-mode: dark'], ['## A', '', '![bg](assets/p.jpg)', '']);
    const out = withBleedInk(md, inks([['bleed', 'assets/p.jpg', 'dark']]));
    assert.match(out, /<\/script>\n\n<!-- _class: color-light -->\n\n## A/, 'the slide\'s own mode, under the block; the runtime adds the deck\'s bleed');
    assert.notEqual(foldSettingsBlock(out), out, 'the block still folds: the deck keeps its settings on re-import');
    const carried = bundle(['color-mode: dark'], ['<!-- class: bleed -->', '## A', '', '![bg](assets/p.jpg)', '']);
    const out2 = withBleedInk(carried, inks([['bleed', 'assets/p.jpg', 'dark']]));
    assert.notEqual(foldSettingsBlock(out2), out2, 'a carried class on slide 1 does not push the spot class above the block');
  });

  test('a print deck, wherever it says so, is left alone', () => {
    const md = bundle(['color-mode: print'], ['<!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', '']);
    assert.deepEqual(bleedInkSlides(md), []);
  });

  test('a deck-wide color-light is evicted by the ink, not left beside it', () => {
    const md = bundle(['class: color-light'], ['<!-- _class: content bleed color-system -->', '## A', '', '![bg](assets/p.jpg)', '']);
    assert.deepEqual(bleedInkSlides(md), [], 'the author named a mode on the slide');
    const md2 = ['<!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', ''].join('\n');
    assert.match(withBleedInk(md2, inks([['content bleed', 'assets/p.jpg', 'light']])), /_class: content bleed dark -->/);
  });

  test('a directive or a photo inside a code fence is the reader\'s example, never the slide\'s', () => {
    const fenced = ['<!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', '', '```html', '<!-- _class: content bleed -->', '![bg](assets/q.jpg)', '```', ''].join('\n');
    const out = withBleedInk(fenced, inks([['content bleed', 'assets/p.jpg', 'light']]));
    assert.ok(out.startsWith('<!-- _class: content bleed dark -->'), 'the real directive takes the ink');
    assert.ok(out.includes('```html\n<!-- _class: content bleed -->\n![bg](assets/q.jpg)\n```'), 'the example is untouched');
    const onlyFenced = ['<!-- _class: content bleed -->', '## A', '', '```md', '![bg](assets/q.jpg)', '```', ''].join('\n');
    assert.deepEqual(bleedInkSlides(onlyFenced), [], 'a photo in an example is no photo');
  });

  test('a `_class` in a comment holding several directives: only its line changes', () => {
    const md = ['<!--', '_class: content bleed', '_paginate: false', '-->', '## A', '', '![bg](assets/p.jpg)', ''].join('\n');
    const out = withBleedInk(md, inks([['content bleed', 'assets/p.jpg', 'light']]));
    assert.equal(out, md.replace('_class: content bleed', '_class: content bleed dark'));
  });

  test('two comments back to back are both read', () => {
    const md = ['<!-- _paginate: false --><!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', ''].join('\n');
    const out = withBleedInk(md, inks([['content bleed', 'assets/p.jpg', 'light']]));
    assert.equal(out, md.replace('<!-- _class: content bleed -->', '<!-- _class: content bleed dark -->'));
  });

  test('only the `_class` comment changes when another directive shares its line, and CRLF stays CRLF', () => {
    const shared = ['<!-- _paginate: false --> <!-- _class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', ''].join('\r\n');
    const out = withBleedInk(shared, inks([['content bleed', 'assets/p.jpg', 'light']]));
    assert.equal(out, shared.replace('<!-- _class: content bleed -->', '<!-- _class: content bleed dark -->'));
    const bare = ['<!-- class: content bleed -->', '## A', '', '![bg](assets/p.jpg)', ''].join('\r\n');
    const out2 = withBleedInk(bare, inks([['content bleed', 'assets/p.jpg', 'dark']]));
    assert.ok(out2.startsWith('<!-- _class: content bleed color-light -->\r\n\r\n'), JSON.stringify(out2.slice(0, 60)));
    assert.doesNotMatch(out2.replace(/\r\n/g, ''), /\n/, 'no bare LF slipped in');
  });

  test('bakeBleedInk samples each photo once per band and writes its ink; a photo it cannot read changes nothing', async () => {
    let reads = 0;
    const out = await bakeBleedInk(md, {
      readPhoto: (url) => { reads++; return url === 'assets/p.jpg' ? { bytes: Buffer.from('x'), mime: 'image/jpeg', width: 1600, height: 900 } : null; },
      samplePixels: async () => solid(DUSK),
    });
    assert.equal(reads, 2);
    assert.match(out, /<!-- _class: content bleed dark -->\n## A/);
    assert.doesNotMatch(out, /_class: content bleed (?:color-light|dark) -->\n\n<!-- class/);
  });
});
