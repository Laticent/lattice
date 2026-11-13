// @vitest-environment node
// Hostile bytes: seeded truncations and corruptions of a valid file of every format, read and cleaned. The reader must
// answer null or a header that holds (a known format, a size that is a positive integer within the format's limit, an
// orientation from 1 to 8) and never throw; a cleaner must answer null or a file of the same format that cleans to
// itself. The seed is printed; LASTRA_FUZZ_SEED=<n> replays a run, LASTRA_FUZZ_ROUNDS=<n> runs longer.
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { cleanerFor } from './clean.js';
import { encodeJpeg } from './jpeg.js';
import { IMAGE_MIME, imageFormat, readImage } from './read.js';

const SEED = Number(process.env.LASTRA_FUZZ_SEED ?? 20261113) >>> 0;
const ROUNDS = Number(process.env.LASTRA_FUZZ_ROUNDS ?? 4000);
console.log(`lastra read fuzz: seed ${SEED}, ${ROUNDS} rounds a format (LASTRA_FUZZ_SEED to replay)`);

/** mulberry32: a small, well-mixed 32-bit generator, so a seed replays exactly. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const tiff = (o: number) => [...ascii('MM'), 0, 42, ...be32(8), ...be16(2), ...be16(0x0112), ...be16(3), ...be32(1), ...be16(o), 0, 0, ...be16(0x8825), ...be16(4), ...be32(1), ...be32(38), ...be32(0)];
const segment = (marker: number, data: number[]) => [0xff, marker, ...be16(data.length + 2), ...data];
const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
const box = (type: string, body: number[]) => [...be32(body.length + 8), ...ascii(type), ...body];
const fullBox = (type: string, body: number[]) => box(type, [0, 0, 0, 0, ...body]);

function seeds(): Record<string, Uint8Array> {
	const px = new Uint8ClampedArray(33 * 17 * 4).map((_v, i) => (i * 37) & 255);
	const jpg = encodeJpeg(px, 33, 17, 80);
	const jpeg = new Uint8Array([0xff, 0xd8, ...segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x/>')]), ...segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(6)]), ...segment(0xfe, ascii('a comment')), ...jpg.subarray(2)]);
	const png = new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...pngChunk('IHDR', [...be32(300), ...be32(200), 8, 3, 0, 0, 0]), ...pngChunk('PLTE', [0, 0, 0]), ...pngChunk('eXIf', tiff(6)), ...pngChunk('tRNS', [0]), ...pngChunk('tEXt', ascii('k\0v')), ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', [])]);
	const gif = new Uint8Array([...ascii('GIF89a'), 64, 0, 32, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, 0x21, 0xfe, 3, 1, 2, 3, 0, 0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0, 0x2c, 0, 0, 0, 0, 64, 0, 32, 0, 0, 2, 2, 1, 2, 0, 0x3b]);
	const body = [...ascii('WEBP'), ...webpChunk('VP8X', [0x18, 0, 0, 0, 63, 0, 0, 31, 0, 0]), ...webpChunk('ALPH', [1, 2, 3]), ...webpChunk('VP8 ', [0, 0, 0, 0x9d, 1, 0x2a, 64, 0, 32, 0, 1, 2]), ...webpChunk('EXIF', tiff(6)), ...webpChunk('XMP ', ascii('<x/>'))];
	const webp = new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
	const vp8l = [...ascii('WEBP'), ...webpChunk('VP8L', [0x2f, ...le32((299 | (199 << 14) | (1 << 28)) >>> 0), 0, 1, 2, 3, 4, 5, 6, 7])];
	const lossless = new Uint8Array([...ascii('RIFF'), ...le32(vp8l.length), ...vp8l]);
	const ipco = box('ipco', [...fullBox('ispe', [...be32(512), ...be32(512)]), ...fullBox('ispe', [...be32(4032), ...be32(3024)]), ...box('irot', [1]), ...box('imir', [0])]);
	const ipma = fullBox('ipma', [...be32(2), ...be16(1), 3, 0x82, 0x83, 0x84, ...be16(2), 1, 0x81]);
	const avif = new Uint8Array([...box('ftyp', [...ascii('mif1'), 0, 0, 0, 0, ...ascii('mif1'), ...ascii('avif')]), ...fullBox('meta', [...fullBox('pitm', be16(1)), ...box('iprp', [...ipco, ...ipma])])]);
	// Two Exif blocks, the first unturned: a browser paints it unturned, so a cleaned copy must too.
	const twoExif = new Uint8Array([0xff, 0xd8, ...segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(1)]), ...segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(6)]), ...jpg.subarray(2)]);
	return { jpeg, twoExif, png, gif, webp, lossless, avif };
}

/** One corruption of `b`, chosen and placed by `r`. */
function mutate(b: Uint8Array, r: () => number): Uint8Array {
	const at = () => Math.floor(r() * b.length);
	switch (Math.floor(r() * 7)) {
		case 0:
			return b.slice(0, at()); // truncated
		case 1: {
			const out = b.slice(); // a few bytes flipped
			for (let k = 1 + Math.floor(r() * 8); k > 0; k--) out[at()] = Math.floor(r() * 256);
			return out;
		}
		case 2: {
			const i = at(); // a run of 0xFF (fill bytes, or a lying length's high bytes)
			const out = b.slice();
			out.fill(0xff, i, Math.min(b.length, i + 1 + Math.floor(r() * 6)));
			return out;
		}
		case 3: {
			const i = at(); // a run of zeros (a length of 0, a size of 0)
			const out = b.slice();
			out.fill(0, i, Math.min(b.length, i + 1 + Math.floor(r() * 6)));
			return out;
		}
		case 4: {
			const i = at(); // bytes cut out of the middle
			return new Uint8Array([...b.subarray(0, i), ...b.subarray(Math.min(b.length, i + 1 + Math.floor(r() * 12)))]);
		}
		case 5: {
			const i = at(); // random bytes inserted
			const junk = Array.from({ length: 1 + Math.floor(r() * 12) }, () => Math.floor(r() * 256));
			return new Uint8Array([...b.subarray(0, i), ...junk, ...b.subarray(i)]);
		}
		default:
			return mutate(mutate(b, r), r); // two at once
	}
}

