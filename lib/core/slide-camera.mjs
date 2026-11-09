// THE SLIDE CAMERA — one picture of a slide, taken the same way by the CLI and the Studio.
//
// Before this, each host photographed a slide its own way: the CLI took a native Chrome screenshot, the
// Studio ran html-to-image (which copies computed styles onto a clone and floors every font size by up to
// 1px). The same deck came out as different pixels: on a 52-slide deck, 52 of 52 slides differed between
// hosts, the Studio's PNG set was 52% larger, and a topic slide's bottom shelf was missing. A picture that
// differs by host is not a spine (engineering/pipeline.md § Pictures).
//
// HOW IT WORKS. The slide is laid out again, by Chromium, inside an SVG image, using the page's OWN
// stylesheets, not copied computed styles. The page's `html` and `body` rules are re-pointed at two wrapper
// divs, the slide and its ancestors are cloned with their attributes, every picture the slide uses is inlined
// as a data URI, and the SVG is drawn onto a canvas. No style is copied, so none can drift: the same
// selectors match the same elements. Measured against a native Chrome screenshot on a 52-slide deck, at most
// 0.0065% of pixels differ by more than 8 levels (html-to-image: 4.3% on average, 21% on the worst slide).
//
// ONE FUNCTION, TWO HOSTS. It runs in a page: the Studio's tab, and the CLI's headless Chrome (the same
// Chromium family, so the same pixels). The host supplies only what a page cannot do for itself:
// `toDataUri(url)`, which turns a picture's address into a `data:` URI (the Studio fetches `blob:` and
// same-origin URLs; the CLI reads confined local files through Node).
//
// FACE. `face: 'screen'` photographs the slide as the live preview shows it; `face: 'export'` adds the
// `.lattice-exporting` class first (the flat face the PDF's photo layer sits under).

import { encodeCanvas, encodePng } from './canvas-encode.mjs';
import cssRefParser from './css-ref.generated.js';
import cssRefReader from './css-ref-reader.js';
import cssTokenReaders from './css-token-readers.js';
import { lanczosResize } from './lanczos.mjs';

// The renderer's CSS reader (security spine; followups.d/3024): every `url(…)` the camera absolutizes, inlines or swaps is
// one this reads, so it reads a `url(` where the browser does. `u\72l(` is a `url(` (the regex readers this replaced
// missed it, and the picture came out blank), and a `url(` inside a comment or a string is not. Only a VALID url token
// counts: the browser never fetches a bad-url token, so the camera must not inline a picture the slide never showed.
// Made on first use, not at load: the picture-encode worker imports `encodeCanvas` from this file and never reads CSS,
// and a top-level call would keep the parser in its bundle (the checker measured 5.2 KB gzip there).
let cssRefSpans = null;
// The last few sheets read: every slide of a deck hands in the same megabytes of page CSS, and the parser costs tens of ms on it.
const spanMemo = new Map();
const SPAN_MEMO_MAX = 4;

/**
 * The `url(…)` spans of `css` the browser fetches: each `{ from, to, value }` (the target, escapes decoded), outside an
 * attribute selector, as a valid url token. Exported for its unit test.
 * @param {string} css
 * @returns {Array<{ from: number, to: number, value: string, fontFace: boolean }>}
 */
export function cssUrlSpans(css) {
	const s = String(css);
	if (!s.includes('(')) return [];
	const hit = spanMemo.get(s);
	if (hit) return hit;
	cssRefSpans ??= cssRefReader.makeCssRefSpans(cssRefParser, cssTokenReaders);
	const spans = cssRefSpans(s).filter((sp) => sp.kind === 'url' && !sp.selector && cssRefReader.isValidUrlToken(s.slice(sp.from, sp.to)));
	// Only a long text is worth keeping: a style attribute is read once, and the memo must not pin megabytes it will not reuse.
	if (s.length > 4096) {
		if (spanMemo.size >= SPAN_MEMO_MAX) spanMemo.delete(spanMemo.keys().next().value);
		spanMemo.set(s, spans);
	}
	return spans;
}

const NS = 'http://www.w3.org/1999/xhtml';
const ROOT = '__lc-root';
const BODY = '__lc-body';

// One pass per document: the page's stylesheet text, with `html`, `body` and `:root` re-pointed at the wrappers.
const cssCache = new WeakMap();

// What the ancestors of the slide must NOT bring along. They are cloned so the slide inherits what it inherits (the deck's
// tokens, its mode, its fonts), but their own BOX is the host's chrome, not the slide: the Studio's preview wraps a slide
// in a frame with a shadow, a margin and a backdrop, and a native screenshot of the slide never includes any of it. These
// declarations strip the box and leave everything that inherits (custom properties, color-scheme, font, container-type).
const ISOLATE = `.__lc-wrap{display:block!important;position:static!important;inset:auto!important;float:none!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:none!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;zoom:1!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;overflow:visible!important;filter:none!important;backdrop-filter:none!important;opacity:1!important;clip-path:none!important;mask:none!important;outline:0!important;border-radius:0!important;contain:none!important;content-visibility:visible!important;aspect-ratio:auto!important;gap:0!important}`;

// A relative `url(...)` has no base inside a data: SVG document, so every one is made absolute against the page first.
// A target with a scheme (`https:`, `data:`) or a fragment (`#clip`) is left as written.
const HAS_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|#)/i;
/** `text` with each relative `url(…)` made absolute against `base`. Exported for its unit test. */
export function absolutizeCssUrls(text, base) {
	let out = '';
	let at = 0;
	for (const sp of cssUrlSpans(text)) {
		const ref = sp.value.trim();
		if (!ref || HAS_SCHEME.test(ref)) continue;
		let abs;
		try {
			abs = new URL(ref, base).href;
		} catch {
			continue;
		}
		out += `${text.slice(at, sp.from)}url("${abs.replace(/["\\\n]/g, (c) => (c === '\n' ? '%0A' : `\\${c}`))}")`;
		at = sp.to;
	}
	return at ? out + text.slice(at) : text;
}

