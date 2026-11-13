// @vitest-environment node
// The cleaners (clean.ts): keep-lists, not drop-lists. Every case below came from the Studio's red team on the photo
// scrubber (engineering/decisions/2026-10-12-library-media-assets.md §3) and moved here with the code.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanerFor, cleanGif, cleanJpeg, cleanPng, cleanWebp } from './clean.js';
import { decodeJpegSync } from './decode/index.js';
import { encodeJpeg } from './jpeg.js';
import { readImage, tiffOrientation } from './read.js';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s);
const GPS = 'GPSLatitude=51.5'; // the marker: if it survives, the location survives

// Tiny but STRUCTURALLY VALID images: they walk as real PNG, WebP and JPEG files. `seed` makes two of them differ.
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
function png(seed = 1, extra: number[][] = []): Uint8Array {
	return new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), ...extra.flat(), ...pngChunk('IDAT', [seed, 2, 3, 4]), ...pngChunk('IEND', [])]);
}

const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
function webp(seed = 1, chunks: number[][] = [], flags = 0): Uint8Array {
	const body = [...ascii('WEBP'), ...webpChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...webpChunk('VP8 ', [seed, 9, 9, 9]), ...chunks.flat()];
	return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
}

/** SOI, optional extra segments, a JFIF APP0, a start-of-scan header and some scan bytes, EOI. */
function jpeg(seed = 1, segments: number[][] = []): Uint8Array {
	const seg = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];
	return new Uint8Array([0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...segments.flat(), ...seg(0xda, [1, 1, 0, 0, 63, 0]), seed, 1, 2, 3, 0xff, 0xd9]);
}
const jpegSegment = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];

/** A TIFF block with Orientation = `o` and a GPS-looking string behind it, as a phone writes it. */
const tiff = (o: number) => [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 2, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, ...ascii(GPS)];

describe('tiffOrientation', () => {
	it('reads Orientation from either byte order, and answers 1 for anything it cannot read', () => {
		expect(tiffOrientation(new Uint8Array(tiff(6)))).toBe(6);
		const le = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0];
		expect(tiffOrientation(new Uint8Array(le))).toBe(8);
		expect(tiffOrientation(new Uint8Array(0))).toBe(1);
		expect(tiffOrientation(new Uint8Array(40))).toBe(1);
	});
});

describe('cleanPng — a keep-list', () => {
	it('drops every chunk that is not on the list, including ones nobody has heard of, and keeps the picture', () => {
		const junk = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'caBX', 'tIME', 'exIf', 'zxIf', 'iTXT', 'vpAg', 'prVW', 'mkBS', 'zzZz'];
		const dirty = png(1, [...junk.map((t) => pngChunk(t, ascii(`${t}${GPS}`))), pngChunk('gAMA', [0, 0, 177, 143]), pngChunk('iCCP', ascii('profile\0\0abc'))]);
		expect(has(dirty, GPS), 'positive control: the input carries the marker').toBe(true);
		const clean = cleanPng(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		for (const t of junk) expect(has(clean, t), t).toBe(false);
		for (const t of ['IHDR', 'gAMA', 'iCCP', 'IDAT', 'IEND']) expect(has(clean, t), t).toBe(true);
		expect(cleanPng(clean)).toEqual(clean); // idempotent
	});
	it('leaves a clean PNG byte for byte', () => {
		const p = png(4);
		expect(cleanPng(p)).toEqual(p);
	});
	it('keeps a picture’s rotation as a chunk of its own, with nothing else from the EXIF block', () => {
		const clean = cleanPng(png(1, [pngChunk('eXIf', tiff(6))])) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'eXIf')).toBe(true);
		const at = new TextDecoder('latin1').decode(clean).indexOf('eXIf');
		expect(tiffOrientation(clean.subarray(at + 4, at + 4 + 26))).toBe(6);
	});
	it('keeps the turn of the first eXIf ahead of the pixels only, as the reader and the engines do', () => {
		const count = (b: Uint8Array) => new TextDecoder('latin1').decode(b).split('eXIf').length - 1;
		expect(count(cleanPng(png(1, [pngChunk('eXIf', tiff(1)), pngChunk('eXIf', tiff(6))])) as Uint8Array)).toBe(0);
		const first = cleanPng(png(1, [pngChunk('eXIf', tiff(6)), pngChunk('eXIf', tiff(1))])) as Uint8Array;
		expect(count(first)).toBe(1);
		expect(readImage(first)?.orientation).toBe(6);
		// An eXIf after the pixels turns nothing in any engine, so it leaves nothing behind.
		const p = png(1);
		const late = new Uint8Array([...p.subarray(0, p.length - 12), ...pngChunk('eXIf', tiff(6)), ...p.subarray(p.length - 12)]);
		expect(count(cleanPng(late) as Uint8Array)).toBe(0);
	});
	it('drops an eXIf that does not rotate the picture', () => {
		expect(has(cleanPng(png(1, [pngChunk('eXIf', tiff(1))])) as Uint8Array, 'eXIf')).toBe(false);
	});
	it('answers null for a file that is not a PNG or is cut short, so the importer re-encodes it', () => {
		expect(cleanPng(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(cleanPng(png().subarray(0, 40))).toBeNull();
	});
	it('drops whatever follows IEND', () => {
		const p = png();
		const trailing = new Uint8Array([...p, ...ascii(GPS)]);
		expect(has(cleanPng(trailing) as Uint8Array, GPS)).toBe(false);
	});
});

