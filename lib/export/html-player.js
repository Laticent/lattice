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
 * `data.width`/`data.height` carry the deck's declared canvas in px (#1577). Omit them and the
 * assembler derives the canvas from the document's own `--_sec-1cqi`/`--_sec-1cqh`, falling back
 * to 1280×720 only when neither is present — so an older caller keeps working and a deck with a
 * non-default `size:` is no longer silently exported at the wrong scale.
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

const TAG_OR_COMMENT = /<!--[\s\S]*?-->|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
// One attribute at a time (name, then its whole quoted value), so `style='…'` written INSIDE another
// attribute's value (an image's alt text) is part of that value and never read as a style attribute.
const ATTR = /([^\s"'<>/=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)?/g;
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Apply `fn` to every piece of the document that is CSS: each `style="…"` attribute value in a real
 * start tag and each `<style>` body. Everything else, text, comments and the bodies of the other
 * raw-text elements, passes through untouched. It relies on what an HTML serializer guarantees, which
 * is what feeds the player: a `<` in text is written `&lt;`, so a raw `<` opens a tag or a comment.
 */
function mapCssContexts(html, fn) {
	let out = '';
	let last = 0;
	const lower = html.toLowerCase();
	TAG_OR_COMMENT.lastIndex = 0;
	for (let m = TAG_OR_COMMENT.exec(html); m; m = TAG_OR_COMMENT.exec(html)) {
		if (!m[1]) continue; // a comment
		const name = m[1].toLowerCase();
		const attrs = m[2].replace(ATTR, (whole, attrName, eq, value) =>
			attrName.toLowerCase() === 'style' && value && (value[0] === '"' || value[0] === "'") ? `${attrName}${eq}${value[0]}${fn(value.slice(1, -1))}${value[0]}` : whole,
		);
		out += html.slice(last, m.index) + `<${m[1]}${attrs}>`;
		last = m.index + m[0].length;
		if (RAW_TEXT.has(name)) {
			const closeTag = new RegExp(`</${name}(?=[\\s/>])`, 'g');
			closeTag.lastIndex = last;
			const found = closeTag.exec(lower);
			const end = found ? found.index : html.length;
			out += name === 'style' ? fn(html.slice(last, end)) : html.slice(last, end);
			last = end;
			TAG_OR_COMMENT.lastIndex = end;
		}
	}
	return out + html.slice(last);
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
	// CSS contexts ONLY: a `style="…"` attribute value inside a real start tag, and a `<style>` body.
	// Text, inline code and code fences are never CSS, and the serializer writes `"` as `&quot;` there
	// too, so a pattern run over the whole document would read a CSS sample an author shows (a
	// `url("file:///…")` in a code block) and bake the named file into the shared file.
	out = mapCssContexts(out, (css) =>
		css
			// The engine also writes each background as `--background-image:"url(\"file://…\")"`, a STRING that
			// only looks like a url() and that nothing reads (lib/engine/background-image.js). It would carry the
			// author's local path into the shared file and a second copy of the picture beside the real
			// declaration, so it is dropped here, before the real `background-image:url(…)` is inlined below.
			.replace(/--background-image:&quot;url\(\\&quot;file:\/\/(?:(?!&quot;|&#39;|&#x27;).)*?\\&quot;\)&quot;;?/gi, '')
			// `url(file://…)` / `url('file://…')`. The quote may also be an HTML entity (`&quot;`, `&#39;`): the
			// engine writes a plain slide's `![bg]` as `style="background-image:url(&quot;file://…&quot;)"`, and a
			// pattern for raw quotes alone left the shared file pointing at a path on the author's disk.
			.replace(/url\((&quot;|&#39;|&#x27;|["']|)(file:\/\/(?:(?!&quot;|&#39;|&#x27;)[^)"'\\])+)\1\)/gi, (m, q, url) => {
				const uri = inline(url);
				return uri ? `url(${q}${uri}${q})` : m;
			}),
	);
	return { html: out, missing, count: inlinedUrls.size };
}

/**
 * Assemble the self-contained player HTML (the CLI path). Delegates the browser-safe
 * assembly to the pure `player-core.mjs`, injecting the Node-locked capabilities.
 *
 * @param {object} opts  — see player-core.assemblePlayer's `data` (docHtml, source,
 *   title, theme, config, notes, now, build, playerVersion).
 * @returns {Promise<{ html: string, report: { images: number, missing: string[], strippedScripts: string[], math: boolean, fontBytesSaved: number, subsetApplied: boolean, assetsHoisted: number, assetBytesSaved: number } }>}
 */
async function buildPlayerHtml(opts) {
	const { assemblePlayer } = await import('./player-core.mjs');
	const { resolveInlineImageSrcs } = require('../core/bg-image');
	const { JSDOM } = require('jsdom');
	const DOMPurify = require('dompurify');
	const { createSlideSanitizer } = await import('../core/sanitize-slide-html.mjs');
	// A dedicated jsdom window backs the DOMPurify sanitizer. `sanitize` is a pure
	// string→string transform (DOMPurify parses the input into its OWN document), so a
	// standalone window yields byte-identical output to the pre-extraction code, which
	// shared the parse window. The golden test pins that identity.
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
	// Resolve deck-relative `<img src>` to `file://` BEFORE inlining, so the inliner
	// (which matches `file://` only) can bake them into the shared file.
	//
	// The engine deliberately does NOT resolve these on the CLI path — `index.js`'s
	// `resolveInlineImageSrcs` no-ops without a baseUrl, "so exported bytes are
	// untouched" — and that is right for the PDF, which Chromium renders with the deck
	// directory as its base. A `--player` export is the opposite case: it is a SINGLE
	// FILE meant to be mailed, and a relative `ada.svg` in it points at nothing once it
	// leaves the deck folder. Every portrait on every slide rendered broken.
	//
	// Scoped to this path on purpose: the PDF/PPTX bytes stay exactly as they were.
	// team-profile is the component that surfaced it (the only one that emits `<img>`
	// from a transform), but the gap was never component-specific — a bare
	// `![](photo.jpg)` on an ordinary `content` slide broke identically.
	const assetBase = opts.assetBaseUrl;
	const inlineAssets = assetBase
		? (html) => inlineFileUrls(resolveInlineImageSrcs(html, assetBase))
		: inlineFileUrls;
	return assemblePlayer(opts, {
		parseHtml: (html) => new JSDOM(html).window.document,
		sanitize,
		sha256: async (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64'),
		inlineAssets,
		// Raw katex.min.css off disk (the math plugin's own copy) (core minifies + inlines only when the deck has
		// math); null when unresolvable/unreadable → the core drops the link + reports it.
		katexCss: () => {
			try {
				return fs.readFileSync(require('../plugins/payload-path.js').vendorPath('math', 'katex-css'), 'utf8');
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
	PRUNE_SKIP_STYLE_IDS,
	isPruneSkippedStyle,
	fontFaceFamilies,
	literalFontWeights,
	mergeIdenticalFontFaces,
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
	PRUNE_SKIP_STYLE_IDS,
	isPruneSkippedStyle,
	fontFaceFamilies,
	literalFontWeights,
	mergeIdenticalFontFaces,
};
