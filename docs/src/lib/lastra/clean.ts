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
 * ONE COLOR PROFILE, READ AS DECODERS READ IT. A JPEG keeps its ICC APP2 chunks only as one whole set (each sequence
 * number from 1 to the count once, at most 255), exactly where the decoder (decode/jpeg.ts) and libjpeg keep the
 * profile; a duplicate, a second count or a sequence out of range drops every ICC chunk. A PNG keeps its first `iCCP`,
 * a WebP its first `ICCP`, a GIF its first ICC and loop-count extensions: later ones are ignored by every decoder, and
 * a file of millions of them must not clean to a file of millions of them.
 *
 * TWO PASSES, ONE BUFFER. Each cleaner walks the file twice: the first pass counts the exact size of the result (and
 * decides the ICC set), the second writes it into a buffer of exactly that size. Memory is the input plus the result,
 * and nothing is kept per block. `cleanAsync` runs the same walk and gives the event loop a turn after every 1 MB of
 * input or 2^14 blocks; the synchronous cleaners run it without yielding, for a caller off the UI thread or with a
 * small file.
 *
 * Each cleaner returns the cleaned bytes, or null when the file does not parse as its format or is cut short: the
 * caller then re-encodes through a decoder, which is slower and lossier but never ships a block it could not read.
 */

import { type AbortSignalLike, runSteps, runStepsSync } from './decode/steps.js';
import { crc32 } from './png.js';
import { tiffOrientation } from './read.js';

const cleanU32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const cleanU32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const chunkTag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const CLEAN_ICC_SIGNATURE = Array.from('ICC_PROFILE', (c) => c.charCodeAt(0));

/** Input bytes, and blocks, between turns of the async cleaner. */
const CLEAN_SLICE_BYTES = 1 << 20;
const CLEAN_SLICE_BLOCKS = 1 << 14;

/**
 * The cleaned file, written as it is read. The counting pass has no buffer and only adds up lengths; the writing
 * pass writes into a buffer of exactly the counted size. `pace` tells a walk when to yield.
 */
class CleanWriter {
	buf: Uint8Array | null;
	at = 0;
	private bytes = 0;
	private blocks = 0;
	constructor(size: number | null) {
		this.buf = size === null ? null : new Uint8Array(size);
	}
	put(p: ArrayLike<number>): void {
		if (this.buf) this.buf.set(p, this.at);
		this.at += p.length;
	}
	/** Write a little-endian u32 at `at` (the writing pass only). */
	setU32le(at: number, v: number): void {
		if (this.buf) new DataView(this.buf.buffer, this.buf.byteOffset).setUint32(at, v, true);
	}
	/** Set or clear bits of the byte at `at` (the writing pass only). */
	maskByte(at: number, and: number, or: number): void {
		if (this.buf) this.buf[at] = (this.buf[at] & and) | or;
	}
	/** Count a block of `n` input bytes; true when the walk should yield. */
	pace(n: number): boolean {
		this.bytes += n;
		if (++this.blocks < CLEAN_SLICE_BLOCKS && this.bytes < CLEAN_SLICE_BYTES) return false;
		this.bytes = 0;
		this.blocks = 0;
		return true;
	}
}

/** What the counting pass decides for the writing pass: today, whether a JPEG's ICC chunks form one whole set. */
class CleanPlan {
	writing = false;
	iccSeen = new Uint8Array(256);
	iccCount = 0;
	iccBroken = false;
	iccBytes = 0;
	iccKeep = false;
	/** The bytes the writing pass leaves out of what the counting pass counted. */
	dropped(): number {
		return this.iccKeep ? 0 : this.iccBytes;
	}
	settle(): void {
		let whole = !this.iccBroken && this.iccCount > 0;
		for (let s = 1; whole && s <= this.iccCount; s++) if (!this.iccSeen[s]) whole = false;
		this.iccKeep = whole;
		this.writing = true;
	}
}

type CleanCore = (b: Uint8Array, out: CleanWriter, plan: CleanPlan) => Generator<void, boolean>;

