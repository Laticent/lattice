import { expect, test } from '@playwright/test';

// The image library's header reader (`@laticent/lastra` `readImage`) against what the engines PAINT. Lattice had four
// readers that disagreed on these files (docs/src/lib/lastra/read.test.ts has each row and the old answers); lastra's
// answer is the one Chromium paints, since both export hosts paint with it. This holds every engine to its probed
// behavior: Chromium must agree with lastra on every file, and WebKit and Firefox may differ only where they were
// measured to differ (ENGINE_SPLITS). An engine that changes its mind fails here, and the reader's rule gets looked at.
// @gecko runs it in Chromium (desktop) and Firefox; @webkit-tablet in WebKit.

type Lastra = typeof import('@laticent/lastra');

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const segment = (marker: number, data: number[]) => [0xff, marker, ...be16(data.length + 2), ...data];
function tiff(o: number, { magic = 42, tag = true } = {}) {
	return [...ascii('MM'), ...be16(magic), ...be32(8), ...be16(1), ...be16(tag ? 0x0112 : 0x010f), ...be16(3), ...be32(1), ...be16(o), 0, 0, ...be32(0)];
}
const exif = (o: number, opts?: Parameters<typeof tiff>[1]) => segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(o, opts)]);
const xmp = segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x/>')]);

// Self-generated with Pillow (64x32): a lossy WebP carrying EXIF Orientation 6, and an AVIF (mif1 compatible brand).
const WEBP_EXIF_6 = 'UklGRn4AAABXRUJQVlA4WAoAAAAIAAAAPwAAHwAAVlA4ID4AAAAQAwCdASpAACAAPm02l0ikIyIhJAgAgA2JZwAAH2BD/9AA/vRRH//7B3//oO//9B3+1X/1VT1+CfX8PAAAAEVYSUYaAAAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAA=';
const AVIF =
	'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKwAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAQAAAACAAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAM21kYXQSAAoJGBU/+0QENBoQMhwUx4eGZQIIIJ5QAAAAx5O05wYQTE4G++XKr4Co';

/** Every case, as decodable files built from lastra's own writers: name, MIME, bytes. */
async function cases(l: Lastra): Promise<Array<{ name: string; mime: string; bytes: Uint8Array }>> {
	const W = 64;
	const H = 32;
	const px = new Uint8ClampedArray(W * H * 4).map((_v, i) => (i % 4 === 3 ? 255 : (i * 29) & 255));
	const jpg = l.encodeJpeg(px, W, H, 80);
	// The encoder writes SOI, APP0, DQT, SOF0, DHT, SOS: segments go in after SOI, or before or after the frame header.
	let sofAt = 2;
	while (jpg[sofAt + 1] !== 0xc0) sofAt += 2 + ((jpg[sofAt + 2] << 8) | jpg[sofAt + 3]);
	const sofEnd = sofAt + 2 + ((jpg[sofAt + 2] << 8) | jpg[sofAt + 3]);
	const head = (extra: number[]) => new Uint8Array([0xff, 0xd8, ...extra, ...jpg.subarray(2)]);
	const beforeFrame = (extra: number[]) => new Uint8Array([...jpg.subarray(0, sofAt), ...extra, ...jpg.subarray(sofAt)]);
	const afterFrame = (extra: number[]) => new Uint8Array([...jpg.subarray(0, sofEnd), ...extra, ...jpg.subarray(sofEnd)]);
	const png = await l.encodePng(W, H, (y0, rows) => px.subarray(y0 * W * 4, (y0 + rows) * W * 4));
	const chunk = (type: string, data: number[]) => {
		const body = [...ascii(type), ...data];
		return [...be32(data.length), ...body, ...be32(l.crc32(body))];
	};
	const afterIhdr = (c: number[]) => new Uint8Array([...png.subarray(0, 33), ...c, ...png.subarray(33)]);
	const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
	return [
		{ name: 'jpeg exif 6', mime: 'image/jpeg', bytes: head(exif(6)) },
		{ name: 'jpeg exif 1 then 6', mime: 'image/jpeg', bytes: head([...exif(1), ...exif(6)]) },
		{ name: 'jpeg exif without the tag, then 6', mime: 'image/jpeg', bytes: head([...exif(1, { tag: false }), ...exif(6)]) },
		{ name: 'jpeg exif 6 after the frame header', mime: 'image/jpeg', bytes: afterFrame(exif(6)) },
		{ name: 'jpeg exif 6 with magic 43', mime: 'image/jpeg', bytes: head(exif(6, { magic: 43 })) },
		{ name: 'jpeg exif 9', mime: 'image/jpeg', bytes: head(exif(9)) },
		{ name: 'jpeg xmp then exif 6', mime: 'image/jpeg', bytes: head([...xmp, ...exif(6)]) },
		{ name: 'jpeg junk before the frame header', mime: 'image/jpeg', bytes: beforeFrame([0x00, 0x11, 0x22]) },
		{ name: 'jpeg fill bytes before the frame header', mime: 'image/jpeg', bytes: beforeFrame([0xff, 0xff, 0xff]) },
		{ name: 'jpeg FF D8 then 00', mime: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0x00, ...jpg.subarray(2)]) },
		{ name: 'png', mime: 'image/png', bytes: png },
		{ name: 'png eXIf 6', mime: 'image/png', bytes: afterIhdr(chunk('eXIf', tiff(6))) },
		{ name: 'png bad signature tail', mime: 'image/png', bytes: new Uint8Array([...png.subarray(0, 4), 0, 0, 0, 0, ...png.subarray(8)]) },
		{ name: 'png chunk before IHDR', mime: 'image/png', bytes: new Uint8Array([...png.subarray(0, 8), ...chunk('tEXt', ascii('k\0v')), ...png.subarray(8)]) },
		{ name: 'webp exif 6', mime: 'image/webp', bytes: b64(WEBP_EXIF_6) },
		{ name: 'avif', mime: 'image/avif', bytes: b64(AVIF) },
	];
}

