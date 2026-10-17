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

const { bytesToDataUri } = require('../core/data-uri');

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
		// One encoding for both hosts (lib/core/data-uri.js): SVG as percent-encoded UTF-8, else base64.
		return bytesToDataUri(fs.readFileSync(absPath), mime);
	} catch {
		return null;
	}
}

// Only the START tag (group 1, 2) is read. `<!--` is matched alone and skipped with indexOf, so a deck of
// unterminated comments costs one scan to the end instead of one per `<!--` (a lazy `[\s\S]*?-->` rescanned the
// whole rest of the document from every one). A bogus comment (`<?x …>`, `<!DOCTYPE …>`, `<![CDATA[ …]]>`, which a
// browser ends at the first `>`) and an END tag (whose attributes a browser parses and ignores) are matched so their
// text is never mistaken for a start tag, then skipped.
const TAG_OR_COMMENT = /<!--|<[?!][^>]*>|<\/[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
// One attribute at a time (name, then its whole quoted value), so `style='…'` written INSIDE another
// attribute's value (an image's alt text) is part of that value and never read as a style attribute.
const ATTR = /([^\s"'<>/=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)?/g;
// Elements whose body a browser does not parse as markup: nothing inside one is a tag.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'iframe', 'noscript', 'plaintext']);

/**
 * Rewrite the three places the player may bake a local file into itself, and nothing else: each
 * `style="…"` attribute value and each `<style>` body (`css`), and the `src` attribute of an `<img>`
 * (`imgSrc`). Attributes are tokenized one at a time, so `src='…'` written inside another attribute's
 * value (`alt`, `data-src`) is part of that value. Text, comments, end tags and the bodies of raw-text
 * elements pass through untouched. It relies on what an HTML serializer guarantees, which is what feeds
 * the player: a `<` in text is written `&lt;`, so a raw `<` opens a tag or a comment.
 * @param {string} html
 * @param {{ css: (value: string) => string, imgSrc: (value: string) => string }} fns
 */
function mapPlayerContexts(html, { css, imgSrc }) {
	let out = '';
	let last = 0;
	const lower = html.toLowerCase();
	TAG_OR_COMMENT.lastIndex = 0;
	for (let m = TAG_OR_COMMENT.exec(html); m; m = TAG_OR_COMMENT.exec(html)) {
		if (m[0] === '<!--') {
			// `<!-->` and `<!--->` are complete empty comments; an unterminated one runs to the end of the document.
			const body = m.index + 4;
			let end;
			if (html.startsWith('>', body)) end = body + 1;
			else if (html.startsWith('->', body)) end = body + 2;
			else {
				const close = html.indexOf('-->', body);
				end = close === -1 ? html.length : close + 3;
			}
			TAG_OR_COMMENT.lastIndex = end;
			continue;
		}
		if (!m[1]) continue; // a bogus comment or an end tag
		const name = m[1].toLowerCase();
		const attrs = m[2].replace(ATTR, (whole, attrName, eq, value) => {
			if (!value || (value[0] !== '"' && value[0] !== "'")) return whole;
			const attr = attrName.toLowerCase();
			const inner = value.slice(1, -1);
			if (attr === 'style') return `${attrName}${eq}${value[0]}${css(inner)}${value[0]}`;
			if (attr === 'src' && name === 'img') return `${attrName}${eq}${value[0]}${imgSrc(inner)}${value[0]}`;
			return whole;
		});
		out += html.slice(last, m.index) + `<${m[1]}${attrs}>`;
		last = m.index + m[0].length;
		if (RAW_TEXT.has(name)) {
			const closeTag = new RegExp(`</${name}(?=[\\s/>])`, 'g');
			closeTag.lastIndex = last;
			const found = closeTag.exec(lower);
			const end = found ? found.index : html.length;
			out += name === 'style' ? css(html.slice(last, end)) : html.slice(last, end);
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
	// Three places only, found by tokenizing real start tags (mapPlayerContexts): an `<img src="file://…">` (NOT
	// stylesheet <link> hrefs, since a data: link trips style-src CSP, and NOT <script src>, removed wholesale by the
	// jsdom pass), a `style` attribute value, and a `<style>` body. Text, inline code and code fences are never CSS,
	// and the serializer writes `"` as `&quot;` there too, so a pattern run over the whole document would read a CSS
	// sample an author shows (a `url("file:///…")` in a code block) and bake the named file into the shared file.
	// The URL pattern is bounded at PATH_MAX-ish 4096 characters: an unbounded one rescans to the end of the value
	// from every `url(file://` and a stranger's deck could stall the export.
	const out = mapPlayerContexts(html, {
		imgSrc: (src) => (/^file:\/\/[^"']+$/i.test(src) ? (inline(src) ?? src) : src),
		css: (css) =>
			css
				// The engine also writes each background as `--background-image:"url(\"file://…\")"`, a STRING that
				// only looks like a url() and that nothing reads (lib/engine/background-image.js). It would carry the
				// author's local path into the shared file and a second copy of the picture beside the real
				// declaration, so it is dropped here, before the real `background-image:url(…)` is inlined below.
				.replace(/--background-image:&quot;url\(\\&quot;file:\/\/(?:(?!&quot;|&#39;|&#x27;).){0,4096}?\\&quot;\)&quot;;?/gi, '')
				// `url(file://…)` / `url('file://…')`. The quote may also be an HTML entity (`&quot;`, `&#39;`): the
				// engine writes a plain slide's `![bg]` as `style="background-image:url(&quot;file://…&quot;)"`, and a
				// pattern for raw quotes alone left the shared file pointing at a path on the author's disk.
				.replace(/url\((&quot;|&#39;|&#x27;|["']|)(file:\/\/(?:(?!&quot;|&#39;|&#x27;)[^)"'\\]){1,4096})\1\)/gi, (m, q, url) => {
					const uri = inline(url);
					return uri ? `url(${q}${uri}${q})` : m;
				}),
	});
	return { html: out, missing, count: inlinedUrls.size };
}

/**
 * Resolve each relative `url()` in a `style="…"` attribute against the deck's folder, so the
 * inliner can bake it in. The CLI renders with no base URL on purpose (its PDF resolves relative
 * paths against the deck's folder), so a section background written by the engine reaches the
 * player as `url(&quot;a.jpg&quot;)`, which points at nothing once the file leaves that folder.
 * Absolute URLs, `data:`, fragments and the escaped `--background-image` string are left alone.
 */
function resolveStyleUrls(html, baseUrl) {
	return html.replace(/(\sstyle=")([^"]*)"/gi, (whole, pre, value) => {
		const next = value.replace(/url\((&quot;|&#39;|')?([^)"'&\\]+)\1\)/gi, (m, q = '', ref) => {
			const r = ref.trim();
			if (!r || /^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('#') || r.startsWith('//')) return m;
			try {
				return `url(${q}${new URL(r, baseUrl).href}${q})`;
			} catch {
				return m;
			}
		});
		return next === value ? whole : `${pre}${next}"`;
	});
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
		? (html) => inlineFileUrls(resolveStyleUrls(resolveInlineImageSrcs(html, assetBase), assetBase))
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

// Glyph subsetting lives in player-fonts.js, which the Studio bundles too, so both hosts subset
// with the same code and the same HarfBuzz build (decisions/2026-10-16-player-as-library-audit.md §11).
const { subsetEmbeddedFonts } = require('./player-fonts.js');

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
	resolveStyleUrls,
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