// A comment or a quoted string in CSS: the selector rewrite below leaves them as written, so `content:" body "` stays text.
const CSS_OPAQUE = /\/\*[\s\S]*?\*\/|"[^"\\\n]*(?:\\[\s\S][^"\\\n]*)*"|'[^'\\\n]*(?:\\[\s\S][^'\\\n]*)*'/g;

/** `rewrite` applied to the CSS outside its comments and strings. Exported for its unit test. */
export function outsideCssStrings(css, rewrite) {
	let out = '';
	let last = 0;
	for (const m of css.matchAll(CSS_OPAQUE)) {
		out += rewrite(css.slice(last, m.index)) + m[0];
		last = m.index + m[0].length;
	}
	return out + rewrite(css.slice(last));
}

/** Point `:root`, `html` and `body` selectors at the camera's two wrapper divs, leaving comments and strings alone. */
export function repointRootSelectors(css) {
	return outsideCssStrings(css, (part) =>
		part
			.replace(/:root\b/g, `.${ROOT}`)
			.replace(/(^|[\s,{}>+~(])html\b(?![-\w])/g, `$1.${ROOT}`)
			.replace(/(^|[\s,{}>+~(])body\b(?![-\w])/g, `$1.${BODY}`),
	);
}

/**
 * The text a slide's pseudo-elements draw (`::before`, `::after`, `::marker` content), read from the computed style so a CSS
 * escape such as `"\1F389"` comes back as the character. `textContent` never holds it, so an emoji set only through
 * `content:` lost its font slice (the emoji drew in a fallback face). The value is the computed `content` as written by the
 * browser (quotes and all): enough for a code-point scan, not for display.
 * @param {Element | null | undefined} root
 * @returns {string}
 */
export function pseudoContentText(root) {
	const view = root?.ownerDocument?.defaultView;
	if (!view) return '';
	const parts = [];
	for (const el of [root, ...root.querySelectorAll('*')]) {
		for (const pseudo of ['::before', '::after', '::marker']) {
			const content = view.getComputedStyle(el, pseudo).content;
			if (content && content !== 'none' && content !== 'normal') parts.push(content);
		}
	}
	return parts.join('\n');
}

function pageCss(doc) {
	const parts = [];
	for (const owner of doc.querySelectorAll('style')) parts.push(owner.textContent || '');
	for (const sheet of Array.from(doc.styleSheets)) {
		if (sheet.ownerNode && sheet.ownerNode.localName === 'style') continue; // already taken verbatim above
		try {
			parts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
		} catch {
			// a cross-origin sheet cannot be read: the host's `fontCss` carries what matters (its faces)
		}
	}
	for (const sheet of Array.from(doc.adoptedStyleSheets || [])) parts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
	// Keyed on the TEXT, not on how many sheets there are: Calco swaps a per-slide <style> in and out of the same slot, and a
	// count would serve slide 1's rules to every later slide. (Comparing two equal 2 MB strings is a pointer test.)
	const src = parts.join('\n');
	const hit = cssCache.get(doc);
	if (hit && hit.src === src) return hit.text;
	const text = repointRootSelectors(absolutizeCssUrls(src, doc.baseURI));
	cssCache.set(doc, { src, text });
	return text;
}

const REMOTE = /^(?:file|blob|https?):/i;
// `url(...)` in CSS text or in a serialized style attribute (where a double quote is written `&quot;` and `&` as `&amp;`).
/**
 * The addresses of the `@font-face` rules whose `unicode-range` none of `text` falls in. A browser would never fetch those faces for this
 * text either.
 * @param {string} css
 * @param {string} text
 * @returns {Set<string>}
 */
export function unusedRangeFaceUrls(css, text) {
	const out = new Set();
	const cps = Array.from(String(text), (c) => c.codePointAt(0));
	for (const face of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
		const range = face[0].match(/unicode-range\s*:\s*([^;}]+)/i);
		if (!range) continue;
		const ranges = range[1].split(',').map((r) => {
			const [a, b] = r.trim().replace(/^u\+/i, '').split('-');
			const lo = Number.parseInt(a, 16);
			return [lo, b ? Number.parseInt(b, 16) : lo];
		});
		if (cps.some((cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi))) continue;
		for (const sp of cssUrlSpans(face[0])) if (REMOTE.test(sp.value)) out.add(sp.value);
	}
	return out;
}

/**
 * The CSS with every `@font-face` rule of the named families removed, so the browser draws those characters with the machine's own font.
 * `font-embedding: system-emoji` rides on this: the export's page carries Noto Color Emoji, and a picture export honors the tier by leaving it out.
 * @param {string} css
 * @param {string[]} families  family names, any case, with or without quotes
 * @returns {string}
 */
export function withoutFontFaces(css, families) {
	const names = new Set(families.map((f) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase()).filter(Boolean));
	if (!names.size) return css;
	return css.replace(/@font-face\s*\{[^}]*\}/g, (face) => {
		const family = face.match(/font-family\s*:\s*([^;}]+)/i)?.[1]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
		return family && names.has(family) ? '' : face;
	});
}

/**
 * The CSS with every `@font-face` rule dropped whose family is not in `used`. A page carries every face its theme could draw (this site's:
 * 79 rules, 1.7 MB of base64) and the camera used to put all of them in every slide's SVG; the browser parses them again for each shot.
 * A rule with no readable family is kept.
 * @param {string} css
 * @param {Set<string> | null} used  family names, lower case, no quotes; null keeps every face
 */
export function onlyUsedFontFaces(css, used) {
	if (!used) return css;
	return css.replace(/@font-face\s*\{[^}]*\}/g, (face) => {
		const family = face.match(/font-family\s*:\s*([^;}]+)/i)?.[1]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
		return !family || used.has(family) ? face : '';
	});
}

