/**
 * PNG to RGBA (engineering/decisions/2026-11-13-image-library.md §3, slice 3).
 *
 * Every color type (gray, RGB, palette, gray + alpha, RGBA) at every bit depth the format allows
 * (1, 2, 4, 8, 16), `tRNS` transparency, and Adam7 interlacing. Inflate is the platform's
 * `DecompressionStream` (inflate.ts), so the decode is async.
 *
 * What it reads and what it ignores:
 * - 16-bit samples become 8-bit by their high byte (libpng `png_set_strip_16`, and what Pillow does for
 *   RGB and RGBA). A 16-bit `tRNS` key is compared against the full 16-bit sample, before the cut.
 * - Low bit depths scale to 0..255 exactly (1 bit x 255, 2 bits x 85, 4 bits x 17).
 * - A palette index past the end of `PLTE` is opaque black, as libpng's zero-filled 256-entry palette.
 * - Color management is NOT applied: `gAMA`, `cHRM`, `sRGB`, `iCCP` and `cICP` are skipped, and the
 *   samples come back as stored. That is what a browser shows for untagged or sRGB-tagged content, which
 *   is nearly every PNG a deck carries; a PNG tagged with another gamma or profile decodes to its stored
 *   values, as `createImageBitmap(blob, { colorSpaceConversion: 'none' })` would.
 * - APNG: the default image only (`acTL`, `fcTL`, `fdAT` are ancillary and skipped).
 *
 * Refusals (each a `LastraError`): no signature or a malformed chunk header (`bad-marker`); bytes that
 * end mid-chunk or before any image data (`truncated`); a bad CRC on IHDR, PLTE, IDAT or IEND (`crc`); an
 * impossible header, a bad filter byte, IDAT chunks that are not consecutive, image data that does not
 * inflate to exactly the size the header implies (`corrupt`); an unknown critical chunk (`unsupported`);
 * over `maxPixels` or `maxBytes` (`too-large`), checked on the header before inflating anything.
 * A bad CRC on an ancillary chunk drops that chunk, as libpng does.
 */

import { LastraError } from './errors.js';
import { inflateExact } from './inflate.js';
import { checkPixels, resolveLimits, tick } from './limits.js';
import type { DecodedImage, DecodeOptions } from './types.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Adam7: x offset, y offset, x step, y step, per pass. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/** Allowed bit depths per color type. */
const DEPTHS: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

interface Header {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlace: number;
}

