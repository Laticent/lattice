/**
 * lib/export/html-player.js
 *
 * The Node ADAPTER for the self-contained `.html` PLAYER
 * (engineering/decisions/2026-07-07-html-lattice-player.md, and the extraction in
 * 2026-07-08-studio-html-player-export.md). The browser-safe ASSEMBLY logic lives
 * in the pure `player-core.mjs`; this file supplies the Node-locked capabilities it
 * needs — jsdom parse, DOMPurify sanitize, `crypto` sha256, `fs` image inlining,
 * KaTeX `fs` read, `subset-font` — and owns the post-assembly PRUNE kernel the
 * emulator drives in Chromium (kept adapter-side: the Studio prunes against its
 * live preview iframe instead).
 *
 * `buildPlayerHtml`'s output is BYTE-IDENTICAL to before the core was extracted
 * (golden-pinned in test/unit/export/html-player.test.js), so the shipped CLI
 * player (#798–#824) does not move a byte.
 *
 * CommonJS (lib/export convention, beside pptx-export.js). `async` because the
 * core + sanitizer are ESM (dynamic import) and it reads asset bytes off disk.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');

const MIME = {
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

/** Read a local file and return a data: URI, or null if unreadable. */
function fileToDataUri(absPath) {
	try {
		const ext = path.extname(absPath).toLowerCase();
		const mime = MIME[ext] || 'application/octet-stream';
		const buf = fs.readFileSync(absPath);
		if (ext === '.svg') {
			// SVG inlines smaller as utf8;charset with minimal percent-encoding than base64.
			const enc = encodeURIComponent(buf.toString('utf8')).replace(/%20/g, ' ');
			return `data:${mime};charset=utf-8,${enc}`;
		}
		return `data:${mime};base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

/**
 * Replace every `file://…` URL in the document (in `<img src>` and CSS
 * `url('file://…')`) with a data: URI. Returns the rewritten HTML and a list of
 * assets that could not be inlined (the honesty report).
 *
 * TRUST BOUNDARY: this reads arbitrary local files a `file://` URL names and bakes
 * their bytes into the shared file. That is BENIGN for the CLI (an author baking
 * their OWN deck on their OWN machine — they already have those files). It would be a
 * disclosure vector if this exporter is ever run SERVER-SIDE on an UNTRUSTED deck
 * (`<img src="file:///etc/passwd">`): a hosted bake path must first gate `file://`
 * inlining to an allowlisted asset root under the deck directory.
 */
function inlineFileUrls(html) {
	const missing = [];
	const inlinedUrls = new Set();
	const seen = new Map();
	const inline = (fileUrl) => {
		if (seen.has(fileUrl)) return seen.get(fileUrl);
		let abs;
		try {
			abs = fileURLToPath(fileUrl.split(/[?#]/)[0]);
		} catch {
			missing.push(fileUrl);
			return null;
		}
		const uri = fileToDataUri(abs);
		if (uri) inlinedUrls.add(fileUrl);
		else missing.push(fileUrl);
		seen.set(fileUrl, uri);
		return uri;
	};
	// `<img src="file://…">` ONLY (matched as a whole img tag): NOT stylesheet <link>
	// hrefs (data: link trips style-src CSP) and NOT <script src> (removed wholesale by
	// the jsdom pass — never inlined, never regex-"sanitized" here).
	let out = html.replace(/(<img\b[^>]*?\bsrc=)(["'])(file:\/\/[^"']+)\2/gi, (m, pre, q, url) => {
		const uri = inline(url);
		return uri ? `${pre}${q}${uri}${q}` : m;
	});
	// CSS `url(file://…)` / `url('file://…')` inside inline style attrs and <style>.
	out = out.replace(/url\((["']?)(file:\/\/[^)"']+)\1\)/gi, (m, q, url) => {
		const uri = inline(url);
		return uri ? `url(${q}${uri}${q})` : m;
	});
	return { html: out, missing, count: inlinedUrls.size };
}

/**
 * Assemble the self-contained player HTML (the CLI path). Delegates the browser-safe
 * assembly to the pure `player-core.mjs`, injecting the Node-locked capabilities.
 *
 * @param {object} opts  — see player-core.assemblePlayer's `data` (docHtml, source,
 *   title, theme, config, notes, now, build, playerVersion).
 * @returns {Promise<{ html: string, report: { images: number, missing: string[], strippedScripts: string[], math: boolean, fontBytesSaved: number, subsetApplied: boolean } }>}
 */
async function buildPlayerHtml(opts) {
	const { assemblePlayer } = await import('./player-core.mjs');
	const { JSDOM } = require('jsdom');
	const DOMPurify = require('dompurify');
	const { createSlideSanitizer } = await import('../core/sanitize-slide-html.mjs');
	// A dedicated jsdom window backs the DOMPurify sanitizer. `sanitize` is a pure
	// string→string transform (DOMPurify parses the input into its OWN document), so a
	// standalone window yields byte-identical output to the pre-extraction code, which
	// shared the parse window. The golden test pins that identity.
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
	return assemblePlayer(opts, {
		parseHtml: (html) => new JSDOM(html).window.document,
		sanitize,
		sha256: async (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64'),
		inlineAssets: inlineFileUrls,
		// Raw katex.min.css off disk (core minifies + inlines only when the deck has
		// math); null when unresolvable/unreadable → the core drops the link + reports it.
		katexCss: () => {
			try {
				return fs.readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8');
			} catch {
				return null;
			}
		},
		subsetFonts: subsetEmbeddedFonts,
	});
}

/**
 * Rewrite each embedded `@font-face` `data:font/woff2` to a glyph subset covering
 * only the characters the shipped file could ever show. OPTIONAL: if `subset-font`
 * isn't installed the file ships with full fonts (today's behavior) — never a hard
 * failure. Emoji are unaffected: they render via the recipient's SYSTEM emoji font
 * (no emoji font is embedded), so they were never in these text faces.
 *
 * @param {string} html the assembled player HTML
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
async function subsetEmbeddedFonts(html) {
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
	const uniq = [...new Set([...html.matchAll(re)].map((m) => m[1]))];
	const map = new Map();
	let saved = 0;
	for (const b64 of uniq) {
		try {
			const full = Buffer.from(b64, 'base64');
			const sub = await subsetFont(full, chars, { targetFormat: 'woff2' });
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

// ── used-selector + used-family PRUNE kernel (P6) ─────────────────────────────
// Extracted to lib/export/player-prune.js so the CLI emulator (headless Chromium)
// and the Studio (offscreen iframe) share ONE kernel (HARD RULE #1). Re-exported here
// so the emulator (which requires this adapter) keeps its import site unchanged.
const {
	GATE_PROPS,
	baseSelectorString,
	collectBaseSelectors,
	prunePlayerCss,
	normalizeFamily,
	prunePlayerFontFaces,
	PLAYER_PRUNE_SAFELIST,
} = require("./player-prune.js");

module.exports = {
	buildPlayerHtml,
	inlineFileUrls,
	fileToDataUri,
	subsetEmbeddedFonts,
	GATE_PROPS,
	collectBaseSelectors,
	prunePlayerCss,
	baseSelectorString,
	prunePlayerFontFaces,
	normalizeFamily,
	PLAYER_PRUNE_SAFELIST,
};
