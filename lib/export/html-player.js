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
const { WEB_IMAGE_PLACEHOLDER } = require('../core/remote-ref');
const { createFileConfiner } = require('./file-confine');

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
		// A picture type only. Any other file a deck names (`url(../notes.txt)`) is not embedded: a
		// shared player is no place for a file the author did not mean as a picture.
		const mime = MIME[ext];
		if (!mime) return null;
		// One encoding for both hosts (lib/core/data-uri.js): SVG as percent-encoded UTF-8, else base64.
		return bytesToDataUri(fs.readFileSync(absPath), mime);
	} catch {
		return null;
	}
}

// ── the player's local-file inliner, on the DOM ──────────────────────────────────────────────────────────
// The player bakes a local picture into itself in three places, and nowhere else: an `<img src>`, a `style`
// attribute and a `<style>` body. It used to find them by tokenizing the document's HTML text by hand, which has to
// agree with a browser on every state of the HTML tokenizer (a quote opens a value only after `=`, a comment ends at
// `-->` or `--!>`, a `<script>` has escape states, `<plaintext>` never ends, foreign content differs, …) and
// took five checker passes and three more reviews to get close. It now works on the DOM the assembler parses ANYWAY
// (`caps.parseHtml`, one parse): the parser decides what an element, an attribute and a text node are, so a position a
// browser ignores is not in the tree, and attribute values arrive entity-decoded, so the CSS readers below see plain
// quotes and no entity spellings. `<template>` content is a separate fragment and is walked too (a script clones it into
// the page, where a browser loads the picture).

