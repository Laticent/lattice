// The browser half of the shared image policy (lib/core/image-policy.js): decode, shrink, encode as JPEG.
//
// Both hosts run this same function in a page: the Studio in the user's tab, the CLI in the headless page
// it already drives (lib/export/chrome-recode.js). The browser decodes and scales; the shared JPEG encoder
// writes the bytes, so a deck exported from either host, in any browser, lands at the same size. The PLAN (what to shrink, what to keep) is the
// policy file's; this file only does what the plan says.

import policyCore from './image-policy.js';
import { createJpegEncoder } from './jpeg-encode.mjs';

const { readImageInfo, planRecode, acceptRecode } = policyCore;

/**
 * Decode `bytes`, scale to the plan's size, and encode a JPEG with the shared encoder (lib/core/jpeg-encode.mjs), so the
 * bytes do not depend on the browser. Self-contained apart from `make` (it uses no import when `make` is passed),
 * because the CLI ships its source into a page with `.toString()`, the way `isContinuousTone` ships, and sends
 * `createJpegEncoder`'s source with it.
 *
 * Returns null when the picture should stay as it is: it did not decode, or it has real transparency
 * (a JPEG would paint it black), which only a PNG header's hint can suggest, so the pixels are checked.
 *
 * @param {Uint8Array} bytes
 * @param {string} mime
 * @param {{ width: number, height: number, quality: number, checkAlpha: boolean }} plan
 * @param {typeof createJpegEncoder} [make]  the encoder factory
 * @returns {Promise<Uint8Array|null>}
 */
export async function encodeJpegInPage(bytes, mime, plan, make = createJpegEncoder) {
	let bmp;
	try {
		bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
	} catch {
		return null;
	}
	try {
		const { width: W, height: H } = plan;
		let canvas;
		if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(W, H);
		else {
			canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;
		}
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bmp, 0, 0, W, H);
		bmp.close?.();
		bmp = null;
		// One pass, 64 rows at a time: the alpha check (any pixel not fully opaque keeps the picture a PNG) and the encode.
		const enc = make({ width: W, height: H, quality: plan.quality });
		for (let y0 = 0; y0 < H; y0 += 64) {
			const rows = Math.min(64, H - y0);
			const px = ctx.getImageData(0, y0, W, rows).data;
			if (plan.checkAlpha) for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return null;
			enc.addRows(px, rows);
		}
		return enc.finish();
	} finally {
		bmp?.close?.();
	}
}

/**
 * Apply the policy to one picture's bytes.
 * @param {Uint8Array} bytes
 * @param {ReturnType<typeof policyCore.resolveImagePolicy>} policy
 * @param {(bytes: Uint8Array, mime: string, plan: object) => Promise<Uint8Array|null>} [encode]  the host's encoder; default is this page's
 * @returns {Promise<{ bytes: Uint8Array, mime: string, changed: boolean }>}  the original when nothing wins
 */
export async function recodeImage(bytes, policy, encode = encodeJpegInPage) {
	const info = readImageInfo(bytes);
	const mime = info ? info.mime : '';
	const plan = planRecode(info, bytes.length, policy);
	if (!plan) return { bytes, mime, changed: false };
	let out = null;
	try {
		out = await encode(bytes, mime, plan);
	} catch {
		out = null;
	}
	if (!out || !acceptRecode(bytes.length, out.length, plan, policy)) return { bytes, mime, changed: false };
	return { bytes: out, mime: 'image/jpeg', changed: true };
}