/**
 * The `font-family` values the sheet sets on `::before` and `::after`, with each `var(--x)` replaced by `lookup('--x')`.
 * `unresolved` is true when a value stays unreadable (a custom property the slide does not define, or a `font:` shorthand).
 * @param {string} css
 * @param {(name: string) => string} lookup
 * @returns {{ families: string[], unresolved: boolean }}
 */
export function pseudoElementFamilies(css, lookup) {
	const families = [];
	let unresolved = false;
	// Any rule whose selector names a pseudo-element: `::before`, `::marker`, `::first-line`, `::first-letter`, `::placeholder`, the
	// one-colon forms of the legacy four, and the rest. Each can carry a face the elements' own computed styles never show.
	// One pass over the braces, no backtracking: the sheet carries megabytes of base64 (every face), and a regex that looks for a
	// selector before each `{` took 44 s on a single 300 KB face.
	const PSEUDO = /::[a-z-]+|:(?:before|after|first-line|first-letter)\b/i;
	for (let i = 0; i < css.length; i++) {
		const c = css.charCodeAt(i);
		if (c === 123) {
			// `{`: the text since the last brace is a selector or an at-rule prelude.
			const selectorStart = css.lastIndexOf('}', i - 1);
			const selector = css.slice(Math.max(selectorStart, css.lastIndexOf('{', i - 1)) + 1, i);
			const close = css.indexOf('}', i);
			const nested = css.indexOf('{', i + 1);
			if (close === -1) break;
			// A block holding another block is an at-rule (@media, @supports): its inner rules are read as the scan reaches them.
			if (nested !== -1 && nested < close) continue;
			if (selector.length < 2000 && PSEUDO.test(selector)) {
				const body = css.slice(i + 1, close);
				if (/(?:^|[;\s])font\s*:/i.test(body)) unresolved = true;
				for (const m of body.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
					const value = m[1]
						.replace(/!\s*important/gi, '')
						.replace(/\\\s/g, ' ')
						.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => {
							const got = String(lookup(name) || '').trim();
							if (!got) unresolved = true;
							return got;
						});
					families.push(value);
				}
			}
			// Skip the body: nothing inside a declaration block opens a rule.
			i = close;
		}
	}
	return { families, unresolved };
}

/** Every family named in a computed `font-family` stack of the slide, its descendants and their `::before`/`::after`: the faces a shot can draw with. */
function familiesDrawnBy(section, css) {
	const win = section.ownerDocument.defaultView;
	const used = new Set();
	const note = (stack) => {
		for (const f of String(stack || '').split(',')) {
			const name = f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
			if (name) used.add(name);
		}
	};
	const seen = new Set();
	for (const el of [section, ...section.querySelectorAll('*')]) {
		const stack = win.getComputedStyle(el).fontFamily;
		if (!seen.has(stack)) {
			seen.add(stack);
			note(stack);
		}
	}
	// A `::before` or `::after` may set its own face (an icon font, a counter's numerals), and reading a pseudo-element's computed style
	// costs a style recalculation per element: the sheet says which rules set one, so those families are kept without asking.
	// A `var(--x)` is resolved on the slide. One that does not resolve, or a `font:` shorthand, keeps every face: a missing face is a
	// slide drawn in the wrong font, and a spare one costs a few milliseconds.
	const lookup = (name) => win.getComputedStyle(section).getPropertyValue(name);
	const { families, unresolved } = pseudoElementFamilies(css, lookup);
	if (unresolved) return null;
	for (const f of families) note(f);
	return used;
}

/** A face's identity for the browser: family, weight, style, unicode-range. Two rules with one key draw the same text, so one of them is dead weight. */
function faceKey(face) {
	const pick = (prop) => face.match(new RegExp(`${prop}\\s*:\\s*([^;}]+)`, 'i'))?.[1]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase() ?? '';
	return `${pick('font-family')}|${pick('font-weight')}|${pick('font-style')}|${pick('font-stretch')}|${pick('unicode-range')}`;
}

/**
 * The page's CSS with the faces the host supplied (`fontCss`) taken out of it, where the host's rule has the same key. The Studio's page
 * inlines its faces AND hands the camera the same ones: both rode in every slide's SVG and the browser decoded each twice.
 */
export function withoutDuplicateFaces(pageText, hostText) {
	if (!hostText) return pageText;
	const host = new Set((hostText.match(/@font-face\s*\{[^}]*\}/g) || []).map(faceKey));
	return pageText.replace(/@font-face\s*\{[^}]*\}/g, (face) => (host.has(faceKey(face)) ? '' : face));
}

/**
 * A function that swaps each address in `data` for its data: URI in a piece of CSS text, in ONE pass (a slide's stylesheet is megabytes, and a pass
 * per address re-read all of it). Longest address first, so one that prefixes another is not cut short. Null when there is nothing to swap.
 * With `escaped` (the camera found an address spelled with escapes, `url(https\3a //x/a.png)`, whose literal text the pass cannot find), a
 * pass before it reads the `url(…)` spans and writes the data: URI over each one whose decoded target is still in `data`.
 * @param {Map<string, string | null>} data
 * @param {boolean} [escaped]
 * @returns {((css: string) => string) | null}
 */