const MAX_URL = 4096; // PATH_MAX-ish: a longer address is not one
const CSS_STOP = /[/"'uU]/g;
const URL_UNQUOTED_END = /[)"'(\\\s]/g;
const isCssSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Replace the `url(…)` tokens of an entity-decoded CSS text, in one forward pass that reads CSS the way a browser tokenizes
 * it: a `/* … *\/` comment and a quoted string are skipped whole (a string ends at its quote, or at an unescaped newline, which
 * makes it a bad string), so a `url(` written inside one is text; whitespace around the address is allowed
 * (`url( "a.png" )`, `url( a.png )`); and an unquoted `url(` that holds a `(`, a quote, a backslash or inner whitespace is one
 * invalid token (CSS "bad url"), consumed up to its `)`, so a `url(a/url(b))` nest never yields the inner address. Every
 * character is looked at a bounded number of times.
 * @param {string} css
 * @param {(match: string, quote: string, ref: string) => string|null} fn  the replacement, or null to keep the token
 */
function mapCssUrls(css, fn) {
	const n = css.length;
	let out = '';
	let last = 0;
	let i = 0;
	while (i < n) {
		CSS_STOP.lastIndex = i;
		const m = CSS_STOP.exec(css);
		if (m === null) break;
		i = m.index;
		const c = css[i];
		if (c === '/') {
			if (css[i + 1] !== '*') {
				i++;
				continue;
			}
			const close = css.indexOf('*/', i + 2);
			i = close === -1 ? n : close + 2;
			continue;
		}
		if (c === '"' || c === "'") {
			i = cssString(css, i).next;
			continue;
		}
		// `u` / `U`: a `url(` function token, and not the tail of a longer name (`myurl(`).
		const prev = css[i - 1];
		if (css.slice(i, i + 4).toLowerCase() !== 'url(' || (prev !== undefined && /[\w-]/.test(prev))) {
			i++;
			continue;
		}
		let p = i + 4;
		while (p < n && isCssSpace(css[p])) p++;
		const quote = css[p] === '"' || css[p] === "'" ? css[p] : '';
		let ref;
		let end;
		if (quote) {
			const str = cssString(css, p);
			let q = str.close + 1;
			while (q < n && isCssSpace(css[q])) q++;
			if (str.close === -1 || str.close === p + 1 || css[q] !== ')') {
				i = str.next; // a bad string, or a quoted url not closed by `)`: not a token
				continue;
			}
			ref = css.slice(p + 1, str.close);
			end = q + 1;
		} else {
			URL_UNQUOTED_END.lastIndex = p;
			const t = URL_UNQUOTED_END.exec(css);
			let q = t ? t.index : -1;
			if (t && isCssSpace(css[q])) {
				const stop = q;
				while (q < n && isCssSpace(css[q])) q++;
				if (css[q] === ')') ref = css.slice(p, stop);
			} else if (t && css[q] === ')') ref = css.slice(p, q);
			if (ref === undefined || ref === '') {
				// A bad url: consume to the first `)` (or the end), so nothing inside it is read as a token.
				const rest = css.indexOf(')', p);
				i = rest === -1 ? n : rest + 1;
				continue;
			}
			end = q + 1;
		}
		const replaced = fn(css.slice(i, end), quote, ref);
		if (replaced !== null) {
			out += css.slice(last, i) + replaced;
			last = end;
		}
		i = end;
	}
	return out + css.slice(last);
}

/**
 * The quoted string that opens at `at`. A backslash escapes the next character (an escaped newline continues the string); an
 * unescaped newline or the end of the text ends it unclosed (a CSS bad string).
 * @returns {{ close: number, next: number }} `close`: index of the closing quote, or -1 when unclosed; `next`: where to resume
 */
function cssString(css, at) {
	const quote = css[at];
	let j = at + 1;
	while (j < css.length) {
		const c = css[j];
		if (c === quote) return { close: j, next: j + 1 };
		if (c === '\n' || c === '\r' || c === '\f') return { close: -1, next: j };
		j += c === '\\' ? 2 : 1;
	}
	return { close: -1, next: css.length };
}

/** Replace each `url(file://…)` in a CSS text with what `inline(address)` returns (null keeps it). */
function rewriteFileUrls(css, inline) {
	return mapCssUrls(css, (_match, quote, ref) => {
		if (!/^file:\/\//i.test(ref) || ref.length - 7 < 1 || ref.length - 7 > MAX_URL) return null;
		const uri = inline(ref);
		return uri ? `url(${quote}${uri}${quote})` : null;
	});
}

/** Replace each plain `url(ref)` in a CSS text with `fn(match, quote, ref)`; the relative-path resolver of `inlineDocAssets`. */
function replacePlainUrls(css, fn) {
	return mapCssUrls(css, (match, quote, ref) => {
		const replaced = fn(match, quote, ref);
		return replaced === match ? null : replaced;
	});
}

// The engine also writes each background as `--background-image:"url(\"file://…\")"`, a STRING that only looks like a
// url() and that nothing reads (lib/engine/background-image.js). It would carry the author's local path into the shared
// file and a second copy of the picture beside the real declaration, so it is dropped before the real
// `background-image:url(…)` is inlined.
const BACKGROUND_IMAGE_STRING = /--background-image:"url\(\\"file:\/\/(?:(?!").){0,4096}?\\"\)";?/gi;

const isPictureFile = (p) => {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
};

/**
 * Bake every local picture the document names into the document, in place, and report what could not be.
 *
 * Three positions only, on the parsed tree: each `<img src>`, each `style` attribute and each `<style>` body. For
 * `file://…` addresses in those it swaps the file's bytes in as a data: URI. With a `baseUrl` (the deck's folder, the CLI
 * path) it also resolves a deck-relative `<img src>` and each relative `url()` in a `style` attribute against it first:
 * the CLI renders with no base URL on purpose (its PDF resolves relative paths against the deck's folder), so a section
 * background written by the engine reaches the player as `url("a.jpg")`, which points at nothing once the file leaves that
 * folder. Absolute URLs, `data:`, fragments and the escaped `--background-image` string are left alone, a reference that
 * resolves to nothing stays as the author wrote it (so the author's own folder path never rides into a file they send), and
 * only picture types are ever embedded.
 *
 * TRUST BOUNDARY: this reads arbitrary local files a `file://` URL names and bakes their bytes into the shared file. That
 * is BENIGN for the CLI (an author baking their OWN deck on their OWN machine — they already have those files). It would be a
 * disclosure vector if this exporter is ever run SERVER-SIDE on an UNTRUSTED deck (`<img src="file:///etc/passwd">`). That is
 * what `confine` is: the CLI passes a `createFileConfiner` (lib/export/file-confine.js) holding the deck folder and Lattice's
 * install, and a file whose REAL path sits outside them is refused (the stand-in takes its place). Omit it and every `file://`
 * is read.
 *
 * @param {Document} doc
 * @param {{ baseUrl?: string, confine?: { allows: (p: string) => boolean } }} [opts]
 * @returns {{ count: number, missing: string[] }}
 */
function inlineDocAssets(doc, { baseUrl, confine } = {}) {
	const { resolveAssetUrl } = require('../core/bg-image');
	const missing = [];
	const gone = [];
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
		// A file whose REAL path leaves the allowed roots (a symlink in the deck folder, a typed `file:///etc/x`) is not read.
		// The stand-in takes its place, so the author's local path does not ride into the shared file either (media note §4.11).
		if (confine && !confine.allows(abs)) {
			missing.push(`${fileUrl} (outside the deck folder, so not embedded)`);
			seen.set(fileUrl, WEB_IMAGE_PLACEHOLDER);
			return WEB_IMAGE_PLACEHOLDER;
		}
		const uri = fileToDataUri(abs);
		if (uri) inlinedUrls.add(fileUrl);
		// Say WHY: a file that is not a picture is refused by policy (`fileToDataUri`), not unreadable.
		else missing.push(MIME[path.extname(abs).toLowerCase()] ? fileUrl : `${fileUrl} (not a picture, so not embedded)`);
		seen.set(fileUrl, uri);
		return uri;
	};
	// A relative `url()` becomes an absolute `file://` URL, but only for a file that is there; the inliner bakes it next.
	const resolveRelative = (match, q, ref) => {
		const r = ref.trim();
		if (!r || /^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('#') || r.startsWith('//')) return match;
		try {
			const href = new URL(r, baseUrl).href;
			const picture = !!MIME[path.extname(new URL(href).pathname).toLowerCase()];
			if (picture && isPictureFile(fileURLToPath(href))) return `url(${q}${href}${q})`;
			gone.push(picture ? r : `${r} (not a picture, so not embedded)`);
			return match;
		} catch {
			return match;
		}
	};
	const bakeCss = (css, relative) => {
		let v = css.replace(BACKGROUND_IMAGE_STRING, '');
		if (relative && baseUrl) v = replacePlainUrls(v, resolveRelative);
		return rewriteFileUrls(v, inline);
	};
	// One walk over the elements (a tree walker is about four times faster than four selector scans on a multi-megabyte
	// document, and a deck's `<style>` blocks make it one).
	const visit = (root) => {
		const walker = doc.createTreeWalker(root, 1 /* NodeFilter.SHOW_ELEMENT */);
		for (let el = walker.nextNode(); el; el = walker.nextNode()) {
			const tag = el.localName;
			if (tag === 'img' && el.hasAttribute('src')) {
				const src = el.getAttribute('src');
				let v = baseUrl ? resolveAssetUrl(src, baseUrl) : src;
				if (/^file:\/\/[^"']+$/i.test(v)) v = inline(v) ?? v;
				if (v !== src) el.setAttribute('src', v);
			}
			if (el.hasAttribute('style')) {
				const css = el.getAttribute('style');
				const v = bakeCss(css, true);
				if (v !== css) el.setAttribute('style', v);
			}
			if (tag === 'style') {
				// Each text node on its own: an SVG `<style>` may hold element children, which `textContent` would flatten.
				for (const node of el.childNodes) {
					if (node.nodeType !== 3) continue;
					const v = bakeCss(node.data, false);
					if (v !== node.data) node.data = v;
				}
			}
			if (tag === 'template' && el.content) visit(el.content);
		}
	};
	visit(doc);
	return { count: inlinedUrls.size, missing: [...missing, ...gone] };
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
	const { JSDOM } = require('jsdom');
	const DOMPurify = require('dompurify');
	const { createSlideSanitizer } = await import('../core/sanitize-slide-html.mjs');
	// A dedicated jsdom window backs the DOMPurify sanitizer. `sanitize` is a pure
	// string→string transform (DOMPurify parses the input into its OWN document), so a
	// standalone window yields byte-identical output to the pre-extraction code, which
	// shared the parse window. The golden test pins that identity.
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
	// A `--player` export is a SINGLE FILE meant to be mailed, so a deck-relative `<img src>` or a relative `url()` in a
	// section background must be baked in: a relative `ada.svg` points at nothing once the file leaves the deck folder (every
	// portrait on every slide rendered broken). `inlineDocAssets` resolves each against the deck's folder (`assetBaseUrl`) and then
	// bakes it. The engine deliberately does NOT resolve these on the CLI path (`resolveInlineImageSrcs` no-ops without a
	// baseUrl, "so exported bytes are untouched"), which is right for the PDF, Chromium rendering with the deck directory as its
	// base. Scoped to this path on purpose: the PDF/PPTX bytes stay exactly as they were. team-profile surfaced it (the only
	// component that emits `<img>` from a transform), but a bare `![](photo.jpg)` on a `content` slide broke identically.
	const assetBase = opts.assetBaseUrl;
	// The deck's folder, plus the roots the host adds (the CLI: Lattice's install, where `sample:` art lives).
	// A picture whose real path is elsewhere is not baked in (a symlink out of the folder, a typed `file:///etc/x`).
	const confine = assetBase ? createFileConfiner([fileURLToPath(assetBase), path.resolve(__dirname, '../samples'), ...(opts.assetRoots || [])]) : undefined;
	const built = await assemblePlayer(opts, {
		parseHtml: (html) => new JSDOM(html).window.document,
		sanitize,
		sha256: async (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64'),
		// Bake local pictures into the parsed tree, in place (one parse; see `inlineDocAssets`).
		inlineDocAssets: (doc) => inlineDocAssets(doc, { baseUrl: assetBase, confine }),
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
	return { ...built, html: restoreSvgElementNames(built.html) };
}

// SVG element names jsdom's HTML parser (parse5) lowercases and a browser's does not. The HTML
// spec's table of SVG names to re-case predates `feDropShadow`, and parse5 follows the spec, so
// every parse in this host (the page DOM, then DOMPurify's own parse of each slide) turned a Mermaid
// node's drop shadow into `<fedropshadow>`: an element SVG does not know, so the shadow never drew in
// a CLI player file, and the Studio's file, assembled in a browser, carried the real name
// (decisions/2026-10-16-player-as-library-audit.md §11.9). Restored once, on the finished file,
// because any earlier fix would be lowercased again by the next parse. `<fedropshadow` cannot occur
// in text or an attribute value, where `<` is escaped.
const PARSE5_LOWERCASED_SVG = { fedropshadow: 'feDropShadow' };
function restoreSvgElementNames(html) {
	return html.replace(/<(\/?)(fedropshadow)(?=[\s/>])/g, (_m, close, name) => `<${close}${PARSE5_LOWERCASED_SVG[name]}`);
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
	inlineDocAssets,
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