/** Count, then write: the cleaned bytes in a buffer of exactly their size, or null. */
function* cleanTwice(b: Uint8Array, core: CleanCore): Generator<void, Uint8Array | null> {
	const plan = new CleanPlan();
	const count = new CleanWriter(null);
	if (!(yield* core(b, count, plan))) return null;
	plan.settle();
	const size = count.at - plan.dropped();
	const out = new CleanWriter(size);
	if (!(yield* core(b, out, plan)) || out.at !== size) throw new Error(`lastra: a cleaner wrote ${out.at} bytes after counting ${size}`);
	return out.buf;
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
 *  rotation (browsers differ on whether they apply it, so it must stay). Only the first `iCCP` stays (libpng
 *  ignores a second). False when it is not a PNG or is cut short. */
function* cleanPngCore(b: Uint8Array, out: CleanWriter): Generator<void, boolean> {
	if (b.length < 20 || b[0] !== 0x89 || chunkTag(b, 1) !== 'PNG\r') return false;
	out.put(b.subarray(0, 8));
	let i = 8;
	// Only the FIRST eXIf ahead of the pixels can turn the picture (read.ts readPng, and the engines' probe).
	let exifSeen = false;
	let pixelsSeen = false;
	let iccSeen = false;
	while (i + 12 <= b.length) {
		const len = cleanU32be(b, i);
		const end = i + 12 + len;
		if (end > b.length) return false;
		const type = chunkTag(b, i + 4);
		if (type === 'IDAT') pixelsSeen = true;
		if (type === 'eXIf' && !exifSeen && !pixelsSeen) {
			exifSeen = true;
			const o = tiffOrientation(b.subarray(i + 8, i + 8 + len));
			if (o !== 1) out.put(pngOrientationChunk(o));
		}
		if (PNG_KEEP.has(type) && !(type === 'iCCP' && iccSeen)) out.put(b.subarray(i, end));
		if (type === 'iCCP') iccSeen = true;
		i = end;
		if (type === 'IEND') return true;
		if (out.pace(12 + len)) yield;
	}
	return false;
}

// WebP chunks a picture needs. `EXIF`, `XMP ` and every other chunk are dropped. An animation frame (`ANMF`) is
// copied whole after its own sub-chunks are filtered the same way, because metadata can nest inside one.
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const WEBP_FRAME_KEEP = new Set(['VP8 ', 'VP8L', 'ALPH']);

/** What the chunk walk wrote: whether a picture was among it, an orientation-only EXIF chunk, and where VP8X is. */
interface WebpWalk {
	picture: boolean;
	exif: boolean;
	vp8x: number;
	icc: boolean;
}

function* webpChunks(b: Uint8Array, from: number, to: number, keep: Set<string>, nested: boolean, out: CleanWriter): Generator<void, WebpWalk | null> {
	const walk: WebpWalk = { picture: false, exif: false, vp8x: -1, icc: false };
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
				out.put(chunk);
				walk.exif = true;
			}
		}
		if (keep.has(type) && !(type === 'ICCP' && walk.icc)) {
			if (type === 'ICCP') walk.icc = true;
			if (!nested && (type === 'VP8 ' || type === 'VP8L' || type === 'ANMF')) walk.picture = true;
			if (type === 'ANMF' && !nested) {
				// 16 bytes of frame header, then the frame's own chunks, then the frame's size written back.
				if (len < 16) return null;
				const head = out.at;
				out.put(b.subarray(i, i + 8));
				out.put(b.subarray(i + 8, i + 8 + 16));
				if (!(yield* webpChunks(b, i + 8 + 16, i + 8 + len, WEBP_FRAME_KEEP, true, out))) return null;
				const size = out.at - head - 8;
				out.setU32le(head + 4, size);
				if (size & 1) out.put([0]);
			} else {
				const at = out.at;
				out.put(b.subarray(i, Math.min(end, i + 8 + len)));
				const padded = 8 + len + (len & 1);
				if (out.at - at < padded) out.put(new Uint8Array(padded - (out.at - at)));
				if (type === 'VP8X' && padded >= 9) {
					out.maskByte(at + 8, ~0b1100, 0); // EXIF and XMP flags off
					if (!nested && walk.vp8x < 0) walk.vp8x = at;
				}
			}
		}
		i = end;
		if (out.pace(8 + len)) yield;
	}
	return walk;
}

