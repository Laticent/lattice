/**
 * lib/export/player-fonts.js
 *
 * Glyph subsetting for the self-contained player's embedded fonts, shared by BOTH hosts
 * (HARD RULE #1). The CLI requires it through html-player.js; the Studio gets it in the
 * player-prune bundle (tools/build-player-prune.js), which bundles `subset-font`, HarfBuzz's
 * glue and the woff2 codec for the browser, so a Studio export subsets with the same code as
 * the CLI and produces the same bytes (engineering/decisions/2026-10-16-player-as-library-audit.md
 * §11). Before this the Studio shipped every kept face whole.
 *
 * CommonJS, beside player-prune.js, for the same two consumers. `Buffer` is Node's here and the
 * `buffer` package's in the browser bundle (injected by the bundler).
 */

const { TEXT_FACES } = require('../fonts/text-faces.js');
const { EMOJI_FAMILY } = require('../fonts/emoji-faces.js');
const { ICON_FAMILY } = require('../fonts/icon-faces.js');

// The engine's own faces live in ONE style block (`lattice-embedded-fonts`), beside KaTeX's. Everything below reads and
// writes that block only: a slide whose text happens to look like an @font-face rule is slide text, not a face.
const FONT_BLOCK = /(<style id="lattice-embedded-fonts">)([\s\S]*?)(<\/style>)/;
// The faces, their families and their `data:font/woff2` payloads are read by the one CSS tokenizer (Segno P5b,
// lib/export/css-at-rules.js): a `}` or a `url(` inside a string or a comment is not one.
const { cssAtRuleBlocks, faceFamily, cssBase64Urls } = require('./css-at-rules.js');
const TEXT_FAMILIES = new Set(TEXT_FACES.map((f) => f.family.toLowerCase()));

/** 'emoji' | 'icon' (Lattice Icons) | 'text' (an engine text face) | 'other' (KaTeX and anything else the block carries). */
function faceClass(css, from, to) {
	const family = faceFamily(css, from, to);
	if (family === EMOJI_FAMILY.toLowerCase()) return 'emoji';
	if (family === ICON_FAMILY.toLowerCase()) return 'icon';
	return TEXT_FAMILIES.has(family) ? 'text' : 'other';
}

/** `css` with every face `drop(from, to)` says yes to removed. */
function dropFaces(css, drop) {
	let out = '';
	let at = 0;
	for (const [from, to] of cssAtRuleBlocks(css, 'font-face')) {
		if (!drop(from, to)) continue;
		out += css.slice(at, from);
		at = to;
	}
	return at ? out + css.slice(at) : css;
}

/**
 * Rewrite the embedded `@font-face` `data:font/woff2` faces to the amount the author's `font-embedding:` policy
 * (lib/core/font-policy.js) asks for:
 *
 *   text faces   `exact` cuts to the characters in the document; `used` and `full` keep them whole (they are already the
 *                full Latin range, so a recipient who edits keeps every glyph); `system` drops them.
 *   emoji faces  `exact` cuts to the document's emoji through the COLOR build of the subsetter
 *                (lib/fonts/subset-color.js: the stock wasm drops the color tables and would blank every emoji);
 *                `used` and `full` keep the slices whole; `system` drops them.
 *   icon faces   (Lattice Icons) follow the EMOJI tier (engineering/decisions/2026-11-01-icon-font.md): `exact` cuts to the
 *                document's icons, `used` and `full` keep the whole set, `system` drops them (the host then shows the <svg>).
 *   other faces  (KaTeX) are cut to the document's characters, as they always were.
 *
 * Without a policy it cuts like `exact`. OPTIONAL: if `subset-font` isn't installed the text and KaTeX faces ship
 * whole (today's behavior), never a hard failure; the emoji cut needs only `fontverter`.
 *
 * @param {string} html the assembled player HTML
 * @param {{ text: string, emoji: string, extraChars?: string }} [policy]
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
/**
 * Every distinct code point of `parts`, read in order, as one string in first-seen order: exactly
 * `[...new Set(parts.join(''))].join('')`, which this replaces. That form copied the whole document and made a
 * one-character string per code point, and a Webpage export of phone photos is 33 MB of `data:` base64 (322 MB
 * of allocation, profiled; engineering/decisions/2026-11-11-deferred-asset-bytes.md §4). This walks the UTF-16
 * units once with a flag per code point, the parts as one string. A surrogate pair is one entry and a lone surrogate
 * is its own, as the string iterator reads them (test/unit/export/player-fonts-chars.test.js).
 * @param {string[]} parts
 */