describe('cleanWebp — a keep-list', () => {
	it('drops EXIF, XMP and every unknown chunk, clears the VP8X flags, and rewrites the RIFF size', () => {
		const junk = ['EXIF', 'XMP ', 'C2PA', 'exif', 'XMP\0', 'zzzz'];
		const dirty = webp(1, junk.map((t) => webpChunk(t, ascii(`${t}${GPS}`))), 0x0c);
		expect(has(dirty, GPS)).toBe(true);
		const clean = cleanWebp(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'VP8 '), 'the image data stays').toBe(true);
		const view = new DataView(clean.buffer, clean.byteOffset);
		expect(view.getUint32(4, true), 'RIFF size matches').toBe(clean.length - 8);
		expect(clean[20] & 0b1100, 'EXIF and XMP flags are off').toBe(0);
	});
	it('filters inside an animation frame: metadata nested in ANMF goes, the frame data stays', () => {
		const frameHeader = [0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0]; // x, y, w, h, duration, flags: 12 bytes; pad to 16
		const nested = [...frameHeader, 0, 0, 0, 0, ...webpChunk('VP8 ', [5, 5, 5, 5]), ...webpChunk('EXIF', ascii(GPS))];
		const dirty = webp(1, [webpChunk('ANIM', [0, 0, 0, 0, 0, 0]), webpChunk('ANMF', nested)]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = cleanWebp(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'ANMF') && has(clean, 'ANIM')).toBe(true);
		expect(new DataView(clean.buffer, clean.byteOffset).getUint32(4, true)).toBe(clean.length - 8);
	});
	it('keeps a rotation as an orientation-only EXIF chunk, and the flag that announces it', () => {
		const clean = cleanWebp(webp(1, [webpChunk('EXIF', tiff(8))], 0x08)) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		const at = new TextDecoder('latin1').decode(clean).indexOf('EXIF');
		expect(at).toBeGreaterThan(0);
		expect(tiffOrientation(clean.subarray(at + 8, at + 8 + 26))).toBe(8);
		expect(clean[20] & 0b1000).toBe(0b1000);
	});
	it('reads a file whose last chunk is odd-sized and unpadded, as a browser does', () => {
		const body = [...ascii('WEBP'), ...webpChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...ascii('VP8 '), ...le32(3), 7, 7, 7]; // no pad byte
		const odd = new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
		const clean = cleanWebp(odd) as Uint8Array;
		expect(clean).not.toBeNull();
		expect(clean.length % 2).toBe(0);
	});
	it('answers null for something that is not a WebP', () => {
		expect(cleanWebp(new Uint8Array(30))).toBeNull();
	});
});

const sub = (data: number[]) => [data.length, ...data, 0];
const gif = (exts: number[][], trailer = true) =>
	new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...exts.flat(), 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, ...sub([1, 2, 3]), ...(trailer ? [0x3b] : [])]);

