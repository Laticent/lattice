/**
 * Shared by the decode tests (Node only: they read committed fixtures and hash with node:crypto).
 * Not part of the library. Named `*.test.mts` on purpose: lastra's builder, its standalone typecheck and
 * its import-boundary gate skip test files, and vitest collects only `*.test.ts`, so this is neither
 * shipped nor run as a suite.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export interface Expected {
  seed: number;
  pillow: string;
  libjpegTurbo: string;
  png: Record<string, { width: number; height: number; rgbaSha256: string; iccSha256: string | null; tags: string[] }>;
  jpeg: Record<string, { width: number; height: number; pillowMode: string; rgbaSha256: string; iccSha256: string | null; exifOrientation: number | null }>;
  zlib: Record<string, { outputLength: number; outputSha256: string; zlibVerdict: 'ok' | 'adler' | 'error' | 'truncated' }>;
}

export const expected: Expected = JSON.parse(readFileSync(`${FIXTURES}expected.json`, 'utf8'));

export function fixture(kind: 'png' | 'jpeg', name: string): Uint8Array {
  return new Uint8Array(readFileSync(`${FIXTURES}${kind}/${name}`));
}

export function sha256(data: Uint8Array | Uint8ClampedArray): string {
  return createHash('sha256').update(data).digest('hex');
}

/** mulberry32: a small seeded generator, so every fuzz case can be replayed from its printed seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a file's header declares, read here independently of the decoders: the size of the work. */
export interface Declared {
  pixels: number;
  height: number;
  /** JPEG: coefficient blocks in all stores (whole MCUs). PNG: inflated scanline bytes. */
  units: number;
}

/** The size a file's header declares, or zeros when no header parses. */
export function declared(kind: 'png' | 'jpeg', b: Uint8Array): Declared {
  const none = { pixels: 0, height: 0, units: 0 };
  if (kind === 'png') {
    if (b.length < 33) return none;
    const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const w = u32(16);
    const h = u32(20);
    const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[b[25]] ?? 4;
    const bits = ch * Math.max(1, b[24]);
    // Adam7 adds at most a filter byte and a partial byte per pass row: twice the plain size bounds it.
    return { pixels: w * h, height: h, units: 2 * h * (1 + Math.ceil((w * bits) / 8)) };
  }
  for (let i = 2; i + 4 <= b.length; ) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xff || m === 0 || m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += m === 0xff ? 1 : 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if ((m === 0xc0 || m === 0xc1 || m === 0xc2) && i + 10 <= b.length) {
      const h = (b[i + 5] << 8) | b[i + 6];
      const w = (b[i + 7] << 8) | b[i + 8];
      const nf = b[i + 9];
      let hmax = 1;
      let vmax = 1;
      const comps: [number, number][] = [];
      for (let c = 0; c < nf && i + 12 + 3 * c < b.length; c++) {
        const hv = b[i + 11 + 3 * c];
        comps.push([Math.max(1, hv >> 4), Math.max(1, hv & 15)]);
        hmax = Math.max(hmax, hv >> 4);
        vmax = Math.max(vmax, hv & 15);
      }
      const mx = Math.ceil(w / (8 * hmax));
      const my = Math.ceil(h / (8 * vmax));
      return { pixels: w * h, height: h, units: comps.reduce((n, [ch, cv]) => n + mx * ch * my * cv, 0) };
    }
    i += 2 + Math.max(len, 2);
  }
  return none;
}

/**
 * The most steps a decode may count: a bound proven from the decoders' loops (their headers say how),
 * so a decode past it is a runaway whatever the clock says. The meter counts work: per segment, table and
 * 64 skipped bytes (each at most one per input byte); per decoded block, at most 32 visits a block plus a
 * restart or skip per visit or per input byte (`decoded block` steps sit under the coefficient-work cap); per IDCT block; per 64 output pixels, once for the color
 * conversion and once per component's upsampling. PNG: per chunk, per inflated read plus per 4 KB, per
 * scanline plus per 64 of its bytes.
 */
export function workLimit(kind: 'png' | 'jpeg', b: Uint8Array): number {
  const d = declared(kind, b);
  if (kind === 'png') return 1000 + b.length + 2 * d.units + 4 * d.height;
  // Decoded blocks: a step per block plus one per 8 coefficients, inside the coefficient-work cap of
  // max(1024 x blocks, 2^26) (jpeg.ts COEF_WORK_PER_BLOCK, COEF_WORK_FLOOR); a DC scan is the worst case.
  return 50_000 + 3 * b.length + 1100 * d.units + (1 << 26) + 6 * Math.ceil(d.pixels / 64) + 2 * d.height;
}

