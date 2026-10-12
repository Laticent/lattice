// EXIF Orientation of a JPEG, read from raw bytes. Pure and fs-free: it takes a Uint8Array (a
// Node Buffer is one), so the CLI's dimension reader (`image-dimensions.js`) and the PDF
// writer that runs in the browser (`pdf-compose/compose.mjs`) share ONE parser.
//
// A browser paints a JPEG with its Orientation applied (`image-orientation: from-image` is the
// default). Anything that reads the pixels itself — a build-time aspect read, a PDF writer that
// embeds the original bytes — has to apply the same turn or disagree with what Chrome shows.

const ascii = (b, s, n) => String.fromCharCode(...b.subarray(s, s + n));

/**
 * Orientation (1..8) from an APP1 'Exif' segment payload that starts at `start` (just past the
 * segment length) and ends at `end`. 1 when the tag is absent or the segment is malformed.
 * @param {Uint8Array} b
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
export function exifOrientation(b, start, end) {
	if (end - start < 14 || ascii(b, start, 4) !== 'Exif' || b[start + 4] !== 0 || b[start + 5] !== 0) return 1;
	const t = start + 6; // TIFF header
	const little = ascii(b, t, 2) === 'II';
	if (!little && ascii(b, t, 2) !== 'MM') return 1;
	const u16 = (o) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
	const u32 = (o) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
	if (u16(t + 2) !== 42) return 1;
	const ifd = t + u32(t + 4);
	if (ifd + 2 > end) return 1;
	const n = u16(ifd);
	for (let i = 0; i < n; i++) {
		const e = ifd + 2 + i * 12;
		if (e + 12 > end) return 1;
		if (u16(e) === 0x0112) {
			const v = u16(e + 8);
			return v >= 1 && v <= 8 ? v : 1;
		}
	}
	return 1;
}

/**
 * Orientation of a whole JPEG file: the first APP1 Exif segment before the frame header.
 * 1 for anything that is not a JPEG, has no tag, or is truncated.
 * @param {Uint8Array} b
 * @returns {number}
 */
export function jpegOrientation(b) {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
	let off = 2;
	while (off + 3 < b.length) {
		if (b[off] !== 0xff) { off++; continue; }
		const marker = b[off + 1];
		if (marker === 0xff) { off++; continue; } // fill byte
		if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; } // standalone
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return 1; // frame header: no Exif ahead of it
		const len = (b[off + 2] << 8) | b[off + 3];
		if (len < 2) return 1;
		if (marker === 0xe1) {
			let o = 1;
			try { o = exifOrientation(b, off + 4, Math.min(off + 2 + len, b.length)); } catch { o = 1; }
			if (o !== 1) return o;
		}
		off += 2 + len;
	}
	return 1;
}
