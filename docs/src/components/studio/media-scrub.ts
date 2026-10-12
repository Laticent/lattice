// Remove embedded metadata (EXIF, XMP, C2PA, text chunks, comments, timestamps) from a stored image WITHOUT
// re-encoding it, so the pixels, transparency and animation are what the person added. A phone's location
// lives in that metadata, and every export embeds the stored bytes, so a photo that kept it would leak it
// into every deck file the recipient opens. Decision note: engineering/decisions/2026-10-12-library-media-assets.md §3.
//
// KEEP-LISTS, NOT DROP-LISTS. Each scrubber copies only the blocks the picture needs to be drawn and drops
// everything else, so a metadata block this file has never heard of (a C2PA `caBX` manifest, a `tIME`
// timestamp, a vendor chunk) cannot ride through. The cost is that a future format chunk is lost until it
// is added here; a missing chunk costs fidelity at worst, a missing drop-list entry costs a privacy leak.
//
// Each scrubber returns the cleaned bytes, or null when the file does not parse as its format or carries
// something a byte scrub should not decide (a rotation tag): the caller then re-encodes through a canvas,
// which is slower and lossier but never ships a block it could not read.

const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** The EXIF Orientation (1 to 8) inside a TIFF block, or 1 when there is none or it cannot be read. */
export function tiffOrientation(t: Uint8Array): number {
	if (t.length < 14) return 1;
	const le = t[0] === 0x49 && t[1] === 0x49;
	if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 1;
	const u16 = (i: number) => (le ? t[i] | (t[i + 1] << 8) : (t[i] << 8) | t[i + 1]);
	const u32 = (i: number) => (le ? u32le(t, i) : u32be(t, i));
	const ifd = u32(4);
	if (ifd + 2 > t.length) return 1;
	const n = Math.min(u16(ifd), 256);
	for (let k = 0; k < n; k++) {
		const e = ifd + 2 + k * 12;
		if (e + 12 > t.length) break;
		if (u16(e) === 0x0112) return u16(e + 8) || 1;
	}
	return 1;
}

/** A TIFF block holding ONLY the Orientation tag: no location, no date, no camera. A browser that applies a
 *  PNG's or WebP's rotation tag keeps showing the picture the way the author saw it, and nothing else survives. */
