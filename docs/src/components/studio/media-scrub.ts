// Remove embedded metadata (EXIF, XMP, text chunks, comments) from a stored image WITHOUT re-encoding it, so
// the pixels, transparency and animation are byte-for-byte what the person added. A phone's location lives
// in that metadata, and every export embeds the stored bytes, so a photo that keeps it leaks it into every
// deck file the recipient opens. JPEG is not handled here: the importer always re-encodes it through a
// canvas, which drops everything. Decision note: engineering/decisions/2026-10-12-library-media-assets.md §3, §7.
//
// Each scrubber returns the cleaned bytes, or null when the file does not parse as its format; the caller then
// re-encodes through a canvas, which is slower and lossier but never ships a metadata block it could not read.

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

/** PNG: drop `eXIf`, `tEXt`, `zTXt` and `iTXt` (XMP rides in an `iTXt`). Every other chunk, `acTL` and
 *  `fcTL` of an animation included, is copied as is. */
export function scrubPng(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || b[0] !== 0x89 || tag(b, 1) !== 'PNG\r') return null;
	const DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
	const parts: Uint8Array[] = [b.subarray(0, 8)];
	let i = 8;
	let sawEnd = false;
	while (i + 12 <= b.length) {
		const len = u32be(b, i);
		const end = i + 12 + len;
		if (end > b.length) return null;
		const type = tag(b, i + 4);
		if (!DROP.has(type)) parts.push(b.subarray(i, end));
		i = end;
		if (type === 'IEND') {
			sawEnd = true;
			break;
		}
	}
	return sawEnd ? concat(parts) : null;
}

/** WebP: drop the `EXIF` and `XMP ` chunks, clear their flags in `VP8X`, and rewrite the RIFF size. */
export function scrubWebp(b: Uint8Array): Uint8Array | null {
	if (b.length < 20 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WEBP') return null;
	const riffEnd = Math.min(b.length, 8 + u32le(b, 4));
	const parts: Uint8Array[] = [];
	let i = 12;
	while (i + 8 <= riffEnd) {
		const len = u32le(b, i + 4);
		const end = i + 8 + len + (len & 1);
		if (end > b.length) return null;
		const type = tag(b, i);
		if (type === 'EXIF' || type === 'XMP ') {
			i = end;
			continue;
		}
		const chunk = b.slice(i, end);
		// VP8X flags: bit 3 = EXIF present, bit 2 = XMP present.
		if (type === 'VP8X' && chunk.length >= 9) chunk[8] &= ~0b1100;
		parts.push(chunk);
		i = end;
	}
	const body = concat(parts);
	const out = new Uint8Array(12 + body.length);
	out.set(b.subarray(0, 4), 0);
	new DataView(out.buffer).setUint32(4, 4 + body.length, true);
	out.set(b.subarray(8, 12), 8);
	out.set(body, 12);
	return out;
}

/** GIF: drop comment extensions and application extensions other than the animation loop count (`NETSCAPE`,
 *  `ANIMEXTS`). XMP rides in an `XMP DataXMP` application extension. */
export function scrubGif(b: Uint8Array): Uint8Array | null {
	if (b.length < 14 || tag(b, 0).slice(0, 3) !== 'GIF') return null;
	const skipSubBlocks = (at: number): number => {
		let i = at;
		while (i < b.length && b[i] !== 0) i += b[i] + 1;
		return i + 1; // past the 0 terminator
	};
	let i = 13 + (b[10] & 0x80 ? 3 * 2 ** ((b[10] & 7) + 1) : 0);
	const parts: Uint8Array[] = [b.subarray(0, i)];
	while (i < b.length) {
		const kind = b[i];
		if (kind === 0x3b) {
			parts.push(b.subarray(i, i + 1));
			return concat(parts);
		}
		if (kind === 0x21) {
			const label = b[i + 1];
			const end = skipSubBlocks(i + 2);
			if (end > b.length) return null;
			let keep = true;
			if (label === 0xfe) keep = false;
			if (label === 0xff) {
				const id = String.fromCharCode(...b.subarray(i + 3, i + 3 + 8));
				keep = id.startsWith('NETSCAPE') || id.startsWith('ANIMEXTS');
			}
			if (keep) parts.push(b.subarray(i, end));
			i = end;
			continue;
		}
		if (kind === 0x2c) {
			const flags = b[i + 9];
			let j = i + 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1; // + LZW minimum code size
			j = skipSubBlocks(j);
			if (j > b.length) return null;
			parts.push(b.subarray(i, j));
			i = j;
			continue;
		}
		return null;
	}
	return null; // no trailer: not a GIF this reads
}

/** The scrubber for a stored type, or undefined where there is none (JPEG is re-encoded instead). */
export function scrubberFor(mime: string): ((b: Uint8Array) => Uint8Array | null) | undefined {
	return { 'image/png': scrubPng, 'image/webp': scrubWebp, 'image/gif': scrubGif }[mime];
}
