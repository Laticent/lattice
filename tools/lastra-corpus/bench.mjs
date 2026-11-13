#!/usr/bin/env node
/**
 * How long lastra takes to decode a 12-megapixel photo (engineering/decisions/2026-11-13-image-library.md
 * §4 and §8 "Speed on a phone"). A measurement, not a gate: it prints numbers and never fails on time.
 *
 *   node tools/lastra-corpus/bench.mjs                 # Node: JPEG baseline + progressive, PNG
 *   node tools/lastra-corpus/bench.mjs --browsers      # also lastra and createImageBitmap in Chromium, Firefox, WebKit
 *   node tools/lastra-corpus/bench.mjs --runs 9
 *
 * The 4000 x 3000 picture is drawn here from a seed (smooth fields, grain, edges) and encoded by
 * lib/core/jpeg-encode.mjs (baseline 4:2:0, quality 85) and by node:zlib (PNG, RGB, Paeth rows), so the
 * bench needs no fixture and no Python. A progressive 12 MP file comes from Pillow when `python3` has it
 * (skipped otherwise, and the output says so).
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'docs/package.json'));
const W = 4000;
const H = 3000;

const argv = process.argv.slice(2);
const RUNS = Number(argv[argv.indexOf('--runs') + 1]) || 5;

async function bundle() {
  const esbuild = require('esbuild');
  const out = await esbuild.build({ entryPoints: [path.join(ROOT, 'docs/src/lib/lastra/decode/index.ts')], bundle: true, format: 'esm', platform: 'neutral', write: false, minify: true });
  return out.outputFiles[0].text;
}

function picture() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  let s = 20261113;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const edge = ((x >> 7) + (y >> 7)) & 1 ? 40 : 0;
      rgba[o] = 128 + 90 * Math.sin(x / 300) * Math.cos(y / 410) + edge + rand() * 24;
      rgba[o + 1] = 120 + 80 * Math.sin((x + y) / 520) + rand() * 24;
      rgba[o + 2] = 110 + 70 * Math.cos(x / 230 - y / 330) - edge + rand() * 24;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function pngOf(rgba) {
  const row = W * 3 + 1;
  const raw = new Uint8Array(row * H);
  for (let y = 0; y < H; y++) {
    raw[y * row] = 4;
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        const i = y * row + 1 + x * 3 + c;
        const v = rgba[(y * W + x) * 4 + c];
        const a = x ? rgba[(y * W + x - 1) * 4 + c] : 0;
        const b = y ? rgba[((y - 1) * W + x) * 4 + c] : 0;
        const cc = x && y ? rgba[((y - 1) * W + x - 1) * 4 + c] : 0;
        const p = a + b - cc;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - cc);
        raw[i] = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc)) & 255;
      }
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', [])]));
}

function progressiveFromPillow(baseline) {
  try {
    const out = execFileSync('python3', ['-I', '-c', 'import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read()));b=io.BytesIO();im.save(b,"JPEG",quality=85,progressive=True);sys.stdout.buffer.write(b.getvalue())'], { input: baseline, maxBuffer: 1 << 28 });
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function timeNode(fn) {
  await fn();
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await fn();
    t.push(performance.now() - t0);
  }
  return median(t);
}

async function main() {
  const code = await bundle();
  const lastra = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const { encodeJpeg } = await import(path.join(ROOT, 'lib/core/jpeg-encode.mjs'));
  const rgba = picture();
  const files = { 'JPEG baseline 4:2:0 q85': ['jpeg', encodeJpeg(rgba, W, H, 85)] };
  const prog = progressiveFromPillow(files['JPEG baseline 4:2:0 q85'][1]);
  if (prog) files['JPEG progressive 4:2:0 q85 (Pillow)'] = ['jpeg', prog];
  else console.log('(no python3 + Pillow: the progressive file is skipped)');
  files['PNG RGB 8-bit (zlib 6, Paeth)'] = ['png', pngOf(rgba)];

  console.log(`lastra decode, ${W} x ${H} (12 MP), median of ${RUNS} runs after one warm-up`);
  console.log(`Node ${process.version} on ${process.arch}`);
  for (const [name, [kind, bytes]] of Object.entries(files)) {
    const ms = await timeNode(() => (kind === 'jpeg' ? lastra.decodeJpeg(bytes) : lastra.decodePng(bytes)));
    console.log(`  ${name.padEnd(36)} ${(bytes.length / 1e6).toFixed(2).padStart(6)} MB  ${ms.toFixed(0).padStart(6)} ms  ${((W * H) / 1e6 / (ms / 1000)).toFixed(1)} MP/s`);
  }

  if (!argv.includes('--browsers')) return;
  const pw = require('@playwright/test');
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const browser = await pw[engine].launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>bench</title>');
    await page.addScriptTag({ type: 'module', content: `${code.replace(/export\s*\{[^}]*\};?\s*$/, '')}\nwindow.lastra = { decodeJpeg: ${exportName(code, 'decodeJpeg')}, decodePng: ${exportName(code, 'decodePng')} };` });
    await page.waitForFunction(() => window.lastra);
    console.log(`${engine} ${browser.version()}`);
    for (const [name, [kind, bytes]] of Object.entries(files)) {
      const r = await page.evaluate(
        async ({ b64, kind, runs }) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
          const run = async (fn) => {
            await fn();
            const t = [];
            for (let i = 0; i < runs; i++) {
              const t0 = performance.now();
              await fn();
              t.push(performance.now() - t0);
            }
            return med(t);
          };
          const type = kind === 'jpeg' ? 'image/jpeg' : 'image/png';
          const ours = await run(() => (kind === 'jpeg' ? window.lastra.decodeJpeg(bytes) : window.lastra.decodePng(bytes)));
          const platform = await run(async () => {
            const bmp = await createImageBitmap(new Blob([bytes], { type }), { colorSpaceConversion: 'none' });
            const c = new OffscreenCanvas(bmp.width, bmp.height);
            const x = c.getContext('2d');
            x.drawImage(bmp, 0, 0);
            x.getImageData(0, 0, bmp.width, bmp.height);
            bmp.close();
          });
          return { ours, platform };
        },
        { b64: Buffer.from(bytes).toString('base64'), kind, runs: RUNS },
      );
      console.log(`  ${name.padEnd(36)} lastra ${r.ours.toFixed(0).padStart(6)} ms   createImageBitmap + getImageData ${r.platform.toFixed(0).padStart(6)} ms`);
    }
    await browser.close();
  }
}

/** The local name esbuild gave an export, read from the bundle's final `export { local as name }`. */
function exportName(code, name) {
  const m = code.match(/export\s*\{([^}]*)\}/);
  for (const part of (m ? m[1] : '').split(',')) {
    const [local, as] = part.trim().split(/\s+as\s+/);
    if ((as ?? local) === name) return local;
  }
  throw new Error(`no export ${name}`);
}

await main();
