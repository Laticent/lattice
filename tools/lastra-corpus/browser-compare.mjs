#!/usr/bin/env node
/**
 * How far lastra's decode is from each browser engine's, on the committed corpus
 * (engineering/decisions/2026-11-13-image-library.md §4).
 *
 *   node tools/lastra-corpus/browser-compare.mjs              # table to stdout
 *   node tools/lastra-corpus/browser-compare.mjs --json       # the same numbers as JSON
 *   node tools/lastra-corpus/browser-compare.mjs --assert     # exit 1 when an engine leaves its ceiling
 *   node tools/lastra-corpus/browser-compare.mjs --engines chromium,webkit
 *
 * Each engine decodes each fixture with `createImageBitmap(blob, { colorSpaceConversion: 'none',
 * premultiplyAlpha: 'none', imageOrientation: 'none' })` and hands back `getImageData`; lastra decodes
 * the same bytes in Node. The comparison is over red, green and blue, and alpha separately (`alpha`, the
 * largest alpha difference over every pixel: it is what a tRNS policy decides). Color counts only pixels
 * lastra decodes as opaque, because a 2D canvas stores premultiplied color and so cannot hand back the
 * exact color of a translucent pixel.
 *
 * For a file that carries an ICC profile or PNG color chunks it also reports what the engine DISPLAYS,
 * with its default color management (`displayed`: the largest channel difference and the mean and largest
 * CIE76 delta E against lastra's as-stored pixels). That is reported, never asserted: it is the gap a host
 * closes by giving a tagged file to a color-managed decoder, which `icc` and `tags` let it detect.
 *
 * Reporting, not a unit test: it needs Playwright's three browsers (docs/scripts/e2e-ensure-browsers.mjs
 * installs WebKit and Firefox). The ceilings `--assert` holds are set from the measurement recorded in
 * the design note, so a change in an engine or in lastra that moves the numbers shows up here.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'docs/src/lib/lastra/decode/fixtures');
const require = createRequire(path.join(ROOT, 'docs/package.json'));

/**
 * Ceilings, from the measurement recorded in the design note §4 (2026-11-13, Playwright's Chromium 141,
 * Firefox 142 and WebKit 26 on Linux). Every engine matches lastra bit for bit on every JPEG and on every
 * 1- to 8-bit PNG, so the default ceiling is zero. The known differences, each pinned here so a change on
 * either side shows:
 * - Firefox turns a 16-bit sample (alpha included) into 8 bits by rounding; lastra, Chromium, WebKit,
 *   libpng's `png_set_strip_16` and Pillow keep the high byte. At most 1 apart, PSNR over 53 dB.
 * - Chromium paints a palette index past the end of PLTE with a palette color; lastra, Firefox, WebKit
 *   and libpng paint it opaque black (PNG 1.2 calls such a file an error, so any answer is a choice).
 * - tRNS: lastra follows libpng (Firefox, WebKit) and ignores a tRNS longer than the palette or of the
 *   wrong length for its color type; Chromium applies both.
 * - WebKit color-manages a file with an ICC profile, or a PNG whose gAMA is not sRGB's, even under
 *   `colorSpaceConversion: 'none'`; lastra returns the stored values (and the profile).
 * - Damaged JPEGs (restart markers lost, doubled or out of order, bad Huffman codes, an EOI mid-scan) and
 *   progressive files missing their last scans (libjpeg's block smoothing) decode identically in Chromium
 *   and Firefox. WebKit differs by at most a few levels on the smoothed files (14 on the one-scan file).
 * - A file that ends with no EOI: Chromium refuses it, WebKit shows nothing, Firefox shows the scan-boundary
 *   cut as lastra does and the other two differently. lastra reads the end as EOI, as libjpeg does.
 * - A zlib stream with a wrong Adler-32, or none at all: the engines disagree with each other. Chromium
 *   decodes the bad checksum as lastra does and refuses the missing one; Firefox refuses the missing one
 *   and drops the last rows of the bad one; WebKit drops rows of both. lastra reads neither (it stops at
 *   the image's size), so its answer is the same in every engine, which is what the in-engine run checks.
 * - Coefficients a quantization table pushes past 16 bits: every engine runs libjpeg-turbo's SIMD IDCT,
 *   which saturates in 16-bit lanes; lastra follows the C code, which does not (real encoders never write
 *   such a file; on the reviewers' 951 damaged files lastra matches the C build on every one).
 * `maxDiff` is the largest color difference allowed, `minPsnr` the lowest PSNR in dB, `maxAlpha` the
 * largest alpha difference (0 when absent).
 */