export function urlSwap(data, escaped = false) {
	if (!data.size) return null;
	const to = new Map([...data].map(([u, d]) => [u, d ?? 'data:,']));
	const alternatives = [...to.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const re = new RegExp(alternatives.join('|'), 'g');
	const literal = (css) => css.replace(re, (hit) => to.get(hit));
	if (!escaped) return literal;
	// The span pass runs FIRST: an escaped address can hold a shorter address's literal text (`url(https://x/a.png?v\3d 1)`
	// holds `https://x/a.png`), and a literal pass run first would write that one's data inside it.
	return (css) => {
		let out = '';
		let at = 0;
		for (const sp of cssUrlSpans(css)) {
			const d = to.get(sp.value);
			if (d === undefined) continue;
			out += `${css.slice(at, sp.from)}url("${d.replace(/["\\\n]/g, encodeURIComponent)}")`;
			at = sp.to;
		}
		return literal(at ? out + css.slice(at) : css);
	};
}

// A web font the stylesheet names is the page's business (its @font-face rules ship as data already); it is not a picture the slide lost.
const FONT_URL = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i;
// Characters XML 1.0 cannot carry (a form feed pasted from Word, a lone surrogate): the SVG would not parse and the whole slide would fail.
// One native scan for the rare bad character, so a clean slide (nearly all of them) skips the loop below: the markup is megabytes of base64.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are exactly what this finds
const XML_ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/;
function stripXmlIllegal(text) {
	if (!XML_ILLEGAL.test(text)) return text;
	let out = '';
	let from = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		let bad = (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0xfffe || c === 0xffff;
		if (!bad && c >= 0xd800 && c <= 0xdbff) {
			const next = text.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff) i++; // a valid pair
			else bad = true;
		} else if (!bad && c >= 0xdc00 && c <= 0xdfff) bad = true;
		if (bad) {
			out += text.slice(from, i);
			from = i + 1;
		}
	}
	return from === 0 ? text : out + text.slice(from);
}

async function inlineAll(urls, toDataUri, onImageError) {
	const out = new Map();
	for (const url of urls) {
		try {
			out.set(url, await toDataUri(url));
		} catch {
			out.set(url, null);
			if (onImageError && !FONT_URL.test(url)) onImageError(url);
		}
	}
	return out;
}

function wrapperOf(src, cls, doc) {
	const el = doc.createElementNS(NS, 'div');
	for (const a of Array.from(src.attributes)) {
		if (a.name === 'class' || a.name === 'id') continue;
		try {
			el.setAttribute(a.name, a.value);
		} catch {
			// an attribute name XML refuses: it carries no style
		}
	}
	el.setAttribute('class', `${cls} __lc-wrap ${src.getAttribute('class') || ''}`.trim());
	return el;
}

// ── PICTURES AT THE SIZE THEY ARE DRAWN ───────────────────────────────────────────────────────────────
// A 12-megapixel phone photo in a 1,100-pixel box is shrunk about four times when the slide is drawn, and the BROWSER does
// that shrink inside the SVG image. Chromium filters it; WebKit (Safari, every iPhone browser) does not, so the photo comes out
// with grain that was never in it, and grain is what a JPEG cannot compress: the same slide's picture was 60% larger from
// WebKit than from Chromium (engineering/decisions/2026-11-03-pictures-at-drawn-size.md). So the camera shrinks each large
// picture ITSELF, before the draw, to the pixels it will cover, with a Lanczos-3 filter (lib/core/lanczos.mjs); the browser's
// own scaling and halving steps were both measured softer. The result is lossless PNG, so the shrink adds no compression of its own,
// and the slide draws the picture at 1:1 with no scaling left for the engine to do. A picture drawn at or near its own size
// is left alone.

/**
 * Shrink only when the picture has at least this many times the pixels it covers, on each side. Measured against the original resized
 * with Lanczos, the same photo content at each ratio, in the real camera: at 2x and above the camera's shrink wins on both engines
 * (WebKit at 3x: 49.2 dB and SSIM 0.9985 against the browser's 27.6 dB and 0.827); at 1.7x and 1.34x WebKit's own scaling is slightly
 * closer (41.3 against 40.7 dB, 41.8 against 38.2 dB). Below 2x the picture is left to the browser, as it always was
 * (decisions/2026-11-03-pictures-at-drawn-size.md).
 */
export const RESAMPLE_MIN_RATIO = 2;

/** Split a computed CSS list (`background-image`, `background-size`) at its top-level commas: a `data:` URL has commas of its own. */
export function splitCssList(value) {
	const out = [];
	let depth = 0;
	let quote = '';
	let from = 0;
	for (let i = 0; i < value.length; i++) {
		const c = value[i];
		if (quote) {
			if (c === '\\') i++;
			else if (c === quote) quote = '';
		} else if (c === '"' || c === "'") quote = c;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ',' && depth === 0) {
			out.push(value.slice(from, i).trim());
			from = i + 1;
		}
	}
	out.push(value.slice(from).trim());
	return out;
}

/** The address inside one `url(...)` layer (the browser's computed value), or null for a gradient or `none`. Exported for its unit test. */
export function layerUrl(layer) {
	const spans = cssUrlSpans(layer);
	return spans.length === 1 && spans[0].from === 0 && spans[0].to === layer.length ? spans[0].value : null;
}

/**
 * How many CSS pixels of box one natural pixel of a picture covers, for one background layer, or null when the size is not
 * one the camera can read (it then leaves the picture alone).
 * @param {string} size  one computed `background-size` layer: `cover`, `contain`, `auto`, or one or two lengths
 * @param {number} bw @param {number} bh  the box, in CSS pixels
 * @param {number} nw @param {number} nh  the picture's natural size
 */