function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/** Decode a PNG to RGBA. Async because inflate runs through `DecompressionStream`. */
export async function decodePng(bytes: Uint8Array, opts?: DecodeOptions): Promise<DecodedImage> {
  const limits = resolveLimits(bytes, opts);
  const meter = limits.meter;
  const len = bytes.length;
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (i >= len) throw new LastraError('truncated', 'the file ends inside the PNG signature');
    if (bytes[i] !== SIGNATURE[i]) throw new LastraError('bad-marker', 'not a PNG: the signature does not match');
  }

  let header: Header | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let idatBytes = 0;
  let idatClosed = false;
  let sawEnd = false;

  let at = 8;
  while (at < len) {
    tick(meter);
    if (at + 8 > len) throw new LastraError('truncated', 'the file ends inside a chunk header');
    const length = u32(bytes, at);
    if (length > 0x7fffffff) throw new LastraError('bad-marker', `a chunk declares ${length} bytes, over the format's 2^31 - 1`);
    const t0 = bytes[at + 4];
    const t1 = bytes[at + 5];
    const t2 = bytes[at + 6];
    const t3 = bytes[at + 7];
    if (!isLetter(t0) || !isLetter(t1) || !isLetter(t2) || !isLetter(t3)) throw new LastraError('bad-marker', `a chunk type at byte ${at + 4} is not four letters`);
    const type = String.fromCharCode(t0, t1, t2, t3);
    const dataStart = at + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > len) throw new LastraError('truncated', `the file ends inside the ${type} chunk`);
    const critical = (t0 & 0x20) === 0;
    const crcOk = critical || type === 'tRNS' ? crc32(bytes, at + 4, dataEnd) === u32(bytes, dataEnd) : true;
    if (!header && type !== 'IHDR') throw new LastraError('bad-marker', `the first chunk is ${type}, not IHDR`);
    if (critical && !crcOk) throw new LastraError('crc', `the ${type} chunk's CRC does not match its bytes`);
    if (idat.length > 0 && type !== 'IDAT') idatClosed = true;

    if (type === 'IHDR') {
      if (header) throw new LastraError('bad-marker', 'a second IHDR chunk');
      if (length !== 13) throw new LastraError('bad-marker', `IHDR is ${length} bytes, not 13`);
      header = readHeader(bytes, dataStart);
      checkPixels(header.width, header.height, limits);
    } else if (type === 'PLTE') {
      if (idat.length > 0) throw new LastraError('bad-marker', 'PLTE after the image data');
      if (palette) throw new LastraError('bad-marker', 'a second PLTE chunk');
      if (length === 0 || length % 3 !== 0 || length > 768) throw new LastraError('corrupt', `PLTE is ${length} bytes, not 3 to 768 in steps of 3`);
      palette = bytes.subarray(dataStart, dataEnd);
    } else if (type === 'tRNS') {
      if (idat.length > 0) throw new LastraError('bad-marker', 'tRNS after the image data');
      if (crcOk) trns = bytes.subarray(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      if (idatClosed) throw new LastraError('corrupt', 'IDAT chunks are not consecutive');
      idat.push(bytes.subarray(dataStart, dataEnd));
      idatBytes += length;
    } else if (type === 'IEND') {
      sawEnd = true;
      break;
    } else if (critical) {
      throw new LastraError('unsupported', `unknown critical chunk ${type}`);
    }
    at = dataEnd + 4;
  }

  if (!header) throw new LastraError('truncated', 'the file ends before IHDR');
  if (idat.length === 0) throw new LastraError(sawEnd ? 'corrupt' : 'truncated', 'no image data (IDAT)');
  if (header.colorType === 3 && !palette) throw new LastraError('corrupt', 'a palette image without PLTE');

  const { width, height, depth, colorType, interlace } = header;
  const channels = CHANNELS[colorType];
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const passes = interlace ? ADAM7 : ([[0, 0, 1, 1]] as const);
  let expected = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw > 0 && ph > 0) expected += ph * (1 + Math.ceil((pw * bitsPerPixel) / 8));
  }

  let compressed: Uint8Array;
  if (idat.length === 1) compressed = idat[0];
  else {
    compressed = new Uint8Array(idatBytes);
    let o = 0;
    for (const part of idat) {
      compressed.set(part, o);
      o += part.length;
    }
  }
  const raw = await inflateExact(compressed, expected, meter);

  const out = new Uint8ClampedArray(width * height * 4);
  const emit = pixelWriter(header, palette, trns, out);
  let pos = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowBytes = Math.ceil((pw * bitsPerPixel) / 8);
    let prev = new Uint8Array(rowBytes);
    let cur = new Uint8Array(rowBytes);
    for (let j = 0; j < ph; j++) {
      tick(meter);
      const filter = raw[pos];
      unfilter(filter, raw, pos + 1, rowBytes, bpp, prev, cur);
      pos += 1 + rowBytes;
      emit(cur, pw, x0, y0 + j * dy, dx);
      const t = prev;
      prev = cur;
      cur = t;
    }
  }
  return { width, height, data: out };
}

function readHeader(b: Uint8Array, o: number): Header {
  const width = u32(b, o);
  const height = u32(b, o + 4);
  const depth = b[o + 8];
  const colorType = b[o + 9];
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) throw new LastraError('corrupt', `IHDR size ${width}x${height} is out of range`);
  const depths = DEPTHS[colorType];
  if (!depths) throw new LastraError('corrupt', `IHDR color type ${colorType} does not exist`);
  if (!depths.includes(depth)) throw new LastraError('corrupt', `IHDR bit depth ${depth} is not allowed for color type ${colorType}`);
  if (b[o + 10] !== 0) throw new LastraError('unsupported', `IHDR compression method ${b[o + 10]}`);
  if (b[o + 11] !== 0) throw new LastraError('unsupported', `IHDR filter method ${b[o + 11]}`);
  if (b[o + 12] > 1) throw new LastraError('unsupported', `IHDR interlace method ${b[o + 12]}`);
  return { width, height, depth, colorType, interlace: b[o + 12] };
}

