/**
 * Integration: the picture policy reaches the pictures cropped from a slide (docs/src/lib/calco/capture.ts `cropPictures`,
 * `CaptureOptions.pictures`). By default a photographic crop is a JPEG; under `images: original` every crop is a lossless PNG.
 *
 * Slow tier: one Chromium launch, no CLI.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { cropPictures, captureOfficeSlides } = require('@laticent/calco');
const { cropRules } = require('../../../lib/core/office-export-policy.js');

describe('calco crops follow the picture policy', () => {
  let browser;
  let page;
  before(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent('<!doctype html><body style="margin:0"><section style="width:1280px;height:720px;position:relative">x</section></body>', { waitUntil: 'load' });
  });
  after(async () => {
    await browser?.close();
  });

  const crop = async (rules) =>
    page.evaluate(
      async (fnSource, args) => {
        // A noisy, fully opaque picture: a photograph for the rules' purposes.
        const c = document.createElement('canvas');
        c.width = 1280;
        c.height = 720;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(1280, 720);
        let seed = 7;
        for (let i = 0; i < img.data.length; i += 4) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          img.data[i] = seed & 255;
          img.data[i + 1] = (seed >> 8) & 255;
          img.data[i + 2] = (seed >> 16) & 255;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const fg = c.toDataURL('image/png').split(',')[1];
        const fn = new Function(`return (${fnSource})`)();
        return fn(document.querySelector('section'), { fg, boxes: [{ x: 100, y: 100, w: 400, h: 300, photo: true }], rules: args.rules });
      },
      cropPictures.toString(),
      { rules },
    );

  // What a host passes Calco for the crops (lib/core/office-export-policy.js `cropRules`), and the geometry rule Calco adds itself.
  const rulesFor = (setting) => ({ maxOutside: 0.0002, ...cropRules(setting) });

  test('by default a photographic crop is a JPEG', async () => {
    const got = await crop(rulesFor({}));
    assert.equal(got.images[0][0].jpeg, true);
  });

  test('a pictures option in the old { mode, quality } shape is refused loudly', async () => {
    const host = { run: async () => ({}), shoot: async () => new Uint8Array(0), guard: (_i, fn) => fn() };
    await assert.rejects(() => captureOfficeSlides(host, 1, { pictures: { mode: 'optimized', quality: 80 } }), /pictures\.toneBytes must be a finite number/);
  });

  test('images: original keeps every crop a lossless PNG', async () => {
    const got = await crop(rulesFor('original'));
    assert.ok(got.images[0].length > 0);
    assert.ok(got.images[0].every((p) => p.jpeg === false), 'no JPEG under original');
  });
});

// The same policy end to end: an editable .pptx of a deck with a photograph. The photo is a crop of the slide, and `images: original` keeps it a
// lossless PNG, where the default makes it a JPEG. (The rules above are hand-built; this runs the CLI's own wiring from the `images:` line.)
describe('calco crops follow the images: line, end to end', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const zlib = require('node:zlib');
  const { spawnSync } = require('node:child_process');
  const ROOT = path.resolve(__dirname, '..', '..', '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-crop-'));
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  // A noisy 640x360 RGB PNG: a photograph for the picture rules.
  function noisePng() {
    const w = 640;
    const h = 360;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    let seed = 11;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w * 3; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        raw[y * (w * 3 + 1) + 1 + x] = (seed >> 16) & 255;
      }
    }
    const crc = (buf) => {
      let c = ~0;
      for (const b of buf) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
      return (~c) >>> 0;
    };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(td));
      return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }

  const mediaOf = async (images) => {
    const JSZip = require('jszip');
    fs.writeFileSync(path.join(tmp, 'photo.png'), noisePng());
    const deck = path.join(tmp, `d-${images}.md`);
    fs.writeFileSync(deck, `---\nimages: ${images}\n---\n\n# Photo\n\n![A noisy photograph](photo.png)\n`);
    const out = path.join(tmp, `d-${images}.pptx`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, out, '--quiet', '--editable'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, r.stderr);
    return Object.keys((await JSZip.loadAsync(fs.readFileSync(out))).files).filter((n) => /^ppt\/media\/.+/.test(n));
  };

  test('images: original writes no JPEG; the default writes one for a photograph', async () => {
    const original = await mediaOf('original');
    const optimized = await mediaOf('optimized');
    assert.ok(original.length > 0 && original.every((n) => /\.png$/i.test(n)), `original: only PNG media, got ${original.join(', ')}`);
    assert.ok(optimized.some((n) => /\.jpe?g$/i.test(n)), `the default makes the photograph a JPEG, got ${optimized.join(', ')}`);
  });
});
