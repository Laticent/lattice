/**
 * read — what a picture is, from its header alone: format, pixel size, whether it may carry
 * transparency, and the turn a browser applies when it paints it (the EXIF Orientation, 1 to 8).
 *
 * ONE READER. Lattice had four, and they disagreed on real files (a second EXIF block, an EXIF
 * block after the frame header, junk bytes between JPEG segments, an orientation of 9). Each
 * disagreement is a row in read.test.ts, settled by what Chromium, WebKit and Firefox actually
 * paint; the rules below follow that evidence, not any one old reader.
 *
 * UNTRUSTED BYTES. Every read is bounds-checked and every loop advances, so a truncated or hostile
 * file gives `null`, never an exception, a hang or a size that is not a positive integer within
 * the format's own limits (read.fuzz.test.ts holds that over seeded corruptions).
 */

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'svg';

/** The header facts about one picture. `width` and `height` are the STORED size, before `orientation` turns it. */
export interface ImageInfo {
	format: Exclude<ImageFormat, 'svg'>;
	mime: string;
	/** Stored pixel width: an integer from 1 to the format's maximum. */
	width: number;
	/** Stored pixel height: an integer from 1 to the format's maximum. */
	height: number;
	/** The picture MAY have transparent pixels (a hint from the header: the pixels decide). False only when the format or header rules it out. */
	alpha: boolean;
	/** The EXIF Orientation a browser applies, 1 (none) to 8. 5 to 8 swap width and height on screen. */
	orientation: number;
}

/** The MIME type for each format. */
export const IMAGE_MIME: Readonly<Record<ImageFormat, string>> = Object.freeze({
	png: 'image/png',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	svg: 'image/svg+xml',
});

/** The largest size a PNG or an AVIF `ispe` may state: PNG caps each side at 2^31 - 1. */
const MAX_U31 = 0x7fffffff;