/** Undo one scanline's filter from `raw[at..at+rowBytes)` into `cur`, given the previous unfiltered row. */
function unfilter(filter: number, raw: Uint8Array, at: number, rowBytes: number, bpp: number, prev: Uint8Array, cur: Uint8Array): void {
  switch (filter) {
    case 0:
      cur.set(raw.subarray(at, at + rowBytes));
      return;
    case 1:
      for (let i = 0; i < rowBytes; i++) cur[i] = raw[at + i] + (i >= bpp ? cur[i - bpp] : 0);
      return;
    case 2:
      for (let i = 0; i < rowBytes; i++) cur[i] = raw[at + i] + prev[i];
      return;
    case 3:
      for (let i = 0; i < rowBytes; i++) cur[i] = raw[at + i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1);
      return;
    case 4:
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        cur[i] = raw[at + i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      return;
    default:
      throw new LastraError('corrupt', `scanline filter type ${filter} does not exist`);
  }
}

type Emit = (row: Uint8Array, count: number, x0: number, y: number, dx: number) => void;

/** One function per color type that writes a scanline's pixels into the RGBA output. */
function pixelWriter(h: Header, palette: Uint8Array | null, trns: Uint8Array | null, out: Uint8ClampedArray): Emit {
  const { width, depth, colorType } = h;
  const sampleAt = (row: Uint8Array, i: number): number => {
    if (depth === 8) return row[i];
    if (depth === 16) return (row[2 * i] << 8) | row[2 * i + 1];
    const perByte = 8 / depth;
    const shift = 8 - depth * ((i % perByte) + 1);
    return (row[(i / perByte) | 0] >> shift) & ((1 << depth) - 1);
  };
  const to8 = depth === 16 ? (v: number) => v >> 8 : depth === 8 ? (v: number) => v : (v: number) => v * (255 / ((1 << depth) - 1));

  if (colorType === 0) {
    const key = trns && trns.length >= 2 ? (trns[0] << 8) | trns[1] : -1;
    return (row, count, x0, y, dx) => {
      let o = (y * width + x0) * 4;
      const step = dx * 4;
      for (let i = 0; i < count; i++, o += step) {
        const s = sampleAt(row, i);
        const g = to8(s);
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = s === key ? 0 : 255;
      }
    };
  }
  if (colorType === 2) {
    const has = trns !== null && trns.length >= 6;
    const kr = has ? (trns[0] << 8) | trns[1] : -1;
    const kg = has ? (trns[2] << 8) | trns[3] : -1;
    const kb = has ? (trns[4] << 8) | trns[5] : -1;
    return (row, count, x0, y, dx) => {
      let o = (y * width + x0) * 4;
      const step = dx * 4;
      for (let i = 0; i < count; i++, o += step) {
        const r = sampleAt(row, 3 * i);
        const g = sampleAt(row, 3 * i + 1);
        const b = sampleAt(row, 3 * i + 2);
        out[o] = to8(r);
        out[o + 1] = to8(g);
        out[o + 2] = to8(b);
        out[o + 3] = r === kr && g === kg && b === kb ? 0 : 255;
      }
    };
  }
  if (colorType === 3) {
    // A 256-entry table, zero-filled past PLTE (opaque black), alpha from tRNS where it reaches.
    const lut = new Uint8Array(256 * 4);
    const entries = Math.min((palette as Uint8Array).length / 3, 1 << depth);
    for (let i = 0; i < 256; i++) {
      if (i < entries) {
        lut[i * 4] = (palette as Uint8Array)[i * 3];
        lut[i * 4 + 1] = (palette as Uint8Array)[i * 3 + 1];
        lut[i * 4 + 2] = (palette as Uint8Array)[i * 3 + 2];
      }
      lut[i * 4 + 3] = trns && i < trns.length && i < entries ? trns[i] : 255;
    }
    return (row, count, x0, y, dx) => {
      let o = (y * width + x0) * 4;
      const step = dx * 4;
      for (let i = 0; i < count; i++, o += step) {
        const p = sampleAt(row, i) * 4;
        out[o] = lut[p];
        out[o + 1] = lut[p + 1];
        out[o + 2] = lut[p + 2];
        out[o + 3] = lut[p + 3];
      }
    };
  }
  const n = CHANNELS[colorType];
  return (row, count, x0, y, dx) => {
    let o = (y * width + x0) * 4;
    const step = dx * 4;
    for (let i = 0; i < count; i++, o += step) {
      if (n === 2) {
        const g = to8(sampleAt(row, 2 * i));
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = to8(sampleAt(row, 2 * i + 1));
      } else {
        out[o] = to8(sampleAt(row, 4 * i));
        out[o + 1] = to8(sampleAt(row, 4 * i + 1));
        out[o + 2] = to8(sampleAt(row, 4 * i + 2));
        out[o + 3] = to8(sampleAt(row, 4 * i + 3));
      }
    }
  };
}
