// @vitest-environment node
// The PLAN half of the importer — pure. The decode/canvas half needs a real browser (jsdom has
// no image decoder, so a jsdom test would only confirm a stub); it is exercised on the real
// Studio, not here.
import { describe, expect, it } from 'vitest';
import { classifyMedia, MAX_IMAGE_EDGE, mimeOf, planImage, uniqueName } from './media-import';

describe('mimeOf', () => {
	it('trusts the browser’s type, else infers from the extension (iOS hands back HEIC with none)', () => {
		expect(mimeOf({ name: 'a.png', type: 'image/PNG' })).toBe('image/png');
		expect(mimeOf({ name: 'IMG_1.HEIC', type: '' })).toBe('image/heic');
		expect(mimeOf({ name: 'notes.txt', type: '' })).toBe('');
	});
});

describe('classifyMedia', () => {
	it('takes images, refuses everything else', () => {
		expect(classifyMedia({ name: 'a.jpg', type: 'image/jpeg' })).toBe('image');
		expect(classifyMedia({ name: 'a.heic', type: '' })).toBe('image');
		expect(classifyMedia({ name: 'a.pdf', type: 'application/pdf' })).toBeNull();
		expect(classifyMedia({ name: 'a.zip', type: '' })).toBeNull();
	});
});

describe('planImage', () => {
	it('always re-encodes a JPEG, even under the cap — that is what strips GPS from the bytes', () => {
		const p = planImage('image/jpeg', 1200, 800);
		expect(p).toMatchObject({ reencode: true, width: 1200, height: 800, mime: 'image/jpeg', downscaled: true });
	});
	it('turns HEIC into JPEG', () => {
		expect(planImage('image/heic', 4032, 3024)).toMatchObject({ reencode: true, mime: 'image/jpeg' });
	});
	it('caps the LONG edge and keeps the aspect, landscape and portrait', () => {
		const land = planImage('image/jpeg', 4032, 3024);
		expect(Math.max(land.width, land.height)).toBe(MAX_IMAGE_EDGE);
		expect(land.width / land.height).toBeCloseTo(4032 / 3024, 2);
		const port = planImage('image/jpeg', 3024, 4032);
		expect(port.height).toBe(MAX_IMAGE_EDGE);
		expect(port.width).toBeLessThan(port.height);
	});
	it('leaves a PNG or WebP under the cap untouched (screenshots and logos stay lossless)', () => {
		expect(planImage('image/png', 1920, 1080)).toMatchObject({ reencode: false, mime: 'image/png', downscaled: false });
		expect(planImage('image/webp', 800, 600).reencode).toBe(false);
	});
	it('downscales an oversized PNG in its own format so transparency survives', () => {
		expect(planImage('image/png', 6000, 3000)).toMatchObject({ reencode: true, mime: 'image/png', width: MAX_IMAGE_EDGE, height: 1280 });
	});
	it('stores GIF and AVIF as given', () => {
		for (const m of ['image/gif', 'image/avif']) expect(planImage(m, 9000, 9000).reencode).toBe(false);
	});
	it('re-encodes the spellings of JPEG that pickers report, so GPS never survives in `image/jpg`', () => {
		for (const m of ['image/jpg', 'image/pjpeg']) expect(planImage(m, 800, 600)).toMatchObject({ reencode: true, mime: 'image/jpeg' });
	});
	it('turns any type the Library does not store into a PNG, so a backup never has to drop one', () => {
		for (const m of ['image/bmp', 'image/tiff', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/x-whatever', 'image/svg+xml']) {
			expect(planImage(m, 400, 300), m).toMatchObject({ reencode: true, mime: 'image/png' });
		}
	});
	it('never produces a zero-size image from an extreme aspect', () => {
		const p = planImage('image/png', 20000, 3);
		expect(p.width).toBe(MAX_IMAGE_EDGE);
		expect(p.height).toBeGreaterThanOrEqual(1);
	});
});

describe('uniqueName', () => {
	it('numbers a clash so a batch of IMG_0042 files cannot refuse each other', () => {
		expect(uniqueName('img', new Set())).toBe('img');
		expect(uniqueName('img', new Set(['img']))).toBe('img-2');
		expect(uniqueName('img', new Set(['img', 'img-2', 'img-3']))).toBe('img-4');
	});
});
