/**
 * video-providers.mjs — THE video provider registry. One ordered table of
 * provider descriptors, shared by every surface that has to answer a question
 * about a video URL.
 *
 * ── WHY THIS IS ONE FILE ─────────────────────────────────────────────────────
 *
 * It used to be two. `lib/engine/video-providers.js` answered "who hosts this,
 * and where does the poster link go" for the static render; `video-overlay.js`
 * answered "what iframe src plays it" for the parent-hosted lightbox, with its
 * OWN id regexes. Same four providers, two tables, no shared kernel — so adding
 * one meant two edits in unrelated trees, and missing the second degraded
 * playback to "opens a tab" with nothing going red (HARD RULE #1).
 *
 * They had also DRIFTED, in four places, and merging them is what forced each
 * disagreement to become a decision instead of an accident:
 *
 *   - YouTube id: `[\w-]{6,}` (engine) vs `[\w-]{11}` (overlay). **11 wins** —
 *     every YouTube id is 11 chars, and the overlay's security test asserts the
 *     built src carries `[\w-]{11}`. The looser form bought nothing and widened
 *     what could reach a player src.
 *   - YouTube forms: the engine knew `live/`, the overlay knew `-nocookie` and
 *     `watch?list=…&v=`. **Union** — both were right about different URLs.
 *   - Vimeo id: `\d{5,}` (engine) vs `\d+` (overlay). **`\d{5,}` wins** — it is
 *     the one that cannot match a bare year in a path segment. It costs the lightbox
 *     a four-digit id (a pre-2006 Vimeo upload), which now falls back to opening a
 *     tab instead of playing inline.
 *   - TikTok id: `/video/(\d{6,})` anywhere (engine) vs the three real TikTok
 *     paths (overlay). **The overlay's wins** — it is scoped to tiktok.com paths
 *     rather than any URL containing `/video/`.
 *   - Host match: a bare `/provider\.com/i` substring (engine) vs an origin-anchored
 *     `(?:^|//|\.)provider\.com/` (overlay's shape test). **Neither survived.** Both
 *     test a SUBSTRING of the whole URL, so a provider name anywhere in it counts:
 *     the bare form matched a FRAGMENT (`https://evil.example/#instagram.com/reel/X`
 *     resolved as Instagram), and the anchored form still matched a QUERY
 *     (`https://evil.example/?next=https://vimeo.com/1`). That is not academic for
 *     `tiktok` and `instagram`, whose `watch` passes the author's URL THROUGH: the
 *     slide then renders a "Watch on Instagram" badge and a QR code encoding the
 *     attacker's origin. So a row now declares its `hosts` as data and we match the
 *     PARSED host. A shared or AI-generated deck cannot dress a foreign origin in a
 *     provider's badge.
 *
 * ── THE DESCRIPTOR (this is the contract) ────────────────────────────────────
 *
 *   key      unique, stable, becomes `data-provider` on the figure
 *   label    human name — "Watch on {label}" on the poster badge
 *   hosts    the hostnames I own, as DATA. Matched against the URL's parsed host
 *            (exact, or a subdomain of it) — never as a substring of the whole URL
 *   id       the PARSED url -> the bare video id. '' when the URL carries none.
 *            It reads `pathname` and `searchParams` and never mentions a hostname:
 *            `providerFor` already established which provider owns this URL, so an
 *            id extractor that re-matched the host would be both redundant and
 *            wrong — an unanchored `instagram\.com\/p\/` also matches
 *            `https://evil.example/instagram.com/p/x`, which is the shape CodeQL's
 *            js/incomplete-hostname-regexp flags and the shape that caused the
 *            substring bug this registry exists to fix.
 *   watch    (id, originalUrl) -> the canonical watch/QR target
 *   oembed   (watchUrl) -> the oEmbed endpoint, or null when there isn't a public one
 *   embed    (id) -> a privacy player src for the lightbox, or null if unframeable
 *   shape    'landscape' | 'portrait' — how the lightbox sizes itself
 *   asyncResolve  true when a link form exists whose id is NOT in the URL, so the
 *                 overlay must resolve it out of band (TikTok short links only)
 *
 * Adding a provider is ONE ROW. Every consumer — the static poster, the QR
 * target, the oEmbed tool, the lightbox, the shape of the lightbox — reads it
 * from here.
 *
 * ── INVARIANTS ───────────────────────────────────────────────────────────────
 *
 * Pure and dependency-free: no `fs`, no network, no DOM. It only PARSES a URL.
 * The actual oEmbed fetch lives in tools/fetch-video-oembed.js, never here and
 * never at render — render stays offline and deterministic.
 *
 * `embed` is REBUILT FROM THE PARSED ID against a fixed template, never from the
 * author's href. That is the whole safety property behind the playback overlay:
 * a hostile URL cannot become an iframe src. Keep it that way — a row whose
 * `embed` interpolates anything but its own validated id is a defect.
 *
 * Node reaches this from CJS via `require()` (Node 22 require(esm)); the docs
 * site imports it directly, the same way it already imports present-transport.mjs
 * and sanitize-style-text.mjs. See engineering/decisions/2026-09-13-plugin-architecture.md.
 */

