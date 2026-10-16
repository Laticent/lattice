/**
 * Store each repeated inlined asset ONCE in an exported player.
 *
 * The player bakes every picture into the file as a `data:` URI, one copy per place it is
 * used. A photo reused on four slides was four copies: on the 120-slide gallery deck, 54
 * inlined URIs carried only 19 distinct assets, and the repeats were 577,670 bytes, 21% of
 * the file (engineering/decisions/2026-10-16-player-as-library-audit.md §3).
 *
 * `hoistRepeatedAssets` moves each large base64 `url(data:…)` that occurs more than once into
 * one custom property on `:root`, and points every use at it with `var()`:
 *
 *   style="background-image:url('data:image/jpeg;base64,/9j…')"   ×4
 *   →  :root{--lp-asset-0:url(data:image/jpeg;base64,/9j…)}        ×1
 *      style="background-image:var(--lp-asset-0)"                 ×4
 *
 * It is CSS only, so the no-JavaScript floor keeps every picture. Why it is safe:
 *   · `var()` substitutes tokens, so `url()` inside the property computes exactly as it did
 *     inline; a `data:` URI has no base URL to resolve against, so moving it cannot move it.
 *   · Custom properties inherit, and nothing in the player redeclares `--lp-asset-*`.
 *   · A FONT is never touched: `var()` is invalid inside `@font-face` descriptors. Fonts are
 *     skipped by media type and by position (inside an `@font-face` block).
 *   · `<img src>` is never touched: it has no `url()` and cannot read a custom property.
 *   · Script bodies are never touched (the envelope, narration blocks, the player script).
 *   · Only base64 URIs, whose alphabet holds no quote, paren, `<` or `;`, so the match cannot
 *     end early or late. Percent-encoded SVG URIs are small and stay inline.
 *
 * Deterministic: properties are numbered in order of first occurrence.
 *
 * Pure and DOM-free, so the CLI and the Studio share it through `assemblePlayer`.
 */

/** The `<style>` id the hoisted assets ride in; the CSS prune must skip it (player-prune.js). */
export const ASSET_STYLE_ID = 'lp-assets';

/** Smaller URIs stay inline: below this, the `var()` indirection saves too little to matter. */
const MIN_HOIST_BYTES = 2048;

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const URL_RE = /url\(\s*(['"]?)(data:([a-z0-9.+/-]+);base64,[A-Za-z0-9+/=]+)\1\s*\)/gi;

/** Is `at` inside an `@font-face { … }` block of `text`? (Its braces never nest.) */
function insideFontFace(text, at) {
	const open = text.lastIndexOf('@font-face', at);
	if (open === -1) return false;
	const close = text.indexOf('}', open);
	return close === -1 || close > at;
}

/** Split `html` into script bodies (opaque) and everything else, keeping order. */
function segments(html) {
	const out = [];
	let last = 0;
	for (const m of html.matchAll(SCRIPT_RE)) {
		if (m.index > last) out.push({ text: html.slice(last, m.index), script: false });
		out.push({ text: m[0], script: true });
		last = m.index + m[0].length;
	}
	if (last < html.length) out.push({ text: html.slice(last), script: false });
	return out;
}

/**
 * @param {string} html  a whole assembled player document
 * @returns {{ html: string, hoisted: number, saved: number }}  `saved` is in bytes
 */
export function hoistRepeatedAssets(html) {
	const parts = segments(html);
	const counts = new Map(); // uri → occurrences, in first-occurrence order
	for (const part of parts) {
		if (part.script) continue;
		for (const m of part.text.matchAll(URL_RE)) {
			const [, , uri, mime] = m;
			if (uri.length < MIN_HOIST_BYTES || /font/i.test(mime) || insideFontFace(part.text, m.index)) continue;
			counts.set(uri, (counts.get(uri) || 0) + 1);
		}
	}
	const names = new Map();
	for (const [uri, n] of counts) if (n > 1) names.set(uri, `--lp-asset-${names.size}`);
	if (!names.size) return { html, hoisted: 0, saved: 0 };

	const body = parts
		.map((part) =>
			part.script
				? part.text
				: part.text.replace(URL_RE, (whole, _q, uri, _mime, offset) =>
						names.has(uri) && !insideFontFace(part.text, offset) ? `var(${names.get(uri)})` : whole,
					),
		)
		.join('');
	const decls = [...names].map(([uri, name]) => `${name}:url(${uri})`).join(';');
	const block = `<style id="${ASSET_STYLE_ID}">:root{${decls}}</style>`;
	const at = body.search(/<\/head>/i);
	if (at === -1) return { html, hoisted: 0, saved: 0 };
	const out = `${body.slice(0, at)}${block}\n${body.slice(at)}`;
	return { html: out, hoisted: names.size, saved: html.length - out.length };
}