const EXACT = { maxDiff: 0, minPsnr: Number.POSITIVE_INFINITY };
const SIXTEEN_BIT_ROUNDING = { maxDiff: 1, minPsnr: 53, maxAlpha: 1 };
const ANY = { maxDiff: 255, minPsnr: 0, maxAlpha: 255 };
const SIMD_OVERFLOW = { 'overflow-dqt-before-first-scan.jpg': ANY, 'overflow-dqt16-large-values.jpg': ANY };
const CEILINGS = {
  chromium: { ...SIMD_OVERFLOW, 'ct3-d4-short-palette.png': ANY, 'edge-trns-longer-than-plte.png': ANY, 'edge-gray8-trns-length3.png': ANY },
  firefox: {
    ...SIMD_OVERFLOW,
    ...Object.fromEntries(
      ['ct0-d16', 'ct0-d16-adam7', 'ct2-d16', 'ct2-d16-adam7', 'ct4-d16', 'ct4-d16-adam7', 'ct6-d16', 'ct6-d16-adam7', 'ct0-d16-trns-adam7', 'ct2-d16-trns'].map((f) => [`${f}.png`, SIXTEEN_BIT_ROUNDING]),
    ),
    'cut-prog-inside-scan.jpg': ANY,
    'cut-base-no-eoi-only.jpg': ANY,
    'edge-zlib-bad-adler.png': ANY,
  },
  webkit: {
    ...SIMD_OVERFLOW,
    ...Object.fromEntries(
      [
        'phone-display-p3.jpg',
        'phone-adobe-rgb.jpg',
        'phone-mpf-two-pictures.jpg',
        'phone-icc-two-segments.jpg',
        'phone-ultra-hdr-gain-map.jpg',
        'tagged-display-p3-iccp.png',
        'tagged-adobe-rgb-iccp.png',
        'tagged-gama-only-1.0.png',
        'cut-prog-at-scan-boundary.jpg',
        'cut-prog-inside-scan.jpg',
        'cut-base-no-eoi-only.jpg',
        'edge-zlib-bad-adler.png',
        'edge-zlib-no-adler.png',
      ].map((f) => [f, ANY]),
    ),
    ...Object.fromEntries(['partial-prog-keep1of10.jpg', 'partial-prog-keep3of10.jpg', 'partial-prog-keep6of10.jpg', 'partial-prog-keep9of10.jpg'].map((f) => [f, { maxDiff: 14, minPsnr: 40 }])),
  },
};

function args() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--engines');
  return {
    json: a.includes('--json'),
    assert: a.includes('--assert'),
    engines: i >= 0 ? a[i + 1].split(',') : ['chromium', 'firefox', 'webkit'],
  };
}

async function loadLastra() {
  const esbuild = require('esbuild');
  const out = await esbuild.build({ entryPoints: [path.join(ROOT, 'docs/src/lib/lastra/decode/index.ts')], bundle: true, format: 'esm', platform: 'neutral', write: false });
  const code = out.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return { lastra: await import(url), code };
}

/**
 * Run lastra itself inside the engine on every fixture and hand back a digest per file (SHA-256 of the
 * RGBA, or the refusal code). Node's digests must match exactly: the decoders are pure JavaScript, so a
 * difference here is an engine-dependent path inside lastra (the platform inflate once was one).
 */
async function lastraInEngine(page, code, files) {
  await page.addScriptTag({ type: 'module', content: `${code.replace(/export\s*\{([^}]*)\};?\s*$/, (_, names) => `window.__lastra = {${names.split(',').map((n) => { const [l, a] = n.trim().split(/\s+as\s+/); return `${a ?? l}: ${l}`; }).join(',')}};`)}` });
  await page.waitForFunction(() => window.__lastra);
  return page.evaluate(async ([list, digestSrc]) => {
    const digestOf = new Function(`return ${digestSrc}`)();
    const out = {};
    for (const [name, kind, b64] of list) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      try {
        const img = kind === 'jpeg' ? await window.__lastra.decodeJpeg(bytes) : await window.__lastra.decodePng(bytes);
        out[name] = digestOf(img.data);
      } catch (e) {
        out[name] = `refused ${e?.code ?? String(e)}`;
      }
    }
    return out;
  }, [files, pixelDigest.toString()]);
}

