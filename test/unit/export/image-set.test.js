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
  test('fixed presets are literal multipliers at HD', () => {
    assert.equal(IS.resolveRasterScale('2x', 1280, 720), 2);
    assert.equal(IS.resolveRasterScale('1x', 1280, 720), 1);
    assert.equal(IS.resolveRasterScale('half', 1280, 720), 0.5);
  });
  test('fixed presets are OOM-capped on a big deck (4K @ 2x → 1×, not 2×)', () => {
    assert.equal(IS.resolveRasterScale('2x', 3840, 2160), 1); // 2× would be 7680px → capped
    assert.equal(IS.resolveRasterScale('1x', 3840, 2160), 1);
    assert.equal(IS.resolveRasterScale('half', 3840, 2160), 0.5);
  });
  test('unknown preset behaves like max', () => {
    assert.equal(IS.resolveRasterScale('bogus', 1280, 720), 2);
  });
  test('max never lets the long edge exceed RASTER_MAX_EDGE (oversized custom @size)', () => {
    // A custom @size wider than the 3840 budget must fall to a sub-1 scale, not silently 1×.
    for (const [w, h] of [[5000, 2812], [7680, 4320], [10000, 5000]]) {
      const s = IS.resolveRasterScale('max', w, h);
      assert.ok(Math.max(w, h) * s <= IS.RASTER_MAX_EDGE + 0.5, `${w}x${h} @max stays within budget`);
    }
    assert.equal(IS.resolveRasterScale('max', 3840, 2160), 1); // exactly at budget → 1×
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

describe('image-set: geometry + dpi', () => {
  test('orientationOf reports landscape / portrait / square', () => {
    assert.equal(IS.orientationOf(1280, 720), 'landscape');
    assert.equal(IS.orientationOf(1080, 1920), 'portrait');
    assert.equal(IS.orientationOf(1000, 1000), 'square');
  });
  test('physicalSize normalizes the long edge to 13.333in', () => {
    assert.deepEqual(IS.physicalSize(1280, 720), { width: 13.333, height: 7.5, unit: 'in' });
    // portrait swaps which edge is 13.333
    const p = IS.physicalSize(720, 1280);
    assert.equal(p.height, 13.333);
    assert.equal(p.width, 7.5);
  });
  test('dpiFor = pixel long edge ÷ 13.333in', () => {
    assert.equal(IS.dpiFor(2560, 1440), 192); // 2× HD
    assert.equal(IS.dpiFor(3840, 2160), 288); // 4K
    assert.equal(IS.dpiFor(1280, 720), 96);   // 1× (screen)
  });
});

describe('image-set: dataByteLength', () => {
  test('handles strings (utf-8), typed arrays, and blob-likes', () => {
    assert.equal(IS.dataByteLength('abc'), 3);
    assert.equal(IS.dataByteLength('★'), 3); // multi-byte
    assert.equal(IS.dataByteLength(new Uint8Array([1, 2, 3, 4])), 4);
    assert.equal(IS.dataByteLength({ size: 99 }), 99); // Blob-like
    assert.equal(IS.dataByteLength(null), 0);
  });
});

describe('image-set: embedRasterDpi', () => {
  // A minimal valid 1×1 PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  );

  test('PNG gains a pHYs chunk with the right pixels-per-meter', () => {
    const out = IS.embedRasterDpi(PNG, 'png', 192);
    // pHYs is inserted right after the 8-byte signature + 25-byte IHDR chunk (offset 33).
    const type = String.fromCharCode(out[37], out[38], out[39], out[40]);
    assert.equal(type, 'pHYs', 'a pHYs chunk should follow IHDR');
    const xppu = (out[41] << 24) | (out[42] << 16) | (out[43] << 8) | out[44];
    assert.equal(xppu, Math.round(192 / 0.0254)); // 192 dpi → ~7559 ppm
    assert.equal(out[49], 1, 'unit = meter');
    assert.ok(out.length > PNG.length, 'output grew by the chunk');
  });

  test('JPEG JFIF density is set to dpi', () => {
    // Minimal JPEG: SOI + JFIF APP0 (units/density placeholders) + EOI.
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
      0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const out = IS.embedRasterDpi(jpeg, 'jpeg', 300);
    assert.equal(out[13], 1, 'units = dpi');
    assert.equal((out[14] << 8) | out[15], 300, 'Xdensity');
    assert.equal((out[16] << 8) | out[17], 300, 'Ydensity');
  });

  test('JPEG embedding never mutates the caller buffer (Node Buffer.slice aliases memory)', () => {
    // Regression: `bytes.slice()` returns a VIEW for a Node Buffer, so patching the copy
    // would corrupt the input in place. `embedJpegDpi` must always deep-copy.
    const src = [
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
      0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ];
    const buf = Buffer.from(src);
    const out = IS.embedRasterDpi(buf, 'jpeg', 300);
    assert.notEqual(buf[14], out[14], 'the returned bytes carry the new density');
    assert.deepEqual([...buf], src, 'the input Buffer is untouched');
  });

  test('PNG that already carries a pHYs ends with exactly ONE (no spec-violating duplicate)', () => {
    const be32 = (n) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    const cat = (...a) => { const t = []; for (const x of a) t.push(...x); return Uint8Array.from(t); };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = cat(be32(13), Uint8Array.of(0x49, 0x48, 0x44, 0x52), new Uint8Array(13), be32(0));
    const stalePhys = cat(be32(9), Uint8Array.of(0x70, 0x48, 0x59, 0x73), new Uint8Array(9), be32(0));
    const idat = cat(be32(0), Uint8Array.of(0x49, 0x44, 0x41, 0x54), be32(0));
    const src = cat(Uint8Array.from(sig), ihdr, stalePhys, idat);
    const out = IS.embedRasterDpi(Buffer.from(src), 'png', 192);
    let count = 0, i = 8;
    while (i + 8 <= out.length) {
      const len = (out[i] << 24 >>> 0) + (out[i + 1] << 16) + (out[i + 2] << 8) + out[i + 3];
      const type = String.fromCharCode(out[i + 4], out[i + 5], out[i + 6], out[i + 7]);
      if (type === 'pHYs') count++;
      if (type === 'IDAT') break;
      i += 12 + len;
    }
    assert.equal(count, 1, 'the stale pHYs is replaced, not duplicated');
  });

  test('malformed JPEG APP0 (declared length < 16) is left unchanged, not mis-patched', () => {
    // APP0 says length 8 but carries "JFIF\0"; bytes 13-17 belong to the NEXT marker (SOF0).
    const badApp0 = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x08, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10,
    ]);
    assert.equal(IS.embedRasterDpi(badApp0, 'jpeg', 192), badApp0, 'a short APP0 is not patched');
  });

  test('WebP / unknown / bad dpi is returned unchanged', () => {
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
    assert.equal(IS.embedRasterDpi(webp, 'webp', 192), webp);
    assert.equal(IS.embedRasterDpi(PNG, 'png', 0), PNG);   // non-positive dpi
    assert.equal(IS.embedRasterDpi(PNG, 'png', NaN), PNG);
  });

  test('non-PNG bytes handed to the PNG path are returned unchanged (never corrupt)', () => {
    const notpng = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(IS.embedRasterDpi(notpng, 'png', 192), notpng);
  });
});