/** WebP: copy the keep-listed chunks, filter inside animation frames, clear the EXIF/XMP flags in `VP8X`, rewrite the RIFF size. */
function* cleanWebpCore(b: Uint8Array, out: CleanWriter): Generator<void, boolean> {
	if (b.length < 20 || chunkTag(b, 0) !== 'RIFF' || chunkTag(b, 8) !== 'WEBP') return false;
	const declared = 8 + cleanU32le(b, 4);
	// A file shorter than its own header says is cut short (one byte of slack: an unpadded odd last chunk).
	if (declared > b.length + 1) return false;
	const riffEnd = Math.min(b.length, declared);
	out.put(b.subarray(0, 12));
	const walk = yield* webpChunks(b, 12, riffEnd, WEBP_KEEP, false, out);
	// And a WebP with no picture in it is not one.
	if (!walk?.picture) return false;
	// The VP8X EXIF flag stays on only when an orientation-only EXIF chunk was kept.
	if (walk.exif && walk.vp8x >= 0) out.maskByte(walk.vp8x + 8, 0xff, 0b1000);
	out.setU32le(4, out.at - 8);
	return true;
}

/** GIF: keep the picture, the frame timing, the color profile and the loop count; drop comments, plain-text
 *  blocks and every other application extension (XMP lives in one). Only the first loop count and the first
 *  ICC extension stay: a decoder reads the first. A GIF with no trailer, which browsers still play, is read to
 *  its end and given one. */
function* cleanGifCore(b: Uint8Array, out: CleanWriter): Generator<void, boolean> {
	if (b.length < 14 || chunkTag(b, 0).slice(0, 3) !== 'GIF') return false;
	// Past a run of sub-blocks and its 0 terminator, yielding as it goes: a frame can be most of the file.
	function* skipSubBlocks(at: number): Generator<void, number> {
		let i = at;
		while (i < b.length && b[i] !== 0) {
			const n = b[i] + 1;
			i += n;
			if (out.pace(n)) yield;
		}
		return i + 1;
	}
	let i = 13 + (b[10] & 0x80 ? 3 * 2 ** ((b[10] & 7) + 1) : 0);
	if (i > b.length) return false;
	out.put(b.subarray(0, i));
	let frames = 0;
	let loopSeen = false;
	let iccSeen = false;
	while (i < b.length) {
		const kind = b[i];
		if (kind === 0x3b) break;
		if (kind === 0x21) {
			const label = b[i + 1];
			const end = yield* skipSubBlocks(i + 2);
			if (end > b.length) return false;
			const stop = end;
			if (label === 0xf9) out.put(b.subarray(i, stop)); // graphic control: frame delay, disposal, transparency
			else if (label === 0xff && b[i + 2] === 11) {
				const id = String.fromCharCode(...b.subarray(i + 3, i + 14));
				// The loop count is one 3-byte data block; an ICC profile is its own extension. Anything else goes.
				if ((id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') && !loopSeen) {
					loopSeen = true;
					// Only the first data block (sub-block id 1 plus the 16-bit loop count) is kept; more blocks after it are not a loop count.
					const loop = b[i + 14] === 3 && i + 18 <= b.length ? b.subarray(i + 14, i + 18) : new Uint8Array([3, 1, 0, 0]);
					out.put([0x21, 0xff, 11, ...b.subarray(i + 3, i + 14), ...loop, 0]);
				} else if (id === 'ICCRGBG1012' && !iccSeen) {
					iccSeen = true;
					out.put(b.subarray(i, stop));
				}
			}
			i = end;
			continue;
		}
		if (kind === 0x2c) {
			if (i + 10 > b.length) return false;
			const flags = b[i + 9];
			let j = i + 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1; // + LZW minimum code size
			j = yield* skipSubBlocks(j);
			if (j > b.length) return false; // the frame's data must end in its own terminator
			out.put(b.subarray(i, j));
			frames++;
			i = j;
			continue;
		}
		return false;
	}
	if (!frames) return false;
	out.put([0x3b]);
	return true;
}

/** The JFIF APP0 rebuilt minimal: version, density unit and density, and no thumbnail (a thumbnail is a second picture,
 *  and the bytes after the density are free to carry anything). */
function minimalJfif(b: Uint8Array, at: number): number[] {
	return [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, ...b.subarray(at + 9, at + 16), 0, 0];
}

/** The Adobe APP14 rebuilt to its 12 defined bytes (`Adobe`, version, two flag words, the color transform), which a
 *  decoder needs to tell RGB, YCbCr, CMYK and YCCK apart; anything after them goes. */
function minimalAdobe(b: Uint8Array, at: number): number[] {
	return [0xff, 0xee, 0, 14, ...b.subarray(at + 4, at + 16)];
}

/** The marker segments a picture needs, kept as they are: DQT (DB), DRI (DD), DNL (DC), and C0 to CF but the reserved
 *  JPG (C8): every start-of-frame, DHT (C4) and DAC (CC). */
const isJpegTableOrFrame = (marker: number) => marker === 0xdb || marker === 0xdd || marker === 0xdc || (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8);

const CLEAN_JFIF_SIGNATURE = [0x4a, 0x46, 0x49, 0x46, 0]; // JFIF\0
const CLEAN_EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0, 0]; // Exif\0\0
const CLEAN_ADOBE_SIGNATURE = [0x41, 0x64, 0x6f, 0x62, 0x65]; // Adobe