export function backgroundScale(size, bw, bh, nw, nh) {
	if (!(nw > 0 && nh > 0)) return null;
	if (size === 'cover') return Math.max(bw / nw, bh / nh);
	if (size === 'contain') return Math.min(bw / nw, bh / nh);
	const parts = size.split(/\s+/);
	const len = (p, box) => (p === 'auto' ? null : p.endsWith('%') ? (parseFloat(p) / 100) * box : p.endsWith('px') ? parseFloat(p) : Number.NaN);
	const dw = len(parts[0], bw);
	const dh = len(parts[1] ?? 'auto', bh);
	if (Number.isNaN(dw) || Number.isNaN(dh)) return null;
	if (dw == null && dh == null) return 1;
	return Math.max(dw == null ? 0 : dw / nw, dh == null ? 0 : dh / nh);
}

/** The same for an `<img>`, by its `object-fit`. */
export function objectFitScale(fit, bw, bh, nw, nh) {
	if (!(nw > 0 && nh > 0)) return null;
	if (fit === 'none') return 1;
	if (fit === 'contain') return Math.min(bw / nw, bh / nh);
	if (fit === 'scale-down') return Math.min(1, bw / nw, bh / nh);
	// `fill` stretches each axis on its own; the larger of the two is the one the picture must keep.
	return Math.max(bw / nw, bh / nh);
}

/**
 * Every picture the LIVE slide draws that the camera can measure: the element's index in `[section, ...section.querySelectorAll('*')]`,
 * how it carries the picture (`src` of an `<img>`, or its inline `style` for a background), its address, and a function of the
 * picture's natural size giving CSS px of box per picture pixel. A use the camera cannot size reliably is left out, and an element
 * left out keeps its picture as it is.
 */
function drawnPictureUses(section, w) {
	const win = section.ownerDocument.defaultView;
	const sr = section.getBoundingClientRect();
	const unit = sr.width > 0 ? w / sr.width : 1;
	const uses = [];
	[section, ...section.querySelectorAll('*')].forEach((el, index) => {
		const r = el.getBoundingClientRect();
		if (!(r.width > 0 && r.height > 0)) return;
		const bw = r.width * unit;
		const bh = r.height * unit;
		const cs = win.getComputedStyle(el);
		// Pixel art and QR codes are drawn nearest-neighbor on purpose: a smoothing shrink would blur them.
		if (cs.imageRendering === 'pixelated' || cs.imageRendering === 'crisp-edges') return;
		if (el.localName === 'img') {
			const url = el.currentSrc || el.src;
			const fit = cs.objectFit;
			if (url) uses.push({ index, attr: 'src', url, scaleOf: (nw, nh) => objectFitScale(fit, bw, bh, nw, nh) });
			return;
		}
		if (!cs.backgroundImage || cs.backgroundImage === 'none') return;
		const layers = splitCssList(cs.backgroundImage);
		const sizes = splitCssList(cs.backgroundSize);
		const attach = splitCssList(cs.backgroundAttachment);
		const repeat = splitCssList(cs.backgroundRepeat);
		layers.forEach((layer, i) => {
			const url = layerUrl(layer);
			if (!url) return;
			// `fixed` sizes the picture against the viewport, not this box; `round` may stretch a tile up to 1.5x. Neither is the box's size.
			if (attach[i % attach.length] === 'fixed' || /\bround\b/.test(repeat[i % repeat.length])) return;
			const size = sizes[i % sizes.length];
			uses.push({ index, attr: 'style', url, scaleOf: (nw, nh) => backgroundScale(size, bw, bh, nw, nh) });
		});
	});
	return uses;
}

/** Rows the camera reads off the source picture at a time: a strip, never a full copy of a 12-megapixel photo. */
const RESAMPLE_STRIP = 64;

/**
 * A picture shrunk to `tw` x `th` with a Lanczos-3 filter (lib/core/lanczos.mjs), on a canvas. The source is read in strips off a
 * scratch canvas the strip's height, so the whole photo's pixels are never held at once. Halving steps and the browser's own scaling
 * were both measured softer: they kept 35 to 47% of the detail Lanczos keeps (decisions/2026-11-03-pictures-at-drawn-size.md).
 */
export function resamplePicture(img, nw, nh, tw, th, doc) {
	const scratch = doc.createElement('canvas');
	scratch.width = nw;
	scratch.height = Math.min(RESAMPLE_STRIP, nh);
	const sg = scratch.getContext('2d', { willReadFrequently: true });
	// Each strip is a 1:1 copy: no smoothing, so no engine can blend across a strip's seam.
	sg.imageSmoothingEnabled = false;
	const readRows = (y, n) => {
		sg.clearRect(0, 0, nw, scratch.height);
		sg.drawImage(img, 0, y, nw, n, 0, 0, nw, n);
		return sg.getImageData(0, 0, nw, n).data;
	};
	const pixels = lanczosResize(readRows, nw, nh, tw, th, scratch.height);
	scratch.width = 0;
	scratch.height = 0;
	const out = doc.createElement('canvas');
	out.width = tw;
	out.height = th;
	out.getContext('2d').putImageData(new ImageData(pixels, tw, th), 0, 0);
	return out;
}

function decodePicture(url, doc) {
	return new Promise((resolve, reject) => {
		const img = doc.createElement('img');
		img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
		img.onerror = reject;
		img.src = url;
	});
}

// The same photo on several slides is shrunk once per export, not once per slide: the last few results, by their picture and size.
const SHRUNK_MEMO = new Map();
const SHRUNK_MEMO_MAX = 6;