function orientationOnlyTiff(orientation: number): Uint8Array {
	return new Uint8Array([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation & 255, 0, 0, 0, 0, 0, 0]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const x of bytes) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function pngOrientationChunk(orientation: number): Uint8Array {
	const body = orientationOnlyTiff(orientation);
	const out = new Uint8Array(12 + body.length);
	const v = new DataView(out.buffer);
	v.setUint32(0, body.length);
	out.set([0x65, 0x58, 0x49, 0x66], 4); // eXIf
	out.set(body, 8);
	v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
	return out;
}

// PNG chunks a picture needs. `tIME`, `eXIf`, `tEXt`, `zTXt`, `iTXt` (XMP), `caBX` (C2PA) and every private
// chunk are dropped. `iCCP` stays: it is the colour profile, and without it the colours shift.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'cICP', 'acTL', 'fcTL', 'fdAT']);

/** PNG: copy the keep-listed chunks. An `eXIf` that rotates the picture is replaced by one holding only the
 *  rotation (browsers differ on whether they apply it, so it must stay). Null when it is not a PNG or is cut short. */
export function scrubPng(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || b[0] !== 0x89 || tag(b, 1) !== 'PNG\r') return null;
	const parts: Uint8Array[] = [b.subarray(0, 8)];
	let i = 8;
	let sawEnd = false;
	while (i + 12 <= b.length) {
		const len = u32be(b, i);
		const end = i + 12 + len;
		if (end > b.length) return null;
		const type = tag(b, i + 4);
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
	return sawEnd ? concat(parts) : null;
}

// WebP chunks a picture needs. `EXIF`, `XMP ` and every other chunk are dropped. An animation frame (`ANMF`) is
// copied whole after its own sub-chunks are filtered the same way, because metadata can nest inside one.
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const WEBP_FRAME_KEEP = new Set(['VP8 ', 'VP8L', 'ALPH']);

function webpChunks(b: Uint8Array, from: number, to: number, keep: Set<string>, nested: boolean): Uint8Array[] | null {
	const parts: Uint8Array[] = [];
	let i = from;
	while (i + 8 <= to) {
		const len = u32le(b, i + 4);
		let end = i + 8 + len + (len & 1);
		// A file whose last chunk is odd-sized and unpadded still opens in a browser: read it, and pad it on the way out.
		if (end > to && i + 8 + len <= to) end = to;
		if (end > to) return null;
		const type = tag(b, i);
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
				const body = concat([b.subarray(i + 8, i + 8 + 16), ...inner]);
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
export function scrubWebp(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WEBP') return null;
	const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
	const parts = webpChunks(b, 12, riffEnd, WEBP_KEEP, false);
	if (!parts || !parts.length) return null;
	// The VP8X EXIF flag stays on only when an orientation-only EXIF chunk was kept.
	if (parts.some((p) => tag(p, 0) === 'EXIF')) {
		const x = parts.find((p) => tag(p, 0) === 'VP8X');
		if (x) x[8] |= 0b1000;
	}
	const body = concat(parts);
	const out = new Uint8Array(12 + body.length);
	out.set(b.subarray(0, 4), 0);
	new DataView(out.buffer).setUint32(4, 4 + body.length, true);
	out.set(b.subarray(8, 12), 8);
	out.set(body, 12);
	return out;
}

/** GIF: keep the picture, the frame timing, the colour profile and the loop count; drop comments, plain-text
 *  blocks and every other application extension (XMP lives in one). A GIF with no trailer, which browsers
 *  still play, is read to its end and given one. */
export function scrubGif(b: Uint8Array): Uint8Array | null {
	if (b.length < 14 || tag(b, 0).slice(0, 3) !== 'GIF') return null;
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
			if (end > b.length + 1) return null;
			const stop = Math.min(end, b.length);
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
			if (j > b.length + 1) return null;
			parts.push(b.subarray(i, Math.min(j, b.length)));
			frames++;
			i = j;
			continue;
		}
		return null;
	}
	if (!frames) return null;
	parts.push(new Uint8Array([0x3b]));
	return concat(parts);
}

// JPEG segments a picture needs: everything except application segments (EXIF, XMP, IPTC, Photoshop) and
// comments, keeping the JFIF header (APP0) and the ICC colour profile (APP2).
/** JPEG: drop every APPn segment except APP0 and APP2, and comments, before the scan. Used on a restore, where
 *  the importer's canvas re-encode is not available; a photo this Library stored is already clean, so this only
 *  matters for a backup made by something else. */
export function scrubJpeg(b: Uint8Array): Uint8Array | null {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
	const parts: Uint8Array[] = [b.subarray(0, 2)];
	let i = 2;
	while (i + 4 <= b.length) {
		if (b[i] !== 0xff) return null;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xda) {
			// Start of scan: the rest is entropy-coded data up to the end of the file.
			parts.push(b.subarray(i));
			return concat(parts);
		}
		if (marker === 0xd9) return null;
		const len = (b[i + 2] << 8) | b[i + 3];
		if (len < 2 || i + 2 + len > b.length) return null;
		const keep = !((marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe);
		if (keep) parts.push(b.subarray(i, i + 2 + len));
		i += 2 + len;
	}
	return null;
}

/** The scrubber for a stored type, or undefined where there is none. */
export function scrubberFor(mime: string): ((b: Uint8Array) => Uint8Array | null) | undefined {
	return { 'image/png': scrubPng, 'image/webp': scrubWebp, 'image/gif': scrubGif, 'image/jpeg': scrubJpeg }[mime];
}
