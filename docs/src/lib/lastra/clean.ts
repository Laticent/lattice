/**
 * clean — remove embedded metadata (EXIF, XMP, C2PA, text chunks, comments, timestamps) from a picture WITHOUT
 * re-encoding it, so the pixels, transparency and animation are what the person added. A phone's location lives in
 * that metadata, and a picture that kept it leaks it into every file it is embedded in. Lattice's decision note:
 * engineering/decisions/2026-10-12-library-media-assets.md §3.
 *
 * KEEP-LISTS, NOT DROP-LISTS. Each cleaner copies only the blocks the picture needs to be drawn and drops everything
 * else, so a metadata block this file has never heard of (a C2PA `caBX` manifest, a `tIME` timestamp, a vendor chunk)
 * cannot ride through. The cost is that a future format chunk is lost until it is added here; a missing chunk costs
 * fidelity at worst, a missing drop-list entry costs a privacy leak.
 *
 * Each cleaner returns the cleaned bytes, or null when the file does not parse as its format or is cut short: the
 * caller then re-encodes through a decoder, which is slower and lossier but never ships a block it could not read.
 */

import { crc32 } from './png.js';
import { tiffOrientation } from './read.js';

const cleanU32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const cleanU32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const chunkTag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

function joinBytes(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** A TIFF block holding ONLY the Orientation tag: no location, no date, no camera. A browser that applies a
 *  PNG's or WebP's rotation tag keeps showing the picture the way the author saw it, and nothing else survives. */
function orientationOnlyTiff(orientation: number): Uint8Array {
	return new Uint8Array([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation & 255, 0, 0, 0, 0, 0, 0]);
}

function pngOrientationChunk(orientation: number): Uint8Array {
	const body = orientationOnlyTiff(orientation);
	const out = new Uint8Array(12 + body.length);
	const v = new DataView(out.buffer);
	v.setUint32(0, body.length);
	out.set([0x65, 0x58, 0x49, 0x66], 4); // eXIf
	out.set(body, 8);
	v.setUint32(8 + body.length, crc32(out, 4, 8 + body.length));
	return out;
}

// PNG chunks a picture needs. `tIME`, `eXIf`, `tEXt`, `zTXt`, `iTXt` (XMP), `caBX` (C2PA) and every private
// chunk are dropped. `iCCP` stays: it is the color profile, and without it the colors shift.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'cICP', 'acTL', 'fcTL', 'fdAT']);

/** PNG: copy the keep-listed chunks. An `eXIf` that rotates the picture is replaced by one holding only the
 *  rotation (browsers differ on whether they apply it, so it must stay). Null when it is not a PNG or is cut short. */
export function cleanPng(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || b[0] !== 0x89 || chunkTag(b, 1) !== 'PNG\r') return null;
	const parts: Uint8Array[] = [b.subarray(0, 8)];
	let i = 8;
	let sawEnd = false;
	while (i + 12 <= b.length) {
		const len = cleanU32be(b, i);
		const end = i + 12 + len;
		if (end > b.length) return null;
		const type = chunkTag(b, i + 4);
		if (type === 'eXIf') {
			const o = tiffOrientation(b.subarray(i + 8, i + 8 + len));
			if (o !== 1) parts.push(pngOrientationChunk(o));
		}
		if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
		i = end;
		if (type === 'IEND') {
			sawEnd = true;
			break;
		}
	}
	return sawEnd ? joinBytes(parts) : null;
}

// WebP chunks a picture needs. `EXIF`, `XMP ` and every other chunk are dropped. An animation frame (`ANMF`) is
// copied whole after its own sub-chunks are filtered the same way, because metadata can nest inside one.
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const WEBP_FRAME_KEEP = new Set(['VP8 ', 'VP8L', 'ALPH']);

