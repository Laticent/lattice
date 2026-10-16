// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scrubberFor, scrubGif, scrubJpeg, scrubPng, scrubWebp, tiffOrientation } from './media-scrub';
import { jpeg, jpegSegment, png, pngChunk, webp, webpChunk } from './test-images';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s);
const GPS = 'GPSLatitude=51.5'; // the marker: if it survives, the location survives

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

describe('scrubPng — a keep-list', () => {
	it('drops every chunk that is not on the list, including ones nobody has heard of, and keeps the picture', () => {
		const junk = ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'caBX', 'tIME', 'exIf', 'zxIf', 'iTXT', 'vpAg', 'prVW', 'mkBS', 'zzZz'];
		const dirty = png(1, [...junk.map((t) => pngChunk(t, ascii(`${t}${GPS}`))), pngChunk('gAMA', [0, 0, 177, 143]), pngChunk('iCCP', ascii('profile\0\0abc'))]);
		expect(has(dirty, GPS), 'positive control: the input carries the marker').toBe(true);
		const clean = scrubPng(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		for (const t of junk) expect(has(clean, t), t).toBe(false);
		for (const t of ['IHDR', 'gAMA', 'iCCP', 'IDAT', 'IEND']) expect(has(clean, t), t).toBe(true);
		expect(scrubPng(clean)).toEqual(clean); // idempotent
	});
	it('leaves a clean PNG byte for byte', () => {
		const p = png(4);
		expect(scrubPng(p)).toEqual(p);
	});
	it('keeps a picture’s rotation as a chunk of its own, with nothing else from the EXIF block', () => {
		const clean = scrubPng(png(1, [pngChunk('eXIf', tiff(6))])) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'eXIf')).toBe(true);
		const at = new TextDecoder('latin1').decode(clean).indexOf('eXIf');
		expect(tiffOrientation(clean.subarray(at + 4, at + 4 + 26))).toBe(6);
	});
	it('drops an eXIf that does not rotate the picture', () => {
		expect(has(scrubPng(png(1, [pngChunk('eXIf', tiff(1))])) as Uint8Array, 'eXIf')).toBe(false);
	});
	it('answers null for a file that is not a PNG or is cut short, so the importer re-encodes it', () => {
		expect(scrubPng(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(scrubPng(png().subarray(0, 40))).toBeNull();
	});
	it('drops whatever follows IEND', () => {
		const p = png();
		const trailing = new Uint8Array([...p, ...ascii(GPS)]);
		expect(has(scrubPng(trailing) as Uint8Array, GPS)).toBe(false);
	});
});

describe('scrubWebp — a keep-list', () => {
	it('drops EXIF, XMP and every unknown chunk, clears the VP8X flags, and rewrites the RIFF size', () => {
		const junk = ['EXIF', 'XMP ', 'C2PA', 'exif', 'XMP\0', 'zzzz'];
		const dirty = webp(1, junk.map((t) => webpChunk(t, ascii(`${t}${GPS}`))), 0x0c);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubWebp(dirty) as Uint8Array;
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
		const clean = scrubWebp(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'ANMF') && has(clean, 'ANIM')).toBe(true);
		expect(new DataView(clean.buffer, clean.byteOffset).getUint32(4, true)).toBe(clean.length - 8);
	});
	it('keeps a rotation as an orientation-only EXIF chunk, and the flag that announces it', () => {
		const clean = scrubWebp(webp(1, [webpChunk('EXIF', tiff(8))], 0x08)) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		const at = new TextDecoder('latin1').decode(clean).indexOf('EXIF');
		expect(at).toBeGreaterThan(0);
		expect(tiffOrientation(clean.subarray(at + 8, at + 8 + 26))).toBe(8);
		expect(clean[20] & 0b1000).toBe(0b1000);
	});
	it('reads a file whose last chunk is odd-sized and unpadded, as a browser does', () => {
		const body = [...ascii('WEBP'), ...webpChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...ascii('VP8 '), ...le32(3), 7, 7, 7]; // no pad byte
		const odd = new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
		const clean = scrubWebp(odd) as Uint8Array;
		expect(clean).not.toBeNull();
		expect(clean.length % 2).toBe(0);
	});
	it('answers null for something that is not a WebP', () => {
		expect(scrubWebp(new Uint8Array(30))).toBeNull();
	});
});