import { PROVIDER_TABLES } from '../plugins/providers.generated.mjs';

/** `{id}` and `{url}` go in as they are (an id already matched its pattern; a url is the parser's own
 *  re-serialization); `{watch}` is always URL-encoded, because it lands inside another URL's query. */
const fill = (template, { id = '', url = '', watch = '' }) =>
	template.replace(/\{(id|url|watch)\}/g, (_m, k) => (k === 'id' ? id : k === 'url' ? url : encodeURIComponent(watch)));

/** A host compared the way a rule's `host`/`notHost` names it: lower-case, `www.` dropped. */
const bareHost = (url) => url.hostname.toLowerCase().replace(/^www\./, '');

/**
 * One declared row (`contributes.providers`, lib/plugins/plugin.schema.json) → the descriptor every consumer reads.
 * The templates are checked here as well as by the schema: an `embed` that interpolates anything but the validated id
 * would let a hostile address become an iframe src, so a row that tries is refused when the module loads.
 */
function compile(row) {
	if (row.embed !== null && !/^https:\/\/[^{}]*\{id\}[^{}]*$/.test(row.embed)) throw new Error(`video provider "${row.key}": embed may hold only {id}`);
	if (row.watch !== '{url}' && !/^https:\/\/[^{}]*\{id\}[^{}]*$/.test(row.watch)) throw new Error(`video provider "${row.key}": watch is an https template with {id}, or {url}`);
	if (row.oembed !== null && !/^https:\/\/[^{}]*\{watch\}[^{}]*$/.test(row.oembed)) throw new Error(`video provider "${row.key}": oembed may hold only {watch}`);
	const rules = row.id.map((r) => ({
		host: r.host || null,
		notHost: r.notHost || null,
		query: r.query || null,
		pattern: r.pattern ? new RegExp(r.pattern) : null,
		path: r.path ? new RegExp(r.path) : null,
	}));
	return Object.freeze({
		key: row.key,
		label: row.label,
		hosts: Object.freeze([...row.hosts]),
		id: (url) => {
			const host = bareHost(url);
			for (const r of rules) {
				if ((r.host && host !== r.host) || (r.notHost && host === r.notHost)) continue;
				if (r.query) {
					const v = url.searchParams.get(r.query);
					if (v && (!r.pattern || r.pattern.test(v))) return v;
					continue;
				}
				const m = r.path && url.pathname.match(r.path);
				if (m) return m[1];
			}
			return '';
		},
		watch: (id, original) => fill(row.watch, { id, url: original }),
		oembed: row.oembed === null ? null : (watch) => fill(row.oembed, { watch }),
		embed: row.embed === null ? null : (id) => fill(row.embed, { id }),
		shape: row.shape,
		...(row.asyncResolve ? { asyncResolve: true } : {}),
	});
}

/** The registry, compiled from every plugin's declared rows. Ordered — `providerFor` takes the first row whose host matches. */
export const PROVIDERS = Object.freeze(Object.values(PROVIDER_TABLES).flat().map(compile));
/** Each declaring plugin's own compiled rows, for the matcher a plugin's ctx carries (`ctx.provider`). */
const BY_PLUGIN = new Map(Object.entries(PROVIDER_TABLES).map(([plugin, rows]) => [plugin, rows.map((r) => PROVIDERS.find((p) => p.key === r.key))]));

/**
 * Parse a video URL, or null if it isn't an http(s) URL. Authors routinely type a
 * bare `youtube.com/watch?v=…` with no scheme, so a failed parse is retried once as
 * https — but only when the string has no scheme of its own, so a `javascript:` or
 * `data:` URL can never be coaxed into looking like a host.
 */
