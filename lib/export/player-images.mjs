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
import { cleanerFor } from '@laticent/lastra';
import contentPolicy from '../core/content-policy.js';
import { recodeImage } from '../core/image-recode.mjs';
import mediaSources from '../core/media-sources.js';

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

/** A picture baked in as `data:` text, in any of the places a player keeps one. */
const ANY_DATA_IMAGE = /data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)/gi;
/** Every attribute a render fetches from (lib/core/content-policy.js, the one list), and `style`, where the engine
 *  writes a slide's background picture. */
const PICTURE_ATTRS = [...contentPolicy.RENDER_FETCH_ATTRS, 'style'];

/**
 * Remove the metadata of every picture baked into a player, before anything else reads the document: EXIF (a phone's
 * location among it), XMP, text chunks and comments, cut by the image library's cleaner, the one the Studio's intake and
 * the `.lattice` packer use (`@laticent/lastra` `cleanerFor`). The pixels are untouched, so the player looks the same; a
 * picture already clean (every Studio Library photo) keeps its exact bytes. Runs whatever the image policy says,
 * `images: original` included: "original" is the pixels the author added, never the camera's notes about them.
 *
 * Every place a player keeps a picture: an `<img src>`, `srcset` candidates, a `<video poster>`, an SVG `<image href>`,
 * a `style` attribute and a `<style>` element. Each distinct picture is cleaned once. One the cleaner cannot parse is
 * never shipped as it is: the drawn stand-in takes its place, as for a picture outside the deck's folder, and it is
 * named in `refused`.
 * @param {Document} doc
 * @returns {{ cleaned: number, refused: string[] }}  `cleaned`: pictures whose bytes changed
 */
export function cleanDocImages(doc) {
	const memo = new Map();
	let cleaned = 0;
	const refused = [];
	const clean = (uri, mime, body) => {
		if (memo.has(uri)) return memo.get(uri);
		const bytes = unb64(body);
		const out = cleanerFor(mime.toLowerCase())?.(bytes);
		let next;
		if (!out) {
			next = mediaSources.WEB_IMAGE_PLACEHOLDER;
			refused.push(`a ${mime.slice(6).toUpperCase()} picture of ${bytes.length} bytes (it does not read as a whole file, so its metadata cannot be removed; not embedded)`);
		} else if (out.length === bytes.length && out.every((b, i) => b === bytes[i])) {
			next = uri;
		} else {
			next = `data:${mime};base64,${b64(out)}`;
			cleaned++;
		}
		memo.set(uri, next);
		return next;
	};
	const rewrite = (text) => text.replace(ANY_DATA_IMAGE, (uri, mime, body) => clean(uri, mime, body));
	const walker = doc.createTreeWalker(doc, 1 /* NodeFilter.SHOW_ELEMENT */);
	const visit = (el) => {
		for (const name of PICTURE_ATTRS) {
			const v = el.getAttribute?.(name);
			if (v && v.includes('data:image/')) {
				const next = rewrite(v);
				if (next !== v) el.setAttribute(name, next);
			}
		}
		if (el.localName === 'style') {
			for (const node of el.childNodes) if (node.nodeType === 3 && node.data.includes('data:image/')) node.data = rewrite(node.data);
		}
		if (el.localName === 'template' && el.content) for (const inner of el.content.querySelectorAll('*')) visit(inner);
	};
	for (let el = walker.nextNode(); el; el = walker.nextNode()) visit(el);
	return { cleaned, refused };
}
