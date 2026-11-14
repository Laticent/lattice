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
import { cleanerFor, IMAGE_MIME, imageFormat } from '@laticent/lastra';
import contentPolicy from '../core/content-policy.js';
import htmlRefReader from '../core/html-ref-reader.js';
import { recodeImage } from '../core/image-recode.mjs';
import mediaSources from '../core/media-sources.js';
import remoteRef from '../core/remote-ref.js';

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

/** Every attribute a render fetches from (lib/core/content-policy.js, the one list), and `style`, where the engine
 *  writes a slide's background picture. */
const PICTURE_ATTRS = [...contentPolicy.RENDER_FETCH_ATTRS, 'style'];

/** Where a `data:image/…` address starts, in any letter case (a browser reads the scheme and type case-insensitively). */
const DATA_IMAGE_AT = /data:image\//gi;
/** The picture types the cleaner keeps as they are, by the format the bytes say (`imageFormat`), never the URI's MIME. */
const CLEANABLE = new Set(['png', 'jpeg', 'webp', 'gif']);
/** How deep an SVG inside an SVG is followed; past it the picture is the stand-in. */
const MAX_SVG_DEPTH = 4;
const { rawTextEnd } = htmlRefReader;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/**
 * The drawn stand-in, spelled so it can be pasted anywhere an address sat: inside a single- or double-quoted
 * attribute, a quoted CSS string or an unquoted `url(…)`. `WEB_IMAGE_PLACEHOLDER` quotes its SVG attributes with `'`
 * and has spaces, either of which would end the container it is pasted into; percent-encoded, a browser reads the
 * same picture.
 */
