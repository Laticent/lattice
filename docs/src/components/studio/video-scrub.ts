// Remove embedded metadata, location above all, from a stored MP4 or QuickTime clip WITHOUT re-encoding it.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md ("Clip location data").
//
// WHY THIS IS NOT THE PHOTO SCRUBBER. A photo is rebuilt from the blocks it needs (`media-scrub.ts`). A clip cannot be:
// dropping a box changes the size of every box above it, and the sample tables inside `moov` hold ABSOLUTE byte offsets
// into `mdat`, so removing bytes in front of `mdat` would corrupt the file. So each metadata box is OVERWRITTEN IN PLACE
// as a `free` box of the same size, with a zeroed payload. Every other byte, every size and every offset stays where it
// was, and a player skips `free`.
//
// WHAT IS OVERWRITTEN, a deny-list by necessity. Walking every standard container (`moov`, `trak`, `mdia`, `minf`,
// `edts`, `mvex`, `meco`, and `moof`/`traf` in a fragmented file), at ANY depth: `udta`, `meta`, `loci` and `©xyz`
// (a phone's location lives here: Apple's `com.apple.quicktime.location.ISO6709` in `meta`, Android's and QuickTime's
// `©xyz` and 3GPP's `loci` in `udta`, with the make, model, software and creation date beside them). Also a `uuid` box at
// the top level or directly under `moov` (XMP packets, Canon's CMT records), and top-level `XMP_` and `xml ` boxes. And any
// DATA AFTER THE LAST BOX: a vendor trailer (Insta360's, Samsung's) is not a box, players ignore it, and some carry a
// track log. None of this is needed to decode or play the picture. Whole boxes are cleared, not single keys, so a key this
// file has never heard of cannot ride through inside one.
//
// WHAT IS NOT: anything that lives in the SAMPLES, which sit in `mdat` and are addressed by the sample tables in `moov`,
// so clearing them means rewriting those tables: a timed-metadata track (a GoPro's GPMF, an Insta360's camm, a Sony's
// `rtmd`, some phones' `mebx`), and a text or subtitle track whose captions hold coordinates (a DJI drone with captions
// on). Such a clip can still carry a position per frame, and this reports success on it. The notes say so.
//
// Nothing here trusts the file: every size is checked against the bytes that remain, the walk is bounded, and a box
// that does not fit makes the whole answer `null` (the caller refuses the clip rather than store bytes nobody read).

export type Patch = { offset: number; bytes: Uint8Array };
type Reader = (offset: number, length: number) => Promise<Uint8Array>;

/** Most top-level boxes walked. A phone clip has a handful; a fragmented one has two per fragment. */
const MAX_TOP_BOXES = 50_000;
/** Most boxes walked inside `moov` and inside one `trak`. */
const MAX_CHILDREN = 5_000;
/** The most bytes this will overwrite in total. Metadata is a few KB; a megabyte-sized `uuid` is already odd. */
const MAX_PATCH_BYTES = 8 * 1024 * 1024;

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** Boxes cleared wherever they appear inside a container, or at the top level. */
const CLEAR = new Set(['udta', 'meta', 'loci', '\u00a9xyz']);
/** Top-level boxes cleared as well: XMP packets and a `uuid` extension box. */
const TOP_CLEAR = new Set(['uuid', 'XMP_', 'xml ']);
/** Boxes whose children are boxes the walk opens. Every other box is opaque. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'edts', 'mvex', 'meco', 'moof', 'traf']);
/** A top-level box that may legitimately say "I run to the end of the file" (metadata boxes may too, and are cleared whole). Anything else that does is a trailer. */
const TO_END_OK = new Set(['mdat', 'moov', 'moof', 'free', 'skip', 'wide']);
/** How deep the container walk goes. A real file is five levels; a bound keeps a hostile one from recursing. */
const MAX_DEPTH = 8;

type Box = { offset: number; size: number; header: number; type: string; toEnd: boolean };

/** The box that starts at `offset` inside `[offset, end)`, or null when it does not fit. */
async function boxAt(read: Reader, offset: number, end: number): Promise<Box | null> {
	const room = end - offset;
	if (room < 8) return null;
	const head = await read(offset, Math.min(16, room));
	if (head.length < 8) return null;
	const small = u32(head, 0);
	let header = 8;
	let size = small;
	if (small === 1) {
		if (head.length < 16) return null;
		header = 16;
		size = u32(head, 8) * 2 ** 32 + u32(head, 12);
	} else if (small === 0) {
		size = room; // "to the end of the enclosing box"
	}
	if (!Number.isSafeInteger(size) || size < header || size > room) return null;
	return { offset, size, header, type: tag(head, 4), toEnd: small === 0 };
}

/** The `free` box that replaces `box`: the same size field and length, type `free`, payload zeros. */
async function freePatch(read: Reader, box: Box): Promise<Patch> {
	const bytes = new Uint8Array(box.size);
	const original = await read(box.offset, box.header);
	bytes.set(original.subarray(0, box.header), 0); // keeps the size field exactly as it was, 32 or 64 bit
	bytes[4] = 0x66; // f
	bytes[5] = 0x72; // r
	bytes[6] = 0x65; // e
	bytes[7] = 0x65; // e
	return { offset: box.offset, bytes };
}

