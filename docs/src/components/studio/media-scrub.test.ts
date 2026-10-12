// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scrubberFor, scrubGif, scrubPng, scrubWebp } from './media-scrub';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s);
const GPS = 'GPSLatitude=51.5'; // the marker: if it survives, the location survives

// PNG: signature + IHDR + [extra chunks] + IDAT + IEND. CRCs are not checked by the scrubber, so zeros do.
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
const png = (extra: number[][] = []) =>
	new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), ...extra.flat(), ...pngChunk('IDAT', [1, 2, 3, 4]), ...pngChunk('IEND', [])]);

describe('scrubPng', () => {
	it('cuts eXIf, tEXt, zTXt and iTXt, and keeps the pixels and every other chunk', () => {
		const dirty = png([pngChunk('eXIf', ascii(GPS)), pngChunk('tEXt', ascii(`Comment\0${GPS}`)), pngChunk('iTXt', ascii(`XML:com.adobe.xmp\0${GPS}`)), pngChunk('zTXt', ascii(`k\0\0${GPS}`)), pngChunk('gAMA', [0, 0, 177, 143])]);
		expect(has(dirty, GPS), 'positive control: the input carries the marker').toBe(true);
		const clean = scrubPng(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		for (const t of ['eXIf', 'tEXt', 'zTXt', 'iTXt']) expect(has(clean, t), t).toBe(false);
		for (const t of ['IHDR', 'gAMA', 'IDAT', 'IEND']) expect(has(clean, t), t).toBe(true);
		expect(scrubPng(clean)).toEqual(clean); // idempotent
	});
	it('leaves a clean PNG byte for byte', () => {
		const p = png();
		expect(scrubPng(p)).toEqual(p);
	});
	it('answers null for a file that is not a PNG or is cut short, so the importer re-encodes it', () => {
		expect(scrubPng(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(scrubPng(png().subarray(0, 40))).toBeNull();
		expect(scrubPng(new Uint8Array([...png().subarray(0, 8), ...be32(9999), ...ascii('IDAT')]))).toBeNull();
	});
});

// WebP: RIFF + size + WEBP, then VP8X (flags + 3-byte w/h) and chunks.
const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
const webp = (chunks: number[][], flags = 0x0c) => {
	const vp8x = webpChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	const body = [...ascii('WEBP'), ...vp8x, ...chunks.flat()];
	return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
};

describe('scrubWebp', () => {
	it('cuts EXIF and XMP chunks, clears their VP8X flags, and rewrites the RIFF size', () => {
		const dirty = webp([webpChunk('VP8 ', [9, 9, 9, 9]), webpChunk('EXIF', ascii(GPS)), webpChunk('XMP ', ascii(`<x>${GPS}</x>`))]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubWebp(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'EXIF') || has(clean, 'XMP '), 'the chunks are gone').toBe(false);
		expect(has(clean, 'VP8 '), 'the image data stays').toBe(true);
		const view = new DataView(clean.buffer, clean.byteOffset);
		expect(view.getUint32(4, true), 'RIFF size matches').toBe(clean.length - 8);
		// VP8X flags byte: EXIF and XMP bits cleared.
		expect(clean[20] & 0b1100).toBe(0);
	});
	it('answers null for something that is not a WebP', () => {
		expect(scrubWebp(new Uint8Array(30))).toBeNull();
	});
});

// GIF: header, logical screen descriptor (no global table), extensions, one image, trailer.
const sub = (data: number[]) => [data.length, ...data, 0];
const gif = (exts: number[][]) =>
	new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...exts.flat(), 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, ...sub([1, 2, 3]), 0x3b]);

describe('scrubGif', () => {
	it('cuts comments and XMP, keeps the animation loop and frame timing, and the picture', () => {
		const netscape = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), ...sub([1, 0, 0])];
		const xmp = [0x21, 0xff, 11, ...ascii('XMP DataXMP'), ...sub(ascii(GPS))];
		const comment = [0x21, 0xfe, ...sub(ascii(GPS))];
		const gce = [0x21, 0xf9, ...sub([0, 10, 0, 0])];
		const dirty = gif([netscape, xmp, comment, gce]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubGif(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'NETSCAPE2.0'), 'the loop count stays').toBe(true);
		expect(clean.at(-1)).toBe(0x3b);
		expect(clean.length).toBeLessThan(dirty.length);
		expect(scrubGif(clean)).toEqual(clean);
	});
	it('answers null for a truncated or non-GIF file', () => {
		expect(scrubGif(new Uint8Array(20))).toBeNull();
		expect(scrubGif(gif([]).subarray(0, 20))).toBeNull();
	});
});

describe('scrubberFor', () => {
	it('has one for the three kept types and none for the rest', () => {
		for (const m of ['image/png', 'image/webp', 'image/gif']) expect(scrubberFor(m), m).toBeTypeOf('function');
		for (const m of ['image/jpeg', 'image/avif', 'image/svg+xml']) expect(scrubberFor(m), m).toBeUndefined();
	});
});
