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

// The engine's own faces live in ONE style block (`lattice-embedded-fonts`), beside KaTeX's. Everything below reads and
// writes that block only: a slide whose text happens to look like an @font-face rule is slide text, not a face.
const FONT_BLOCK = /(<style id="lattice-embedded-fonts">)([\s\S]*?)(<\/style>)/;
const FACE = /@font-face\s*\{[^}]*\}/g;
const DATA_URI = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
const TEXT_FAMILIES = new Set(TEXT_FACES.map((f) => f.family.toLowerCase()));

/** 'emoji' | 'text' (an engine text face) | 'other' (KaTeX and anything else the block carries). */
function faceClass(face) {
	const m = face.match(/font-family\s*:\s*['"]?([^;'"}]+)/i);
	const family = (m ? m[1] : '').trim().toLowerCase();
	if (family === EMOJI_FAMILY.toLowerCase()) return 'emoji';
	return TEXT_FAMILIES.has(family) ? 'text' : 'other';
}

/**
 * Rewrite the embedded `@font-face` `data:font/woff2` faces to the amount the author's `fonts:` policy
 * (lib/core/font-policy.js) asks for:
 *
 *   text faces   `exact` cuts to the characters in the document; `used` and `full` keep them whole (they are already the
 *                full Latin range, so a recipient who edits keeps every glyph); `system` drops them.
 *   emoji faces  `exact` cuts to the document's emoji through the COLOR build of the subsetter
 *                (lib/fonts/subset-color.js: the stock wasm drops the color tables and would blank every emoji);
 *                `used` and `full` keep the slices whole; `system` drops them.
 *   other faces  (KaTeX) are cut to the document's characters, as they always were.
 *
 * Without a policy it cuts like `exact`. OPTIONAL: if `subset-font` isn't installed the text and KaTeX faces ship
 * whole (today's behavior), never a hard failure; the emoji cut needs only `fontverter`.
 *
 * @param {string} html the assembled player HTML
 * @param {{ text: string, emoji: string, extraChars?: string }} [policy]
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
async function subsetEmbeddedFonts(html, policy) {
	const tiers = policy || { text: 'exact', emoji: 'exact' };
	const block = html.match(FONT_BLOCK);
	if (!block) return { html, applied: false, saved: 0 };
	const tierOf = (cls) => (cls === 'emoji' ? tiers.emoji : cls === 'text' ? tiers.text : 'exact');

	// `system`: drop the faces of that class, so the viewer's own fonts draw the text.
	let css = block[2].replace(FACE, (face) => (tierOf(faceClass(face)) === 'system' ? '' : face));
	let changed = css !== block[2];

	// The character set = EVERY distinct character in the whole document — visible slide/article/chrome text AND the
	// player-JS glyph literals (e.g. the ☀ that only appears after a dark-toggle) AND attributes. Collected by CODE
	// POINT (the string iterator, so a surrogate-pair emoji stays one entry) — over-inclusive on purpose: an unused
	// char costs ~nothing, a missing one is permanent tofu.
	// `extraChars`: what the page's entities spell, which a host that can decode them supplies.
	const chars = [...new Set(html + (tiers.extraChars || ''))].join('');
	let subsetFont = null;
	try {
		subsetFont = require('subset-font');
	} catch {
		/* optional dep absent — text and KaTeX faces ship whole */
	}

	const cuts = new Map(); // base64 → 'emoji' | 'font' for each face a tier asks to cut
	for (const face of css.matchAll(FACE)) {
		const cls = faceClass(face[0]);
		if (tierOf(cls) !== 'exact') continue;
		if (cls !== 'emoji' && !subsetFont) continue;
		for (const m of face[0].matchAll(DATA_URI)) cuts.set(m[1], cls === 'emoji' ? 'emoji' : 'font');
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
		css = css.replace(DATA_URI, (m, b64) => (out.has(b64) ? `url(data:font/woff2;base64,${out.get(b64)})` : m));
		changed = true;
	}
	if (!changed) return { html, applied: false, saved: 0 };
	return { html: html.replace(FONT_BLOCK, (m, open, _body, close) => `${open}${css}${close}`), applied: true, saved };
}

module.exports = { subsetEmbeddedFonts };
