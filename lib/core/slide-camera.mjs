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

import { encodeJpegCanvas } from './jpeg-encode.mjs';

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
const REL_URL = /url\(\s*(["']?)(?![a-z][a-z0-9+.-]*:|#)([^)"']+?)\1\s*\)/gi;
function absolutizeCssUrls(text, base) {
	if (!text.includes('url(')) return text;
	return text.replace(REL_URL, (whole, _q, ref) => {
		try {
			return `url("${new URL(ref.trim(), base).href}")`;
		} catch {
			return whole;
		}
	});
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
	const text = absolutizeCssUrls(src, doc.baseURI)
		.replace(/:root\b/g, `.${ROOT}`)
		.replace(/(^|[\s,{}>+~(])html\b(?![-\w])/g, `$1.${ROOT}`)
		.replace(/(^|[\s,{}>+~(])body\b(?![-\w])/g, `$1.${BODY}`);
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
		for (const m of face[0].matchAll(CSS_URL)) out.add(m[2]);
	}
	return out;
}

/**
 * The CSS with every `@font-face` rule of the named families removed, so the browser draws those characters with the machine's own font.
 * `fonts: system-emoji` rides on this: the export's page carries Noto Color Emoji, and a picture export honors the tier by leaving it out.
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
 * @param {Map<string, string | null>} data
 * @returns {((css: string) => string) | null}
 */
export function urlSwap(data) {
	if (!data.size) return null;
	const to = new Map([...data].map(([u, d]) => [u, d ?? 'data:,']));
	const alternatives = [...to.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const re = new RegExp(alternatives.join('|'), 'g');
	return (css) => css.replace(re, (hit) => to.get(hit));
}

const CSS_URL = /url\(\s*(&quot;|&#39;|["']?)((?:file|blob|https?):[^)"']+?)\1\s*\)/gi;
const unescapeXml = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

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
		if (st && st.includes('url(')) el.setAttribute('style', absolutizeCssUrls(st, doc.baseURI));
	}
	clone.querySelectorAll('style').forEach((st) => {
		if (st.textContent.includes('url(')) st.textContent = absolutizeCssUrls(st.textContent, doc.baseURI);
	});
	// The document may ask for families to be left out (`data-lattice-omit-fonts`, a comma list): see `withoutFontFaces`.
	const omit = (doc.documentElement.getAttribute('data-lattice-omit-fonts') || '').split(',');
	const rawSheet = withoutFontFaces(withoutDuplicateFaces(pageCss(doc), fontCss) + (fontCss ? `\n${fontCss}` : ''), omit);
	const sheetText = onlyUsedFontFaces(rawSheet, familiesDrawnBy(section, rawSheet));


	// Pictures named from CSS (a background, a mask) live in the page's stylesheet or the slide's inline styles.
	// A face split by `unicode-range` (the emoji font's 11 slices) is fetched and inlined only when the slide shows a character in its range:
	// inlining all of them into every slide's SVG would cost megabytes a shot for a slide with no emoji.
	const unused = unusedRangeFaceUrls(sheetText, clone.textContent || '');
	for (const m of sheetText.matchAll(CSS_URL)) if (!unused.has(m[2])) note(m[2]);
	for (const m of new XMLSerializer().serializeToString(clone).matchAll(CSS_URL)) note(unescapeXml(m[2]));
	const data = toDataUri ? await inlineAll(need, toDataUri, onImageError) : new Map();
	if (!toDataUri) for (const u of need) if (onImageError) onImageError(u);
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
	const swap = urlSwap(data);
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
		return canvas;
	};
	// A host whose engine decodes a nested picture only after the first draw (WebKit) supplies `settle`, which waits for the pictures
	// and draws again; everywhere else it is one draw.
	return settle ? settle(svg, drawSlide) : drawSlide();
}

// ── PNG ENCODER ──────────────────────────────────────────────────────────────────────────────────────
// `canvas.toBlob('image/png')` compresses lightly (a 52-slide deck came out 40% larger than Chrome's own screenshot
// encoder wrote it), and the Studio's PNGs paid that price for every export. This writes the same pixels with a
// per-row adaptive filter and the platform's deflate: opaque slides as 8-bit RGB (3 bytes a pixel, and the PDF writer's
// direct-embed path reads it as it is), slides with transparency as RGBA. One encoder, so both hosts write one file.
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(bytes, start, end) {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Rows read from the canvas, filtered and deflated at a time: the encoder holds a band, never the whole picture (a 4K slide is 33 MB of pixels). */
const PNG_BAND = 64;

/** PNG bytes for a canvas, smaller than the browser's own encoder writes. */
export async function encodePng(canvas, { fast = false } = {}) {
	const { width: W, height: H } = canvas;
	// No CompressionStream (Safari before 16.4): the browser's own PNG, larger but never a lost export.
	if (typeof CompressionStream !== 'function') {
		const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob returned null'))), 'image/png'));
		return new Uint8Array(await blob.arrayBuffer());
	}
	// Bands are read through a small scratch canvas, not from `canvas` itself: a hundred readbacks of one canvas make the browser warn and
	// move that canvas to the CPU, and the scratch is one band tall, never a second copy of the picture.
	const scratch = canvas.ownerDocument ? canvas.ownerDocument.createElement('canvas') : new OffscreenCanvas(W, Math.min(PNG_BAND, H));
	scratch.width = W;
	scratch.height = Math.min(PNG_BAND, H);
	const sg = scratch.getContext('2d', { willReadFrequently: true });
	const band = (y0, rows) => {
		sg.clearRect(0, 0, W, rows);
		sg.drawImage(canvas, 0, y0, W, rows, 0, 0, W, rows);
		return sg.getImageData(0, 0, W, rows);
	};
	// Opaque first (nearly every slide): one pass over the pixels. A pixel with alpha found on the way ends that attempt and the RGBA one starts.
	const attempt = async (opaque) => {
		const bpp = opaque ? 3 : 4;
		const stride = W * bpp;
		// Deflate as the bands arrive; the output is read at the same time so a full pipe never stalls the writer.
		const cs = new CompressionStream('deflate');
		const writer = cs.writable.getWriter();
		const pieces = [];
		const reading = (async () => {
			const r = cs.readable.getReader();
			for (;;) {
				const { done, value } = await r.read();
				if (done) return;
				pieces.push(value);
			}
		})();
		let row = new Uint8Array(stride);
		let up = new Uint8Array(stride);
		for (let y0 = 0; y0 < H; y0 += PNG_BAND) {
			const rows = Math.min(PNG_BAND, H - y0);
			const d = band(y0, rows).data;
			const out = new Uint8Array((stride + 1) * rows);
			for (let r = 0; r < rows; r++) {
				if (opaque) {
						for (let i = r * W * 4, o = 0, end = i + W * 4; i < end; i += 4) {
							if (d[i + 3] !== 255) {
								writer.abort().catch(() => {});
								reading.catch(() => {});
								return null;
							}
							row[o++] = d[i];
							row[o++] = d[i + 1];
							row[o++] = d[i + 2];
						}
					}
				else row.set(d.subarray(r * stride, (r + 1) * stride));
				// Pick the filter with the smallest sum of absolute (signed) residuals, all five in ONE pass over the row.
				// `fast`: Sub for every row, no search: about 3x quicker and larger, for the test suites that render hundreds of decks.
				let best;
					if (fast) best = 1;
				else {
					let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
					for (let x = 0; x < stride; x++) {
						const v = row[x];
						const a = x >= bpp ? row[x - bpp] : 0;
						const b = up[x];
						const c = x >= bpp ? up[x - bpp] : 0;
						const p = a + b - c;
						const pa = Math.abs(p - a);
						const pb = Math.abs(p - b);
						const pc = Math.abs(p - c);
						const e0 = v;
						const e1 = (v - a) & 0xff;
						const e2 = (v - b) & 0xff;
						const e3 = (v - ((a + b) >> 1)) & 0xff;
						const e4 = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
						s0 += e0 < 128 ? e0 : 256 - e0;
						s1 += e1 < 128 ? e1 : 256 - e1;
						s2 += e2 < 128 ? e2 : 256 - e2;
						s3 += e3 < 128 ? e3 : 256 - e3;
						s4 += e4 < 128 ? e4 : 256 - e4;
					}
					let bestSum = s0;
					best = 0;
					if (s1 < bestSum) { bestSum = s1; best = 1; }
					if (s2 < bestSum) { bestSum = s2; best = 2; }
					if (s3 < bestSum) { bestSum = s3; best = 3; }
					if (s4 < bestSum) best = 4;
				}
				const at = r * (stride + 1);
				out[at] = best;
				for (let x = 0; x < stride; x++) {
					const v = row[x];
					const a = x >= bpp ? row[x - bpp] : 0;
					const b = up[x];
					let e;
					if (best === 0) e = v;
					else if (best === 1) e = v - a;
					else if (best === 2) e = v - b;
					else if (best === 3) e = v - ((a + b) >> 1);
					else {
						const c = x >= bpp ? up[x - bpp] : 0;
						const p = a + b - c;
						const pa = Math.abs(p - a);
						const pb = Math.abs(p - b);
						const pc = Math.abs(p - c);
						e = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
					}
					out[at + 1 + x] = e;
				}
				const t = up;
				up = row;
				row = t;
			}
			await writer.write(out);
		}
		await writer.close();
		await reading;
		const idat = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
		let off = 0;
		for (const p of pieces) { idat.set(p, off); off += p.length; }
		const chunk = (type, data) => {
			const b = new Uint8Array(12 + data.length);
			const dv = new DataView(b.buffer);
			dv.setUint32(0, data.length);
			for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
			b.set(data, 8);
			dv.setUint32(8 + data.length, crc32(b, 4, 8 + data.length));
			return b;
		};
		const ihdr = new Uint8Array(13);
		const dv = new DataView(ihdr.buffer);
		dv.setUint32(0, W);
		dv.setUint32(4, H);
		ihdr[8] = 8;
		ihdr[9] = opaque ? 2 : 6;
		const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
		const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
		let at = 0;
		for (const p of parts) { png.set(p, at); at += p.length; }

		return png;
	};
	return (await attempt(true)) ?? attempt(false);
}

/**
 * A canvas's bytes in the export's format: the shared PNG writer, or the shared JPEG writer (lib/core/jpeg-encode.mjs) with
 * transparency on white. Every export picture goes through here, so no picture's bytes depend on the browser that drew it.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {{ type?: 'png'|'jpeg', quality?: number, fast?: boolean }} [format]  quality 1 to 100, for a JPEG
 * @returns {Promise<Uint8Array>}
 */
export async function encodeCanvas(canvas, { type = 'png', quality, fast = false } = {}) {
	if (type === 'jpeg') return encodeJpegCanvas(canvas, { quality });
	if (type !== 'png') throw new TypeError(`encodeCanvas: no shared writer for ${type}`);
	return encodePng(canvas, { fast });
}

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
