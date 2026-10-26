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

const isEmojiFace = (face) => /font-family\s*:\s*['"]?Noto Color Emoji/i.test(face);

/** `system`: drop the embedded faces of that class, so the viewer's own fonts draw the text. */
function stripFacesOf(html, tiers) {
	return html.replace(/@font-face\s*\{[^}]*\}/g, (face) => {
		const tier = isEmojiFace(face) ? tiers.emoji : tiers.text;
		return tier === 'system' ? '' : face;
	});
}

/**
 * Rewrite each embedded `@font-face` `data:font/woff2` to a glyph subset covering
 * only the characters the shipped file could ever show. OPTIONAL: if `subset-font`
 * isn't installed the file ships with full fonts (today's behavior) — never a hard
 * failure. The Noto Color Emoji slices are cut to the deck's emoji on `exact` (through the color build of
 * the subsetter, lib/fonts/subset-color.js: the stock one drops the color tables and blanks every emoji) and
 * kept whole on `used` and `full`.
 *
 * Which faces it cuts follows the author's `fonts:` policy (lib/core/font-policy.js): text faces are cut to the
 * shown characters only on `exact`; on `used` and `full` they ship whole (they are already the full Latin range,
 * so a recipient who edits keeps every glyph); `system` drops the faces. Without a policy it cuts like `exact`.
 *
 * @param {string} html the assembled player HTML
 * @param {{ text: string, emoji: string }} [policy]
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
async function subsetEmbeddedFonts(html, policy) {
	const tiers = policy || { text: 'exact', emoji: 'exact' };
	if (tiers.text === 'system' || tiers.emoji === 'system') html = stripFacesOf(html, tiers);
	let subsetFont;
	try {
		subsetFont = require('subset-font');
	} catch {
		return { html, applied: false, saved: 0 }; // optional dep absent — ship full fonts
	}
	// The character set = EVERY distinct character in the whole document — visible
	// slide/article/chrome text AND the player-JS glyph literals (e.g. the ☀ that
	// only appears after a dark-toggle) AND attributes. Collected by CODE POINT (the
	// string iterator, so a surrogate-pair emoji stays one entry) — over-inclusive
	// on purpose: an unused char costs ~nothing, a missing one is permanent tofu.
	const chars = [...new Set(html)].join('');
	const re = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
	const whole = new Set();
	const emojiFaces = new Set();
	for (const face of html.matchAll(/@font-face\s*\{[^}]*\}/g)) {
		if (isEmojiFace(face[0])) for (const m of face[0].matchAll(re)) (tiers.emoji === 'exact' ? emojiFaces : whole).add(m[1]);
	}
	if (tiers.text !== 'exact') {
		for (const face of html.matchAll(/@font-face\s*\{[^}]*\}/g)) for (const m of face[0].matchAll(re)) whole.add(m[1]);
	}
	const uniq = [...new Set([...html.matchAll(re)].map((m) => m[1]))].filter((b64) => !whole.has(b64));
	const map = new Map();
	let saved = 0;
	for (const b64 of [...uniq, ...emojiFaces]) {
		try {
			const full = Buffer.from(b64, 'base64');
			// Emoji are a COLOR font: the stock wasm drops the color tables, so they go through the color build (lib/fonts/subset-color.js).
			const sub = emojiFaces.has(b64) ? await require('../fonts/subset-color.js').subsetColorFont(full, chars, { targetFormat: 'woff2' }) : await subsetFont(full, chars, { targetFormat: 'woff2' });
			const subB64 = sub.toString('base64');
			// Only accept a subset that is actually smaller (a corrupt/parse edge could
			// grow it); otherwise keep the full face.
			if (subB64.length < b64.length) {
				saved += b64.length - subB64.length;
				map.set(b64, subB64);
			}
		} catch {
			/* per-face failure — keep the full face, no tofu */
		}
	}
	if (map.size === 0) return { html, applied: false, saved: 0 };
	const out = html.replace(re, (m, b64) => (map.has(b64) ? `url(data:font/woff2;base64,${map.get(b64)})` : m));
	return { html: out, applied: true, saved };
}

module.exports = { subsetEmbeddedFonts };
