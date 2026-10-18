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

// ── a linear reader of start tags ─────────────────────────────────────────────────────────────────────────
// The player inliner must read exactly the positions a BROWSER reads as a `style` attribute, a `<style>` body
// and an `<img src>`, and no others: a position the browser ignores that the inliner reads bakes a file the author
// never loaded, and one the inliner skips ships an absolute local path. The first cut used regexes, which read a
// `"` anywhere in a tag as a quote (a browser opens a value only after `=`) and were quadratic on a deck of
// unclosed quotes (a 1 MB `<a "` deck ran past five minutes). This follows the HTML tokenizer's tag states instead
// (https://html.spec.whatwg.org/#tokenization), one forward pass, each character looked at a bounded number of times:
//   · `<!--` ends at `-->` (`<!-->` and `<!--->` are empty comments; unterminated runs to the end);
//   · `<!…`, `<?…` and `</` + a non-letter are bogus comments, ended by the first `>`;
//   · `</x …>` is an end tag: its attributes are parsed and ignored;
//   · `<x …>`: after the name, an attribute NAME runs to whitespace, `/`, `>` or `=` and may contain `"`, `'` and `<`
//     (so `<img <src=…>` has an attribute named `<src`); a value opens only after `=`, quoted or bare;
//   · a quote with no closing quote is end-of-file inside a tag: the tag is dropped and so is the rest of the document;
//   · on a duplicate attribute the FIRST wins, as in a browser, so a later `src` or `style` is never read;
//   · the body of a raw-text element is not markup. (Inside `<svg>` / `<math>` a browser parses a `<style>` child as
//     markup, but still applies its text as CSS, so the reader treats it as raw too: it reads the CSS, and a `<img>`
//     inside such a body is the rare over-read, which the deck-folder limit bounds. Modeling foreign content needs
//     the full tree builder, which is the DOM route in followups.d.)
// What it still leans on is what an HTML serializer guarantees, which is what feeds the player: a `<` in text is `&lt;`.
const isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\r';
// Elements whose body a browser does not parse as markup: nothing inside one is a tag.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'iframe', 'noscript', 'plaintext']);
// Lowercase A-Z only, so the copy keeps the original's length. `String.toLowerCase()` turns `İ` into two UTF-16 units, and
// every index taken from the copy would then point at the wrong place in the original.
const asciiLower = (str) => str.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const isAsciiLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/**
 * Read one tag starting at `html[at] === '<'` followed by a letter (start tag) or `/` + letter (end tag).
 * @returns {{ name: string, end: number, attrs: { name: string, valueStart: number, valueEnd: number, quoted: boolean }[], selfClosing: boolean } | null}
 *   `end` is the index just past `>`; null when the tag never closes (end of file inside it).
 */