function distinctChars(parts) {
	const seen = new Uint8Array(0x110000);
	const order = [];
	const add = (c) => {
		if (!seen[c]) {
			seen[c] = 1;
			order.push(c);
		}
	};
	// The parts read as ONE string, as the joined form did: a high surrogate that ends one part pairs with a low
	// surrogate that starts the next (`held`), without copying the parts together.
	let held = -1;
	for (const s of parts) {
		for (let i = 0; i < s.length; i++) {
			const c = s.charCodeAt(i);
			if (held >= 0) {
				const h = held;
				held = -1;
				if (c >= 0xdc00 && c <= 0xdfff) {
					add(((h - 0xd800) << 10) + (c - 0xdc00) + 0x10000);
					continue;
				}
				add(h);
			}
			if (c >= 0xd800 && c <= 0xdbff) held = c;
			else add(c);
		}
	}
	if (held >= 0) add(held);
	let out = '';
	for (let i = 0; i < order.length; i += 0x2000) out += String.fromCodePoint(...order.slice(i, i + 0x2000));
	return out;
}

async function subsetEmbeddedFonts(html, policy) {
	const tiers = policy || { text: 'exact', emoji: 'exact' };
	const block = html.match(FONT_BLOCK);
	if (!block) return { html, applied: false, saved: 0 };
	const tierOf = (cls) => (cls === 'emoji' || cls === 'icon' ? tiers.emoji : cls === 'text' ? tiers.text : 'exact');

	// `system`: drop the faces of that class, so the viewer's own fonts draw the text.
	let css = dropFaces(block[2], (from, to) => tierOf(faceClass(block[2], from, to)) === 'system');
	let changed = css !== block[2];

	// The character set = EVERY distinct character in the whole document — visible slide/article/chrome text AND the
	// player-JS glyph literals (e.g. the ☀ that only appears after a dark-toggle) AND attributes. Collected by CODE
	// POINT (the string iterator, so a surrogate-pair emoji stays one entry) — over-inclusive on purpose: an unused
	// char costs ~nothing, a missing one is permanent tofu.
	// `extraChars`: what the page's entities spell, which a host that can decode them supplies.
	// Numeric character references count as the characters they spell: an icon's glyph is written `&#xE040;`, and a cut
	// that missed it would leave the icon an empty box.
	const refs = [...html.matchAll(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/gi)]
		.map((m) => Number.parseInt(m[1] ?? m[2], m[1] ? 16 : 10))
		.filter((n) => n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff))
		.map((n) => String.fromCodePoint(n))
		.join('');
	const chars = distinctChars([html, refs, tiers.extraChars || '']);
	let subsetFont = null;
	try {
		subsetFont = require('subset-font');
	} catch {
		/* optional dep absent — text and KaTeX faces ship whole */
	}

	const cuts = new Map(); // base64 → 'emoji' | 'font' for each face a tier asks to cut
	for (const [from, to] of cssAtRuleBlocks(css, 'font-face')) {
		const cls = faceClass(css, from, to);
		if (tierOf(cls) !== 'exact') continue;
		if (cls !== 'emoji' && !subsetFont) continue;
		for (const u of cssBase64Urls(css, 'font/woff2', from, to)) cuts.set(u.payload, cls === 'emoji' ? 'emoji' : 'font');
	}

	const out = new Map();
	let saved = 0;
	for (const [b64, kind] of cuts) {
		try {
			const full = Buffer.from(b64, 'base64');
			const sub = kind === 'emoji' ? await require('../fonts/subset-color.js').subsetColorFont(full, chars, { targetFormat: 'woff2' }) : await subsetFont(full, chars, { targetFormat: 'woff2' });
			const subB64 = sub.toString('base64');
			// Only accept a subset that is actually smaller (a corrupt/parse edge could grow it); otherwise keep the full face.
			if (subB64.length < b64.length) {
				saved += b64.length - subB64.length;
				out.set(b64, subB64);
			}
		} catch {
			/* per-face failure — keep the full face, no tofu */
		}
	}
	if (out.size) {
		let next = '';
		let at = 0;
		for (const u of cssBase64Urls(css, 'font/woff2')) {
			if (!out.has(u.payload)) continue;
			next += `${css.slice(at, u.rawFrom)}data:font/woff2;base64,${out.get(u.payload)}`;
			at = u.rawTo;
		}
		css = next + css.slice(at);
		changed = true;
	}
	if (!changed) return { html, applied: false, saved: 0 };
	return { html: html.replace(FONT_BLOCK, (_m, open, _body, close) => `${open}${css}${close}`), applied: true, saved };
}

module.exports = { subsetEmbeddedFonts, distinctChars, faceClass };
