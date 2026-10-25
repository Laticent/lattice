// The browser half of the shared image policy (lib/core/image-policy.js): decode, shrink, encode as JPEG.
//
// Both hosts run this same function in a Chromium page: the Studio in the user's tab, the CLI in the
// headless page it already drives (lib/export/chrome-recode.js). One encoder gives one answer, so a
// deck exported from either lands at the same size. The PLAN (what to shrink, what to keep) is the
// policy file's; this file only does what the plan says.

import policyCore from './image-policy.js';

const { readImageInfo, planRecode, acceptRecode } = policyCore;

/**
 * Decode `bytes`, scale to the plan's size, and encode a JPEG. Self-contained (it uses no import) because
 * the CLI ships its source into a page with `.toString()`, the way `isContinuousTone` ships.
 *
 * Returns null when the picture should stay as it is: it did not decode, or it has real transparency
 * (a JPEG would paint it black), which only a PNG header's hint can suggest, so the pixels are checked.
 *
 * @param {Uint8Array} bytes
 * @param {string} mime
 * @param {{ width: number, height: number, quality: number, checkAlpha: boolean }} plan
 * @returns {Promise<Uint8Array|null>}
 */
export async function encodeJpegInPage(bytes, mime, plan) {
	let bmp;
	try {
		bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
	} catch {
		return null;
	}
	try {
		const makeCanvas = (w, h) => {
			if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			return c;
		};
		const canvas = makeCanvas(plan.width, plan.height);
		const ctx = canvas.getContext('2d', { willReadFrequently: !!plan.checkAlpha });
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bmp, 0, 0, plan.width, plan.height);
		if (plan.checkAlpha) {
			// Any pixel that is not fully opaque keeps the picture a PNG.
			const px = ctx.getImageData(0, 0, plan.width, plan.height).data;
			for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return null;
		}
		const q = plan.quality / 100;
		const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality: q }) : await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
		if (!blob || blob.type !== 'image/jpeg') return null;
		return new Uint8Array(await blob.arrayBuffer());
	} finally {
		bmp.close?.();
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
