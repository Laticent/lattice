// @vitest-environment node
// read.ts: the one header reader. It replaced four in Lattice, which disagreed on real files:
//   A  lib/core/image-policy.js `readImageInfo` and its private EXIF copy (the recode plan)
//   B  lib/core/pdf-compose/compose.mjs `sniffImage` + lib/core/exif-orientation.mjs `jpegOrientation` (the PDF writer)
//   C  docs/src/components/studio/media-store.ts `sniffImageMime` (the Studio's Library)
//   D  lib/core/image-dimensions.js `readDimensions` + exif-orientation.mjs (the image layout's shape)
// Each disagreement is a row below: what each old reader answered, the answer lastra gives, and why that one is right.
// "Right" is what the engines paint, probed in Chromium, WebKit and Firefox (Playwright's builds, 2026-11-13; Lattice's
// docs/e2e/lastra-read-engines.spec.ts holds the engines to it). Where the engines split, Chromium decides: both of
// Lattice's export hosts paint with it (the CLI drives Chrome; the Studio's exports are checked in it first).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'vitest';
import { encodeJpeg } from './jpeg.js';
import { displaySize, type ImageInfo, imageFormat, readImage, tiffOrientation } from './read.js';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const bytes = (...parts: ArrayLike<number>[]) => new Uint8Array(parts.flatMap((p) => Array.from(p)));

// ── Builders ─────────────────────────────────────────────────────────────────────────────────────

