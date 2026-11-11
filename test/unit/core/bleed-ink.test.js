/**
 * A `bleed` slide picks its ink from its photo (lib/core/bleed-ink.mjs), and its two hosts write it in: the CLI before its page
 * renders (lib/export/bleed-ink-stamp.js) and the Export-to-Marp bundle's Markdown (lib/export/marp-bleed-ink.js). The pixel
 * reading is each host's; these tests hand in pixels and hold the decision and the rewrite.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const ink = require('../../../lib/core/bleed-ink.js');
const { stampBleedInk } = require('../../../lib/export/bleed-ink-stamp.js');
const { bleedInkSlides, withBleedInk, bakeBleedInk } = require('../../../lib/export/marp-bleed-ink.js');

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
  });

  test('light ink is the theme\'s dark mode, dark ink its light mode, and any other mode class goes', () => {
    assert.deepEqual(ink.classesWithInk('content bleed form', 'light'), ['content', 'bleed', 'form', 'dark']);
    assert.deepEqual(ink.classesWithInk('content dark bleed', 'dark'), ['content', 'bleed', 'light']);
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
    assert.match(await stampBleedInk(html, host(DAY)), /class="content bleed light"/);
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

  test('the slides that pick their ink, and only those', () => {
    assert.deepEqual(bleedInkSlides(md).map((s) => s.url), ['assets/p.jpg', 'assets/r.jpg']);
  });

  test('the mode joins the slide\'s own `_class`, or a spot `_class` holds the carried class plus the mode', () => {
    const out = withBleedInk(md, new Map([['assets/p.jpg', 'light'], ['assets/r.jpg', 'dark']]));
    assert.match(out, /<!-- _class: content bleed dark -->\n## A/);
    assert.match(out, /<!-- _class: content dark bleed -->\n## B/, 'the author\'s own dark is untouched');
    assert.match(out, /<!-- _class: content bleed light -->\n\n\n<!-- class: content bleed -->\n## C/);
  });

  test('bakeBleedInk samples each photo once and writes its ink; a photo it cannot read changes nothing', async () => {
    let reads = 0;
    const out = await bakeBleedInk(md, {
      readPhoto: (url) => { reads++; return url === 'assets/p.jpg' ? { bytes: Buffer.from('x'), mime: 'image/jpeg', width: 1600, height: 900 } : null; },
      samplePixels: async () => solid(DUSK),
    });
    assert.equal(reads, 2);
    assert.match(out, /<!-- _class: content bleed dark -->\n## A/);
    assert.doesNotMatch(out, /_class: content bleed (?:light|dark) -->\n\n\n<!-- class/);
  });
});