const sub = (data: number[]) => [data.length, ...data, 0];
const gif = (exts: number[][], trailer = true) =>
	new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...exts.flat(), 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, ...sub([1, 2, 3]), ...(trailer ? [0x3b] : [])]);

describe('scrubGif — a keep-list', () => {
	const netscape = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), ...sub([1, 0, 0])];
	it('keeps the loop count, frame timing and colour profile; drops comments, XMP, plain text and extra data', () => {
		const xmp = [0x21, 0xff, 11, ...ascii('XMP DataXMP'), ...sub(ascii(GPS))];
		const comment = [0x21, 0xfe, ...sub(ascii(GPS))];
		const plain = [0x21, 0x01, ...sub([...Array(12).fill(0), ...ascii(GPS)])];
		const gce = [0x21, 0xf9, ...sub([0, 10, 0, 0])];
		const icc = [0x21, 0xff, 11, ...ascii('ICCRGBG1012'), ...sub([1, 2, 3])];
		// One extension, two data blocks, one terminator: the loop count, then bytes that are not a loop count.
		const loopWithExtra = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, ...sub(ascii(GPS))];
		const dirty = gif([loopWithExtra, xmp, comment, plain, gce, icc]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubGif(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'NETSCAPE2.0') && has(clean, 'ICCRGBG1012'), 'loop count and colour profile stay').toBe(true);
		expect(clean.at(-1)).toBe(0x3b);
		expect(scrubGif(clean)).toEqual(clean);
	});
	it('reads a GIF that has no trailer, as a browser does, and gives it one', () => {
		const clean = scrubGif(gif([netscape], false)) as Uint8Array;
		expect(clean.at(-1)).toBe(0x3b);
	});
	it('answers null for a truncated or non-GIF file', () => {
		expect(scrubGif(new Uint8Array(20))).toBeNull();
		expect(scrubGif(gif([]).subarray(0, 14))).toBeNull();
	});
});