/** Steps per unit of declared work: what the fuzz holds near its measured maximum. */
export function workRatio(kind: 'png' | 'jpeg', b: Uint8Array, steps: number): number {
  const d = declared(kind, b);
  const work = kind === 'png' ? b.length / 64 + d.units / 64 + d.height : b.length / 16 + d.units + d.pixels / 64;
  return steps / (work + 64);
}

// ── PNG building blocks ─────────────────────────────────────────────────────────────────────────

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export function chunk(type: string, data: ArrayLike<number> = [], crcOverride?: number): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(Array.from(data), 4);
  const crc = crcOverride ?? crc32(body);
  return Uint8Array.from([...be32(data.length), ...body, ...be32(crc >>> 0)]);
}

export function ihdr(width: number, height: number, depth = 8, colorType = 2, interlace = 0): Uint8Array {
  return chunk('IHDR', [...be32(width), ...be32(height), depth, colorType, 0, 0, interlace]);
}

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** An 8-bit RGB PNG of `width` x `height` with filter 0 rows of the given pixel bytes (default all 7s). */
export function rgbPng(width: number, height: number, opts: { raw?: Uint8Array; extra?: Uint8Array[] } = {}): Uint8Array {
  const raw = opts.raw ?? rawRows(width, height, 3);
  return concat(PNG_SIGNATURE, ihdr(width, height), ...(opts.extra ?? []), chunk('IDAT', deflateSync(raw)), chunk('IEND'));
}

export function rawRows(width: number, height: number, bytesPerPixel: number, filter = 0, fill = 7): Uint8Array {
  const row = 1 + width * bytesPerPixel;
  const raw = new Uint8Array(row * height).fill(fill);
  for (let y = 0; y < height; y++) raw[y * row] = filter;
  return raw;
}

export { deflateSync };

// ── JPEG building blocks ────────────────────────────────────────────────────────────────────────

export interface Segment {
  marker: number;
  start: number;
  end: number;
}

/** The marker segments of a JPEG up to and including the first SOS header (`end` is past the header). */
export function jpegSegments(b: Uint8Array): Segment[] {
  const out: Segment[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    const marker = b[i + 1];
    const end = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
    out.push({ marker, start: i, end });
    if (marker === 0xda) break;
    i = end;
  }
  return out;
}

/** Every SOS header in a file, found by scanning for FF DA (entropy data never contains it unstuffed). */
export function scanStarts(b: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < b.length; i++) if (b[i] === 0xff && b[i + 1] === 0xda) out.push(i);
  return out;
}

export function replaceRange(b: Uint8Array, start: number, end: number, insert: ArrayLike<number>): Uint8Array {
  return concat(b.subarray(0, start), Uint8Array.from(insert), b.subarray(end));
}

// ── Synthetic JPEG segments, for files no encoder writes ────────────────────────────────────────

export const SOI = [0xff, 0xd8];
export const EOI = [0xff, 0xd9];
const seg16 = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
/** Quantization table 0, every entry `q`. */
export const dqtAll = (q = 1) => seg16(0xdb, [0, ...Array.from({ length: 64 }, () => q)]);
/** A frame header: `comps` as [id, sampling byte, table]. */
export const sofSeg = (marker: number, w: number, h: number, comps: [number, number, number][]) => seg16(marker, [8, h >> 8, h & 255, w >> 8, w & 255, comps.length, ...comps.flat()]);
export const driSeg = (n: number) => seg16(0xdd, [n >> 8, n & 255]);
/** A scan header with Huffman tables 0/0 for every component. */
export const sosSeg = (ids: number[], ss: number, se: number, ah: number, al: number) => seg16(0xda, [ids.length, ...ids.flatMap((id) => [id, 0]), ss, se, (ah << 4) | al]);
/** A Huffman table with one 1-bit code (symbol `sym`). */
export const dhtOne = (tc: number, th: number, sym = 0) => seg16(0xc4, [(tc << 4) | th, 1, ...Array.from({ length: 15 }, () => 0), sym]);
export const bytesOf = (...parts: number[][]) => Uint8Array.from(parts.flat());