/** A TIFF block holding Orientation `o` (or another tag when `tag` is false), in either byte order. */
function tiff(o: number, { magic = 42, tag = true, little = false } = {}): number[] {
	const u16 = little ? le16 : be16;
	const u32 = little ? le32 : be32;
	return [...ascii(little ? 'II' : 'MM'), ...u16(magic), ...u32(8), ...u16(1), ...u16(tag ? 0x0112 : 0x010f), ...u16(3), ...u32(1), ...u16(o), 0, 0, ...u32(0)];
}
const segment = (marker: number, data: number[]) => [0xff, marker, ...be16(data.length + 2), ...data];
const exif = (o: number, opts?: Parameters<typeof tiff>[1]) => segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(o, opts)]);
const xmp = segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x/>')]);
const sof = (w: number, h: number) => segment(0xc0, [8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const sos = segment(0xda, [1, 1, 0, 0, 63, 0]);

/** A JPEG header: SOI, then `before` (segments ahead of the frame), SOF0 `w` x `h`, `after`, then a scan. */
function jpeg(w: number, h: number, before: number[][] = [], after: number[][] = []): Uint8Array {
	return bytes([0xff, 0xd8], ...before, sof(w, h), ...after, sos, [1, 2, 3, 0xff, 0xd9]);
}

const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
const PNG_SIG = [0x89, ...ascii('PNG'), 13, 10, 26, 10];
/** A PNG header: the signature, IHDR `w` x `h` with `colorType`, then `chunks`, an IDAT and IEND. */
function png(w: number, h: number, colorType = 2, chunks: number[][] = []): Uint8Array {
	return bytes(PNG_SIG, pngChunk('IHDR', [...be32(w), ...be32(h), 8, colorType, 0, 0, 0]), ...chunks, pngChunk('IDAT', [1, 2]), pngChunk('IEND', []));
}

const gif = (w: number, h: number, version = 'GIF89a') => bytes(ascii(version), le16(w), le16(h), [0, 0, 0], [0x3b]);

const riff = (body: number[]) => bytes(ascii('RIFF'), le32(body.length + 4), ascii('WEBP'), body);
const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
/** Lossy: a VP8 key frame's tag (3 bytes), the start code 9D 01 2A, then 14-bit width and height. */
const vp8 = (w: number, h: number, start = [0x9d, 0x01, 0x2a]) => riff(webpChunk('VP8 ', [0, 0, 0, ...start, ...le16(w), ...le16(h), 0, 0]));
/** Lossless: the 0x2F signature, then 14 bits of width - 1, 14 of height - 1, the alpha hint, 3 bits of version. */
const vp8l = (w: number, h: number, alpha: boolean) => riff(webpChunk('VP8L', [0x2f, ...le32(((w - 1) | ((h - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0), 0, 0, 0, 0, 0, 0, 0, 0]));
/** Extended: flags (0x10 alpha, 0x08 EXIF), then 24-bit width - 1 and height - 1. */
const vp8x = (w: number, h: number, flags: number, extra: number[][] = []) =>
	riff([...webpChunk('VP8X', [flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16]), ...extra.flat()]);

const box = (type: string, body: number[]) => [...be32(body.length + 8), ...ascii(type), ...body];
const fullBox = (type: string, version: number, flags: number, body: number[]) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255, ...body]);
/**
 * An AVIF header: ftyp, then meta with the primary item `primary`, its properties in ipco and the ipma that ties
 * item ids to them. `items` maps an item id to the 1-based ipco indices it carries.
 */
function avif(props: number[][], items: Record<number, number[]>, { primary = 1, major = 'avif', compatible = ['mif1', 'avif'] } = {}): Uint8Array {
	const ftyp = box('ftyp', [...ascii(major), 0, 0, 0, 0, ...compatible.flatMap(ascii)]);
	const entries = Object.entries(items).flatMap(([id, list]) => [...be16(Number(id)), list.length, ...list.map((i) => 0x80 | i)]);
	const ipma = fullBox('ipma', 0, 0, [...be32(Object.keys(items).length), ...entries]);
	const meta = fullBox('meta', 0, 0, [...fullBox('pitm', 0, 0, be16(primary)), ...box('iprp', [...box('ipco', props.flat()), ...ipma])]);
	return bytes(ftyp, meta);
}
const ispe = (w: number, h: number) => fullBox('ispe', 0, 0, [...be32(w), ...be32(h)]);
const irot = (quarterTurns: number) => box('irot', [quarterTurns]);
const imir = (axis: number) => box('imir', [axis]);

const read = (b: Uint8Array) => readImage(b);
const turn = (b: Uint8Array) => readImage(b)?.orientation;

// ── The rows the old readers disagreed on ────────────────────────────────────────────────────────

interface Row {
	name: string;
	bytes: () => Uint8Array;
	/** What each old reader answered (null = could not read it). */
	was: string;
	/** What lastra answers. */
	check: (info: ImageInfo | null, format: ReturnType<typeof imageFormat>) => void;
	why: string;
}

const ROWS: Row[] = [
	{
		name: 'JPEG: an Exif block with Orientation 1, then a second with 6',
		bytes: () => jpeg(64, 32, [exif(1), exif(6)]),
		was: 'A 1 · B 6 · D 6 (quarter turn)',
		check: (i) => assert.equal(i?.orientation, 1),
		why: 'the first Exif block decides; Chromium, WebKit and Firefox all paint it unturned',
	},
	{
		name: 'JPEG: a first Exif block with no Orientation tag, then a second with 6',
		bytes: () => jpeg(64, 32, [exif(1, { tag: false }), exif(6)]),
		was: 'A 1 · B 6 · D 6',
		check: (i) => assert.equal(i?.orientation, 1),
		why: 'Chromium and Firefox stop at the first Exif block; WebKit reads on and turns it. Chromium decides',
	},
	{
		name: 'JPEG: the Exif block sits after the frame header, before the scan',
		bytes: () => jpeg(64, 32, [], [exif(6)]),
		was: 'A 6 · B 1 · D 1 (both stopped at the frame header)',
		check: (i) => assert.equal(i?.orientation, 6),
		why: 'libjpeg keeps every marker up to the scan; all three engines turn it',
	},
	{
		name: 'JPEG: Orientation 6 in a TIFF block whose magic number is 43, not 42',
		bytes: () => jpeg(64, 32, [exif(6, { magic: 43 })]),
		was: 'A 6 · B 1 · D 1',
		check: (i) => assert.equal(i?.orientation, 1),
		why: 'not TIFF, so not EXIF; Chrome 153, WebKit and Firefox leave it unturned (Playwright\'s Chromium 141 turned it)',
	},
	{
		name: 'JPEG: Orientation 9',
		bytes: () => jpeg(64, 32, [exif(9)]),
		was: 'A 9 (so the recode skipped it as "rotated") · B 1 · D 1',
		check: (i) => assert.equal(i?.orientation, 1),
		why: 'only 1 to 8 exist; no engine turns it',
	},
	{
		name: 'JPEG: an XMP APP1 before the Exif APP1',
		bytes: () => jpeg(64, 32, [xmp, exif(6)]),
		was: 'A 6 · B 6 · D 6',
		check: (i) => assert.equal(i?.orientation, 6),
		why: 'agreed: an APP1 that is not Exif is skipped. Chromium and WebKit turn it; Firefox reads only the first APP1',
	},
	{
		name: 'JPEG: bytes that are not a marker between two segments',
		bytes: () => jpeg(64, 32, [segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), [0x00, 0x11, 0x22]]),
		was: 'A null (gave up at the first non-marker byte) · D 64x32',
		check: (i) => assert.deepEqual([i?.width, i?.height], [64, 32]),
		why: 'libjpeg skips to the next marker, and all three engines decode it at 64x32',
	},
	{
		name: 'JPEG: 0xFF fill bytes before the frame header',
		bytes: () => jpeg(64, 32, [segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), [0xff, 0xff, 0xff]]),
		was: 'A null (it read a fill byte as a marker with a 65535-byte length) · D 64x32',
		check: (i) => assert.deepEqual([i?.width, i?.height], [64, 32]),
		why: 'fill bytes are allowed before any marker (ITU T.81 B.1.1.2); every engine decodes it',
	},
	{
		name: 'JPEG: FF D8 not followed by a marker',
		bytes: () => bytes([0xff, 0xd8, 0x00], jpeg(64, 32).subarray(2)),
		was: 'B not JPEG · C not JPEG · D 64x32 (it scanned on)',
		check: (_i, f) => assert.equal(f, null),
		why: 'Chromium and WebKit refuse to decode it (Firefox decodes it); a JPEG opens FF D8 FF',
	},
	{
		name: 'PNG: the first four signature bytes, then four wrong ones',
		bytes: () => bytes(png(64, 32).subarray(0, 4), [0, 0, 0, 0], png(64, 32).subarray(8)),
		was: 'A 64x32 · B PNG · C not PNG · D 64x32',
		check: (_i, f) => assert.equal(f, null),
		why: 'no engine decodes it; the last four bytes exist to catch a file mangled in transfer',
	},
	{
		name: 'PNG: a chunk before IHDR',
		bytes: () => bytes(PNG_SIG, pngChunk('tEXt', ascii('k\0v')), png(64, 32).subarray(8)),
		was: 'A and D read bytes 16 to 24 as the size anyway (here: a chunk length and a type)',
		check: (i, f) => {
			assert.equal(f, 'png');
			assert.equal(i, null);
		},
		why: 'IHDR must come first: Chromium and WebKit refuse it (Firefox decodes it)',
	},
	{
		name: 'PNG: a width of 0',
		bytes: () => png(0, 32),
		was: 'A width 0 (the plan refused it) · D {w: 0} (the bucket refused it)',
		check: (i) => assert.equal(i, null),
		why: 'a PNG side is 1 to 2^31 - 1; a header outside that is not one',
	},
	{
		name: 'PNG: an eXIf chunk with Orientation 6 before the pixels',
		bytes: () => png(64, 32, 2, [pngChunk('eXIf', tiff(6))]),
		was: 'A 1 · D unturned',
		check: (i) => assert.equal(i?.orientation, 6),
		why: 'Chromium and Firefox turn it (WebKit does not). The recode now leaves it alone instead of squeezing the turned bitmap into the stored box',
	},
	{
		name: 'WebP: an EXIF chunk with Orientation 6',
		bytes: () => vp8x(64, 32, 0x08, [webpChunk('VP8 ', [0, 0, 0, 0x9d, 1, 0x2a, 64, 0, 32, 0]), webpChunk('EXIF', tiff(6))]),
		was: 'every reader: unturned',
		check: (i) => assert.equal(i?.orientation, 1),
		why: 'agreed, and confirmed: no engine applies a WebP EXIF orientation',
	},
	{
		name: 'WebP: a VP8 chunk without its 9D 01 2A start code',
		bytes: () => vp8(64, 32, [0, 0, 0]),
		was: 'D read the size bytes anyway',
		check: (i) => assert.equal(i, null),
		why: 'not a VP8 key frame, so the bytes there are not a size',
	},
	{
		name: 'GIF: a version other than 87a or 89a',
		bytes: () => gif(64, 32, 'GIF8x'),
		was: 'C not GIF · D 64x32 (it checked only "GIF8")',
		check: (_i, f) => assert.equal(f, null),
		why: 'no engine decodes it',
	},
	{
		name: 'AVIF: the generic mif1 major brand with avif among the compatible brands',
		bytes: () => avif([ispe(64, 32)], { 1: [1] }, { major: 'mif1', compatible: ['mif1', 'avif', 'miaf'] }),
		was: 'C not AVIF (it read the major brand only)',
		check: (i, f) => {
			assert.equal(f, 'avif');
			assert.deepEqual([i?.width, i?.height], [64, 32]);
		},
		why: 'an AVIF names `avif` among its compatible brands; the major brand may be the generic mif1 (AVIF spec §9.1.1)',
	},
];

describe('rows the old readers disagreed on', () => {
	for (const row of ROWS) {
		test(`${row.name} (was: ${row.was}): ${row.why}`, () => {
			const b = row.bytes();
			row.check(readImage(b), imageFormat(b));
		});
	}
});

// ── The reader, format by format ─────────────────────────────────────────────────────────────────

describe('imageFormat', () => {
	test('reads each format by its magic number, from 12 bytes', () => {
		assert.equal(imageFormat(jpeg(4, 4).subarray(0, 12)), 'jpeg');
		assert.equal(imageFormat(png(4, 4).subarray(0, 12)), 'png');
		assert.equal(imageFormat(gif(4, 4)), 'gif');
		assert.equal(imageFormat(gif(4, 4, 'GIF87a')), 'gif');
		assert.equal(imageFormat(vp8(4, 4).subarray(0, 12)), 'webp');
		assert.equal(imageFormat(avif([ispe(4, 4)], { 1: [1] }).subarray(0, 12)), 'avif');
		assert.equal(imageFormat(avif([ispe(4, 4)], { 1: [1] }, { major: 'avis' }).subarray(0, 12)), 'avif');
	});
	test('HEIC is not AVIF, and nothing short or empty is anything', () => {
		assert.equal(imageFormat(avif([ispe(4, 4)], { 1: [1] }, { major: 'heic', compatible: ['mif1', 'heic'] })), null);
		assert.equal(imageFormat(avif([ispe(4, 4)], { 1: [1] }, { major: 'mif1', compatible: ['mif1', 'heic'] })), null);
		assert.equal(imageFormat(new Uint8Array(0)), null);
		assert.equal(imageFormat(new Uint8Array(32)), null);
		assert.equal(imageFormat(new Uint8Array([0xff, 0xd8])), null);
	});
	test('SVG is markup that opens with a tag and names <svg> in its first 2 KB', () => {
		const svg = (s: string) => new TextEncoder().encode(s);
		assert.equal(imageFormat(svg('<svg xmlns="http://www.w3.org/2000/svg"/>')), 'svg');
		assert.equal(imageFormat(svg('﻿  \n<?xml version="1.0"?>\n<!-- a long comment -->\n<SVG viewBox="0 0 1 1">')), 'svg');
		assert.equal(imageFormat(svg(`<?xml version="1.0"?>${' '.repeat(1500)}<svg>`)), 'svg', 'past 64 bytes of prolog');
		assert.equal(imageFormat(svg('<?xml version="1.0"?><html/>')), null, 'XML that is not SVG');
		assert.equal(imageFormat(svg('<svgfoo/>')), null, 'a different element');
		assert.equal(imageFormat(svg('hello <svg>')), null, 'text before the first tag');
		assert.equal(readImage(svg('<svg width="10" height="20"/>')), null, 'an SVG has no pixel size here');
	});
});

describe('readImage: PNG', () => {
	test('size, and the alpha hint from the color type or a tRNS chunk before the pixels', () => {
		assert.deepEqual(read(png(1179, 1179, 2)), { format: 'png', mime: 'image/png', width: 1179, height: 1179, alpha: false, orientation: 1 });
		assert.equal(read(png(10, 10, 6))?.alpha, true, 'RGBA');
		assert.equal(read(png(10, 10, 4))?.alpha, true, 'gray + alpha');
		assert.equal(read(png(10, 10, 3, [pngChunk('tRNS', [0])]))?.alpha, true, 'a palette PNG with tRNS may be transparent');
		const afterPixels = bytes(png(10, 10, 3).subarray(0, -12), pngChunk('tRNS', [0]), pngChunk('IEND', []));
		assert.equal(read(afterPixels)?.alpha, false, 'a tRNS after the first IDAT is not read');
	});
	test('the largest legal side reads; one past it does not', () => {
		assert.equal(read(png(0x7fffffff, 1))?.width, 0x7fffffff);
		assert.equal(read(png(0x80000000, 1)), null);
	});
	test('cut short anywhere before the end of IHDR: null', () => {
		const p = png(64, 32);
		for (let n = 0; n < 26; n++) assert.equal(read(p.subarray(0, n)), null, `${n} bytes`);
	});
});

describe('readImage: JPEG', () => {
	test('the frame size from any start-of-frame marker, baseline or progressive', () => {
		for (const m of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
			const b = bytes([0xff, 0xd8], segment(m, [8, ...be16(1280), ...be16(1920), 1, 1, 0x11, 0]), sos);
			assert.deepEqual([read(b)?.width, read(b)?.height], [1920, 1280], `marker ${m.toString(16)}`);
		}
	});
	test('DHT, JPG and DAC are not frame headers', () => {
		for (const m of [0xc4, 0xc8, 0xcc]) assert.equal(read(bytes([0xff, 0xd8], segment(m, [8, 0, 32, 0, 64, 1]), sos)), null, `marker ${m.toString(16)}`);
	});
	test('a frame height of 0 (set later by a DNL segment) is not a size the header can give', () => {
		assert.equal(read(jpeg(64, 0)), null);
	});
	test('orientation in both byte orders; 5 to 8 swap the painted size', () => {
		for (const o of [1, 2, 3, 4, 5, 6, 7, 8]) {
			for (const little of [false, true]) {
				const info = read(jpeg(4000, 3000, [exif(o, { little })]));
				assert.equal(info?.orientation, o);
				assert.deepEqual(displaySize(info as ImageInfo), o >= 5 ? { width: 3000, height: 4000 } : { width: 4000, height: 3000 });
			}
		}
	});
	test('a real file from the encoder reads at its size', () => {
		const px = new Uint8ClampedArray(37 * 21 * 4).fill(200);
		assert.deepEqual(read(encodeJpeg(px, 37, 21, 90)), { format: 'jpeg', mime: 'image/jpeg', width: 37, height: 21, alpha: false, orientation: 1 });
	});
	test("Lattice's shipped samples: the rotated one carries 6, the upright one none", () => {
		const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../lib/samples/${name}`, import.meta.url)));
		assert.equal(read(sample('photo-tall-rotated.jpg'))?.orientation, 6);
		assert.equal(read(sample('photo-tall.jpg'))?.orientation, 1);
	});
	test('hostile Exif: an IFD offset past the block, an entry count past it, a block shorter than its header', () => {
		const withTiff = (t: number[], len?: number) => {
			const data = [...ascii('Exif'), 0, 0, ...t];
			return bytes([0xff, 0xd8, 0xff, 0xe1], be16(len ?? data.length + 2), data, sof(4000, 3000), sos);
		};
		assert.equal(turn(withTiff([...ascii('MM'), ...be16(42), ...be32(0xffffffff)])), 1);
		// 65535 entries claimed, one real entry present: the real one is read, nothing past the block is.
		assert.equal(turn(withTiff([...ascii('MM'), ...be16(42), ...be32(8), ...be16(65535), ...be16(0x0112), ...be16(3), ...be32(1), ...be16(6), 0, 0])), 6);
		assert.equal(turn(withTiff([...ascii('MM'), ...be16(42), ...be32(8), ...be16(65535), ...be16(0x0100), ...be16(3), ...be32(1), ...be16(1), 0, 0])), 1);
		// The segment says 10 bytes: the Exif header and two bytes of TIFF. The reader resyncs at the frame header.
		const short = withTiff([...ascii('MM'), ...be16(42), ...be32(8)], 10);
		assert.deepEqual([read(short)?.width, read(short)?.orientation], [4000, 1]);
	});
	test('a segment length under 2 is a broken header', () => {
		assert.equal(read(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 1], sof(4, 4), sos)), null);
	});
	test('cut short anywhere before the frame size: null, and never a throw', () => {
		const j = jpeg(4000, 3000, [exif(6)]);
		const sofAt = j.indexOf(0xc0) - 1;
		for (let n = 0; n < sofAt + 9; n++) assert.equal(read(j.subarray(0, n)), null, `${n} bytes`);
		assert.equal(read(j.subarray(0, sofAt + 9))?.orientation, 6, 'the frame size is all a header read needs');
	});
});

describe('readImage: GIF, WebP, AVIF', () => {
	test('GIF: the logical screen; a GIF may always be transparent', () => {
		assert.deepEqual(read(gif(640, 480)), { format: 'gif', mime: 'image/gif', width: 640, height: 480, alpha: true, orientation: 1 });
		assert.equal(read(gif(0, 480)), null);
	});
	test('WebP: lossy, lossless (with its alpha hint) and extended (with its alpha flag)', () => {
		assert.deepEqual(read(vp8(1600, 1000)), { format: 'webp', mime: 'image/webp', width: 1600, height: 1000, alpha: false, orientation: 1 });
		assert.deepEqual([read(vp8l(300, 200, false))?.width, read(vp8l(300, 200, false))?.height, read(vp8l(300, 200, false))?.alpha], [300, 200, false]);
		assert.equal(read(vp8l(300, 200, true))?.alpha, true);
		assert.equal(read(vp8l(16384, 16384, false))?.width, 16384, 'the largest lossless side');
		assert.deepEqual([read(vp8x(5000, 4000, 0x10))?.width, read(vp8x(5000, 4000, 0x10))?.height, read(vp8x(5000, 4000, 0x10))?.alpha], [5000, 4000, true]);
		assert.equal(read(vp8x(5000, 4000, 0))?.alpha, false);
		assert.equal(read(vp8x(1 << 24, 1 << 24, 0)), null, 'a canvas over 2^32 pixels');
		assert.equal(read(riff(webpChunk('ALPH', new Array(20).fill(0)))), null, 'no image chunk first');
	});
	test("AVIF: the PRIMARY item's ispe, not the first one (a grid's tiles, an alpha plane)", () => {
		const b = avif([ispe(512, 512), ispe(4032, 3024)], { 1: [2], 2: [1], 3: [1] });
		assert.deepEqual([read(b)?.width, read(b)?.height], [4032, 3024]);
		assert.deepEqual([read(avif([ispe(512, 512), ispe(800, 600)], { 7: [2] }, { primary: 7 }))?.width], [800]);
		assert.equal(read(avif([ispe(512, 512)], { 2: [1] })), null, 'the primary item has no size');
		assert.equal(read(avif([ispe(0, 512)], { 1: [1] })), null);
	});
	test('AVIF: a version 1 pitm (a 32-bit id) cut to a 16-bit body is refused, not read into the next box', () => {
		// pitm v1 with only two id bytes: a reader that ignored the box's end would take the next box's size bytes
		// (00 00) as the id's low half, id 0x00010000, which the ipma (version 1, 32-bit ids) gives a size.
		const ftyp = box('ftyp', [...ascii('avif'), 0, 0, 0, 0, ...ascii('mif1'), ...ascii('avif')]);
		const ipma = fullBox('ipma', 1, 0, [...be32(1), ...be32(0x00010000), 1, 0x81]);
		const meta = fullBox('meta', 0, 0, [...fullBox('pitm', 1, 0, be16(1)), ...box('iprp', [...box('ipco', ispe(64, 32)), ...ipma])]);
		assert.equal(read(bytes(ftyp, meta)), null);
		// The same file with a whole 32-bit id reads.
		const whole = fullBox('meta', 0, 0, [...fullBox('pitm', 1, 0, be32(0x00010000)), ...box('iprp', [...box('ipco', ispe(64, 32)), ...ipma])]);
		assert.deepEqual([read(bytes(ftyp, whole))?.width, read(bytes(ftyp, whole))?.height], [64, 32]);
	});
	test('AVIF: a box that claims more bytes than the file holds is cut short, so the picture is refused', () => {
		const b = avif([ispe(64, 32)], { 1: [1] });
		const at = Buffer.from(b).indexOf('meta') - 4;
		new DataView(b.buffer, b.byteOffset).setUint32(at, new DataView(b.buffer, b.byteOffset).getUint32(at) + 100);
		assert.equal(read(b), null);
	});
	test('AVIF: irot and imir map to the EXIF orientation, in the order the item lists them', () => {
		const o = (props: number[][]) => read(avif([ispe(64, 32), ...props], { 1: [1, ...props.map((_p, i) => i + 2)] }))?.orientation;
		assert.equal(o([]), 1);
		assert.equal(o([irot(1)]), 8, 'a quarter turn anticlockwise');
		assert.equal(o([irot(2)]), 3);
		assert.equal(o([irot(3)]), 6, 'three anticlockwise is one clockwise');
		assert.equal(o([imir(0)]), 2, 'a left-right flip');
		assert.equal(o([imir(1)]), 4, 'a top-bottom flip');
		assert.equal(o([irot(1), imir(0)]), 7, 'turn, then flip: transverse');
		assert.equal(o([irot(3), imir(0)]), 5, 'turn, then flip: transpose');
		assert.equal(o([imir(0), irot(1)]), 5, 'flip, then turn: the other way round');
	});
	test('AVIF: a box that claims more than the file holds ends the walk', () => {
		const b = avif([ispe(64, 32)], { 1: [1] });
		for (let n = 0; n < b.length; n++) assert.doesNotThrow(() => read(b.subarray(0, n)), `${n} bytes`);
		assert.equal(read(b.subarray(0, b.length - 1)), null);
	});
});

describe('tiffOrientation', () => {
	test('either byte order; 1 for a bad magic number, a value outside 1 to 8, no tag, or too few bytes', () => {
		assert.equal(tiffOrientation(tiff(6)), 6);
		assert.equal(tiffOrientation(tiff(8, { little: true })), 8);
		assert.equal(tiffOrientation(tiff(6, { magic: 43 })), 1);
		assert.equal(tiffOrientation(tiff(0)), 1);
		assert.equal(tiffOrientation(tiff(9)), 1);
		assert.equal(tiffOrientation(tiff(6, { tag: false })), 1);
		assert.equal(tiffOrientation(tiff(6).slice(0, 13)), 1);
		assert.equal(tiffOrientation(new Uint8Array(40)), 1);
	});
});
