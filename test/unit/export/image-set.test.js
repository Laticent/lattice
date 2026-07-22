/**
 * Unit: the shared image-set contract (lib/export/image-set.js).
 *
 * Exercises the PURE surface — config normalization, size-preset math, naming, the
 * manifest, and the file-plan assembly — with tiny fake buffers. No Chromium, no
 * jszip, no DOM. The per-surface pixel capture (CLI puppeteer / Studio html-to-image)
 * is covered by the integration tier + the Studio export tests.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const IS = require('../../../lib/export/image-set');

describe('image-set: normalizeImageSetOptions', () => {
  test('empty input yields the high-fidelity defaults', () => {
    const o = IS.normalizeImageSetOptions();
    assert.equal(o.format, 'png');
    assert.equal(o.size, 'max');
    assert.equal(o.thumbnails, true);
    assert.equal(o.extractSvg, true);
    assert.equal(o.thumbWidth, 480);
    assert.equal(o.mode, 'inherit');
    assert.equal(o.svgBackground, 'inherit');
  });

  test('unknown format / size / mode / background fall back to defaults, never throw', () => {
    const o = IS.normalizeImageSetOptions({ format: 'gif', size: 'huge', mode: 'sepia', svgBackground: 'plaid' });
    assert.equal(o.format, 'png');
    assert.equal(o.size, 'max');
    assert.equal(o.mode, 'inherit');
    assert.equal(o.svgBackground, 'inherit');
  });

  test('valid mode + svgBackground are preserved', () => {
    const o = IS.normalizeImageSetOptions({ mode: 'dark', svgBackground: 'dark' });
    assert.equal(o.mode, 'dark');
    assert.equal(o.svgBackground, 'dark');
    assert.equal(IS.normalizeImageSetOptions({ mode: 'print' }).mode, 'print');
  });

  test('valid lossy format + quality is preserved and clamped', () => {
    assert.equal(IS.normalizeImageSetOptions({ format: 'jpeg', quality: 80 }).quality, 80);
    assert.equal(IS.normalizeImageSetOptions({ format: 'webp', quality: 999 }).quality, 100);
    assert.equal(IS.normalizeImageSetOptions({ format: 'webp', quality: -5 }).quality, 1);
    assert.equal(IS.normalizeImageSetOptions({ quality: NaN }).quality, 92);
  });

  test('booleans honor explicit false', () => {
    const o = IS.normalizeImageSetOptions({ thumbnails: false, extractSvg: false });
    assert.equal(o.thumbnails, false);
    assert.equal(o.extractSvg, false);
  });

  test('thumbWidth is clamped into a sane range', () => {
    assert.equal(IS.normalizeImageSetOptions({ thumbWidth: 10 }).thumbWidth, 48);
    assert.equal(IS.normalizeImageSetOptions({ thumbWidth: 9999 }).thumbWidth, 2000);
  });
});

describe('image-set: resolveRasterScale', () => {
  test('max is fidelity-first, capped at the long-edge budget', () => {
    assert.equal(IS.resolveRasterScale('max', 1280, 720), 2);   // HD → 2×
    assert.equal(IS.resolveRasterScale('max', 3840, 2160), 1);  // 4K → 1× (no OOM)
  });
  test('fixed presets are literal multipliers', () => {
    assert.equal(IS.resolveRasterScale('2x', 1280, 720), 2);
    assert.equal(IS.resolveRasterScale('1x', 1280, 720), 1);
    assert.equal(IS.resolveRasterScale('half', 1280, 720), 0.5);
  });
  test('unknown preset behaves like max', () => {
    assert.equal(IS.resolveRasterScale('bogus', 1280, 720), 2);
  });
});

describe('image-set: svgBackgroundFill', () => {
  test('inherit → null; light/print → white; dark → dark literal', () => {
    assert.equal(IS.svgBackgroundFill('inherit'), null);
    assert.equal(IS.svgBackgroundFill('light'), '#ffffff');
    assert.equal(IS.svgBackgroundFill('dark'), '#111317');
    assert.equal(IS.svgBackgroundFill('print'), '#ffffff');
    assert.equal(IS.svgBackgroundFill('bogus'), null); // falls back to the default (inherit)
  });
});

describe('image-set: svgLookMode', () => {
  test('inherit → null (as slides); the rest → their render mode', () => {
    assert.equal(IS.svgLookMode('inherit'), null);
    assert.equal(IS.svgLookMode('light'), 'light');
    assert.equal(IS.svgLookMode('dark'), 'dark');
    assert.equal(IS.svgLookMode('print'), 'print');
    assert.equal(IS.svgLookMode('bogus'), null);
  });
});

describe('image-set: print is a valid svgBackground look', () => {
  test('normalize accepts print', () => {
    assert.equal(IS.normalizeImageSetOptions({ svgBackground: 'print' }).svgBackground, 'print');
  });
});

describe('image-set: resolveThumbScale', () => {
  test('shrinks to the target width, never upscales', () => {
    assert.equal(IS.resolveThumbScale(480, 1280), 480 / 1280);
    assert.equal(IS.resolveThumbScale(480, 320), 1); // slide already smaller than the thumb → 1×
  });
});

describe('image-set: naming', () => {
  test('padWidth grows with slide count', () => {
    assert.equal(IS.padWidth(5), 2);
    assert.equal(IS.padWidth(120), 3);
  });
  test('deckSlug is filesystem-safe and bounded', () => {
    assert.equal(IS.deckSlug('My Deck: Q3/Q4!'), 'My-Deck-Q3-Q4');
    assert.equal(IS.deckSlug(''), 'deck');
    assert.equal(IS.deckSlug('  '), 'deck');
  });
  test('entry names land in their folders with padded indices', () => {
    assert.equal(IS.slideEntryName('acme', 2, 12, 'png'), 'slides/acme-03.png');
    assert.equal(IS.thumbEntryName('acme', 2, 12, 'jpeg'), 'thumbnails/acme-03.jpeg');
    assert.equal(IS.assetEntryName('acme', 3, 0, 12), 'assets/acme-s03-c00.svg');
  });
});

describe('image-set: assembleImageSetPlan', () => {
  const img = (n) => new Uint8Array([n, n, n]);

  test('packs slides + thumbnails + assets + manifest under one root', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'Board Review',
      options: { format: 'png' },
      geom: { w: 1280, h: 720 },
      scale: 2,
      images: [img(1), img(2)],
      thumbs: [img(9), img(9)],
      svgs: [{ slide: 2, svg: '<svg/>', kind: 'chart' }],
      generator: 'unit',
    });
    const paths = plan.files.map((f) => f.path);
    assert.deepEqual(paths, [
      'slides/Board-Review-01.png',
      'slides/Board-Review-02.png',
      'thumbnails/Board-Review-01.png',
      'thumbnails/Board-Review-02.png',
      'assets/Board-Review-s02-c00.svg',
      'manifest.json',
    ]);
    assert.equal(plan.slug, 'Board-Review');
  });

  test('thumbnails omitted when disabled', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'd', options: { thumbnails: false }, images: [img(1)], thumbs: [img(2)],
    });
    assert.ok(!plan.files.some((f) => f.path.startsWith('thumbnails/')));
  });

  test('svg assets omitted when extractSvg is false', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'd', options: { extractSvg: false }, images: [img(1)], svgs: [{ slide: 1, svg: '<svg/>' }],
    });
    assert.ok(!plan.files.some((f) => f.path.startsWith('assets/')));
  });

  test('multiple assets on one slide get distinct running indices', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'd', images: [img(1)],
      svgs: [{ slide: 1, svg: '<svg id=a/>' }, { slide: 1, svg: '<svg id=b/>' }],
    });
    const assets = plan.files.filter((f) => f.path.startsWith('assets/')).map((f) => f.path);
    assert.deepEqual(assets, ['assets/d-s01-c00.svg', 'assets/d-s01-c01.svg']);
  });

  test('manifest counts + geometry are derived from inputs', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'd', options: { format: 'jpeg', quality: 70 }, geom: { w: 1280, h: 720 }, scale: 2,
      images: [img(1), img(2)], thumbs: [img(3), img(4)], svgs: [{ slide: 1, svg: '<svg/>' }],
    });
    const m = plan.manifest;
    assert.equal(m.kind, 'lattice-image-set');
    assert.equal(m.format, 'jpeg');
    assert.equal(m.lossy, true);
    assert.equal(m.quality, 70);
    assert.deepEqual(m.counts, { slides: 2, thumbnails: 2, assets: 1 });
    assert.deepEqual(m.pixel, { width: 2560, height: 1440, scale: 2 });
    assert.equal(m.colorMode, 'inherit');
    assert.equal(m.svgBackground, 'inherit');
    assert.equal(m.slides[0].thumbnail, 'thumbnails/d-01.jpeg');
    assert.equal(m.slides[1].image, 'slides/d-02.jpeg');
  });

  test('png manifest carries no quality', () => {
    const plan = IS.assembleImageSetPlan({ name: 'd', options: { format: 'png' }, images: [img(1)] });
    assert.equal(plan.manifest.quality, null);
  });

  test('empty image list is rejected', () => {
    assert.throws(() => IS.assembleImageSetPlan({ name: 'd', images: [] }), /no slide images/);
  });
});

describe('image-set: addPlanToZip', () => {
  test('lays every file under the slug folder on a JSZip-like stub', () => {
    // Minimal JSZip stub: folder() returns an object whose file() records paths.
    const recorded = [];
    const fakeFolder = { file: (p) => recorded.push(p) };
    const fakeZip = { folder: () => fakeFolder };
    const plan = IS.assembleImageSetPlan({ name: 'd', images: [new Uint8Array([1])] });
    IS.addPlanToZip(fakeZip, plan);
    assert.ok(recorded.includes('slides/d-01.png'));
    assert.ok(recorded.includes('manifest.json'));
  });
});
