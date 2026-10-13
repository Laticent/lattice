// @vitest-environment node
// The scrubber is checked on bytes, not on a player: it must overwrite metadata boxes IN PLACE (same size, same offsets,
// so a sample table that points into `mdat` stays true) and leave every other byte alone. Synthetic files built here have
// the two real shapes a phone writes (Apple's `meta` with `keys`/`ilst`, and `udta` with `©xyz`), moov at the end and at
// the front; the real-browser spec drives a clip a real browser recorded.
import { describe, expect, it } from 'vitest';
import { applyPatchesToBytes, planVideoScrub, scrubVideoBlob, scrubVideoBytes } from './video-scrub';

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const box = (type: string, ...payload: Uint8Array[]) => {
	const body = cat(...payload);
	return cat(u32(8 + body.length), enc(type), body);
};
const COORDS = '+37.7749-122.4194+016.000/';
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

// An iPhone-shaped `meta`: handler, a `keys` table, and an `ilst` whose item 1 is the ISO 6709 location.
const appleMeta = () =>
	box(
		'meta',
		box('hdlr', u32(0), enc('mdta'), new Uint8Array(12)),
		box('keys', u32(0), u32(2), box('mdta', enc('com.apple.quicktime.location.ISO6709')).slice(0), box('mdta', enc('com.apple.quicktime.make'))),
		box('ilst', box('\u0000\u0000\u0000\u0001', box('data', u32(1), u32(0), enc(COORDS))), box('\u0000\u0000\u0000\u0002', box('data', u32(1), u32(0), enc('Apple')))),
	);
const androidUdta = () => box('udta', box('©xyz', new Uint8Array([0, 18, 0, 0]), enc(COORDS)), box('loci', new Uint8Array(20).fill(7)));
const MDAT = box('mdat', new Uint8Array(500).map((_, i) => (i * 31) % 251));
const trak = (...extra: Uint8Array[]) => box('trak', box('tkhd', new Uint8Array(84)), ...extra);

/** moov at the END (what an iPhone writes): ftyp, wide, mdat, moov. */
const moovLast = () => cat(box('ftyp', enc('qt  '), u32(0), enc('qt  ')), box('wide'), MDAT, box('moov', box('mvhd', new Uint8Array(100)), appleMeta(), trak(androidUdta()), androidUdta()));
/** moov at the FRONT (faststart): sample offsets in `stco` point past it, so nothing may move. */
const moovFirst = () => cat(box('ftyp', enc('isom'), u32(0), enc('isom')), box('moov', box('mvhd', new Uint8Array(100)), trak(box('stco', u32(0), u32(1), u32(4000))), androidUdta(), appleMeta()), MDAT);

const layout = (b: Uint8Array) => types(b).map((t) => `${t.split(':')[0]}:${t.split(':')[2]}`);
const types = (b: Uint8Array) => {
	const out: string[] = [];
	for (let at = 0; at + 8 <= b.length; ) {
		const size = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
		out.push(`${at}:${text(b.subarray(at + 4, at + 8))}:${size}`);
		if (size < 8) break;
		at += size;
	}
	return out;
};

describe('an iPhone-shaped clip (moov last)', () => {
	it('loses every coordinate, keeps its length, and leaves media data and sample tables byte-for-byte', async () => {
		const src = moovLast();
		const out = (await scrubVideoBytes(src.slice())) as Uint8Array;
		expect(out.length).toBe(src.length);
		expect(text(src)).toContain(COORDS);
		expect(text(out)).not.toContain('37.7749');
		expect(text(out)).not.toContain('com.apple.quicktime.location');
		expect(text(out)).not.toContain('Apple');
		// The top-level layout is unchanged: same boxes, same sizes, same offsets.
		expect(types(out)).toEqual(types(src));
		const mdatAt = src.findIndex((_, i) => text(src.subarray(i, i + 4)) === 'mdat') - 4;
		expect(out.subarray(mdatAt, mdatAt + MDAT.length)).toEqual(MDAT);
		expect(text(out)).toContain('free');
		expect(text(out)).toContain('mvhd');
		expect(text(out)).toContain('tkhd');
	});
});

describe('a clip with moov first (faststart)', () => {
	it('does not move a single offset: the `stco` entry is still exactly what it was', async () => {
		const src = moovFirst();
		const out = (await scrubVideoBytes(src.slice())) as Uint8Array;
		expect(out.length).toBe(src.length);
		expect(types(out)).toEqual(types(src));
		const at = src.findIndex((_, i) => text(src.subarray(i, i + 4)) === 'stco');
		expect(out.subarray(at, at + 16)).toEqual(src.subarray(at, at + 16));
		expect(text(out)).not.toContain('37.7749');
	});
});