describe('cleanGif — a keep-list', () => {
	const netscape = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), ...sub([1, 0, 0])];
	it('keeps the loop count, frame timing and color profile; drops comments, XMP, plain text and extra data', () => {
		const xmp = [0x21, 0xff, 11, ...ascii('XMP DataXMP'), ...sub(ascii(GPS))];
		const comment = [0x21, 0xfe, ...sub(ascii(GPS))];
		const plain = [0x21, 0x01, ...sub([...Array(12).fill(0), ...ascii(GPS)])];
		const gce = [0x21, 0xf9, ...sub([0, 10, 0, 0])];
		const icc = [0x21, 0xff, 11, ...ascii('ICCRGBG1012'), ...sub([1, 2, 3])];
		// One extension, two data blocks, one terminator: the loop count, then bytes that are not a loop count.
		const loopWithExtra = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, ...sub(ascii(GPS))];
		const dirty = gif([loopWithExtra, xmp, comment, plain, gce, icc]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = cleanGif(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'NETSCAPE2.0') && has(clean, 'ICCRGBG1012'), 'loop count and color profile stay').toBe(true);
		expect(clean.at(-1)).toBe(0x3b);
		expect(cleanGif(clean)).toEqual(clean);
	});
	it('reads a GIF that has no trailer, as a browser does, and gives it one', () => {
		const clean = cleanGif(gif([netscape], false)) as Uint8Array;
		expect(clean.at(-1)).toBe(0x3b);
	});
	it('answers null for a truncated or non-GIF file', () => {
		expect(cleanGif(new Uint8Array(20))).toBeNull();
		expect(cleanGif(gif([]).subarray(0, 14))).toBeNull();
	});
});