function webpChunks(b: Uint8Array, from: number, to: number, keep: Set<string>, nested: boolean): Uint8Array[] | null {
	const parts: Uint8Array[] = [];
	let i = from;
	while (i + 8 <= to) {
		const len = cleanU32le(b, i + 4);
		let end = i + 8 + len + (len & 1);
		// A file whose last chunk is odd-sized and unpadded still opens in a browser: read it, and pad it on the way out.
		if (end > to && i + 8 + len <= to) end = to;
		if (end > to) return null;
		const type = chunkTag(b, i);
		if (type === 'EXIF' && !nested) {
			// Like a PNG: only the rotation survives, as a chunk of its own.
			const o = tiffOrientation(b.subarray(i + 8, Math.min(i + 8 + len, to)));
			if (o !== 1) {
				const body = orientationOnlyTiff(o);
				const chunk = new Uint8Array(8 + body.length);
				chunk.set([0x45, 0x58, 0x49, 0x46]);
				new DataView(chunk.buffer).setUint32(4, body.length, true);
				chunk.set(body, 8);
				parts.push(chunk);
			}
		}
		if (keep.has(type)) {
			const chunk = new Uint8Array(8 + len + (len & 1));
			chunk.set(b.subarray(i, Math.min(end, i + 8 + len)));
			if (type === 'VP8X' && chunk.length >= 9) chunk[8] &= ~0b1100; // EXIF and XMP flags off
			if (type === 'ANMF' && !nested) {
				// 16 bytes of frame header, then the frame's own chunks.
				if (len < 16) return null;
				const inner = webpChunks(b, i + 8 + 16, i + 8 + len, WEBP_FRAME_KEEP, true);
				if (!inner) return null;
				const body = joinBytes([b.subarray(i + 8, i + 8 + 16), ...inner]);
				const frame = new Uint8Array(8 + body.length + (body.length & 1));
				frame.set(b.subarray(i, i + 4));
				new DataView(frame.buffer).setUint32(4, body.length, true);
				frame.set(body, 8);
				parts.push(frame);
			} else parts.push(chunk);
		}
		i = end;
	}
	return parts;
}

/** WebP: copy the keep-listed chunks, filter inside animation frames, clear the EXIF/XMP flags in `VP8X`, rewrite the RIFF size. */
export function cleanWebp(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || chunkTag(b, 0) !== 'RIFF' || chunkTag(b, 8) !== 'WEBP') return null;
	const declared = 8 + cleanU32le(b, 4);
	// A file shorter than its own header says is cut short (one byte of slack: an unpadded odd last chunk).
	if (declared > b.length + 1) return null;
	const riffEnd = Math.min(b.length, declared);
	const parts = webpChunks(b, 12, riffEnd, WEBP_KEEP, false);
	// And a WebP with no picture in it is not one.
	if (!parts?.some((p) => ['VP8 ', 'VP8L', 'ANMF'].includes(chunkTag(p, 0)))) return null;
	// The VP8X EXIF flag stays on only when an orientation-only EXIF chunk was kept.
	if (parts.some((p) => chunkTag(p, 0) === 'EXIF')) {
		const x = parts.find((p) => chunkTag(p, 0) === 'VP8X');
		if (x) x[8] |= 0b1000;
	}
	const body = joinBytes(parts);
	const out = new Uint8Array(12 + body.length);
	out.set(b.subarray(0, 4), 0);
	new DataView(out.buffer).setUint32(4, 4 + body.length, true);
	out.set(b.subarray(8, 12), 8);
	out.set(body, 12);
	return out;
}

/** GIF: keep the picture, the frame timing, the color profile and the loop count; drop comments, plain-text
 *  blocks and every other application extension (XMP lives in one). A GIF with no trailer, which browsers
 *  still play, is read to its end and given one. */
