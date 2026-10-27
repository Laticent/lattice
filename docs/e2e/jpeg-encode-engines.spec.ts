import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

// The shared JPEG encoder (lib/core/jpeg-encode.mjs) writes the SAME BYTES in every engine, and every engine reads
// them back. @gecko runs it in Chromium (desktop) and Firefox; @webkit-tablet in WebKit, the iPhone's engine.
//
// The encoder exists because the platform encoders (`canvas.toBlob('image/jpeg')`) do not agree: one picture
// PowerPoint came out 12.5 MB from Chromium and 43.3 MB from an iPhone. So the check is the bytes themselves, against
// the golden hash test/unit/core/jpeg-encode.test.js pins in Node, plus a decode by the engine's own JPEG reader.
// It also times a 2560 × 1440 slide, the size a picture export writes, so a slow engine shows up in the report.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The same as GOLDEN in test/unit/core/jpeg-encode.test.js.
const GOLDEN = { width: 301, height: 157, quality: 90, sha256: 'c58daad69614db3208e19a5f8fcd8fb61eec1cc601fdc373bd4e4d12bd926f00' };

// The unit test's picture: flat areas, gradients, hard edges, noise, and a band of transparency.
function synthetic(w: number, h: number) {
	const px = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
			px[i] = x < w / 3 ? 200 : (x * 255) / w;
			px[i + 1] = (y * 255) / h;
			px[i + 2] = ((x >> 3) + (y >> 3)) & 1 ? 40 : n & 255;
			px[i + 3] = y > h * 0.75 ? (x * 255) / w : 255;
		}
	}
	return px;
}

for (const tag of ['@gecko', '@webkit-tablet']) {
	test(`the shared JPEG encoder writes the golden bytes and the engine decodes them ${tag}`, async ({ page }, testInfo) => {
		test.setTimeout(120_000);
		const { createJpegEncoder } = await import(pathToFileURL(path.join(ROOT, 'lib', 'core', 'jpeg-encode.mjs')).href);
		await page.setContent('<!doctype html><title>jpeg</title>');
		// The encoder goes in as its own source text, the way lib/export/chrome-recode.js sends it.
		await page.evaluate(`window.__jpeg = ${createJpegEncoder.toString()}; window.__synthetic = ${synthetic.toString()};`);
		const result = await page.evaluate(async ({ width, height, quality }) => {
			const w = window as unknown as Record<string, any>;
			const px = w.__synthetic(width, height);
			const enc = w.__jpeg({ width, height, quality });
			enc.addRows(px, height);
			const jpg: Uint8Array<ArrayBuffer> = enc.finish();
			// The same picture on white, as the reference both encoders are measured against.
			const flat = new Uint8ClampedArray(px.length);
			for (let i = 0; i < px.length; i += 4) {
				const a = px[i + 3];
				for (let k = 0; k < 3; k++) flat[i + k] = Math.round((px[i + k] * a + 255 * (255 - a)) / 255);
				flat[i + 3] = 255;
			}
			// Read a JPEG back with the engine's own decoder and score it against `flat`.
			const psnrOf = async (blob: Blob) => {
				const bmp = await createImageBitmap(blob);
				const c = document.createElement('canvas');
				c.width = bmp.width;
				c.height = bmp.height;
				const g = c.getContext('2d', { willReadFrequently: true })!;
				g.drawImage(bmp, 0, 0);
				const back = g.getImageData(0, 0, c.width, c.height).data;
				let se = 0;
				let n = 0;
				// Luma only: engines differ in how they keep color (Firefox writes 4:4:4, the others and ours 4:2:0), and that
				// choice is the size difference this encoder exists to remove, not the fidelity being checked.
				const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
				for (let i = 0; i < flat.length; i += 4) {
					se += (luma(flat, i) - luma(back, i)) ** 2;
					n++;
				}
				return { w: bmp.width, h: bmp.height, psnr: 10 * Math.log10((255 * 255) / (se / n)) };
			};
			const ours = await psnrOf(new Blob([jpg], { type: 'image/jpeg' }));
			// The engine's own encoder at the same quality, on the same pixels: the bar ours has to meet.
			const ref = document.createElement('canvas');
			ref.width = width;
			ref.height = height;
			ref.getContext('2d')!.putImageData(new ImageData(flat, width, height), 0, 0);
			const native: Blob = await new Promise((res) => ref.toBlob((b) => res(b!), 'image/jpeg', quality / 100));
			const platform = await psnrOf(native);
			// A slide-sized encode, for the timing.
			const big = new Uint8ClampedArray(2560 * 64 * 4);
			for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24;
			const t = performance.now();
			const slide = w.__jpeg({ width: 2560, height: 1440, quality: 90 });
			for (let y = 0; y < 1440; y += 64) slide.addRows(big, Math.min(64, 1440 - y));
			const slideBytes = slide.finish().length;
			const ms = performance.now() - t;
			let s = '';
			for (let i = 0; i < jpg.length; i += 0x8000) s += String.fromCharCode(...jpg.subarray(i, i + 0x8000));
			return { b64: btoa(s), w: ours.w, h: ours.h, psnr: ours.psnr, platformPsnr: platform.psnr, platformBytes: native.size, ms, slideBytes };
		}, GOLDEN);
		const bytes = Buffer.from(result.b64, 'base64');
		testInfo.annotations.push({ type: 'jpeg', description: `${testInfo.project.name}: ours ${bytes.length} B at ${result.psnr.toFixed(2)} dB, the engine's own ${result.platformBytes} B at ${result.platformPsnr.toFixed(2)} dB, 2560x1440 noise slide ${result.ms.toFixed(0)} ms (${result.slideBytes} B)` });
		expect(createHash('sha256').update(bytes).digest('hex'), 'the same bytes as Node writes').toBe(GOLDEN.sha256);
		expect([result.w, result.h]).toEqual([GOLDEN.width, GOLDEN.height]);
		// The picture is hard on purpose (noise, hard edges), so the bar is relative: its luma as faithful as the engine's
		// own encoder's at the same quality, within a decibel. A broken table or DCT lands far below.
		expect(result.psnr).toBeGreaterThan(result.platformPsnr - 1);
	});
}