/**
 * For every picture the slide shows much smaller than its own size, a PNG `data:` URL of it at the pixels it covers, and which
 * elements to give it to. Uses are grouped by the picture's BYTES, not its address: two addresses for one photo (`a.jpg` and
 * `a.jpg?v=2`) are one picture, and the largest use decides its size, so no use is drawn from fewer pixels than it needs.
 * @param {Element} section  the live slide
 * @param {number} w  the slide's width in CSS px
 * @param {number} scale  device pixels per CSS pixel
 * @param {(url: string) => string|null|undefined} dataOf  the picture's bytes as a `data:` URL (the host's read), by its address
 * @returns {Promise<Array<{ from: string, to: string, uses: Array<{ index: number, attr: 'src'|'style' }> }>>}
 */
async function picturesAtDrawnSize(section, w, scale, dataOf) {
	const doc = section.ownerDocument;
	const byData = new Map();
	for (const use of drawnPictureUses(section, w)) {
		const data = use.url.startsWith('data:') ? use.url : dataOf(use.url);
		// A vector picture has no pixels to shrink; a picture the host could not read is the caller's to hide.
		if (!data || /^data:image\/svg/i.test(data)) continue;
		if (!byData.has(data)) byData.set(data, []);
		byData.get(data).push(use);
	}
	const out = [];
	for (const [data, uses] of byData) {
		try {
			const img = await decodePicture(data, doc);
			const nw = img.naturalWidth;
			const nh = img.naturalHeight;
			const k = Math.max(...uses.map((u) => u.scaleOf(nw, nh) ?? Number.POSITIVE_INFINITY));
			if (!Number.isFinite(k) || k <= 0) continue;
			const tw = Math.ceil(nw * k * scale);
			const th = Math.ceil(nh * k * scale);
			if (nw < tw * RESAMPLE_MIN_RATIO || nh < th * RESAMPLE_MIN_RATIO) continue;
			const key = `${tw}x${th}:${data}`;
			let to = SHRUNK_MEMO.get(key);
			if (!to) {
				const canvas = resamplePicture(img, nw, nh, tw, th, doc);
				to = canvas.toDataURL('image/png');
				canvas.width = 0;
				canvas.height = 0;
				SHRUNK_MEMO.set(key, to);
				while (SHRUNK_MEMO.size > SHRUNK_MEMO_MAX) SHRUNK_MEMO.delete(SHRUNK_MEMO.keys().next().value);
			}
			out.push({
				from: data,
				to,
				uses: uses.map(({ index, attr }) => ({ index, attr })),
			});
		} catch {
			// A picture that will not decode here is drawn as it is: never worse than before.
		}
	}
	return out;
}

/** Replace every occurrence of `from` in `text` with `to`. */
function swapData(text, from, to) {
	return text?.includes(from) ? text.split(from).join(to) : text;
}