const MAX: Record<string, number> = { png: 0x7fffffff, avif: 0x7fffffff, jpeg: 0xffff, gif: 0xffff, webp: 1 << 24 };

function checkInfo(b: Uint8Array, label: string) {
	let info: ReturnType<typeof readImage>;
	try {
		info = readImage(b);
	} catch (e) {
		assert.fail(`${label}: readImage threw ${e}`);
	}
	if (info === null) return;
	assert.ok(Object.hasOwn(MAX, info.format), `${label}: format ${info.format}`);
	assert.equal(info.mime, IMAGE_MIME[info.format], `${label}: mime`);
	for (const side of [info.width, info.height]) assert.ok(Number.isInteger(side) && side >= 1 && side <= MAX[info.format], `${label}: size ${info.width}x${info.height}`);
	assert.ok(Number.isInteger(info.orientation) && info.orientation >= 1 && info.orientation <= 8, `${label}: orientation ${info.orientation}`);
	assert.equal(typeof info.alpha, 'boolean', `${label}: alpha`);
}

function checkClean(b: Uint8Array, label: string) {
	const format = imageFormat(b);
	const clean = format && format !== 'svg' ? cleanerFor(IMAGE_MIME[format]) : undefined;
	if (!clean) return;
	let out: Uint8Array | null;
	try {
		out = clean(b);
	} catch (e) {
		assert.fail(`${label}: the ${format} cleaner threw ${e}`);
	}
	if (out === null) return;
	assert.equal(imageFormat(out), format, `${label}: a cleaned ${format} is still one`);
	assert.deepEqual(clean(out), out, `${label}: a cleaned file cleans to itself`);
	// Cleaning keeps what a browser paints: the same size and the same turn, read before and after.
	const before = readImage(b);
	if (before) {
		const after = readImage(out);
		assert.deepEqual([after?.width, after?.height, after?.orientation], [before.width, before.height, before.orientation], `${label}: the clean file paints like the original`);
	}
}

describe(`seeded corruption (seed ${SEED})`, () => {
	const base = seeds();
	test('every seed file reads cleanly before it is corrupted', () => {
		assert.deepEqual(
			Object.fromEntries(Object.entries(base).map(([k, v]) => [k, readImage(v)])),
			{
				jpeg: { format: 'jpeg', mime: 'image/jpeg', width: 33, height: 17, alpha: false, orientation: 6 },
				twoExif: { format: 'jpeg', mime: 'image/jpeg', width: 33, height: 17, alpha: false, orientation: 1 },
				png: { format: 'png', mime: 'image/png', width: 300, height: 200, alpha: true, orientation: 6 },
				gif: { format: 'gif', mime: 'image/gif', width: 64, height: 32, alpha: true, orientation: 1 },
				webp: { format: 'webp', mime: 'image/webp', width: 64, height: 32, alpha: true, orientation: 1 },
				lossless: { format: 'webp', mime: 'image/webp', width: 300, height: 200, alpha: true, orientation: 1 },
				avif: { format: 'avif', mime: 'image/avif', width: 4032, height: 3024, alpha: true, orientation: 7 },
			},
		);
	});
	for (const [name, file] of Object.entries(seeds())) {
		test(`${name}: ${ROUNDS} corruptions read and clean without a throw or an impossible header`, () => {
			const r = rng(SEED ^ name.split('').reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
			for (let round = 0; round < ROUNDS; round++) {
				const b = mutate(file, r);
				const label = `${name} round ${round} (seed ${SEED})`;
				checkInfo(b, label);
				checkClean(b, label);
			}
		});
	}
});
