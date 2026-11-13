/**
 * Shared by the decode tests (Node only: they read committed fixtures and hash with node:crypto).
 * Not part of the library.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

export const FIXTURES = new URL('./fixtures/', import.meta.url);

export interface Expected {
  seed: number;
  pillow: string;
  libjpegTurbo: string;
  png: Record<string, { width: number; height: number; rgbaSha256: string }>;
  jpeg: Record<string, { width: number; height: number; pillowMode: string; rgbaSha256: string }>;
}

export const expected: Expected = JSON.parse(readFileSync(new URL('expected.json', FIXTURES), 'utf8'));

export function fixture(kind: 'png' | 'jpeg', name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`${kind}/${name}`, FIXTURES)));
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

/**
 * The most steps a decode of `bytes` input bytes may count under `maxPixels`, from the bounds the
 * decoders are built to (their headers say how). A decode that passes it is a runaway, whatever the clock.
 *
 * PNG: one step a chunk (at most bytes / 12), one a read of inflated data plus one per 4 KB of it (the
 * data is at most 8 bytes a pixel plus a filter byte a row), one a scanline (at most 2 x height with
 * Adam7). JPEG: one step a segment; per scan, one an MCU plus one a restart, where an image under
 * `maxPixels` with sides up to 65,535 has at most maxPixels / 64 + 2 x 8,192 + 1 MCUs; scans are at most
 * bytes / 8 (a scan header is 8 bytes or more) and at most 4 x 64 x 14 (each coefficient of each of 4
 * components takes one first pass and 13 refinements); then one step a block row and one an output row.
 */
export function workBudget(kind: 'png' | 'jpeg', bytes: number, maxPixels: number): number {
  if (kind === 'png') return 1000 + bytes + 12 * maxPixels;
  const mcus = Math.ceil(maxPixels / 64) + 2 * 8192 + 1;
  const scans = Math.min(Math.ceil(bytes / 8), 4 * 64 * 14);
  return 1000 + bytes + scans * 2 * mcus + 4 * 8192 + 65536;
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
