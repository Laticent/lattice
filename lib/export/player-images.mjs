/**
 * Apply the shared image policy (lib/core/image-policy.js) to the pictures baked into a player.
 *
 * Runs on the parsed document, after the host has turned every picture into a `data:` URI and before
 * anything is sanitized or serialized, so the CLI (jsdom) and the Studio (a browser DOM) shrink the same
 * pictures the same way. Each distinct URI is encoded once; every place it is used gets the result.
 *
 * Reads `<img src>` and the `url(data:…)` in `style` attributes (where the engine writes a slide's
 * background picture). A picture the policy keeps, or the encoder cannot improve, is left as written.
 */
import { recodeImage } from '../core/image-recode.mjs';

const DATA_IMAGE = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/i;
const CSS_DATA_URL = /url\(\s*(&quot;|&#39;|['"]?)(data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+)\1\s*\)/gi;

const unb64 = (s) => {
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
};
const b64 = (bytes) => {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
};

/**
 * @param {Document} doc
 * @param {ReturnType<import('../core/image-policy.js').resolveImagePolicy>} policy
 * @param {(bytes: Uint8Array, mime: string, plan: object) => Promise<Uint8Array|null>} encode
 * @returns {Promise<{ recoded: number, saved: number }>}  `saved` in bytes of data-URI text
 */
export async function recodeDocImages(doc, policy, encode) {
	const memo = new Map();
	let recoded = 0;
	let saved = 0;
	const better = async (uri) => {
		if (!memo.has(uri)) {
			const m = DATA_IMAGE.exec(uri);
			let next = uri;
			if (m) {
				const r = await recodeImage(unb64(m[2]), policy, encode);
				if (r.changed) {
					next = `data:image/jpeg;base64,${b64(r.bytes)}`;
					recoded++;
				}
			}
			memo.set(uri, next);
		}
		const out = memo.get(uri);
		if (out !== uri) saved += uri.length - out.length;
		return out;
	};
	for (const el of doc.querySelectorAll('img[src^="data:image/"], [style*="data:image/"]')) {
		if (el.localName === 'img') {
			const src = el.getAttribute('src');
			const next = await better(src);
			if (next !== src) el.setAttribute('src', next);
		}
		const style = el.getAttribute('style');
		if (style && style.includes('data:image/')) {
			const found = [...style.matchAll(CSS_DATA_URL)];
			if (!found.length) continue;
			let out = style;
			for (const f of found) out = out.split(f[2]).join(await better(f[2]));
			if (out !== style) el.setAttribute('style', out);
		}
	}
	return { recoded, saved };
}