describe('other places a clip carries metadata', () => {
	it('clears a top-level XMP `uuid` box and an `xml ` box', async () => {
		const xmp = box('uuid', new Uint8Array(16).fill(1), enc(`<x:xmpmeta gps="${COORDS}"/>`));
		const src = cat(box('ftyp', enc('mp42'), u32(0), enc('mp42')), xmp, box('xml ', u32(0), enc(COORDS)), MDAT, box('moov', box('mvhd', new Uint8Array(100))));
		const out = (await scrubVideoBytes(src.slice())) as Uint8Array;
		expect(text(out)).not.toContain('37.7749');
		// The two metadata boxes are now `free`; every offset and size is where it was.
		expect(layout(out)).toEqual(layout(src));
		expect(types(out).map((t) => t.split(':')[1])).toEqual(['ftyp', 'free', 'free', 'mdat', 'moov']);
	});

	it('handles a 64-bit box size and a last box that runs to the end', async () => {
		const big = cat(u32(1), enc('udta'), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 64]), enc(COORDS), new Uint8Array(64 - 16 - COORDS.length));
		const last = cat(u32(0), enc('meta'), enc(COORDS));
		const src = cat(box('ftyp', enc('mp42'), u32(0), enc('mp42')), box('moov', box('mvhd', new Uint8Array(100)), big), last);
		const out = (await scrubVideoBytes(src.slice())) as Uint8Array;
		expect(out.length).toBe(src.length);
		expect(text(out)).not.toContain('37.7749');
		// The 64-bit size field survives exactly.
		const at = src.findIndex((_, i) => text(src.subarray(i, i + 4)) === 'udta') - 4;
		expect(out.subarray(at, at + 16)).toEqual(cat(u32(1), enc('free'), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 64])));
	});
});

describe('a clip with nothing to remove', () => {
	it('plans no patch and hands the same Blob back, untouched', async () => {
		const src = cat(box('ftyp', enc('mp42'), u32(0), enc('mp42')), MDAT, box('moov', box('mvhd', new Uint8Array(100)), trak()));
		expect(await planVideoScrub(async (o, n) => src.subarray(o, o + n), src.length)).toEqual([]);
		const blob = new Blob([src as BlobPart], { type: 'video/mp4' });
		expect(await scrubVideoBlob(blob)).toBe(blob);
	});

	it('tolerates a few stray bytes after the last box', async () => {
		const src = cat(box('ftyp', enc('mp42'), u32(0), enc('mp42')), new Uint8Array([0, 0, 0]));
		expect(await planVideoScrub(async (o, n) => src.subarray(o, o + n), src.length)).toEqual([]);
	});
});

describe('the Blob path and the bytes path agree, and the Blob path never loads the media data', () => {
	it('gives the same bytes both ways', async () => {
		const src = moovLast();
		const viaBytes = (await scrubVideoBytes(src.slice())) as Uint8Array;
		const viaBlob = (await scrubVideoBlob(new Blob([src as BlobPart], { type: 'video/mp4' }))) as Blob;
		expect(new Uint8Array(await viaBlob.arrayBuffer())).toEqual(viaBytes);
		expect(viaBlob.type).toBe('video/mp4');
	});

	it('reads only box headers, never the mdat payload', async () => {
		const src = moovLast();
		let read = 0;
		await planVideoScrub(async (o, n) => {
			read += Math.min(n, src.length - o);
			return src.subarray(o, o + n);
		}, src.length);
		expect(read).toBeLessThan(src.length / 2);
	});
});

describe('a hostile file is refused, never half-read', () => {
	const plan = (b: Uint8Array) => planVideoScrub(async (o, n) => b.subarray(o, o + n), b.length);
	const ftyp = box('ftyp', enc('mp42'), u32(0), enc('mp42'));

	it('refuses a box that runs past the end of the file', async () => {
		expect(await plan(cat(ftyp, u32(10_000), enc('moov'), new Uint8Array(20)))).toBeNull();
	});

	it('refuses a box smaller than its own header', async () => {
		expect(await plan(cat(ftyp, u32(4), enc('free'), new Uint8Array(20)))).toBeNull();
	});

	it('refuses a child that runs past its parent, even when it fits the file', async () => {
		expect(await plan(cat(ftyp, box('moov', box('mvhd', new Uint8Array(20)), cat(u32(500), enc('udta'))), new Uint8Array(1000)))).toBeNull();
	});

	it('refuses a 64-bit size that does not fit', async () => {
		expect(await plan(cat(ftyp, u32(1), enc('moov'), new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])))).toBeNull();
	});

	it('refuses more metadata than a clip should hold, rather than allocate it', async () => {
		const huge = box('uuid', new Uint8Array(9 * 1024 * 1024));
		expect(await plan(cat(ftyp, huge))).toBeNull();
	});

	it('refuses a file made of an absurd number of boxes', async () => {
		const many = cat(...Array.from({ length: 50_001 }, () => box('free')));
		expect(await plan(cat(ftyp, many))).toBeNull();
	});

	it('applies patches in file order without touching anything else', () => {
		const b = new Uint8Array(10).fill(9);
		applyPatchesToBytes(b, [{ offset: 2, bytes: new Uint8Array([1, 1]) }, { offset: 6, bytes: new Uint8Array([2]) }]);
		expect([...b]).toEqual([9, 9, 1, 1, 9, 9, 2, 9, 9, 9]);
	});
});