/** JPEG: a KEEP-LIST like the others. Kept: SOI; a JFIF APP0 rebuilt minimal (version, density, no thumbnail); the turn
 *  of the first Exif block as an orientation-only EXIF block; the ICC profile's APP2 chunks when they form one whole
 *  set (above); an Adobe APP14 rebuilt to its 12 defined bytes (the color transform); DQT, DHT, DAC, DRI, DNL, the frame
 *  header; each scan with its entropy-coded data and restart markers; EOI. Everything else goes: any other APP0 (a
 *  `JFXX` thumbnail), EXIF beyond the turn, XMP, IPTC, Photoshop, MPF, every other APPn, comments, the reserved JPGn
 *  markers (F0 to FD) and any marker an encoder has not invented yet. Everything AFTER the end-of-image marker is
 *  dropped too: cameras append a second image, a motion-photo video or a gain map there, and each can carry its own
 *  location. The pixels decode the same (read.fuzz.test.ts and clean.test.ts decode both). False when the file is not
 *  a JPEG or is cut short before its end marker. */
function* cleanJpegCore(b: Uint8Array, out: CleanWriter, plan: CleanPlan): Generator<void, boolean> {
	if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return false;
	out.put(b.subarray(0, 2));
	let i = 2;
	// The turn a browser applies comes from the FIRST APP1 that opens with `Exif\0\0` before the first scan, and only
	// from it (read.ts readJpeg, and the engines' probe in read.test.ts). Later Exif blocks are dropped like the rest.
	let exifSeen = false;
	let scanSeen = false;
	// Does the segment at `at` open with these bytes? Compared byte by byte: a file can hold millions of segments.
	const opens = (at: number, sig: ArrayLike<number>) => {
		for (let k = 0; k < sig.length; k++) if (b[at + 4 + k] !== sig[k]) return false;
		return true;
	};
	while (i + 2 <= b.length) {
		if (b[i] !== 0xff) return false;
		const marker = b[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xd9) {
			out.put(b.subarray(i, i + 2));
			return true;
		}
		// Markers with no length: a restart marker is kept; a stray SOI, TEM or 0xFF00 pair outside a scan is not.
		if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
			if (marker >= 0xd0 && marker <= 0xd7) out.put(b.subarray(i, i + 2));
			i += 2;
			if (out.pace(2)) yield;
			continue;
		}
		if (i + 4 > b.length) return false;
		const len = (b[i + 2] << 8) | b[i + 3];
		if (len < 2 || i + 2 + len > b.length) return false;
		if (marker === 0xe0) {
			// JFIF with its 14 defined bytes (identifier, version, unit, densities, thumbnail size); any other APP0 goes.
			if (len >= 16 && opens(i, CLEAN_JFIF_SIGNATURE)) out.put(minimalJfif(b, i));
		} else if (marker === 0xe1) {
			// EXIF keeps only its rotation; XMP and the rest of APP1 go.
			if (!exifSeen && !scanSeen && len >= 8 && opens(i, CLEAN_EXIF_SIGNATURE)) {
				exifSeen = true;
				const o = tiffOrientation(b.subarray(i + 10, i + 2 + len));
				if (o !== 1) {
					const tiff = orientationOnlyTiff(o);
					const body = [...CLEAN_EXIF_SIGNATURE, ...tiff];
					out.put([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]);
				}
			}
		} else if (marker === 0xe2) {
			if (len >= 16 && opens(i, CLEAN_ICC_SIGNATURE) && b[i + 15] === 0) cleanJpegIccChunk(b, i, len, out, plan);
		} else if (marker === 0xee) {
			if (len >= 14 && opens(i, CLEAN_ADOBE_SIGNATURE)) out.put(minimalAdobe(b, i));
		} else if (marker === 0xda || isJpegTableOrFrame(marker)) out.put(b.subarray(i, i + 2 + len));
		i += 2 + len;
		if (out.pace(2 + len)) yield;
		if (marker === 0xda) {
			scanSeen = true;
			// Entropy-coded scan data runs to the next real marker (an FF followed by anything but 00 or a restart),
			// read a slice at a time so a long scan yields too.
			const start = i;
			const last = b.length - 1;
			for (;;) {
				const stop = Math.min(last, i + CLEAN_SLICE_BYTES);
				while (i < stop && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
				if (i < stop || i >= last) break;
				yield;
			}
			if (i >= last) return false;
			out.put(b.subarray(start, i));
		}
	}
	return false;
}