describe('cleanJpeg', () => {
	it('drops EXIF, XMP, IPTC and comments; keeps JFIF, the color profile and the scan', () => {
		const dirty = jpeg(1, [jpegSegment(0xe1, ascii(`Exif\0\0${GPS}`)), jpegSegment(0xe1, ascii(`http://ns.adobe.com/xap/1.0/\0${GPS}`)), jpegSegment(0xed, ascii(`Photoshop 3.0\0${GPS}`)), jpegSegment(0xfe, ascii(GPS)), jpegSegment(0xe2, ascii('ICC_PROFILE\0abc'))]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = cleanJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'JFIF') && has(clean, 'ICC_PROFILE')).toBe(true);
		expect(clean.at(-1)).toBe(0xd9);
	});
	it('leaves a clean JPEG byte for byte and answers null for a file that is not one', () => {
		const j = jpeg(3);
		expect(cleanJpeg(j)).toEqual(j);
		expect(cleanJpeg(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
		expect(cleanJpeg(j.subarray(0, 10))).toBeNull();
	});
});

describe('cleanJpeg — a keep-list of segments', () => {
	const segmentsOf = (b: Uint8Array) => {
		const out: number[] = [];
		for (let i = 2; i + 4 <= b.length && b[i] === 0xff; ) {
			out.push(b[i + 1]);
			if (b[i + 1] === 0xda) break;
			i += 2 + ((b[i + 2] << 8) | b[i + 3]);
		}
		return out;
	};
	const real = () => {
		const px = new Uint8ClampedArray(24 * 16 * 4).map((_v, i) => (i % 4 === 3 ? 255 : (i * 37) & 255));
		return encodeJpeg(px, 24, 16, 85); // SOI, JFIF APP0, DQT, SOF0, DHT, SOS
	};
	const withSegments = (b: Uint8Array, segs: number[][]) => new Uint8Array([0xff, 0xd8, ...segs.flat(), ...b.subarray(2)]);
	it('drops an APP0 that is not JFIF (a JFXX thumbnail can carry anything a browser never shows)', () => {
		const dirty = withSegments(real(), [jpegSegment(0xe0, [...ascii('JFXX\0'), 0x10, ...ascii(GPS)])]);
		const clean = cleanJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS) || has(clean, 'JFXX')).toBe(false);
	});
	it('rebuilds JFIF minimal: the version and density stay, the thumbnail and any trailing bytes go', () => {
		const jfif = [...ascii('JFIF\0'), 1, 2, 1, 0, 72, 0, 96, 2, 1, ...new Array(6).fill(200), ...ascii(GPS)]; // a 2x1 RGB thumbnail
		const b = real();
		const dirty = new Uint8Array([0xff, 0xd8, ...jpegSegment(0xe0, jfif), ...b.subarray(2 + 18)]); // replace the encoder's APP0
		const clean = cleanJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect([...clean.subarray(2, 20)]).toEqual([0xff, 0xe0, 0, 16, ...ascii('JFIF\0'), 1, 2, 1, 0, 72, 0, 96, 0, 0]);
	});
	it('drops every reserved JPGn marker segment (F0 to FD) and the reserved JPG frame marker (C8)', () => {
		const reserved = [0xc8, ...Array.from({ length: 14 }, (_v, k) => 0xf0 + k)];
		const dirty = withSegments(real(), reserved.map((m) => jpegSegment(m, ascii(GPS))));
		const clean = cleanJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		for (const m of reserved) expect(segmentsOf(clean), m.toString(16)).not.toContain(m);
	});
	it('keeps the tables, the frame and the scan, in order', () => {
		expect(segmentsOf(cleanJpeg(withSegments(real(), [jpegSegment(0xfe, ascii(GPS)), jpegSegment(0xdd, [0, 4])])) as Uint8Array)).toEqual([0xdd, 0xe0, 0xdb, 0xc0, 0xc4, 0xda]);
	});
	it('keeps an Adobe APP14 to its 12 defined bytes, so a CMYK or YCCK file decodes to the same pixels', () => {
		const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./decode/fixtures/jpeg/${name}`, import.meta.url)));
		for (const name of ['mid-cmyk.jpg', 'mid-ycck.jpg', 'mid-rgb-adobe0.jpg']) {
			const original = fixture(name);
			const clean = cleanJpeg(original) as Uint8Array;
			expect(segmentsOf(clean), name).toContain(0xee);
			expect(Buffer.from(decodeJpegSync(clean).data).equals(Buffer.from(decodeJpegSync(original).data)), name).toBe(true);
		}
		const padded = withSegments(real(), [jpegSegment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1, ...ascii(GPS)])]);
		expect(has(cleanJpeg(padded) as Uint8Array, GPS), 'nothing after the 12 bytes').toBe(false);
	});
	it('every JPEG in the decoder corpus that decodes cleans to the same pixels', () => {
		const dir = new URL('./decode/fixtures/jpeg/', import.meta.url);
		let checked = 0;
		for (const name of readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
			const original = new Uint8Array(readFileSync(new URL(name, dir)));
			let before: Uint8ClampedArray;
			try {
				before = decodeJpegSync(original).data;
			} catch {
				continue; // a damaged file the decoder refuses has no pixels to compare
			}
			const clean = cleanJpeg(original);
			if (!clean) continue; // refused (cut short): the importer re-encodes it instead
			expect(Buffer.from(decodeJpegSync(clean).data).equals(Buffer.from(before)), name).toBe(true);
			checked++;
		}
		expect(checked).toBeGreaterThan(40);
	});
});

describe('cleanJpeg — the rest of the file', () => {
	it('drops everything after the end-of-image marker (a second image, a motion-photo video) and every MPF/vendor APP segment', () => {
		const trailer = [...jpeg(5, [jpegSegment(0xe1, ascii(`Exif\0\0${GPS}`))])]; // a whole second JPEG, with its own EXIF
		const dirty = new Uint8Array([...jpeg(1, [jpegSegment(0xe2, ascii('MPF\0abc')), jpegSegment(0xeb, ascii(GPS))]), ...trailer, ...ascii('ftypmp42')]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = cleanJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS) || has(clean, 'MPF') || has(clean, 'ftyp')).toBe(false);
		expect(clean.at(-1)).toBe(0xd9);
		expect(cleanJpeg(clean)).toEqual(clean);
	});
	it('drops an APPn or comment segment placed BETWEEN the scans of a progressive file', () => {
		const seg = (m: number, d: number[]) => jpegSegment(m, d);
		const sos = seg(0xda, [1, 1, 0, 0, 63, 0]);
		const file = new Uint8Array([0xff, 0xd8, ...seg(0xe0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), ...sos, 7, 8, 9, ...seg(0xe1, ascii(`Exif\0\0${GPS}`)), ...sos, 4, 5, 6, 0xff, 0xd9]);
		expect(has(file, GPS)).toBe(true);
		const clean = cleanJpeg(file) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(clean.at(-1)).toBe(0xd9);
	});
	it('keeps a picture’s rotation as an orientation-only EXIF block, and nothing else from it', () => {
		const clean = cleanJpeg(jpeg(1, [jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(6)])])) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		const at = new TextDecoder('latin1').decode(clean).indexOf('Exif');
		expect(tiffOrientation(clean.subarray(at + 6, at + 6 + 26))).toBe(6);
	});
	it('keeps the turn of the FIRST Exif block only, as the reader and the engines do', () => {
		const exifCount = (b: Uint8Array) => new TextDecoder('latin1').decode(b).split('Exif\0\0').length - 1;
		const tiffNoTag = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x0f, 0, 2, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0];
		// Orientation 1, then 6: no engine turns it, so the clean file must carry no turn.
		expect(exifCount(cleanJpeg(jpeg(1, [jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(1)]), jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(6)])])) as Uint8Array)).toBe(0);
		// A first block with no Orientation tag, then 6: Chromium and Firefox leave it unturned.
		expect(exifCount(cleanJpeg(jpeg(1, [jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiffNoTag]), jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(6)])])) as Uint8Array)).toBe(0);
		// An APP1 that says `Exif` without the two zero bytes is not an Exif block, so the next one is the first.
		const kept = cleanJpeg(jpeg(1, [jpegSegment(0xe1, [...ascii('Exif!!'), ...tiff(8)]), jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(6)])])) as Uint8Array;
		expect(exifCount(kept)).toBe(1);
		const at = new TextDecoder('latin1').decode(kept).indexOf('Exif\0\0');
		expect(tiffOrientation(kept.subarray(at + 6, at + 6 + 26)), 'the turn is the real Exif block\'s').toBe(6);
	});
	it('a real JPEG cleans to the turn readImage reads from the original, whatever its Exif blocks say', () => {
		const px = new Uint8ClampedArray(16 * 8 * 4).fill(128);
		const base = encodeJpeg(px, 16, 8, 80);
		const exif = (o: number) => jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(o)]);
		const xmp = jpegSegment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x/>'));
		const cases = [[exif(6)], [exif(1), exif(6)], [exif(6), exif(1)], [xmp, exif(8)], [exif(3), exif(6), exif(8)], [exif(9), exif(6)], []];
		for (const [k, blocks] of cases.entries()) {
			const file = new Uint8Array([0xff, 0xd8, ...blocks.flat(), ...base.subarray(2)]);
			const clean = cleanJpeg(file) as Uint8Array;
			expect(readImage(clean)?.orientation, `case ${k}`).toBe(readImage(file)?.orientation);
		}
	});
	it('keeps an ICC profile and drops an APP2 that is not one', () => {
		const clean = cleanJpeg(jpeg(1, [jpegSegment(0xe2, ascii('ICC_PROFILE\0abc')), jpegSegment(0xe2, ascii('MPF\0abcdefghij'))])) as Uint8Array;
		expect(has(clean, 'ICC_PROFILE')).toBe(true);
		expect(has(clean, 'MPF')).toBe(false);
	});
	it('answers null for a JPEG cut anywhere before its end marker', () => {
		const j = jpeg(1);
		for (let n = 4; n < j.length; n++) expect(cleanJpeg(j.subarray(0, n)), `${n} bytes`).toBeNull();
	});
});

describe('cut-short files are refused, not stored as pictures that cannot decode', () => {
	it('a WebP cut at any point is null unless it still holds a whole picture', () => {
		const w = webp(1, [webpChunk('EXIF', ascii(GPS))]);
		for (let n = 12; n < w.length - 1; n++) {
			const out = cleanWebp(w.subarray(0, n));
			// Either refused, or (cut only inside the dropped EXIF chunk) a complete picture with the right RIFF size.
			if (out) expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true), `${n} bytes`).toBe(out.length - 8);
		}
		expect(cleanWebp(w.subarray(0, 30)), 'only the VP8X header: no picture').toBeNull();
	});
	it('a WebP with no image chunk is null', () => {
		const body = [...ascii('WEBP'), ...webpChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])];
		expect(cleanWebp(new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]))).toBeNull();
	});
	it('a GIF whose frame data stops before its terminator is null', () => {
		const g = gif([]);
		expect(cleanGif(g.subarray(0, g.length - 2))).toBeNull(); // cut inside the frame's data sub-blocks
		expect(cleanGif(g.subarray(0, g.length - 1)), 'only the trailer missing is fine').not.toBeNull();
	});
});

describe('cleanerFor', () => {
	it('has one for the four stored types and none for the rest', () => {
		for (const m of ['image/png', 'image/webp', 'image/gif', 'image/jpeg']) expect(cleanerFor(m), m).toBeTypeOf('function');
		for (const m of ['image/avif', 'image/svg+xml']) expect(cleanerFor(m), m).toBeUndefined();
		// A MIME type is text from a file: a name an object inherits must not come back as a "cleaner".
		for (const m of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(cleanerFor(m), m).toBeUndefined();
	});
});