type Bytes = ArrayLike<number>;
const readU16be = (b: Bytes, i: number) => (b[i] << 8) | b[i + 1];
const readU16le = (b: Bytes, i: number) => b[i] | (b[i + 1] << 8);
const readU32be = (b: Bytes, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const readU32le = (b: Bytes, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const fourCC = (b: Bytes, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const asciiAt = (b: Bytes, i: number, s: string) => {
	for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false;
	return true;
};
const isSide = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

/**
 * The format, by magic number. Needs only the first 12 bytes for every raster format (an AVIF's
 * compatible brands, read when present, need up to 64). An SVG is markup, found by its first tag.
 * Null for anything else, HEIC included.
 */
export function imageFormat(b: Bytes): ImageFormat | null {
	if (!b || b.length < 3) return null;
	// JPEG: the start-of-image marker followed by a marker.
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
	// PNG: all eight signature bytes; the last four exist to catch a file mangled by a text-mode transfer.
	if (b.length >= 8 && b[0] === 0x89 && asciiAt(b, 1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
	if (b.length >= 6 && (asciiAt(b, 0, 'GIF87a') || asciiAt(b, 0, 'GIF89a'))) return 'gif';
	if (b.length >= 12 && asciiAt(b, 0, 'RIFF') && asciiAt(b, 8, 'WEBP')) return 'webp';
	if (b.length >= 12 && asciiAt(b, 4, 'ftyp') && isAvifBrand(b)) return 'avif';
	if (isSvgText(b)) return 'svg';
	return null;
}

/** AVIF by its major brand, or by a compatible brand under the generic `mif1`/`msf1` major brand. */
function isAvifBrand(b: Bytes): boolean {
	const major = fourCC(b, 8);
	if (major === 'avif' || major === 'avis') return true;
	if (major !== 'mif1' && major !== 'msf1') return false;
	const size = readU32be(b, 0);
	const end = Math.min(b.length, size >= 16 ? size : 0, 64);
	for (let i = 16; i + 4 <= end; i += 4) {
		const brand = fourCC(b, i);
		if (brand === 'avif' || brand === 'avis') return true;
	}
	return false;
}

/** Markup that opens (after a byte-order mark and white space) with `<` and names an `<svg` element in its first 2 KB. */
function isSvgText(b: Bytes): boolean {
	let i = 0;
	if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
	while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
	if (b[i] !== 0x3c) return false;
	const end = Math.min(b.length, 2048);
	for (let k = i; k + 4 < end; k++) {
		if (b[k] === 0x3c && (b[k + 1] | 0x20) === 0x73 && (b[k + 2] | 0x20) === 0x76 && (b[k + 3] | 0x20) === 0x67) {
			const next = b[k + 4];
			if (next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d || next === 0x3e || next === 0x2f) return true;
		}
	}
	return false;
}

/**
 * Read a picture's header. Null when the bytes are not a PNG, JPEG, GIF, WebP or AVIF, or the header
 * is cut short or states an impossible size. An SVG is recognized by `imageFormat` but has no pixel
 * size here: its box is the markup's `width`/`height`/`viewBox`, which Lattice reads with the inline
 * posters (lib/core/image-aspect.js `aspectFromSvgTag`).
 */
export function readImage(b: Uint8Array): ImageInfo | null {
	switch (imageFormat(b)) {
		case 'png':
			return readPng(b);
		case 'jpeg':
			return readJpeg(b);
		case 'gif':
			return readGif(b);
		case 'webp':
			return readWebp(b);
		case 'avif':
			return readAvif(b);
		default:
			return null;
	}
}

/** The size a browser paints: the stored size, with width and height swapped for a quarter turn (orientation 5 to 8). */
export function displaySize(size: Pick<ImageInfo, 'width' | 'height' | 'orientation'>): { width: number; height: number } {
	return size.orientation >= 5 ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

const headerInfo = (format: ImageInfo['format'], width: number, height: number, alpha: boolean, orientation: number): ImageInfo => ({
	format,
	mime: IMAGE_MIME[format],
	width,
	height,
	alpha,
	orientation,
});

// ── EXIF ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The Orientation tag (1 to 8) of a TIFF block (the body of a JPEG `Exif` segment past its six-byte
 * header, a PNG `eXIf` chunk, a WebP `EXIF` chunk). 1 when the block is not TIFF (`II*\0` or `MM\0*`),
 * has no tag, is cut short, or states a value outside 1 to 8: no engine turns a picture for one of those.
 */
export function tiffOrientation(t: Bytes): number {
	if (!t || t.length < 14) return 1;
	const le = t[0] === 0x49 && t[1] === 0x49;
	if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 1;
	const u16 = (i: number) => (le ? readU16le(t, i) : readU16be(t, i));
	if (u16(2) !== 42) return 1;
	const ifd = le ? readU32le(t, 4) : readU32be(t, 4);
	if (ifd < 8 || ifd + 2 > t.length) return 1;
	const n = Math.min(u16(ifd), 256);
	for (let k = 0; k < n; k++) {
		const e = ifd + 2 + k * 12;
		if (e + 12 > t.length) return 1;
		if (u16(e) === 0x0112) {
			const v = u16(e + 8);
			return v >= 1 && v <= 8 ? v : 1;
		}
	}
	return 1;
}

/** A view of `b` from `start` to `end`, without copying when `b` can make one. */
const tiffSlice = (b: Uint8Array, start: number, end: number) => b.subarray(start, Math.max(start, Math.min(end, b.length)));

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────

function readPng(b: Uint8Array): ImageInfo | null {
	// The first chunk is IHDR: 13 bytes of width, height, bit depth, color type, ….
	if (b.length < 26 || readU32be(b, 8) !== 13 || !asciiAt(b, 12, 'IHDR')) return null;
	const width = readU32be(b, 16);
	const height = readU32be(b, 20);
	if (!isSide(width, MAX_U31) || !isSide(height, MAX_U31)) return null;
	const colorType = b[25];
	// Gray + alpha and RGBA carry an alpha channel; a palette or gray PNG carries it in a tRNS chunk.
	let alpha = colorType === 4 || colorType === 6;
	let orientation = 1;
	// The ancillary chunks a browser reads sit before the first IDAT: tRNS, and the eXIf whose
	// rotation Chromium and Firefox apply (WebKit does not; read.test.ts has the probe).
	for (let o = 33; o + 8 <= b.length; ) {
		const len = readU32be(b, o);
		const type = fourCC(b, o + 4);
		if (type === 'IDAT' || type === 'IEND') break;
		if (type === 'tRNS') alpha = true;
		else if (type === 'eXIf' && orientation === 1) orientation = tiffOrientation(tiffSlice(b, o + 8, o + 8 + len));
		o += 12 + len;
	}
	return headerInfo('png', width, height, alpha, orientation);
}

// ── JPEG ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The frame size (from the first start-of-frame segment) and the orientation, walking the header the
 * way libjpeg does, up to the start of scan:
 *
 * - bytes that are not a marker are skipped to the next 0xFF, and 0xFF fill bytes are skipped, as
 *   libjpeg resynchronizes (every engine paints such a file);
 * - the FIRST APP1 segment that opens with `Exif\0\0` decides the orientation, wherever it sits
 *   before the scan, even after the frame header. A later one is ignored even when the first has no
 *   tag: Chromium and Firefox agree; WebKit reads on past a first block with no tag (read.test.ts).
 */
function readJpeg(b: Uint8Array): ImageInfo | null {
	let width = 0;
	let height = 0;
	let orientation = 0; // 0 = no Exif block seen yet
	let o = 2;
	while (o + 1 < b.length) {
		if (b[o] !== 0xff) {
			o++;
			continue;
		}
		const marker = b[o + 1];
		if (marker === 0xff) {
			o++;
			continue;
		}
		// Markers with no length: TEM, the restart markers, a stray SOI, and a 0xFF00 stuffing pair.
		if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
			o += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) break; // end of image, start of scan: the header is over
		if (o + 4 > b.length) break;
		const len = readU16be(b, o + 2);
		if (len < 2) return null;
		const body = o + 4;
		const end = o + 2 + len;
		// SOF0..SOF15 hold the frame size, except DHT (C4), JPG (C8) and DAC (CC).
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && !width) {
			if (len < 7 || body + 5 > b.length) return null;
			height = readU16be(b, body + 1);
			width = readU16be(b, body + 3);
			// A height of 0 is set later by a DNL segment, which a header read cannot know.
			if (!width || !height) return null;
		} else if (marker === 0xe1 && !orientation && len >= 8 && asciiAt(b, body, 'Exif') && b[body + 4] === 0 && b[body + 5] === 0) {
			orientation = tiffOrientation(tiffSlice(b, body + 6, end));
		}
		o = end;
	}
	return width ? headerInfo('jpeg', width, height, false, orientation || 1) : null;
}

// ── GIF ─────────────────────────────────────────────────────────────────────────────────────────

/** The logical screen size. Transparency is set per frame, past the header, so a GIF may always have it. */
function readGif(b: Uint8Array): ImageInfo | null {
	if (b.length < 10) return null;
	const width = readU16le(b, 6);
	const height = readU16le(b, 8);
	if (!isSide(width, 0xffff) || !isSide(height, 0xffff)) return null;
	return headerInfo('gif', width, height, true, 1);
}

// ── WebP ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The canvas size from the first chunk: VP8 (lossy, 14-bit sizes after its start code), VP8L
 * (lossless, after its 0x2F signature), or VP8X (extended, 24-bit sizes and the alpha flag). No engine
 * applies a WebP's EXIF orientation (read.test.ts), so it is always 1.
 */
function readWebp(b: Uint8Array): ImageInfo | null {
	if (b.length < 30) return null;
	const fmt = fourCC(b, 12);
	if (fmt === 'VP8 ') {
		if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
		const width = readU16le(b, 26) & 0x3fff;
		const height = readU16le(b, 28) & 0x3fff;
		if (!width || !height) return null;
		return headerInfo('webp', width, height, false, 1);
	}
	if (fmt === 'VP8L') {
		if (b[20] !== 0x2f) return null;
		const bits = readU32le(b, 21);
		// 14 bits of width - 1, 14 of height - 1, then the alpha_is_used hint.
		return headerInfo('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, ((bits >>> 28) & 1) === 1, 1);
	}
	if (fmt === 'VP8X') {
		const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
		const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
		// The canvas width times height must fit in 32 bits (the WebP container spec).
		if (width * height > 0xffffffff) return null;
		return headerInfo('webp', width, height, (b[20] & 0x10) !== 0, 1);
	}
	return null;
}

// ── AVIF ────────────────────────────────────────────────────────────────────────────────────────

/** One ISO box: its type and where its body starts and ends. */
interface Box {
	type: string;
	body: number;
	end: number;
}

/** The boxes directly inside `[from, to)`. Stops at the first box that does not fit. */
function childBoxes(b: Uint8Array, from: number, to: number): Box[] {
	const out: Box[] = [];
	let o = from;
	while (o + 8 <= to && out.length < 4096) {
		let size = readU32be(b, o);
		let body = o + 8;
		if (size === 1) {
			if (o + 16 > to) break;
			// A 64-bit size: anything past 2^32 is past any buffer this reads.
			if (readU32be(b, o + 8) !== 0) break;
			size = readU32be(b, o + 12);
			body = o + 16;
		} else if (size === 0) size = to - o;
		const end = o + size;
		if (size < body - o || end > to) break;
		out.push({ type: fourCC(b, o + 4), body, end });
		o = end;
	}
	return out;
}

const firstBox = (list: Box[], type: string) => list.find((x) => x.type === type);

// A picture's turn as a 2x2 matrix on (x right, y down), and the EXIF orientation each of the eight is.
type Turn = readonly [number, number, number, number];
const EXIF_TURNS: ReadonlyArray<readonly [Turn, number]> = [
	[[1, 0, 0, 1], 1],
	[[-1, 0, 0, 1], 2], // mirror left-right
	[[-1, 0, 0, -1], 3], // half turn
	[[1, 0, 0, -1], 4], // mirror top-bottom
	[[0, 1, 1, 0], 5], // transpose
	[[0, -1, 1, 0], 6], // quarter turn clockwise
	[[0, -1, -1, 0], 7], // transverse
	[[0, 1, -1, 0], 8], // quarter turn anticlockwise
];
const turnTimes = (a: Turn, m: Turn): Turn => [a[0] * m[0] + a[1] * m[2], a[0] * m[1] + a[1] * m[3], a[2] * m[0] + a[3] * m[2], a[2] * m[1] + a[3] * m[3]];
const ANTICLOCKWISE: Turn = [0, 1, -1, 0];
const exifOf = (m: Turn) => EXIF_TURNS.find(([t]) => t.every((v, i) => v === m[i]))?.[1] ?? 1;

/**
 * The primary item's `ispe` size and its `irot`/`imir` turn, through `pitm` and `ipma`. A grid or a
 * picture with an alpha plane has several `ispe` boxes, and only the primary item's is the canvas.
 */
function readAvif(b: Uint8Array): ImageInfo | null {
	const meta = firstBox(childBoxes(b, 0, b.length), 'meta');
	if (!meta || meta.body + 4 > meta.end) return null;
	const inMeta = childBoxes(b, meta.body + 4, meta.end); // FullBox: version and flags first
	const pitm = firstBox(inMeta, 'pitm');
	const iprp = firstBox(inMeta, 'iprp');
	if (!pitm || !iprp || pitm.body + 6 > pitm.end) return null;
	const primary = b[pitm.body] === 0 ? readU16be(b, pitm.body + 4) : readU32be(b, pitm.body + 4);
	const inIprp = childBoxes(b, iprp.body, iprp.end);
	const ipco = firstBox(inIprp, 'ipco');
	if (!ipco) return null;
	const props = childBoxes(b, ipco.body, ipco.end);
	// Every ipma box lists, per item, the 1-based indices into ipco of the properties it carries.
	const mine: number[] = [];
	for (const ipma of inIprp.filter((x) => x.type === 'ipma')) {
		if (ipma.body + 8 > ipma.end) return null;
		const version = b[ipma.body];
		const wide = (b[ipma.body + 3] & 1) === 1;
		const count = readU32be(b, ipma.body + 4);
		let o = ipma.body + 8;
		for (let e = 0; e < count; e++) {
			const idSize = version < 1 ? 2 : 4;
			if (o + idSize + 1 > ipma.end) return null;
			const id = version < 1 ? readU16be(b, o) : readU32be(b, o);
			const n = b[o + idSize];
			o += idSize + 1;
			if (o + n * (wide ? 2 : 1) > ipma.end) return null;
			for (let k = 0; k < n; k++) {
				const index = wide ? readU16be(b, o) & 0x7fff : b[o] & 0x7f;
				o += wide ? 2 : 1;
				if (id === primary) mine.push(index);
			}
		}
	}
	let width = 0;
	let height = 0;
	// `irot` and `imir` apply in the order the item lists them (HEIF, ISO/IEC 23008-12 §6.5.10, §6.5.12).
	let turn: Turn = [1, 0, 0, 1];
	for (const index of mine) {
		const p = props[index - 1];
		if (!p) continue;
		if (p.type === 'ispe' && p.body + 12 <= p.end) {
			width = readU32be(b, p.body + 4);
			height = readU32be(b, p.body + 8);
		} else if (p.type === 'irot' && p.body < p.end) {
			// Anticlockwise quarter turns.
			for (let k = b[p.body] & 3; k > 0; k--) turn = turnTimes(ANTICLOCKWISE, turn);
		} else if (p.type === 'imir' && p.body < p.end) {
			// Axis 0 is the vertical axis (a left-right flip), axis 1 the horizontal one (top-bottom).
			turn = turnTimes((b[p.body] & 1) === 0 ? [-1, 0, 0, 1] : [1, 0, 0, -1], turn);
		}
	}
	if (!isSide(width, MAX_U31) || !isSide(height, MAX_U31)) return null;
	// An AVIF may carry an alpha plane as an auxiliary item; the header alone says only that it may.
	return headerInfo('avif', width, height, true, exifOf(turn));
}