/**
 * Photograph one slide onto a canvas.
 * @param {Element} section  the slide, laid out in a document
 * @param {object} [opts]
 * @param {number} [opts.scale]  device pixels per CSS pixel (default 1)
 * @param {'screen'|'export'} [opts.face]  default 'screen'
 * @param {string} [opts.fontCss]  `@font-face` rules the page cannot expose (fonts loaded through the FontFace API, or a cross-origin sheet)
 * @param {(url: string) => Promise<string>} [opts.toDataUri]  a picture's address to a `data:` URI; without it, only `data:` pictures draw
 * @param {boolean} [opts.opaque]  paint the page's own background behind the slide (a native screenshot does, so a rounded corner shows it); default transparent, like `omitBackground`
 * @param {(url: string) => void} [opts.onImageError]  called once per picture that could not be read; its `<img>` is hidden
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureSlideCanvas(section, opts = {}) {
	const { scale = 1, face = 'screen', fontCss = '', toDataUri = null, onImageError = null, opaque = false, settle = null } = opts;
	const doc = section.ownerDocument;
	const w = section.offsetWidth || section.getBoundingClientRect().width;
	const h = section.offsetHeight || section.getBoundingClientRect().height;

	// The chain from the slide up to <html>, cloned shallowly: the wrappers keep the ancestors' classes and attributes
	// (the deck's mode, its custom properties), and the slide is the only child on the way down.
	const chain = [];
	for (let e = section.parentElement; e; e = e.parentElement) chain.unshift(e);
	let top = null;
	let tip = null;
	for (const e of chain) {
		const node = e === doc.documentElement ? wrapperOf(e, ROOT, doc) : e === doc.body ? wrapperOf(e, BODY, doc) : doc.createElementNS(NS, e.localName);
		if (e !== doc.documentElement && e !== doc.body) {
			for (const a of Array.from(e.attributes)) {
				try {
					node.setAttribute(a.name, a.name === 'class' ? `__lc-wrap ${a.value}` : a.value);
				} catch {
					/* see wrapperOf */
				}
			}
			if (!e.hasAttribute('class')) node.setAttribute('class', '__lc-wrap');
		}
		if (tip) tip.appendChild(node);
		else top = node;
		tip = node;
	}
	const clone = section.cloneNode(true);
	// The clone's elements in the live slide's order, taken before anything below replaces one, so a measured live element finds its copy.
	const cloneEls = [clone, ...clone.querySelectorAll('*')];
	if (face === 'export') clone.classList.add('lattice-exporting');
	clone.style.transform = 'none';
	clone.style.margin = '0';

	// A live <canvas> clones as an empty one: take its pixels. A picture the host cannot read is hidden, not left broken.
	const liveCanvases = section.querySelectorAll('canvas');
	clone.querySelectorAll('canvas').forEach((c, i) => {
		try {
			const img = doc.createElementNS(NS, 'img');
			img.setAttribute('src', liveCanvases[i].toDataURL('image/png'));
			img.setAttribute('style', c.getAttribute('style') || '');
			img.setAttribute('class', c.getAttribute('class') || '');
			c.replaceWith(img);
		} catch {
			/* a tainted canvas draws as nothing */
		}
	});

	// Every picture the slide names, taken from the LIVE element (its resolved address, `currentSrc` for srcset and lazy swaps),
	// and written onto the clone's own element once the host has turned it into a data: URI.
	const need = new Set();
	const note = (u) => {
		if (u && REMOTE.test(u)) need.add(u);
	};
	const imgJobs = [];
	const livePics = section.querySelectorAll('img');
	clone.querySelectorAll('img').forEach((img, i) => {
		const live = livePics[i];
		const abs = (live && (live.currentSrc || live.src)) || '';
		img.removeAttribute('srcset');
		img.removeAttribute('sizes');
		img.removeAttribute('loading');
		if (abs && !abs.startsWith('data:')) {
			note(abs);
			imgJobs.push([img, abs, 'src']);
		} else if (abs) img.setAttribute('src', abs);
	});
	const liveSvgPics = section.querySelectorAll('image');
	clone.querySelectorAll('image').forEach((el, i) => {
		const live = liveSvgPics[i];
		const abs = live && (live.href?.baseVal ? new URL(live.href.baseVal, doc.baseURI).href : '');
		if (abs && !abs.startsWith('data:')) {
			note(abs);
			imgJobs.push([el, abs, el.hasAttribute('xlink:href') ? 'xlink:href' : 'href']);
		}
	});
	// <picture>: the <img> already carries the source the browser chose (its live `currentSrc`); a sibling <source srcset> would
	// win source selection again inside the SVG image and cannot load there.
	for (const src of clone.querySelectorAll('picture source')) src.remove();
	// <video>: its poster, as a picture (a video element paints nothing inside an SVG image).
	const liveVideos = section.querySelectorAll('video');
	clone.querySelectorAll('video').forEach((v, i) => {
		const abs = (liveVideos[i] && liveVideos[i].poster) || '';
		const img = doc.createElementNS(NS, 'img');
		img.setAttribute('alt', '');
		img.setAttribute('class', v.getAttribute('class') || '');
		img.setAttribute('style', `${v.getAttribute('style') || ''};object-fit:${liveVideos[i] ? doc.defaultView.getComputedStyle(liveVideos[i]).objectFit : 'contain'}`);
		if (abs && !abs.startsWith('data:')) {
			note(abs);
			imgJobs.push([img, abs, 'src']);
		} else if (abs) img.setAttribute('src', abs);
		v.replaceWith(img);
	});
	// A relative address in the slide's own CSS (an author <style>, an inline style, Marp's `backgroundImage:`) is made absolute.
	for (const el of [clone, ...clone.querySelectorAll('[style]')]) {
		const st = el.getAttribute('style');
		if (st?.includes('(')) el.setAttribute('style', absolutizeCssUrls(st, doc.baseURI));
	}
	clone.querySelectorAll('style').forEach((st) => {
		if (st.textContent.includes('(')) st.textContent = absolutizeCssUrls(st.textContent, doc.baseURI);
	});
	// The document may ask for families to be left out (`data-lattice-omit-fonts`, a comma list): see `withoutFontFaces`.
	const omit = (doc.documentElement.getAttribute('data-lattice-omit-fonts') || '').split(',');
	const rawSheet = withoutFontFaces(withoutDuplicateFaces(pageCss(doc), fontCss) + (fontCss ? `\n${fontCss}` : ''), omit);
	const sheetText = onlyUsedFontFaces(rawSheet, familiesDrawnBy(section, rawSheet));


	// Pictures named from CSS (a background, a mask) live in the page's stylesheet or the slide's inline styles.
	// A face split by `unicode-range` (the emoji font's 11 slices) is fetched and inlined only when the slide shows a character in its range:
	// inlining all of them into every slide's SVG would cost megabytes a shot for a slide with no emoji.
	const unused = unusedRangeFaceUrls(sheetText, `${clone.textContent || ''}\n${pseudoContentText(section)}`);
	// Read where an address can sit as CSS (the sheet, the clone's inline styles and its <style> elements), the places the swap
	// below writes. A spelling the literal swap cannot find (an escaped address, `url(https\3a //…)`) is swapped by its span.
	const cssAt = [sheetText];
	for (const el of [clone, ...clone.querySelectorAll('[style]')]) cssAt.push(el.getAttribute('style') || '');
	for (const st of clone.querySelectorAll('style')) cssAt.push(st.textContent || '');
	let escapedAddress = false;
	cssAt.forEach((css, i) => {
		for (const sp of cssUrlSpans(css)) {
			if (i === 0 && unused.has(sp.value)) continue;
			if (!REMOTE.test(sp.value)) continue;
			note(sp.value);
			if (!css.slice(sp.from, sp.to).includes(sp.value)) escapedAddress = true;
		}
	});
	const data = toDataUri ? await inlineAll(need, toDataUri, onImageError) : new Map();
	if (!toDataUri) for (const u of need) if (onImageError) onImageError(u);
	// Each large picture at the pixels it covers, before the draw (see PICTURES AT THE SIZE THEY ARE DRAWN above). Only the elements
	// that were measured get the shrunk copy; any other use of the same picture (a mask, a pseudo-element, the stylesheet) keeps it whole.
	const shrunk = await picturesAtDrawnSize(section, w, scale, (u) => data.get(u));
	// An <img> or <image> whose picture the host could not read is hidden, so the browser's broken-image glyph and the alt text never ship.
	for (const [el, abs, attr] of imgJobs) {
		const d = data.get(abs);
		if (d) el.setAttribute(attr, d);
		else {
			el.removeAttribute(attr);
			el.setAttribute('style', `${el.getAttribute('style') || ''};visibility:hidden`);
		}
	}

	// Pictures named from CSS are swapped for their data in the places an address can sit as CSS: the sheet, the slide's <style> elements and
	// its inline styles. Never in the markup as a whole, where the same text can be a word on the slide (a photo credit that quotes the
	// picture's address) and would be overwritten by megabytes of base64.
	const swap = urlSwap(data, escapedAddress);
	let sheet = sheetText;
	if (swap) {
		sheet = swap(sheetText);
		for (const el of [clone, ...clone.querySelectorAll('[style]')]) {
			const st = el.getAttribute('style');
			if (st) el.setAttribute('style', swap(st));
		}
		clone.querySelectorAll('style').forEach((st) => {
			st.textContent = swap(st.textContent);
		});
	}
	for (const { from, to, uses } of shrunk) {
		for (const { index, attr } of uses) {
			const el = cloneEls[index];
			const v = el?.getAttribute(attr);
			if (v) el.setAttribute(attr, swapData(v, from, to));
		}
	}

	let xhtml = '';
	{
		const host = tip || doc.createElementNS(NS, 'div');
		if (!tip) top = host;
		host.appendChild(clone);
		const style = doc.createElementNS(NS, 'style');
		style.textContent = `${sheet}\n${ISOLATE}`;
		top.insertBefore(style, top.firstChild);
		// Page-level SVG <defs> (the accessibility and print texture patterns, shared gradients) sit OUTSIDE the slide, and a fill
		// of `url(#latt-a11y-tex-3)` points at them: without them every textured wedge and swatch comes out empty.
		for (const s of doc.querySelectorAll('svg')) {
			if (s.closest('section') || !s.querySelector(':scope > defs')) continue;
			top.insertBefore(s.cloneNode(true), style.nextSibling);
		}
		xhtml = stripXmlIllegal(new XMLSerializer().serializeToString(top));
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
	// A data: URL, not a blob: one: a blob: image taints the canvas (foreignObject content is cross-origin to it), and from a file://
	// page it is cross-origin outright. The browser writes the base64 itself: a slide's SVG is megabytes, and encoding it in script
	// (a binary string, then btoa) cost more than drawing it.
	const img = new Image();
	img.src = await new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.onerror = () => reject(r.error);
		r.readAsDataURL(new Blob([svg], { type: 'image/svg+xml' }));
	});
	await img.decode();
	const drawSlide = () => {
		const canvas = doc.createElement('canvas');
		canvas.width = Math.max(1, Math.round(w * scale));
		canvas.height = Math.max(1, Math.round(h * scale));
		const g = canvas.getContext('2d');
		if (opaque) {
			// What a native screenshot shows behind a rounded corner: the body's background, else the root's, else white.
			const win = doc.defaultView;
			const clear = (c) => !c || c === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c);
			const bg = [doc.body, doc.documentElement].map((e) => win.getComputedStyle(e).backgroundColor).find((c) => !clear(c));
			g.fillStyle = bg || '#fff';
			g.fillRect(0, 0, canvas.width, canvas.height);
		}
		g.scale(canvas.width / w, canvas.height / h);
		g.drawImage(img, 0, 0, w, h);
		// THE DRAW IS DONE BEFORE THE CANVAS LEAVES. WebKit records a canvas's drawing and runs it later, and
		// `createImageBitmap(canvas)` (the Studio's encode workers) can take the canvas before that has run: it then gets
		// whatever the canvas's memory held, blank, or the previous slide when WebKit reused it. An iPhone's LibreOffice
		// file repeated slide 2's picture on every slide after it, and its PowerPoint title slide came out black. Reading
		// one pixel back makes WebKit run the drawing now (decisions/2026-11-03-pictures-at-drawn-size.md).
		g.getImageData(0, 0, 1, 1);
		return canvas;
	};
	// A host whose engine decodes a nested picture only after the first draw (WebKit) supplies `settle`, which waits for the pictures
	// and draws again; everywhere else it is one draw.
	return settle ? settle(svg, drawSlide) : drawSlide();
}