/** Walk the children of `[start, end)`, calling `visit` for each. Returns false when a child does not fit. */
async function walk(read: Reader, start: number, end: number, limit: number, visit: (b: Box) => Promise<boolean>): Promise<boolean> {
	let at = start;
	for (let n = 0; at < end; n++) {
		// A tail too short to be a box header (padding, a few stray bytes) cannot hold metadata, so it is not an error.
		if (end - at < 8) break;
		if (n >= limit) return false;
		const box = await boxAt(read, at, end);
		if (!box) return false;
		if (!(await visit(box))) return false;
		at += box.size;
	}
	return true;
}

/**
 * The overwrites that remove a clip's metadata, in file order, or null when the file's box structure cannot be walked
 * (truncated, a size that does not fit, a bound exceeded). An empty list means there was nothing to remove.
 * `read(offset, length)` returns up to `length` bytes at `offset`, so a 50 MB clip is never loaded to be inspected.
 */
export async function planVideoScrub(read: Reader, size: number): Promise<Patch[] | null> {
	const patches: Patch[] = [];
	let patched = 0;
	const addBytes = (p: Patch): boolean => {
		patched += p.bytes.length;
		if (patched > MAX_PATCH_BYTES) return false;
		patches.push(p);
		return true;
	};
	const add = async (box: Box): Promise<boolean> => (patched + box.size > MAX_PATCH_BYTES ? false : addBytes(await freePatch(read, box)));
	/** Clear metadata boxes at any depth below `start`..`end`; false when a child does not fit. */
	const scan = (start: number, end: number, depth: number): Promise<boolean> =>
		walk(read, start, end, MAX_CHILDREN, async (box) => {
			if (CLEAR.has(box.type)) return add(box);
			// A `uuid` directly under `moov` (Canon's CMT records). One inside a `trak` carries a spherical-video
			// projection a player needs, and one inside a `moof` a streaming header: those are left alone.
			if (box.type === 'uuid' && depth === 1) return add(box);
			if (CONTAINERS.has(box.type)) return depth + 1 > MAX_DEPTH ? false : scan(box.offset + box.header, box.offset + box.size, depth + 1);
			return true;
		});

	let at = 0;
	let sawMoov = false;
	let sawMdat = false;
	for (let n = 0; size - at >= 8; n++) {
		// A tail shorter than a box header cannot hold a box, so it is not read.
		if (n >= MAX_TOP_BOXES) return null;
		const box = await boxAt(read, at, size);
		// What follows the last real box is a vendor trailer (not a box; players ignore it; some carry a track log): it is
		// overwritten, but only once both `moov` and `mdat` have been read whole. Before that, a box that does not fit is a
		// truncated or corrupt clip, and zeroing it would destroy real data, so the clip is refused.
		if (!box || (box.toEnd && !TO_END_OK.has(box.type) && !CLEAR.has(box.type) && !TOP_CLEAR.has(box.type))) {
			if (!(sawMoov && sawMdat)) return null;
			return addBytes({ offset: at, bytes: new Uint8Array(size - at) }) ? patches : null;
		}
		if (box.type === 'mdat') sawMdat = true;
		if (CLEAR.has(box.type) || TOP_CLEAR.has(box.type)) {
			if (!(await add(box))) return null;
		} else if (box.type === 'moov' || box.type === 'moof') {
			if (box.type === 'moov') sawMoov = true;
			if (!(await scan(box.offset + box.header, box.offset + box.size, 1))) return null;
		}
		at += box.size;
	}
	// The walk is in file order and boxes never overlap, so the patches are already sorted and disjoint.
	return patches;
}

/** `patches` written into `bytes` in place. */
export function applyPatchesToBytes(bytes: Uint8Array, patches: Patch[]): Uint8Array {
	for (const p of patches) bytes.set(p.bytes, p.offset);
	return bytes;
}

/** `blob` with `patches` applied, assembled from slices so the media data is never copied into memory. */
export function applyPatchesToBlob(blob: Blob, patches: Patch[]): Blob {
	if (!patches.length) return blob;
	const parts: BlobPart[] = [];
	let at = 0;
	for (const p of patches) {
		parts.push(blob.slice(at, p.offset), p.bytes as BlobPart);
		at = p.offset + p.bytes.length;
	}
	parts.push(blob.slice(at));
	return new Blob(parts, { type: blob.type });
}

/** An MP4 or QuickTime clip with its metadata boxes cleared, or null when it cannot be read as one. */
export async function scrubVideoBlob(blob: Blob): Promise<Blob | null> {
	const patches = await planVideoScrub(async (o, n) => new Uint8Array(await blob.slice(o, o + n).arrayBuffer()), blob.size);
	return patches ? applyPatchesToBlob(blob, patches) : null;
}

/** The same, for bytes already in memory (a backup entry). Returns the bytes cleaned, or null. */
export async function scrubVideoBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
	const patches = await planVideoScrub(async (o, n) => bytes.subarray(o, o + n), bytes.length);
	return patches ? applyPatchesToBytes(bytes, patches) : null;
}

/** Does this MIME type name a clip this module can scrub? WebM (Matroska) is not an ISO box file. */
export const isIsoVideo = (mime: string): boolean => mime === 'video/mp4' || mime === 'video/quicktime';
