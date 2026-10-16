/**
 * Store each repeated inlined asset ONCE in an exported player.
 *
 * The player bakes every picture into the file as a `data:` URI, one copy per place it is
 * used. A photo reused on four slides was four copies: on the 120-slide gallery deck, 54
 * inlined URIs carried only 19 distinct assets, and the repeats were 577,670 bytes, 21% of
 * the file (engineering/decisions/2026-10-16-player-as-library-audit.md §3).
 *
 * `hoistRepeatedAssets` moves each large base64 `url(data:…)` that occurs more than once in
 * inline `style` attributes into one custom property on `:root`, and points every use at it
 * with `var()`. That is where the engine writes a slide's background picture:
 *
 *   style="background-image:url('data:image/jpeg;base64,/9j…')"   ×4
 *   →  :root{--lp-asset-0:url(data:image/jpeg;base64,/9j…)}        ×1
 *      style="background-image:var(--lp-asset-0)"                 ×4
 *
 * It is CSS only, so the no-JavaScript floor keeps every picture. Why it is safe:
 *   · `var()` substitutes tokens, so `url()` inside the property computes exactly as it did
 *     inline; a `data:` URI has no base URL to resolve against, so moving it cannot move it.
 *   · Custom properties inherit, and nothing in the player redeclares `--lp-asset-*`.
 *   · Only `style="…"` attribute values inside real start tags are read or rewritten, found by
 *     a small tag scanner. Text, other attributes, comments and raw-text bodies (`<script>`,
 *     `<style>`, `<textarea>`, `<title>`) are never touched. A CSS snippet shown in a code
 *     block appears twice (the slide and the Read·Article copy) and must still read as written.
 *   · Stylesheets are left alone too: a repeated picture in a rule the CSS prune later drops
 *     would otherwise be pinned in this block, which the prune skips.
 *   · A FONT is never touched (by media type): `var()` is invalid in `@font-face` descriptors.
 *   · `<img src>` is never touched: it has no `url()` and cannot read a custom property, so a
 *     picture placed with `![](…)` still ships once per use.
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

const URL_RE = /url\(\s*(['"]?)(data:([a-z0-9.+/-]+);base64,[A-Za-z0-9+/=]+)\1\s*\)/gi;
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)"([^"]*)"/gi;
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Every `style="…"` attribute value that sits inside a real start tag, as [start, end) offsets of
 * the VALUE. A scanner, not a regex over the document: the same characters inside a code block,
 * an `alt`, or the Read·Article copy of a slide are TEXT, and rewriting them would change what
 * the reader sees (the checker's repro: a CSS snippet in a code fence read `var(--lp-asset-0)`).
 *
 * It relies on what an HTML serializer guarantees, which is what feeds this function: `<` in
 * text is written `&lt;`, so a raw `<` opens a tag, a comment, or a raw-text element; attribute
 * values are quoted, with `"` written `&quot;` inside a double-quoted value.
 */
function styleAttrValues(html) {
	const out = [];
	const lower = html.toLowerCase();
	let i = 0;
	while (i < html.length) {
		const lt = html.indexOf('<', i);
		if (lt === -1) break;
		if (html.startsWith('<!--', lt)) {
			const close = html.indexOf('-->', lt + 4);
			i = close === -1 ? html.length : close + 3;
			continue;
		}
		const name = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 64));
		if (!name) {
			i = lt + 1;
			continue;
		}
		// Walk the tag to its `>`, skipping quoted attribute values (which may hold `>`).
		let j = lt + name[0].length;
		let quote = null;
		for (; j < html.length; j++) {
			const c = html[j];
			if (quote) {
				if (c === quote) quote = null;
			} else if (c === '"' || c === "'") quote = c;
			else if (c === '>') break;
		}
		const tag = html.slice(lt, j);
		for (const m of tag.matchAll(STYLE_ATTR_RE)) {
			const at = lt + m.index + m[1].length + 1;
			out.push([at, at + m[2].length]);
		}
		i = j + 1;
		// A raw-text element's body is never markup: jump past its end tag.
		const tagName = name[1].toLowerCase();
		if (RAW_TEXT.has(tagName)) {
			const close = lower.indexOf(`</${tagName}`, i);
			i = close === -1 ? html.length : close;
		}
	}
	return out;
}

/**
 * @param {string} html  a whole assembled player document
 * @returns {{ html: string, hoisted: number, saved: number }}  `saved` is in bytes
 */
export function hoistRepeatedAssets(html) {
	const spans = styleAttrValues(html);
	const counts = new Map(); // uri → occurrences, in first-occurrence order
	for (const [a, b] of spans) {
		for (const m of html.slice(a, b).matchAll(URL_RE)) {
			const [, , uri, mime] = m;
			if (uri.length < MIN_HOIST_BYTES || /font/i.test(mime)) continue;
			counts.set(uri, (counts.get(uri) || 0) + 1);
		}
	}
	const names = new Map();
	for (const [uri, n] of counts) if (n > 1) names.set(uri, `--lp-asset-${names.size}`);
	if (!names.size) return { html, hoisted: 0, saved: 0 };
	if (html.search(/<\/head>/i) === -1) return { html, hoisted: 0, saved: 0 };

	let body = '';
	let last = 0;
	for (const [a, b] of spans) {
		body += html.slice(last, a);
		body += html.slice(a, b).replace(URL_RE, (whole, _q, uri) => (names.has(uri) ? `var(${names.get(uri)})` : whole));
		last = b;
	}
	body += html.slice(last);
	const decls = [...names].map(([uri, name]) => `${name}:url(${uri})`).join(';');
	const block = `<style id="${ASSET_STYLE_ID}">:root{${decls}}</style>`;
	const at = body.search(/<\/head>/i);
	const out = `${body.slice(0, at)}${block}\n${body.slice(at)}`;
	return { html: out, hoisted: names.size, saved: html.length - out.length };
}