describe('image-set: resolveThumbScale', () => {
  test('shrinks to the target width, never upscales', () => {
    assert.equal(IS.resolveThumbScale(480, 1280), 480 / 1280);
    assert.equal(IS.resolveThumbScale(480, 320), 1); // slide already smaller than the thumb → 1×
  });
  test('never exceeds the full raster scale (a sub-1× --image-size caps the thumb)', () => {
    // half-size raster of a 1280px slide is 640px wide; a 700px thumb must clamp to that, not
    // come out BIGGER than the image it thumbnails.
    assert.equal(IS.resolveThumbScale(700, 1280, 0.5), 0.5);
    assert.equal(IS.resolveThumbScale(480, 1280, 0.5), Math.min(0.5, 480 / 1280)); // 0.375 < 0.5 → 0.375
    assert.equal(IS.resolveThumbScale(480, 1280, 2), 480 / 1280); // full 2× headroom → unclamped
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
  test('deckSlug rejects dot-only names and dodges Windows reserved names', () => {
    assert.equal(IS.deckSlug('.'), 'deck');
    assert.equal(IS.deckSlug('..'), 'deck');
    assert.equal(IS.deckSlug('...'), 'deck');
    assert.equal(IS.deckSlug('../../etc'), 'etc');      // no traversal survives
    assert.equal(IS.deckSlug('..lead-dots'), 'lead-dots');
    assert.equal(IS.deckSlug('CON'), 'deck-CON');
    assert.equal(IS.deckSlug('nul'), 'deck-nul');
    assert.equal(IS.deckSlug('v1.2'), 'v1.2');           // internal dots kept
    // Windows reserves the device name regardless of extension — the STEM is what matters.
    assert.equal(IS.deckSlug('nul.txt'), 'deck-nul.txt');
    assert.equal(IS.deckSlug('con.md'), 'deck-con.md');
    assert.equal(IS.deckSlug('lpt1.zip'), 'deck-lpt1.zip');
    assert.equal(IS.deckSlug('nuls.md'), 'nuls.md');     // not a reserved stem → untouched
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

  test('manifest v2 carries orientation, physical size, dpi, provenance, per-file bytes + titles', () => {
    const plan = IS.assembleImageSetPlan({
      name: 'Board Review', options: { format: 'png' }, geom: { w: 1280, h: 720 }, scale: 2,
      images: [img(1), img(2)], thumbs: [img(3), img(4)],
      svgs: [{ slide: 2, svg: '<svg/>', kind: 'chart', chartType: 'piechart' }],
      title: 'Board Review Q3', palette: 'indaco', engineVersion: '1.0.0', createdAt: '2026-07-22T00:00:00Z',
      slideTitles: ['Cover', 'The numbers'], generator: 'unit',
    });
    const m = plan.manifest;
    assert.equal(m.version, 2);
    assert.equal(m.title, 'Board Review Q3');
    assert.equal(m.palette, 'indaco');
    assert.deepEqual(m.engine, { name: 'lattice', version: '1.0.0' });
    assert.equal(m.createdAt, '2026-07-22T00:00:00Z');
    assert.equal(m.orientation, 'landscape');
    assert.deepEqual(m.physical, { width: 13.333, height: 7.5, unit: 'in' });
    assert.equal(m.dpi, 192);
    assert.deepEqual(m.thumbnail, { width: 480, height: 270 });
    // per-slide title + bytes + thumbnail bytes
    assert.equal(m.slides[0].title, 'Cover');
    assert.equal(m.slides[1].title, 'The numbers');
    assert.equal(m.slides[0].bytes, 3);          // img(n) is a 3-byte Uint8Array
    assert.equal(m.slides[0].thumbnailBytes, 3);
    // per-asset chartType + bytes
    assert.equal(m.assets[0].chartType, 'piechart');
    assert.equal(m.assets[0].bytes, 6);          // '<svg/>' = 6 bytes
  });

  test('createdAt is omitted when not provided (byte-reproducible)', () => {
    const plan = IS.assembleImageSetPlan({ name: 'd', images: [img(1)] });
    assert.ok(!('createdAt' in plan.manifest));
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
