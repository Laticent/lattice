/**
 * lib/export/player-seal.mjs
 *
 * The TAIL of player assembly, as one function: write the Content-Security-Policy, glyph-subset
 * the embedded fonts, and store each repeated picture once. It is the first piece of the
 * assembler that the owner ruled on 2026-10-16 (engineering/decisions/2026-10-16-player-as-library-audit.md
 * §7, §10, §11): a stage that seals a finished document and knows nothing about Lattice's slides.
 *
 * `assemblePlayer` (player-core.mjs) writes the document with CSP_SLOT where the policy goes and
 * hands it here. Both hosts reach it through `assemblePlayer`, so the CLI and the Studio seal the
 * same way; what differs is only the `subsetFonts` capability each injects, and both now inject
 * the same `subsetEmbeddedFonts` (player-fonts.js).
 *
 * Order is load-bearing. The policy goes in first, because the subsetter keeps every character
 * the document holds and the policy's characters are part of the document. The hoist runs last,
 * so every inlining pass has already written its `data:` URIs. The CSS prune runs after this,
 * in each host's page (player-prune.js `prunePlayerHtml`); moving it ahead would shrink the
 * subsetter's character set and change every export's bytes.
 */
import { hoistRepeatedAssets } from './player-assets.mjs';

/**
 * Where `assemblePlayer` leaves the policy for {@link sealPlayer} to write. U+0000 cannot reach a
 * serialized document (the HTML parser turns it into U+FFFD), so no slide text can collide with it.
 */
export const CSP_SLOT = '\u0000lp-csp\u0000';

/**
 * The player's policy: nothing remote, inline styles, and only the scripts whose hashes are listed.
 * `media.audio` grants `media-src data:`, and only a file that carries a clip asks for it.
 * `media.consentOrigins` is the viewer-consent mode (player-core.mjs `consentPictures`): it grants
 * `connect-src` for exactly those origins and `img-src blob:`, and NEVER puts an origin in
 * `img-src`. Only the hash-pinned script can open a `connect-src` request, and it does so only
 * after the reader presses "Load pictures"; it hands each picture to its `<img>` as a blob URL.
 * An origin in `img-src` would let deck markup or CSS the placeholder pass cannot rewrite
 * (`image-set()`, a CSS escape, an SVG `<feImage>`) fetch from it on open, before consent and with
 * scripting off: the red team measured exactly that (decisions/2026-10-16-player-as-library-audit.md §11.4).
 *
 * @param {{ scriptHashes: string[], media?: { audio?: boolean, consentOrigins?: string[] } }} p  base64 sha256 per script
 */
export function playerCsp({ scriptHashes, media = {} }) {
	const scripts = scriptHashes.map((h) => `'sha256-${h}'`).join(' ');
	// Origins only, each re-derived from a URL, so nothing else (a `;`, a quote, a wildcard) can
	// reach the policy through this list.
	const origins = (media.consentOrigins || []).flatMap((o) => {
		try {
			const u = new URL(o);
			return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === o ? [o] : [];
		} catch {
			return [];
		}
	});
	const img = origins.length ? `img-src data: blob:; connect-src ${origins.join(' ')}; ` : 'img-src data:; ';
	return `default-src 'none'; script-src ${scripts}; style-src 'unsafe-inline'; ` + `${img}font-src data:; ${media.audio ? 'media-src data:; ' : ''}base-uri 'none'; form-action 'none'`;
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Seal an assembled document.
 *
 * @param {{ html: string, scriptHashes: string[], media?: { audio?: boolean } }} doc  `html` carries CSP_SLOT once, in its head
 * @param {{ subsetFonts?: (html: string) => Promise<{ html: string, applied: boolean, saved: number }> }} caps
 * @returns {Promise<{ html: string, report: { fontBytesSaved: number, subsetApplied: boolean, assetsHoisted: number, assetBytesSaved: number } }>}
 */
export async function sealPlayer({ html, scriptHashes, media }, caps = {}) {
	if (!html.includes(CSP_SLOT)) throw new Error('sealPlayer: the document has no policy slot');
	const withCsp = html.replace(CSP_SLOT, () => `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(playerCsp({ scriptHashes, media }))}">`);
	// Optional cap with a graceful fallback. It saves about 28% of the font bytes (measured in
	// decisions/2026-07-07-html-lattice-player.md; the faces ship latin-subset already).
	const subset = caps.subsetFonts ? await caps.subsetFonts(withCsp) : { html: withCsp, applied: false, saved: 0 };
	const hoisted = hoistRepeatedAssets(subset.html);
	return {
		html: hoisted.html,
		report: { fontBytesSaved: subset.saved, subsetApplied: subset.applied, assetsHoisted: hoisted.hoisted, assetBytesSaved: hoisted.saved },
	};
}
