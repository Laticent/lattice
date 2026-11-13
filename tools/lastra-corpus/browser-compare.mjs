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
 * the same bytes in Node. The comparison is over red, green and blue. For PNG it counts only pixels
 * lastra decodes as opaque, because a 2D canvas stores premultiplied color and so cannot hand back the
 * exact color of a translucent pixel.
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
 * 1- to 8-bit PNG, so the default ceiling is zero. The two known differences are lastra's choices, kept
 * on purpose and pinned here so a change on either side shows:
 * - Firefox turns a 16-bit PNG sample into 8 bits by rounding; lastra, Chromium, WebKit, libpng's
 *   `png_set_strip_16` and Pillow keep the high byte. At most 1 apart, PSNR over 53 dB.
 * - Chromium paints a palette index past the end of PLTE with a palette color; lastra, Firefox, WebKit
 *   and libpng paint it opaque black (PNG 1.2 calls such a file an error, so any answer is a choice).
 * `maxDiff` is the largest channel difference allowed, `minPsnr` the lowest PSNR in dB.
 */
const EXACT = { maxDiff: 0, minPsnr: Number.POSITIVE_INFINITY };
const SIXTEEN_BIT_ROUNDING = { maxDiff: 1, minPsnr: 53 };
const CEILINGS = {
  chromium: { 'ct3-d4-short-palette.png': { maxDiff: 255, minPsnr: 0 } },
  firefox: Object.fromEntries(
    ['ct0-d16', 'ct0-d16-adam7', 'ct2-d16', 'ct2-d16-adam7', 'ct4-d16', 'ct4-d16-adam7', 'ct6-d16', 'ct6-d16-adam7', 'ct0-d16-trns-adam7', 'ct2-d16-trns'].map((f) => [`${f}.png`, SIXTEEN_BIT_ROUNDING]),
  ),
  webkit: {},
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
  const url = `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

function stats(ours, theirs, onlyOpaque) {
  let max = 0;
  let sum = 0;
  let sq = 0;
  let n = 0;
  let differ = 0;
  for (let p = 0; p < ours.length; p += 4) {
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
  return { max, mean: n ? sum / n : 0, psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), differingPixels: differ, pixels: n / 3 };
}

async function main() {
  const opts = args();
  const lastra = await loadLastra();
  const pw = require('@playwright/test');
  const expected = JSON.parse(readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'));
  const files = [...Object.keys(expected.jpeg).map((f) => ['jpeg', f]), ...Object.keys(expected.png).map((f) => ['png', f])];
  const ours = new Map();
  for (const [kind, f] of files) {
    const bytes = new Uint8Array(readFileSync(path.join(FIXTURES, kind, f)));
    const img = kind === 'jpeg' ? await lastra.decodeJpeg(bytes) : await lastra.decodePng(bytes);
    ours.set(f, { kind, bytes, img });
  }

  const results = {};
  let failed = 0;
  for (const engine of opts.engines) {
    const browser = await pw[engine].launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>lastra</title>');
    const version = browser.version();
    const rows = [];
    for (const [f, o] of ours) {
      const b64 = Buffer.from(o.bytes).toString('base64');
      const type = o.kind === 'jpeg' ? 'image/jpeg' : 'image/png';
      const got = await page.evaluate(
        async ({ b64, type }) => {
          const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([raw], { type }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none' });
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
        { b64, type },
      );
      const theirs = Buffer.from(got.b64, 'base64');
      if (got.width !== o.img.width || got.height !== o.img.height) {
        rows.push({ file: f, kind: o.kind, error: `size ${got.width}x${got.height}, lastra ${o.img.width}x${o.img.height}` });
        failed++;
        continue;
      }
      const s = stats(o.img.data, theirs, o.kind === 'png');
      const ceiling = CEILINGS[engine]?.[f] ?? EXACT;
      const ok = s.max <= ceiling.maxDiff && s.psnr >= ceiling.minPsnr;
      if (!ok) failed++;
      rows.push({ file: f, kind: o.kind, ...s, ok });
    }
    await browser.close();
    results[engine] = { version, rows };
  }

  if (opts.json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const [engine, { version, rows }] of Object.entries(results)) {
      console.log(`\n${engine} ${version}`);
      for (const r of rows) {
        if (r.error) console.log(`  ${r.file.padEnd(36)} ${r.error}`);
        else console.log(`  ${r.file.padEnd(36)} max ${String(r.max).padStart(3)}  mean ${r.mean.toFixed(4)}  psnr ${r.psnr === Infinity ? '   inf' : r.psnr.toFixed(2).padStart(6)}  differing ${r.differingPixels}/${r.pixels}${r.ok ? '' : '  OVER CEILING'}`);
      }
    }
  }
  if (opts.assert && failed) {
    console.error(`${failed} comparisons over their ceiling`);
    process.exit(1);
  }
}

await main();