/**
 * One ICC APP2 chunk (`ICC_PROFILE\0`, sequence number, count, data). The counting pass follows the set as the decoder
 * does (decode/jpeg.ts readJpegIccChunk): one count, each sequence from 1 to it once; anything else breaks the set. It
 * counts every chunk it would write; the writing pass writes them only when the set came out whole.
 */
function cleanJpegIccChunk(b: Uint8Array, at: number, len: number, out: CleanWriter, plan: CleanPlan): void {
	if (plan.writing) {
		if (plan.iccKeep) out.put(b.subarray(at, at + 2 + len));
		return;
	}
	if (plan.iccBroken) return;
	const seq = b[at + 16];
	const count = b[at + 17];
	if (plan.iccCount === 0) plan.iccCount = count;
	if (count === 0 || count !== plan.iccCount || seq === 0 || seq > count || plan.iccSeen[seq]) {
		plan.iccBroken = true;
		return;
	}
	plan.iccSeen[seq] = 1;
	plan.iccBytes += 2 + len;
	out.put(b.subarray(at, at + 2 + len));
}

const CLEAN_CORES = new Map<string, CleanCore>([
	['image/png', cleanPngCore],
	['image/webp', cleanWebpCore],
	['image/gif', cleanGifCore],
	['image/jpeg', cleanJpegCore],
]);

/** PNG without its metadata, or null (see `cleanPngCore`). */
export function cleanPng(b: Uint8Array): Uint8Array | null {
	return runStepsSync(cleanTwice(b, cleanPngCore));
}

/** WebP without its metadata, or null. */
export function cleanWebp(b: Uint8Array): Uint8Array | null {
	return runStepsSync(cleanTwice(b, cleanWebpCore));
}

/** GIF without its metadata, or null. */
export function cleanGif(b: Uint8Array): Uint8Array | null {
	return runStepsSync(cleanTwice(b, cleanGifCore));
}

/** JPEG without its metadata, or null (see `cleanJpegCore`). */
export function cleanJpeg(b: Uint8Array): Uint8Array | null {
	return runStepsSync(cleanTwice(b, cleanJpegCore));
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

/**
 * The same cleaning as `cleanerFor(mime)`, giving the event loop a turn after every 1 MB of input or 2^14 blocks:
 * for a UI thread, where a 50 MB photo cleaned in one go holds the page for most of a second. Resolves to the cleaned
 * bytes, or null when the file does not parse or there is no cleaner for `mime`; rejects with `signal.reason` once
 * the signal aborts.
 */
export function cleanAsync(mime: string, bytes: Uint8Array, opts?: { signal?: AbortSignalLike }): Promise<Uint8Array | null> {
	const core = CLEAN_CORES.get(mime);
	if (!core) return Promise.resolve(null);
	return runSteps(() => cleanTwice(bytes, core), opts?.signal);
}