/**
 * Where an engine was measured (2026-11-13) to paint differently from lastra. Chromium's entry carries the major
 * versions it holds for: Playwright's Chromium 141 turns a picture whose TIFF block has the wrong magic number, and
 * Chrome 153 (the CLI's export browser here), WebKit and Firefox do not, which is the answer lastra gives.
 */
const CHROMIUM_BEFORE_153: Record<string, string> = {
	'jpeg exif 6 with magic 43': '32x64',
};
const ENGINE_SPLITS: Record<string, Record<string, string>> = {
	webkit: {
		'jpeg exif without the tag, then 6': '32x64', // WebKit reads on past a first Exif block with no tag
		'png eXIf 6': '64x32', // WebKit does not apply a PNG's eXIf
	},
	firefox: {
		'jpeg xmp then exif 6': '64x32', // Firefox reads only the first APP1
		'jpeg FF D8 then 00': '64x32', // Firefox decodes a JPEG whose SOI is not followed by a marker
		'png chunk before IHDR': '64x32', // Firefox decodes a PNG whose first chunk is not IHDR
	},
};

for (const tag of ['@gecko', '@webkit-tablet']) {
	test(`lastra's header read matches what the engine paints ${tag}`, async ({ page, browserName, browser }) => {
		const splits = { ...ENGINE_SPLITS[browserName], ...(browserName === 'chromium' && Number.parseInt(browser.version(), 10) < 153 ? CHROMIUM_BEFORE_153 : {}) };
		const l: Lastra = await import('@laticent/lastra');
		await page.setContent('<!doctype html><title>read</title>');
		const rows: Array<{ name: string; painted: string; expected: string }> = [];
		for (const c of await cases(l)) {
			const painted = await page.evaluate(async (src) => {
				const img = new Image();
				img.src = src;
				try {
					await img.decode();
				} catch {
					return 'no decode';
				}
				return `${img.naturalWidth}x${img.naturalHeight}`;
			}, `data:${c.mime};base64,${Buffer.from(c.bytes).toString('base64')}`);
			const info = l.readImage(c.bytes);
			const read = info ? `${l.displaySize(info).width}x${l.displaySize(info).height}` : 'no decode';
			rows.push({ name: c.name, painted, expected: splits[c.name] ?? read });
		}
		expect(rows.filter((r) => r.painted !== r.expected), JSON.stringify(rows, null, 1)).toEqual([]);
	});
}