describe('scrubJpeg', () => {
	it('drops EXIF, XMP, IPTC and comments; keeps JFIF, the colour profile and the scan', () => {
		const dirty = jpeg(1, [jpegSegment(0xe1, ascii(`Exif\0\0${GPS}`)), jpegSegment(0xe1, ascii(`http://ns.adobe.com/xap/1.0/\0${GPS}`)), jpegSegment(0xed, ascii(`Photoshop 3.0\0${GPS}`)), jpegSegment(0xfe, ascii(GPS)), jpegSegment(0xe2, ascii('ICC_PROFILE\0abc'))]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(has(clean, 'JFIF') && has(clean, 'ICC_PROFILE')).toBe(true);
		expect(clean.at(-1)).toBe(0xd9);
	});
	it('leaves a clean JPEG byte for byte and answers null for a file that is not one', () => {
		const j = jpeg(3);
		expect(scrubJpeg(j)).toEqual(j);
		expect(scrubJpeg(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
		expect(scrubJpeg(j.subarray(0, 10))).toBeNull();
	});
});

describe('scrubJpeg — the rest of the file', () => {
	it('drops everything after the end-of-image marker (a second image, a motion-photo video) and every MPF/vendor APP segment', () => {
		const trailer = [...jpeg(5, [jpegSegment(0xe1, ascii(`Exif\0\0${GPS}`))])]; // a whole second JPEG, with its own EXIF
		const dirty = new Uint8Array([...jpeg(1, [jpegSegment(0xe2, ascii('MPF\0abc')), jpegSegment(0xeb, ascii(GPS))]), ...trailer, ...ascii('ftypmp42')]);
		expect(has(dirty, GPS)).toBe(true);
		const clean = scrubJpeg(dirty) as Uint8Array;
		expect(has(clean, GPS) || has(clean, 'MPF') || has(clean, 'ftyp')).toBe(false);
		expect(clean.at(-1)).toBe(0xd9);
		expect(scrubJpeg(clean)).toEqual(clean);
	});
	it('drops an APPn or comment segment placed BETWEEN the scans of a progressive file', () => {
		const seg = (m: number, d: number[]) => jpegSegment(m, d);
		const sos = seg(0xda, [1, 1, 0, 0, 63, 0]);
		const file = new Uint8Array([0xff, 0xd8, ...seg(0xe0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), ...sos, 7, 8, 9, ...seg(0xe1, ascii(`Exif\0\0${GPS}`)), ...sos, 4, 5, 6, 0xff, 0xd9]);
		expect(has(file, GPS)).toBe(true);
		const clean = scrubJpeg(file) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		expect(clean.at(-1)).toBe(0xd9);
	});
	it('keeps a picture’s rotation as an orientation-only EXIF block, and nothing else from it', () => {
		const clean = scrubJpeg(jpeg(1, [jpegSegment(0xe1, [...ascii('Exif\0\0'), ...tiff(6)])])) as Uint8Array;
		expect(has(clean, GPS)).toBe(false);
		const at = new TextDecoder('latin1').decode(clean).indexOf('Exif');
		expect(tiffOrientation(clean.subarray(at + 6, at + 6 + 26))).toBe(6);
	});
	it('keeps an ICC profile and drops an APP2 that is not one', () => {
		const clean = scrubJpeg(jpeg(1, [jpegSegment(0xe2, ascii('ICC_PROFILE\0abc')), jpegSegment(0xe2, ascii('MPF\0abcdefghij'))])) as Uint8Array;
		expect(has(clean, 'ICC_PROFILE')).toBe(true);
		expect(has(clean, 'MPF')).toBe(false);
	});
	it('answers null for a JPEG cut anywhere before its end marker', () => {
		const j = jpeg(1);
		for (let n = 4; n < j.length; n++) expect(scrubJpeg(j.subarray(0, n)), `${n} bytes`).toBeNull();
	});
});

describe('cut-short files are refused, not stored as pictures that cannot decode', () => {
	it('a WebP cut at any point is null unless it still holds a whole picture', () => {
		const w = webp(1, [webpChunk('EXIF', ascii(GPS))]);
		for (let n = 12; n < w.length - 1; n++) {
			const out = scrubWebp(w.subarray(0, n));
			// Either refused, or (cut only inside the dropped EXIF chunk) a complete picture with the right RIFF size.
			if (out) expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true), `${n} bytes`).toBe(out.length - 8);
		}
		expect(scrubWebp(w.subarray(0, 30)), 'only the VP8X header: no picture').toBeNull();
	});
	it('a WebP with no image chunk is null', () => {
		const body = [...ascii('WEBP'), ...webpChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])];
		expect(scrubWebp(new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]))).toBeNull();
	});
	it('a GIF whose frame data stops before its terminator is null', () => {
		const g = gif([]);
		expect(scrubGif(g.subarray(0, g.length - 2))).toBeNull(); // cut inside the frame's data sub-blocks
		expect(scrubGif(g.subarray(0, g.length - 1)), 'only the trailer missing is fine').not.toBeNull();
	});
});

describe('scrubberFor', () => {
	it('has one for the four stored types and none for the rest', () => {
		for (const m of ['image/png', 'image/webp', 'image/gif', 'image/jpeg']) expect(scrubberFor(m), m).toBeTypeOf('function');
		for (const m of ['image/avif', 'image/svg+xml']) expect(scrubberFor(m), m).toBeUndefined();
	});
});