const PASTE_SAFE_PLACEHOLDER = mediaSources.WEB_IMAGE_PLACEHOLDER.replace(/'/g, '%27').replace(/ /g, '%20');

/**
 * The characters a `data:` address is written with, which an escape may spell. Decoding one of them never changes
 * what the text around it means, in markup or in CSS, so the reader can decode them and see the address the browser
 * sees. Every other reference is left as written.
 */
const ADDRESS_CHAR = /^[A-Za-z0-9:/;,+=._%-]$/;
const XML_CHAR_REF = /&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g;
/**
 * An SVG's text with each XML character reference that spells an address character decoded (`data&#58;image/…` is
 * `data:image/…` to the XML parser that draws it). Anything else stays as written, so markup keeps its structure.
 * @param {string} text
 */
function decodeAddressRefs(text) {
	if (!text.includes('&#')) return text;
	return text.replace(XML_CHAR_REF, (ref, hex, dec) => {
		const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
		if (cp > 0x10ffff) return ref;
		const ch = String.fromCodePoint(cp);
		return ADDRESS_CHAR.test(ch) ? ch : ref;
	});
}

/**
 * The bytes a browser reads from a `data:` URI: the header's parameters (`;name=x.jpg`, any case) are read for
 * `base64` and nothing else; a base64 body is percent-decoded and its whitespace (a wrapped line) dropped, as a
 * browser does; any other body is percent-decoded to bytes. Null when it does not decode.
 * @param {string} uri
 * @returns {Uint8Array | null}
 */
function dataUriBytes(uri) {
	const comma = uri.indexOf(',');
	if (comma < 0) return null;
	const params = uri.slice(5, comma).split(';').slice(1).map((p) => p.trim().toLowerCase());
	const body = uri.slice(comma + 1);
	try {
		if (params.includes('base64')) return unb64(decodeURIComponent(body).replace(/\s+/g, ''));
		const out = [];
		for (let i = 0; i < body.length; i++) {
			if (body[i] === '%' && /^[0-9a-f]{2}$/i.test(body.slice(i + 1, i + 3))) {
				out.push(parseInt(body.slice(i + 1, i + 3), 16));
				i += 2;
			} else {
				const cp = body.codePointAt(i);
				for (const b of utf8.encode(String.fromCodePoint(cp))) out.push(b);
				if (cp > 0xffff) i++;
			}
		}
		return new Uint8Array(out);
	} catch {
		return null;
	}
}

/**
 * A cleaner for the `data:image/…` pictures in a document or a stylesheet, remembering each distinct URI. Shared by
 * the player's pass below and by `cleanSvgText`, so a picture inside an SVG meets the same rule as one beside it.
 */
function createUriCleaner() {
	const memo = new Map();
	const state = { cleaned: 0, refused: [] };
	const refuse = (uri, why) => {
		state.refused.push(`a picture (${uri.slice(0, 40).replace(/\s+/g, ' ')}…) ${why}; not embedded`);
		return PASTE_SAFE_PLACEHOLDER;
	};
	/** One `data:image/…` URI, as it should ship. */
	const cleanUri = (uri, depth) => {
		const key = `${depth}\u0000${uri}`;
		if (memo.has(key)) return memo.get(key);
		let next = uri;
		const bytes = dataUriBytes(uri);
		const format = bytes ? imageFormat(bytes) : null;
		if (!bytes) next = refuse(uri, 'does not decode');
		else if (format === 'svg') {
			// An SVG carries pictures of its own: each is cleaned by this same rule, and the SVG is otherwise kept as it
			// is. Nothing sanitizes inside an SVG kept as a picture: the image context (`<img>`, `url(…)`) is what keeps
			// its script inert. Rewritten only when something changed.
			if (depth >= MAX_SVG_DEPTH) next = refuse(uri, 'is an SVG nested too deep to read');
			else {
				const text = fromUtf8.decode(bytes);
				const out = rewriteSvg(text, depth + 1);
				if (out !== text) {
					next = `data:image/svg+xml;base64,${b64(utf8.encode(out))}`;
					state.cleaned++;
				}
			}
		} else if (!CLEANABLE.has(format)) next = refuse(uri, format ? `is ${format.toUpperCase()}, which the cleaner does not read` : 'is not a picture the cleaner can read');
		else {
			const out = cleanerFor(IMAGE_MIME[format])(bytes);
			if (!out) next = refuse(uri, 'does not read as a whole file, so its metadata cannot be removed');
			else if (!(out.length === bytes.length && out.every((b, i) => b === bytes[i]))) {
				next = `data:${IMAGE_MIME[format]};base64,${b64(out)}`;
				state.cleaned++;
			}
		}
		memo.set(key, next);
		return next;
	};
	/**
	 * Every `data:image/…` URI in a text (a stylesheet, an SVG, a `style` or `srcset` value), each where it ends: at its
	 * closing quote when one opens it, at `)` after an unquoted `url(`, else at the first space, quote, `<`, `>` or
	 * `)`. A trailing `,` (a `srcset` separator) stays outside.
	 */
	const rewriteText = (text, depth) => {
		let out = '';
		let at = 0;
		DATA_IMAGE_AT.lastIndex = 0;
		const starts = [];
		for (let m = DATA_IMAGE_AT.exec(text); m; m = DATA_IMAGE_AT.exec(text)) starts.push(m.index);
		for (const s of starts) {
			if (s < at) continue;
			const open = text[s - 1];
			let end;
			if (open === '"' || open === "'") end = text.indexOf(open, s);
			else if (open === '(') end = text.indexOf(')', s);
			else {
				const rest = /[\s"'<>)]/.exec(text.slice(s));
				end = rest ? s + rest.index : -1;
			}
			if (end < 0) end = text.length;
			let cut = end;
			while (cut > s && /[\s,]/.test(text[cut - 1])) cut--;
			out += text.slice(at, s) + cleanUri(text.slice(s, cut), depth) + text.slice(cut, end);
			at = end;
		}
		return out + text.slice(at);
	};
	/**
	 * A piece of CSS (a `style` value, a `<style>` body, a presentation attribute) with every picture it names cleaned,
	 * read by the CSS tokenizer the web-image block uses (remote-ref.js `cssRefSpans`), so an escaped spelling
	 * (`url('data\3a image/…')`, `u\72l(…)`) is found as the browser reads it. A picture that changed is written back
	 * plainly: an unquoted `url(…)`, or a string in its own quote, both safe in any container. Then the plain-text pass,
	 * for a form the tokenizer does not name.
	 */
	const rewriteCss = (css, depth) => {
		let out = css;
		if (/data|\\/i.test(css)) {
			const spans = remoteRef.cssRefSpans(css).filter((sp) => /^data:image\//i.test(sp.value.trim()));
			for (const sp of spans.reverse()) {
				const value = sp.value.trim();
				const next = cleanUri(value, depth);
				if (next === value) continue;
				const q = css[sp.from];
				out = out.slice(0, sp.from) + (sp.kind === 'url' ? `url(${next})` : `${q}${next}${q}`) + out.slice(sp.to);
			}
		}
		return rewriteText(out, depth);
	};
	/**
	 * An SVG's text: the XML references that spell an address decoded, then each CSS place in it read as CSS (a
	 * `<style>` body, and every attribute value, since `style` and the presentation attributes are CSS; a value that
	 * names no picture comes back unchanged), then every remaining address as text. The tags are read by the markup
	 * reader the web-image block uses (remote-ref.js `scanHtml`), and a `<style>` ends where `rawTextEnd` says.
	 */
	const rewriteSvg = (text, depth) => {
		const decoded = decodeAddressRefs(text);
		const edits = [];
		for (const t of remoteRef.scanHtml(decoded).tags) {
			if (t.closing) continue;
			for (const a of t.attrs) {
				if (a.vFrom < 0) continue;
				const v = decoded.slice(a.vFrom, a.vTo);
				const next = rewriteCss(v, depth);
				if (next !== v) edits.push([a.vFrom, a.vTo, next]);
			}
			if (t.name === 'style' && !t.selfClosing) {
				const close = rawTextEnd(decoded, 'style', t.end);
				const to = close < 0 ? decoded.length : close;
				const body = decoded.slice(t.end, to);
				const next = rewriteCss(body, depth);
				if (next !== body) edits.push([t.end, to, next]);
			}
		}
		let out = decoded;
		for (const [from, to, next] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, from) + next + out.slice(to);
		const final = rewriteText(out, depth);
		// Decoding the references alone changes no picture: an SVG with nothing to clean keeps its exact bytes.
		return final === decoded ? text : final;
	};
	return { cleanUri, rewriteText, rewriteCss, rewriteSvg, state };
}

/**
 * The raster pictures inside an SVG's text, cleaned (`cleanDocImages`' rule), with the SVG otherwise byte-identical.
 * For a host that copies an SVG file as it is (tools/export-marp.js).
 * @param {string} text
 * @returns {{ text: string, cleaned: number, refused: string[] }}
 */
export function cleanSvgText(text) {
	const c = createUriCleaner();
	const out = c.rewriteSvg(text, 1);
	return { text: out, cleaned: c.state.cleaned, refused: c.state.refused };
}

/** The attributes that hold ONE address; the rest of the attributes a render fetches from hold a list (`srcset`). */
const SINGLE_URL_ATTR = (name) => !/srcset$/i.test(name);

/**
 * Remove the metadata of every picture baked into a player, before anything else reads the document: EXIF (a phone's
 * location among it), XMP, text chunks and comments, cut by the image library's cleaner, the one the Studio's intake and
 * the `.lattice` packer use (`@laticent/lastra` `cleanerFor`). The pixels are untouched, so the player looks the same; a
 * picture already clean (every Studio Library photo) keeps its exact bytes. Runs whatever the image policy says,
 * `images: original` included: "original" is the pixels the author added, never the camera's notes about them.
 *
 * WHICH PICTURES. Any `data:image/…` URI, in any letter case, with any parameters (`;name=x.jpg`), a wrapped base64
 * body or a percent-encoded one: a browser draws all of them. The decoded BYTES decide what it is (lastra
 * `imageFormat`), never the URI's MIME, so `image/jpg` and a mislabelled file are caught. An SVG is read for the
 * pictures inside it, cleaned the same way. Every place a player keeps a picture: each attribute a render fetches from
 * (lib/core/content-policy.js `RENDER_FETCH_ATTRS`: `src`, `srcset`, `poster`, an SVG `<image href>` …), a `style`
 * attribute and a `<style>` element. Each distinct picture is cleaned once. One that does not decode, a type the
 * cleaner does not read (AVIF) or a file it cannot parse is never shipped as it is: the drawn stand-in takes its place,
 * as for a picture outside the deck's folder, and it is named in `refused`.
 * @param {Document} doc
 * @returns {{ cleaned: number, refused: string[] }}  `cleaned`: pictures whose bytes changed
 */
export function cleanDocImages(doc) {
	const { cleanUri, rewriteText, rewriteCss, state } = createUriCleaner();
	const visit = (el) => {
		for (const name of PICTURE_ATTRS) {
			const v = el.getAttribute?.(name);
			if (!v) continue;
			let next;
			if (name === 'style') {
				// CSS: an escape can spell the address (`data\3a image/…`), so the CSS reader looks whenever one could.
				if (!/data|\\/i.test(v)) continue;
				next = rewriteCss(v, 0);
			} else {
				if (!/data:image\//i.test(v)) continue;
				const trimmed = v.trim();
				next = SINGLE_URL_ATTR(name) && /^data:image\//i.test(trimmed) ? cleanUri(trimmed, 0) : rewriteText(v, 0);
				if (next === trimmed) continue;
			}
			if (next !== v) el.setAttribute(name, next);
		}
		if (el.localName === 'style') {
			for (const node of el.childNodes) if (node.nodeType === 3 && /data|\\/i.test(node.data)) {
				const next = rewriteCss(node.data, 0);
				if (next !== node.data) node.data = next;
			}
		}
		if (el.localName === 'template' && el.content) for (const inner of el.content.querySelectorAll('*')) visit(inner);
	};
	const walker = doc.createTreeWalker(doc, 1 /* NodeFilter.SHOW_ELEMENT */);
	for (let el = walker.nextNode(); el; el = walker.nextNode()) visit(el);
	return { cleaned: state.cleaned, refused: state.refused };
}