export function cleanGif(b: Uint8Array): Uint8Array | null {
	if (b.length < 14 || chunkTag(b, 0).slice(0, 3) !== 'GIF') return null;
	const skipSubBlocks = (at: number): number => {
		let i = at;
		while (i < b.length && b[i] !== 0) i += b[i] + 1;
		return i + 1; // past the 0 terminator
	};
	let i = 13 + (b[10] & 0x80 ? 3 * 2 ** ((b[10] & 7) + 1) : 0);
	if (i > b.length) return null;
	const parts: Uint8Array[] = [b.subarray(0, i)];
	let frames = 0;
	while (i < b.length) {
		const kind = b[i];
		if (kind === 0x3b) break;
		if (kind === 0x21) {
			const label = b[i + 1];
			const end = skipSubBlocks(i + 2);
			if (end > b.length) return null;
			const stop = end;
			if (label === 0xf9) parts.push(b.subarray(i, stop)); // graphic control: frame delay, disposal, transparency
			else if (label === 0xff && b[i + 2] === 11) {
				const id = String.fromCharCode(...b.subarray(i + 3, i + 14));
				// The loop count is one 3-byte data block; an ICC profile is its own extension. Anything else goes.
				if (id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') {
					// Only the first data block (sub-block id 1 plus the 16-bit loop count) is kept; more blocks after it are not a loop count.
					const loop = b[i + 14] === 3 && i + 18 <= b.length ? b.subarray(i + 14, i + 18) : new Uint8Array([3, 1, 0, 0]);
					parts.push(new Uint8Array([0x21, 0xff, 11, ...b.subarray(i + 3, i + 14), ...loop, 0]));
				}
				else if (id === 'ICCRGBG1012') parts.push(b.subarray(i, stop));
			}
			i = end;
			continue;
		}
		if (kind === 0x2c) {
			if (i + 10 > b.length) return null;
			const flags = b[i + 9];
			let j = i + 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1; // + LZW minimum code size
			j = skipSubBlocks(j);
			if (j > b.length) return null; // the frame's data must end in its own terminator
			parts.push(b.subarray(i, j));
			frames++;
			i = j;
			continue;
		}
		return null;
	}
	if (!frames) return null;
	parts.push(new Uint8Array([0x3b]));
	return joinBytes(parts);
}

/** JPEG: walk every segment through to the end-of-image marker, keeping JFIF (APP0), an ICC color profile (APP2
 *  that really is one) and the picture's own segments, and dropping EXIF, XMP, IPTC, Photoshop, MPF, vendor
 *  segments and comments. A picture's rotation survives as an orientation-only EXIF block. Everything AFTER the
 *  end-of-image marker is dropped too: cameras append a second image, a motion-photo video or a gain map there,
 *  and each can carry its own location. Null when the file is not a JPEG or is cut short before its end marker. */
export function cleanJpeg(b: Uint8Array): Uint8Array | null {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
	const parts: Uint8Array[] = [b.subarray(0, 2)];
	let i = 2;
	const isIcc = (at: number, len: number) => len >= 14 && chunkTag(b, at + 4).slice(0, 4) === 'ICC_' && String.fromCharCode(...b.subarray(at + 4, at + 15)) === 'ICC_PROFILE';
	while (i + 2 <= b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xd9) {
			parts.push(b.subarray(i, i + 2));
			return joinBytes(parts);
		}
		if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
			parts.push(b.subarray(i, i + 2)); // standalone markers carry no length
			i += 2;
			continue;
		}
		if (i + 4 > b.length) return null;
		const len = (b[i + 2] << 8) | b[i + 3];
		if (len < 2 || i + 2 + len > b.length) return null;
		const seg = b.subarray(i, i + 2 + len);
		let keep = true;
		if (marker === 0xe1) {
			// EXIF keeps only its rotation; XMP and the rest of APP1 go.
			keep = false;
			if (len >= 16 && chunkTag(b, i + 4) === 'Exif') {
				const o = tiffOrientation(b.subarray(i + 10, i + 2 + len));
				if (o !== 1) {
					const tiff = orientationOnlyTiff(o);
					const body = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
					parts.push(new Uint8Array([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]));
				}
			}
		} else if (marker === 0xe2) keep = isIcc(i, len);
		else if ((marker >= 0xe3 && marker <= 0xef) || marker === 0xfe) keep = false;
		if (keep) parts.push(seg);
		i += 2 + len;
		if (marker === 0xda) {
			// Entropy-coded scan data runs to the next real marker (an FF followed by anything but 00 or a restart).
			const start = i;
			while (i + 1 < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
			if (i + 1 >= b.length) return null;
			parts.push(b.subarray(start, i));
		}
	}
	return null;
}

const CLEANERS = new Map<string, (b: Uint8Array) => Uint8Array | null>([
	['image/png', cleanPng],
	['image/webp', cleanWebp],
	['image/gif', cleanGif],
	['image/jpeg', cleanJpeg],
]);

/** The cleaner for a MIME type, or undefined where there is none. */
export function cleanerFor(mime: string): ((b: Uint8Array) => Uint8Array | null) | undefined {
	// A Map, not an object literal: `cleanerFor('constructor')` must not hand back Object's own constructor.
	return CLEANERS.get(mime);
}