/** Two FNV-1a hashes with different offsets: a digest computed the same way in Node and in a page (a page
 * opened with setContent has no `crypto.subtle`). */
function pixelDigest(data) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    a = Math.imul(a ^ data[i], 0x01000193) >>> 0;
    b = Math.imul(b ^ data[i] ^ (i & 255), 0x01000193) >>> 0;
  }
  return `${data.length}:${a.toString(16)}:${b.toString(16)}`;
}

function stats(ours, theirs, onlyOpaque) {
  let max = 0;
  let sum = 0;
  let sq = 0;
  let n = 0;
  let differ = 0;
  let alpha = 0;
  for (let p = 0; p < ours.length; p += 4) {
    // Alpha survives a canvas exactly; color does not where alpha is under 255 (it is stored premultiplied).
    alpha = Math.max(alpha, Math.abs(ours[p + 3] - theirs[p + 3]));
    if (onlyOpaque && ours[p + 3] !== 255) continue;
    let any = false;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(ours[p + c] - theirs[p + c]);
      if (d > max) max = d;
      sum += d;
      sq += d * d;
      n++;
      if (d) any = true;
    }
    if (any) differ++;
  }
  const mse = n ? sq / n : 0;
  return { max, alpha, mean: n ? sum / n : 0, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), differingPixels: differ, pixels: n / 3 };
}

