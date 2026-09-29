/**
 * lib/export/inline-url-media.mjs
 *
 * Embed the pictures a deck references BY URL into the markup, as `data:` URIs, so a
 * self-contained export shows them. The Studio's player export is the caller today.
 *
 * ── Why the player needs it ──────────────────────────────────────────────────
 * The exported player's content-security policy is `img-src data: blob:` and nothing else
 * (lib/core/subresource-csp.mjs): a deck must not make its reader's browser fetch anything on
 * open. So every picture the file shows has to be IN the file. The CLI bakes local `file://`
 * images (lib/export/html-player.js `inlineFileUrls`); the Studio had no such step, so an
 * `![bg](/images/x.jpg)` panel and a video `poster` came out blank in the player while the
 * Studio preview showed them (followup 2358-p2).
 *
 * ── What it embeds, and what it does not ─────────────────────────────────────
 * Pictures only: `<img src>`, SVG `<image href>`, `<video poster>`, and every `url()` in an
 * inline `style` attribute or a `<style>` block (a `![bg]` panel and a video poster are both
 * inline `background-image`). `@font-face` sources are left alone: fonts ride their own path.
 * So is a custom property: the engine writes each background twice, once as the real
 * declaration and once as `--background-image:"url(\"…\")"`, a STRING that only looks like a
 * `url()`. Video and audio FILES are not embedded — a clip can be hundreds of megabytes. An
 * `<img srcset>` naming a picture we fetch is dropped once its `src` is embedded: the browser
 * prefers the srcset, and the policy would refuse every candidate in it.
 *
 * A URL is fetched only when its origin is in `origins`. The caller decides that list, because
 * a fetch at export time is a request made on the author's behalf; the Studio passes its own
 * origin. A web URL outside the list is left exactly as written, for the caller's placeholder
 * pass (lib/core/remote-ref.js `blockWebImages`) to draw and count.
 *
 * A picture it could NOT embed — a failed fetch, a response that is not an image, one over the
 * size limits — is listed in `missing` with its reason, and its reference is written back as the
 * ABSOLUTE URL. That second part is what lets the placeholder pass draw it: a relative address
 * is invisible to that pass, so it shipped as-is and the reader got a broken-image mark.
 *
 * Pure: no DOM, no `fetch`. The transport is the injected `fetchDataUri`, so the same scan
 * runs under the unit tests and in the browser.
 */