// The PNG and JPEG writers live in lib/core/canvas-encode.mjs (the encode worker imports them without the camera).
export { encodeCanvas, encodePng };


/**
 * Photograph one slide and encode it. PNG, or JPEG or WebP at `quality` (1 to 100); a JPEG is drawn on white, since it has no alpha.
 * @returns {Promise<{ bytes: Uint8Array, type: 'png'|'jpeg'|'webp' }>}
 */
export async function captureSlide(section, { type = 'png', quality, fastPng = false, ...rest } = {}) {
	// No default quality here: the number is the image policy's (lib/core/image-policy.js), and a second copy would not follow a change to it.
	if (type !== 'png' && !Number.isFinite(quality)) throw new TypeError('captureSlide: a jpeg or webp shot needs a quality from the image policy');
	const canvas = await captureSlideCanvas(section, rest);
	if (type === 'png' || type === 'jpeg') return { bytes: await encodeCanvas(canvas, { type, quality, fast: fastPng }), type };
	if (type !== 'webp') throw new TypeError(`captureSlide: unknown type ${type}`);
	// WebP has no shared writer: it is an image set's opt-in format, and the browser's encoder is the only one there is.
	const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob returned null'))), 'image/webp', quality / 100));
	return { bytes: new Uint8Array(await blob.arrayBuffer()), type };
}