function parseUrl(raw) {
	const url = String(raw || '').trim();
	if (!url) return null;
	const attempts = /^[a-z][a-z0-9+.-]*:/i.test(url) ? [url] : [url, `https://${url}`];
	for (const candidate of attempts) {
		try {
			const parsed = new URL(candidate);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
			// Drop the trailing dot of a fully-qualified name HERE rather than only at the
			// host comparison, so everything downstream — the id extractors, the watch
			// target, the QR payload — sees one spelling of the host.
			if (parsed.hostname.endsWith('.')) parsed.hostname = parsed.hostname.replace(/\.+$/, '');
			return parsed;
		} catch {
			/* try the next form */
		}
	}
	return null;
}

/**
 * Does `host` equal `owned`, or sit under it as a subdomain? The trailing dot of a
 * fully-qualified name is stripped first — `youtube.com.` is `youtube.com`, and
 * without this a legitimate FQDN silently resolved to no provider at all.
 */
function hostMatches(host, owned) {
	const h = host.replace(/\.$/, '');
	return h === owned || h.endsWith(`.${owned}`);
}

/**
 * The provider row owning this URL, or null. Matches the PARSED HOST, so a
 * provider name appearing anywhere else in the URL — path, query, fragment —
 * resolves to nothing. Order-sensitive: the first matching row wins.
 */
export function providerFor(raw, rows = PROVIDERS) {
	const parsed = parseUrl(raw);
	if (!parsed) return null;
	const host = parsed.hostname.toLowerCase();
	return rows.find((p) => p.hosts.some((h) => hostMatches(host, h))) || null;
}

/**
 * Resolve a URL to a provider descriptor for the STATIC render, or null if it
 * isn't a recognized video URL. Never throws.
 *   { key, label, id, url (canonical watch/QR target), oembedUrl|null }
 */
export function detectProvider(raw, rows = PROVIDERS) {
	const parsed = parseUrl(raw);
	const p = parsed && providerFor(parsed, rows);
	if (!p) return null;
	// Work from the RE-SERIALIZED url, never the author's raw string. `tiktok` and
	// `instagram` hand their watch target straight through, and that target is both an
	// `href` and — the part that bites — the payload of a QR code somebody scans with
	// a phone. A backslash makes the two URL standards disagree about the host:
	// WHATWG (every browser, and `new URL` here) ends the authority at the `\`, so
	// `https://instagram.com\@evil.example/p/X/` is instagram.com; an RFC 3986 parser
	// reads the userinfo and says evil.example. Serializing through the parser we
	// VALIDATED with normalizes the backslash away, so the string we render is the one
	// we checked. It also makes a scheme-less bullet an absolute link rather than a
	// relative one.
	const url = parsed.href;
	const id = p.id(parsed);
	// No id in the URL — a channel page, a playlist, a profile. `watch` would build a
	// truncated target (`…/watch?v=`), so the poster link and the QR would both point
	// at a dead URL. Fall back to what the author wrote: the host is already verified
	// as this provider's, so it is a real link to them. (`tiktok` and `instagram`
	// already did exactly this for every URL.)
	const watch = id ? p.watch(id, url) : url;
	return {
		key: p.key,
		label: p.label,
		id,
		url: watch,
		oembedUrl: p.oembed ? p.oembed(watch) : null,
	};
}

/**
 * A video href → a safe player src, or null. SYNC — resolves only when the id is
 * in the URL. TikTok SHORT links are the one async case (resolveTikTokSrc).
 */
export function embedSrc(href) {
	if (!href) return null;
	const parsed = parseUrl(href);
	const p = parsed && providerFor(parsed);
	if (!p?.embed) return null;
	const id = p.id(parsed);
	return id ? p.embed(id) : null;
}

/** True if a tap on this href should open the player (sync, or async-resolvable). */
export function isEmbeddable(href) {
	if (embedSrc(href)) return true;
	const p = providerFor(href);
	return Boolean(p?.asyncResolve);
}

/**
 * The provider's native player shape → how the lightbox sizes itself. YouTube and
 * Vimeo are 16:9 (`landscape`); TikTok and Instagram reels are vertical phone
 * video (`portrait`), so a 16:9 box would letterbox or crop them.
 * @returns {'portrait'|'landscape'}
 */
export function providerShape(href) {
	const p = providerFor(href);
	return p?.shape ?? 'landscape';
}

/**
 * The matcher a plugin's ctx carries (`ctx.provider(url)`, lib/core/plugin-ctx.js): `detectProvider` over the rows
 * THAT plugin declared, or null for a plugin that declared none. The host owns the matching; the plugin owns its table.
 * @param {string} plugin
 * @returns {(raw: string) => object|null}
 */
export function providerMatcherFor(plugin) {
	const rows = BY_PLUGIN.get(plugin);
	return rows ? (raw) => detectProvider(raw, rows) : () => null;
}