/** sRGB 8-bit to CIELAB (D65), for a perceptual distance between two decodes. */
function lab(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Mean and largest CIE76 color difference over opaque pixels. */
function deltaE(ours, theirs) {
  let sum = 0;
  let max = 0;
  let n = 0;
  for (let p = 0; p < ours.length; p += 4) {
    if (ours[p + 3] !== 255) continue;
    const a = lab(ours[p], ours[p + 1], ours[p + 2]);
    const b = lab(theirs[p], theirs[p + 1], theirs[p + 2]);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    sum += d;
    max = Math.max(max, d);
    n++;
  }
  return { meanDeltaE: n ? sum / n : 0, maxDeltaE: max };
}

/** Decode in the page: `raw` as the file is, with the given createImageBitmap options. */
async function engineDecode(page, bytes, type, options) {
  return page.evaluate(
    async ({ b64, type, options }) => {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      let bmp;
      try {
        bmp = await createImageBitmap(new Blob([raw], { type }), options);
      } catch (e) {
        return { refused: String(e) };
      }
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let s = '';
      for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return { width: bmp.width, height: bmp.height, b64: btoa(s) };
    },
    { b64: Buffer.from(bytes).toString('base64'), type, options },
  );
}

async function main() {
  const opts = args();
  const { lastra, code } = await loadLastra();
  const pw = require('@playwright/test');
  const expected = JSON.parse(readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'));
  const files = [...Object.keys(expected.jpeg).map((f) => ['jpeg', f]), ...Object.keys(expected.png).map((f) => ['png', f])];
  const ours = new Map();
  for (const [kind, f] of files) {
    const bytes = new Uint8Array(readFileSync(path.join(FIXTURES, kind, f)));
    const raw = kind === 'jpeg' ? await lastra.decodeJpeg(bytes) : await lastra.decodePng(bytes);
    const digest = pixelDigest(raw.data);
    // Every engine now turns a picture by its EXIF orientation even with `imageOrientation: 'none'`
    // (the value was retired from the spec in favor of 'from-image'), so the comparison turns lastra's
    // as-stored pixels the same way first, with applyOrientation.
    const o = expected[kind][f].exifOrientation;
    const img = o ? lastra.applyOrientation(raw, o) : raw;
    ours.set(f, { kind, bytes, img, digest });
  }

  const results = {};
  let failed = 0;
  for (const engine of opts.engines) {
    const browser = await pw[engine].launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>lastra</title>');
    const version = browser.version();
    const rows = [];
    // lastra in this engine against lastra in Node: identical on every fixture, or the run fails.
    const inEngine = await lastraInEngine(page, code, [...ours].map(([f, o]) => [f, o.kind, Buffer.from(o.bytes).toString('base64')]));
    let sameAsNode = 0;
    for (const [f, o] of ours) {
      if (inEngine[f] === o.digest) sameAsNode++;
      else {
        failed++;
        rows.push({ file: f, kind: o.kind, error: `lastra in ${engine} gave ${String(inEngine[f]).slice(0, 140)}, in Node ${o.digest.slice(0, 16)}`, ok: false });
      }
    }
    for (const [f, o] of ours) {
      const type = o.kind === 'jpeg' ? 'image/jpeg' : 'image/png';
      const got = await engineDecode(page, o.bytes, type, { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none' });
      if (got.refused) {
        // A damaged or cut file an engine will not decode at all: reported, and allowed only for the
        // damaged and partial fixtures, whose whole point is that decoders disagree on them.
        const allowed = /^(damaged|partial|cut|overflow)-/.test(f) || f === 'edge-zlib-no-adler.png';
        if (!allowed) failed++;
        rows.push({ file: f, kind: o.kind, error: `the engine refuses it (${got.refused.slice(0, 60)})`, ok: allowed });
        continue;
      }
      const theirs = Buffer.from(got.b64, 'base64');
      if (got.width !== o.img.width || got.height !== o.img.height) {
        rows.push({ file: f, kind: o.kind, error: `size ${got.width}x${got.height}, lastra ${o.img.width}x${o.img.height}` });
        failed++;
        continue;
      }
      const s = stats(o.img.data, theirs, o.kind === 'png');
      const ceiling = CEILINGS[engine]?.[f] ?? EXACT;
      const ok = s.max <= ceiling.maxDiff && s.psnr >= ceiling.minPsnr && s.alpha <= (ceiling.maxAlpha ?? 0);
      if (!ok) failed++;
      const row = { file: f, kind: o.kind, ...s, ok };
      // A tagged file: what the engine DISPLAYS (its default color management and EXIF rotation) against
      // lastra's as-stored pixels. Reported, never asserted: this is the gap a host closes by handing such
      // a file to a color-managed decoder.
      const e = expected[o.kind][f];
      if (e.iccSha256 || e.tags?.length) {
        const shown = await engineDecode(page, o.bytes, type, { premultiplyAlpha: 'none' });
        if (shown.width !== o.img.width || shown.height !== o.img.height) row.displayed = { size: `${shown.width}x${shown.height}` };
        else {
          const px = Buffer.from(shown.b64, 'base64');
          const d = stats(o.img.data, px, true);
          row.displayed = { max: d.max, ...deltaE(o.img.data, px) };
        }
      }
      rows.push(row);
    }
    await browser.close();
    results[engine] = { version, lastraSameAsNode: `${sameAsNode}/${ours.size}`, rows };
  }

  if (opts.json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const [engine, { version, rows }] of Object.entries(results)) {
      console.log(`\n${engine} ${version}: lastra in the engine matches lastra in Node on ${results[engine].lastraSameAsNode} fixtures`);
      for (const r of rows) {
        if (r.error) console.log(`  ${r.file.padEnd(36)} ${r.error}`);
        else {
          const shown = r.displayed ? (r.displayed.size ? `  | displayed: rotated to ${r.displayed.size}` : `  | displayed: max ${r.displayed.max}, mean dE ${r.displayed.meanDeltaE.toFixed(2)}, max dE ${r.displayed.maxDeltaE.toFixed(2)}`) : '';
          console.log(`  ${r.file.padEnd(36)} max ${String(r.max).padStart(3)}  alpha ${String(r.alpha).padStart(3)}  mean ${r.mean.toFixed(4)}  psnr ${r.psnr === Infinity ? '   inf' : r.psnr.toFixed(2).padStart(6)}  differing ${r.differingPixels}/${r.pixels}${r.ok ? '' : '  OVER CEILING'}${shown}`);
        }
      }
    }
  }
  if (opts.assert && failed) {
    console.error(`${failed} comparisons over their ceiling`);
    process.exit(1);
  }
}

await main();