function readTag(html, at, isEnd) {
	const n = html.length;
	let i = at + (isEnd ? 2 : 1);
	const nameStart = i;
	while (i < n && !isWs(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
	const name = html.slice(nameStart, i).toLowerCase();
	const attrs = [];
	const seen = new Set();
	let selfClosing = false;
	for (;;) {
		while (i < n && (isWs(html[i]) || html[i] === '/')) {
			selfClosing = html[i] === '/' && html[i + 1] === '>';
			i++;
		}
		if (i >= n) return null;
		if (html[i] === '>') return { name, end: i + 1, attrs, selfClosing };
		// attribute name: a leading `=` belongs to the name; `"`, `'` and `<` are ordinary name characters
		const aStart = i;
		i++;
		while (i < n && !isWs(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
		const aName = html.slice(aStart, i).toLowerCase();
		let j = i;
		while (j < n && isWs(html[j])) j++;
		let valueStart = -1;
		let valueEnd = -1;
		let quoted = false;
		if (html[j] === '=') {
			j++;
			while (j < n && isWs(html[j])) j++;
			const q = html[j];
			if (q === '"' || q === "'") {
				const close = html.indexOf(q, j + 1);
				if (close === -1) return null;
				valueStart = j + 1;
				valueEnd = close;
				quoted = true;
				i = close + 1;
			} else {
				valueStart = j;
				while (j < n && !isWs(html[j]) && html[j] !== '>') j++;
				valueEnd = j;
				i = j;
			}
		}
		if (!seen.has(aName)) {
			seen.add(aName);
			attrs.push({ name: aName, valueStart, valueEnd, quoted });
		}
	}
}

/**
 * Where a raw-text element's body ends: the matching end tag (`</name` then whitespace, `/` or `>`), or the end of
 * the document. `<plaintext>` never ends. A `<script>` follows the HTML escape states: after `<!--` a `<script` opens a
 * double-escaped run in which `</script>` does not end the element, until `-->` (https://html.spec.whatwg.org/#script-data-escaped-state).
 */
function rawTextEnd(html, lower, name, from) {
	const n = html.length;
	if (name === 'plaintext') return n;
	if (name === 'script') {
		const re = /<!--|-->|<\/?script(?=[\t\n\f\r />])/gi;
		re.lastIndex = from;
		let escaped = false;
		let double = false;
		for (let m = re.exec(html); m; m = re.exec(html)) {
			const t = m[0].toLowerCase();
			if (t === '<!--') escaped = true;
			else if (t === '-->') escaped = double = false;
			else if (t === '<script') {
				if (escaped) double = true;
			} else if (double) double = false;
			else return m.index;
		}
		return n;
	}
	for (let k = lower.indexOf(`</${name}`, from); k !== -1; k = lower.indexOf(`</${name}`, k + 1)) {
		const after = lower[k + 2 + name.length];
		if (after === undefined || isWs(after) || after === '/' || after === '>') return k;
	}
	return n;
}

/**
 * Rewrite the three places the player may bake a local file into itself, and nothing else: each
 * `style="…"` attribute value and each `<style>` body (`css`), and the `src` attribute of an `<img>`
 * (`imgSrc`). Only a quoted value is rewritten, and only the first attribute of that name. Text, comments, end
 * tags and the bodies of raw-text elements pass through untouched, byte for byte.
 * @param {string} html
 * @param {{ css: (value: string) => string, imgSrc: (value: string) => string, styleBody?: (value: string) => string }} fns
 *   `styleBody` maps a `<style>` element's text (default: `css`); `css` alone then maps `style` attributes.
 */
function mapPlayerContexts(html, { css, imgSrc, styleBody = css }) {
	let out = '';
	let last = 0;
	const lower = asciiLower(html);
	const n = html.length;
	let i = html.indexOf('<');
	while (i !== -1 && i < n) {
		const c1 = html[i + 1];
		let next;
		if (html.startsWith('<!--', i)) {
			// `<!-->` and `<!--->` are complete empty comments; an unterminated one runs to the end of the document.
			const body = i + 4;
			if (html.startsWith('>', body)) next = body + 1;
			else if (html.startsWith('->', body)) next = body + 2;
			else {
				const close = html.indexOf('-->', body);
				next = close === -1 ? n : close + 3;
			}
		} else if (c1 === '!' || c1 === '?' || (c1 === '/' && !isAsciiLetter(html[i + 2] ?? ''))) {
			const gt = html.indexOf('>', i + 2);
			next = gt === -1 ? n : gt + 1; // a bogus comment ends at the first `>`
		} else if (c1 === '/') {
			const tag = readTag(html, i, true);
			if (!tag) break;
			next = tag.end;
		} else if (isAsciiLetter(c1 ?? '')) {
			const tag = readTag(html, i, false);
			if (!tag) break; // end of file inside a tag: a browser drops it and everything after
			let rewritten = '';
			let from = i;
			for (const a of tag.attrs) {
				if (!a.quoted) continue;
				const value = html.slice(a.valueStart, a.valueEnd);
				let mapped = value;
				if (a.name === 'style') mapped = css(value);
				else if (a.name === 'src' && tag.name === 'img') mapped = imgSrc(value);
				if (mapped !== value) {
					rewritten += html.slice(from, a.valueStart) + mapped;
					from = a.valueEnd;
				}
			}
			next = tag.end;
			if (from !== i) {
				out += html.slice(last, i) + rewritten + html.slice(from, tag.end);
				last = tag.end;
			}
			if (RAW_TEXT.has(tag.name)) {
				const end = rawTextEnd(html, lower, tag.name, next);
				if (tag.name === 'style') {
					const body = html.slice(next, end);
					const mapped = styleBody(body);
					if (mapped !== body) {
						out += html.slice(last, next) + mapped;
						last = end;
					}
				}
				next = end;
			}
		} else {
			i = html.indexOf('<', i + 1); // a lone `<` is text
			continue;
		}
		i = next >= n ? -1 : html.indexOf('<', next);
	}
	return out + html.slice(last);
}

// A quote as a browser reads it inside a `style` attribute value: raw, or an entity spelling of `"` or `'`.
const QUOTE_TOKEN = /&quot;|&#0*34;|&#0*39;|&#x0*22;|&#x0*27;|["']/iy;
// What ends a `url(file://…` address: `)`, a quote in any spelling, or a backslash.
const URL_END = /[)"'\\]|&(?:quot|#0*34|#0*39|#x0*22|#x0*27);/gi;
const quoteKind = (tok) => (/^(?:"|&quot;|&#0*34;|&#x0*22;)$/i.test(tok) ? 'd' : 's');
const MAX_URL = 4096; // PATH_MAX-ish: a longer address is not one

/**
 * Replace each `url(file://…)` in a CSS text with what `inline(address)` returns (null keeps it). One forward pass: the
 * next terminator is looked up once and reused by every start before it, so a megabyte of `url(file://url(file://…` costs
 * a megabyte, not a megabyte times the bound (the regex it replaces took about 3.7 s on that deck).
 * @param {string} css
 * @param {(fileUrl: string) => string|null} inline
 */
function rewriteFileUrls(css, inline) {
	const lower = asciiLower(css);
	let out = '';
	let last = 0;
	let term = null; // cached next terminator at or after `termFrom`
	let termFrom = -1;
	let none = false; // no terminator anywhere after termFrom
	let k = lower.indexOf('url(');
	while (k !== -1) {
		const p = k + 4;
		QUOTE_TOKEN.lastIndex = p;
		const oq = QUOTE_TOKEN.exec(css);
		const open = oq ? oq[0] : '';
		const u = p + open.length;
		if (lower.startsWith('file://', u)) {
			if (!none && (termFrom > u || term === null || term.index < u)) {
				URL_END.lastIndex = u;
				term = URL_END.exec(css);
				termFrom = u;
				none = term === null;
			}
			if (!none && term.index - (u + 7) >= 1 && term.index - (u + 7) <= MAX_URL) {
				const url = css.slice(u, term.index);
				let end = term.index;
				let closeQ = '';
				let ok = true;
				if (open) {
					QUOTE_TOKEN.lastIndex = end;
					const cq = QUOTE_TOKEN.exec(css);
					if (cq && quoteKind(cq[0]) === quoteKind(open)) {
						closeQ = cq[0];
						end += closeQ.length;
					} else ok = false;
				}
				if (ok && css[end] === ')') {
					const uri = inline(url);
					if (uri) {
						out += `${css.slice(last, k)}url(${open}${uri}${closeQ})`;
						last = end + 1;
						k = lower.indexOf('url(', last);
						continue;
					}
				}
			}
		}
		k = lower.indexOf('url(', p);
	}
	return out + css.slice(last);
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
 * inlining to an allowlisted asset root under the deck directory. That is what `confine` is: the CLI
 * passes a `createFileConfiner` (lib/export/file-confine.js) holding the deck folder and Lattice's install,
 * and a file whose REAL path sits outside them is refused. Omit it and every `file://` is read, as before.
 */
function inlineFileUrls(html, { confine } = {}) {
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
		// A file whose REAL path leaves the allowed roots (a symlink in the deck folder, a typed
		// `file:///etc/x`) is not read. The stand-in takes its place, so the author's local path does not
		// ride into the shared file either (media note §4.11, "Paths stay inside the deck").
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
			rewriteFileUrls(
				css
				// The engine also writes each background as `--background-image:"url(\"file://…\")"`, a STRING that
				// only looks like a url() and that nothing reads (lib/engine/background-image.js). It would carry the
				// author's local path into the shared file and a second copy of the picture beside the real
				// declaration, so it is dropped here, before the real `background-image:url(…)` is inlined below.
				.replace(/--background-image:&quot;url\(\\&quot;file:\/\/(?:(?!&quot;|&#39;|&#x27;).){0,4096}?\\&quot;\)&quot;;?/gi, ''),
				// Then `url(file://…)` / `url('file://…')`, with the quote as a raw character or as an HTML entity in any
				// spelling a browser decodes (`&quot;`, `&#34;`, `&#x22;`, `&#39;`, `&#x27;`, leading zeros too): the engine
				// writes a plain slide's `![bg]` as `style="background-image:url(&quot;file://…&quot;)"`, and a hand-written
				// deck may use another spelling. One forward pass (`rewriteFileUrls`).
				inline,
			),
	});
	return { html: out, missing, count: inlinedUrls.size };
}

/**
 * Resolve each relative `url()` in a `style="…"` attribute against the deck's folder, so the
 * inliner can bake it in. The CLI renders with no base URL on purpose (its PDF resolves relative
 * paths against the deck's folder), so a section background written by the engine reaches the
 * player as `url(&quot;a.jpg&quot;)`, which points at nothing once the file leaves that folder.
 * Absolute URLs, `data:`, fragments and the escaped `--background-image` string are left alone.
 *
 * Only real `style` attributes, found by the same tag scanner as the inliner (mapPlayerContexts).
 * Chromium writes `"` raw in text, so a pattern over the whole document read a code sample
 * (`<div style="background:url(pic.jpg)">` in inline code) as markup and wrote the author's folder
 * path into it, which the inliner then rightly left alone as text.
 */
const isPictureFile = (p) => {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
};
// `url(ref)`, `url('ref')` and `url(&quot;ref&quot;)` / `url(&#39;ref&#39;)`, as `String.replace` with the pattern
// /url\((&quot;|&#39;|')?([^)"'&\\]+)\1\)/gi would call `fn(match, quote, ref)`. That pattern is quadratic on a deck of
// unclosed `url(` (each start scans to the end of the value); this reads the next terminator once for every start before it.
const PLAIN_QUOTE = /&quot;|&#39;|'/iy;
const PLAIN_END = /[)"'&\\]/g;
function replacePlainUrls(css, fn) {
	const lower = asciiLower(css);
	let out = '';
	let last = 0;
	let term = null;
	let scanned = false;
	let k = lower.indexOf('url(');
	while (k !== -1) {
		const p = k + 4;
		PLAIN_QUOTE.lastIndex = p;
		const oq = PLAIN_QUOTE.exec(css);
		const q = oq ? oq[0] : '';
		const u = p + q.length;
		// The address is one or more characters up to the next `)`, quote or `&`; an unterminated one never matches.
		if (!scanned || (term !== null && term.index < u)) {
			PLAIN_END.lastIndex = u;
			term = PLAIN_END.exec(css);
			scanned = term !== null;
			if (term === null) break; // no terminator anywhere after this: no later start can match either
		}
		if (term.index > u && css.slice(term.index, term.index + q.length).toLowerCase() === q.toLowerCase() && css[term.index + q.length] === ')') {
			const end = term.index + q.length + 1;
			out += css.slice(last, k) + fn(css.slice(k, end), q, css.slice(u, term.index));
			last = end;
			k = lower.indexOf('url(', last);
			continue;
		}
		k = lower.indexOf('url(', p);
	}
	return out + css.slice(last);
}

function resolveStyleUrls(html, baseUrl, missing = []) {
	const keep = (s) => s;
	return mapPlayerContexts(html, { imgSrc: keep, styleBody: keep, css: (value) =>
		replacePlainUrls(value, (m, q, ref) => {
			const r = ref.trim();
			if (!r || /^[a-z][a-z0-9+.-]*:/i.test(r) || r.startsWith('#') || r.startsWith('//')) return m;
			try {
				const href = new URL(r, baseUrl).href;
				// Only a file that is there. A reference that resolves to nothing (a typo, an encoded
				// `..%2f`) stays as the author wrote it, rather than carrying the author's own folder
				// path into a file they send. What gets embedded is limited by TYPE, in
				// `fileToDataUri`: pictures only, wherever they sit, as for an `<img>` (a deck pulling
				// `../shared/logo.png` from a sibling folder is ordinary; a non-picture is never baked in).
				// A picture type only, and only one that is there; anything else stays as written, so
				// the author's folder path never rides into the shipped file, and is still REPORTED,
				// as written: the honesty report names what did not make it, and why.
				const picture = !!MIME[path.extname(new URL(href).pathname).toLowerCase()];
				if (picture && isPictureFile(fileURLToPath(href))) return `url(${q}${href}${q})`;
				missing.push(picture ? r : `${r} (not a picture, so not embedded)`);
				return m;
			} catch {
				return m;
			}
		}),
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
	// The deck's folder, plus the roots the host adds (the CLI: Lattice's install, where `sample:` art lives).
	// A picture whose real path is elsewhere is not baked in (a symlink out of the folder, a typed `file:///etc/x`).
	const confine = assetBase ? createFileConfiner([fileURLToPath(assetBase), path.resolve(__dirname, '../samples'), ...(opts.assetRoots || [])]) : undefined;
	const inlineAssets = assetBase
		? (html) => {
				const gone = [];
				const r = inlineFileUrls(resolveStyleUrls(resolveInlineImageSrcs(html, assetBase), assetBase, gone), { confine });
				return { ...r, missing: [...r.missing, ...gone] };
			}
		: inlineFileUrls;
	const built = await assemblePlayer(opts, {
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