// Any start tag, its quoted attribute values read whole so a `>` inside one does not end it.
const TAG = /<([a-z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
// ONE attribute, value consumed whole. Walking a tag attribute by attribute is what keeps
// `alt="a src=/x.png"` an alt: a pattern searched across the whole tag found a `src=` in it.
// `[\s/]`: the HTML parser takes a `/` as a separator too, so `<img/src=…>` has a src.
const ATTR = /([\s/]+)([^\s"'>/=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]*))?/g;
const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
// A plain `url(…)`, bare or quoted, with its quotes possibly spelled as entities (an attribute).
const CSS_URL = /url\(\s*(&quot;|&#39;|&#34;|&#x27;|["']?)([^"'()]*?)\1\s*\)/gi;
// The CSS a picture scan must not read: `@font-face` blocks, and custom-property declarations.
// Entities are decoded before this runs on an attribute, so `;` is a real declaration end.
const NOT_PICTURES = /(@font-face\s*\{[^}]*\}|--[\w-]+\s*:[^;{}]*)/i;

/** Which attribute of which element names a picture. */
function isPictureAttr(el, attr) {
	if (el === 'img') return attr === 'src';
	if (el === 'video') return attr === 'poster';
	if (el === 'image') return attr === 'href' || attr === 'xlink:href';
	return false;
}

const decode = (v) =>
	String(v)
		.replace(/&quot;|&#34;|&#x22;/gi, '"')
		.replace(/&#39;|&#x27;|&apos;/gi, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
const encodeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unquote = (v) => v.replace(/^["']|["']$/g, '');

/** Rewrite each attribute of every start tag: `fn(el, name, value)` returns a new value or null. */
function mapAttrs(html, fn) {
	return html.replace(TAG, (tag, name, rest) => {
		const el = name.toLowerCase();
		let changed = false;
		const next = rest.replace(ATTR, (whole, sp, attr, eq, quoted) => {
			if (quoted === undefined) return whole;
			const v = decode(unquote(quoted));
			const out = fn(el, attr.toLowerCase(), v);
			if (out === null || out === undefined || out === v) return whole;
			changed = true;
			return `${sp}${attr}${eq}"${encodeAttr(out)}"`;
		});
		return changed ? `<${name}${next}>` : tag;
	});
}

/** `fn` over each `url()` target in the picture-bearing parts of a CSS text. */
function mapCssUrls(css, fn) {
	return String(css)
		.split(NOT_PICTURES)
		.map((part, i) =>
			i % 2
				? part
				: part.replace(CSS_URL, (whole, q, raw) => {
						const out = fn(decode(raw));
						if (!out) return whole;
						// A quoted spelling keeps its quote. A bare one stays bare for a base64 URI, which
						// carries no quote, paren or space; an absolute URL written back on a failure is
						// quoted, since it may carry characters a bare url() cannot.
						const qq = q.length === 1 ? q : q ? decode(q) : out.startsWith('data:') ? '' : "'";
						return `url(${qq}${out}${qq})`;
					}),
		)
		.join('');
}

/**
 * @param {string} html  slide markup
 * @param {object} opts
 * @param {string} opts.baseUrl  what a relative URL resolves against (the page the preview ran on)
 * @param {Iterable<string>} opts.origins  origins it may fetch from (`https://host[:port]`)
 * @param {(url: string) => Promise<{ dataUri?: string, reason?: string }>} opts.fetchDataUri
 *   fetch one absolute URL; resolve `{ dataUri }` for an image, `{ reason }` for anything else
 * @param {Map<string, Promise<{ dataUri?: string, reason?: string }>>} [opts.cache]
 *   shared across calls, so a second render of the same deck fetches nothing twice
 * @param {number} [opts.concurrency]  fetches in flight at once
 * @param {number} [opts.maxTotalBytes]  the embedded pictures' combined size; past it, the rest
 *   are reported rather than embedded, so a deck of photographs cannot grow the file without end
 * @returns {Promise<{ html: string, count: number, bytes: number, missing: Array<{ url: string, reason: string }> }>}
 */
export async function inlineUrlMedia(html, { baseUrl, origins, fetchDataUri, cache = new Map(), concurrency = 6, maxTotalBytes = 48 * 1024 * 1024 }) {
	const allow = new Set(origins);
	const src = String(html ?? '');

	/** The absolute URL to fetch for a reference, or null when it is not ours to fetch. */
	const target = (value) => {
		const v = String(value ?? '').trim();
		// A backslash or a quote is an ESCAPED spelling (the engine's `--background-image` string
		// is one); the URL parser would read `\"` as a path, so it is never a fetch of ours.
		if (!v || /^(data|blob):/i.test(v) || v.startsWith('#') || /["'\\]/.test(v)) return null;
		let u;
		try {
			u = new URL(v, baseUrl);
		} catch {
			return null;
		}
		if (!/^https?:$/.test(u.protocol) || !allow.has(u.origin)) return null;
		return u.href;
	};

	// Pass 1: collect every reference we will fetch, by walking the same structure pass 3 rewrites.
	const wanted = new Set();
	const note = (v) => {
		const t = target(v);
		if (t) wanted.add(t);
		return null;
	};
	const scan = (swap) =>
		mapAttrs(
			src.replace(STYLE_BLOCK, (whole, open, body, close) => {
				const next = mapCssUrls(body, swap);
				return next === body ? whole : `${open}${next}${close}`;
			}),
			(el, attr, v) => {
				if (isPictureAttr(el, attr)) return swap(v);
				if (attr === 'style') return mapCssUrls(v, swap);
				return null;
			},
		);
	scan(note);

	// Pass 2: fetch each distinct URL once, a few at a time, inside the total budget.
	const results = new Map();
	const queue = [...wanted];
	let bytes = 0;
	const worker = async () => {
		while (queue.length) {
			const url = queue.shift();
			if (!cache.has(url)) cache.set(url, Promise.resolve().then(() => fetchDataUri(url)).catch((e) => ({ reason: String(e?.message || e || 'fetch failed') })));
			const r = await cache.get(url);
			const size = r?.dataUri ? r.dataUri.length : 0;
			if (size && bytes + size > maxTotalBytes) {
				results.set(url, { reason: `over the export's ${Math.round(maxTotalBytes / 1048576)} MB picture budget` });
				continue;
			}
			bytes += size;
			results.set(url, r || { reason: 'fetch failed' });
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

	const missing = [];
	let count = 0;
	for (const url of wanted) {
		const r = results.get(url);
		if (r?.dataUri) count++;
		else missing.push({ url, reason: r?.reason || 'fetch failed' });
	}

	// Pass 3: rewrite. Embedded → the data: URI; failed → the absolute URL (see the header).
	const swap = (v) => {
		const t = target(v);
		if (!t) return null;
		return results.get(t)?.dataUri || t;
	};
	let out = scan(swap);
	// An `<img srcset>` that names a picture of ours goes once the `src` beside it is embedded.
	out = out.replace(TAG, (tag, name, rest) => {
		if (name.toLowerCase() !== 'img') return tag;
		let hasData = false;
		let setAttr = null;
		for (const m of rest.matchAll(ATTR)) {
			const a = m[2].toLowerCase();
			const v = m[4] === undefined ? '' : decode(unquote(m[4]));
			if (a === 'src' && v.startsWith('data:image/')) hasData = true;
			if (a === 'srcset') setAttr = { whole: m[0], v };
		}
		if (!hasData || !setAttr) return tag;
		const ours = setAttr.v
			.split(',')
			.map((c) => c.trim().split(/\s+/)[0])
			.some((c) => target(c));
		return ours ? `<${name}${rest.replace(setAttr.whole, '')}>` : tag;
	});
	return { html: out, count, bytes, missing };
}

/**
 * The completion-toast line for the pictures an export could not carry, or undefined when every
 * one made it. `missing` failed to embed; `webOrigins` are the sites whose pictures the
 * placeholder pass drew. `ownOrigin` is dropped from that list, because a picture of ours reaching
 * the placeholder is one that failed to embed, and `missing` already names it with its reason.
 *
 * @param {ReadonlyArray<{ url: string, reason: string }>} missing
 * @param {ReadonlyArray<string>} webOrigins
 * @param {string} [ownOrigin]
 * @returns {string|undefined}
 */
export function describeMissingMedia(missing, webOrigins, ownOrigin) {
	const parts = [];
	if (missing.length) {
		const first = missing[0];
		const name = first.url.replace(/^[a-z]+:\/\/[^/]+/i, '');
		const n = missing.length;
		parts.push(`${n} ${n === 1 ? 'image' : 'images'} could not be embedded (${name}: ${first.reason}${n > 1 ? `, and ${n - 1} more` : ''})`);
	}
	const sites = webOrigins.filter((o) => o !== ownOrigin).map((o) => o.replace(/^https?:\/\//, ''));
	if (sites.length) parts.push(`images from ${sites.join(', ')} ship as placeholders, since the export fetches only from this site`);
	return parts.length ? parts.join('; ') : undefined;
}

/**
 * The browser transport: fetch one URL and read it as a base64 `data:` URI. Refuses anything that
 * is not an image — a static host answers a missing file with its HTML 404 page, and that must be
 * reported, not embedded — anything over `maxBytes`, which would bloat the file past what a
 * reader can open on a phone, and a request that has not answered within `timeoutMs`, so one
 * stalled picture cannot hang the export on its status line.
 *
 * @param {typeof fetch} fetchImpl
 * @param {{ maxBytes?: number, timeoutMs?: number }} [opts]
 */
export function browserFetchDataUri(fetchImpl, { maxBytes = 8 * 1024 * 1024, timeoutMs = 20_000 } = {}) {
	const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
	return async (url) => {
		const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
		const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
		try {
			let res;
			try {
				res = await fetchImpl(url, { credentials: 'same-origin', signal: ctrl?.signal });
			} catch (e) {
				return { reason: ctrl?.signal.aborted ? `no answer within ${timeoutMs / 1000}s` : `could not be fetched (${e?.message || 'network error'})` };
			}
			if (!res.ok) return { reason: `the server answered ${res.status}` };
			const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
			// The type goes into the data: URI verbatim, so it must be a bare type and nothing more.
			if (!/^image\/[a-z0-9.+-]+$/.test(type)) return { reason: `not an image (${type || 'no content type'})` };
			const declared = Number(res.headers.get('content-length'));
			if (declared > maxBytes) return { reason: `too large to embed (${mb(declared)})` };
			const buf = new Uint8Array(await res.arrayBuffer());
			if (buf.byteLength > maxBytes) return { reason: `too large to embed (${mb(buf.byteLength)})` };
			let bin = '';
			for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
			return { dataUri: `data:${type};base64,${btoa(bin)}` };
		} catch (e) {
			return { reason: ctrl?.signal.aborted ? `no answer within ${timeoutMs / 1000}s` : `could not be read (${e?.message || 'error'})` };
		} finally {
			if (timer) clearTimeout(timer);
		}
	};
}
