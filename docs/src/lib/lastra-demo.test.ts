import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ImageInfo, planRecode, readImage } from '@laticent/lastra';
import { describe, expect, it } from 'vitest';
import { decodeUpright, EDGES, fitEdge, kb, keepReason, LATTICE, readPicture, recode, verdict } from './lastra-demo';

// The three samples the page offers (examples/media/README.md says where each comes from).
const media = resolve(dirname(fileURLToPath(import.meta.url)), '../../../examples/media');
const load = (f: string) => new Uint8Array(readFileSync(join(media, f)));

describe('lastra demo', () => {
	it("uses Lattice's own thresholds, and offers its long edge", () => {
		expect(LATTICE).toEqual({ maxEdge: 2560, quality: 90, minBytes: 150 * 1024, formatShare: 0.7, sameFormatShare: 0.9, tightJpegBytesPerPx: 0.5 });
		expect(EDGES).toContain(LATTICE.maxEdge);
	});

	it('reads each sample the way the page describes it', () => {
		const canoe = readPicture(load('canoe.jpg'));
		expect(canoe.info).toMatchObject({ format: 'jpeg', width: 1600, height: 1000, orientation: 1, alpha: false });
		expect(canoe.cleaned!.length).toBeLessThan(load('canoe.jpg').length);

		// The turn sits after the frame header, where Lattice's old readers missed it; every engine applies it.
		const mug = readPicture(load('mug-exif-after-frame.jpg'));
		expect(mug.info).toMatchObject({ format: 'jpeg', width: 1000, height: 1600, orientation: 6 });
		expect(mug.painted).toEqual({ width: 1600, height: 1000 });
		expect(mug.agreed).toBe(true);

		const png = readPicture(load('canoe-turned.png'));
		expect(png.info).toMatchObject({ format: 'png', width: 300, height: 480, orientation: 6 });
		expect(png.painted).toEqual({ width: 480, height: 300 });
		expect(png.cleaned).not.toBeNull();
		// A PNG's eXIf turn is one not every engine applies.
		expect(png.agreed).toBe(false);
	});

	it('gives a reason exactly when planRecode keeps the file', () => {
		const infos: (ImageInfo | null)[] = [null];
		for (const format of ['png', 'jpeg', 'webp'] as const) {
			for (const orientation of [1, 6]) {
				for (const [width, height] of [[1600, 1000], [4000, 3000], [0, 10]]) {
					infos.push({ format, mime: `image/${format}`, width, height, alpha: false, orientation });
				}
			}
		}
		for (const info of infos) {
			for (const bytes of [1000, 200 * 1024, 5_000_000]) {
				for (const maxEdge of EDGES) {
					const t = { ...LATTICE, maxEdge };
					expect(keepReason(info, bytes, t) === null, JSON.stringify({ info, bytes, maxEdge })).toBe(planRecode(info, bytes, t) !== null);
				}
			}
		}
	});

	it('names why each sample is kept as it is', () => {
		const canoe = load('canoe.jpg');
		expect(verdict(readImage(canoe), canoe.length, 2560, 90).reason).toMatch(/under 150 KB/);
		const mug = load('mug-exif-after-frame.jpg');
		expect(verdict(readImage(mug), mug.length, 2560, 90).plan).toBeNull();
	});

	it('decodes upright, shrinks to the long edge and writes a JPEG', async () => {
		const bytes = load('mug-exif-after-frame.jpg');
		const info = readImage(bytes)!;
		const px = (await decodeUpright(bytes, info))!;
		expect([px.width, px.height]).toEqual([1600, 1000]);
		const out = recode(px, info, bytes.length, 640, 80);
		expect([out.width, out.height]).toEqual([640, 400]);
		expect([out.jpeg[0], out.jpeg[1]]).toEqual([0xff, 0xd8]);
		expect(readImage(out.jpeg)).toMatchObject({ format: 'jpeg', width: 640, height: 400, orientation: 1 });
		expect(out.accepted).toBe(true);

		const png = load('canoe-turned.png');
		const pngPx = (await decodeUpright(png, readImage(png)!))!;
		expect([pngPx.width, pngPx.height]).toEqual([480, 300]);
	});

	it('never enlarges, and prints sizes', () => {
		expect(fitEdge(300, 480, 2560)).toEqual({ width: 300, height: 480 });
		expect(fitEdge(1600, 1000, 1280)).toEqual({ width: 1280, height: 800 });
		expect(kb(900)).toBe('900 B');
		expect(kb(117307)).toBe('115 KB');
	});
});
