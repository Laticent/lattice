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

/** The registry. Ordered — `providerFor` takes the first row whose host matches. */
export const PROVIDERS = [
	{
		key: 'youtube',
		label: 'YouTube',
		hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
		// Every id-bearing YouTube form, from both former tables: `watch?v=` (wherever
		// the parameter sits), youtu.be, shorts, embed, live, and the -nocookie origin
		// the lightbox itself emits, so a re-parse round-trips. `searchParams` replaces
		// the old `watch\?(?:.*&)?v=` scan — no `.*` to backtrack over, and it finds `v`
		// wherever in the query it sits rather than only after a `&`.
		id: (url) => {
			const v = url.searchParams.get('v');
			if (v && /^[\w-]{11}$/.test(v)) return v;
			// youtu.be puts the id at the path ROOT; youtube.com always nests it under a
			// verb. Keeping those apart matters: a bare 11-character path on youtube.com is
			// a channel or a handle, not a video.
			const root = url.hostname.toLowerCase().replace(/^www\./, '') === 'youtu.be';
			const m = url.pathname.match(root ? /^\/([\w-]{11})$/ : /^\/(?:shorts|embed|live|v)\/([\w-]{11})$/);
			return m ? m[1] : '';
		},
		watch: (id) => `https://www.youtube.com/watch?v=${id}`,
		oembed: (watch) => `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
		// NO `playsinline`: on iPhone Safari a `playsinline` YouTube embed is locked
		// to a small inline player with play/pause only and NO fullscreen — iOS
		// reserves the scrubber/volume/fullscreen for its NATIVE player. Omitting it
		// lets iOS hand playback to that player on play (full controls, still
		// in-page). Desktop is unaffected.
		embed: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
		shape: 'landscape',
	},
	{
		key: 'vimeo',
		label: 'Vimeo',
		hosts: ['vimeo.com'],
		id: (url) => (url.pathname.match(/^\/(?:video\/)?(\d{5,})(?:\/|$)/) || [])[1] || '',
		watch: (id) => `https://vimeo.com/${id}`,
		oembed: (watch) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(watch)}`,
		embed: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
		shape: 'landscape',
	},
	{
		key: 'tiktok',
		label: 'TikTok',
		hosts: ['tiktok.com'],
		// CANONICAL links carry the numeric id (`/@user/video/{id}`, `/embed/{id}`,
		// `/player/v1/{id}`), so they embed synchronously. `/t/{code}` SHORT links
		// carry no id — hence `asyncResolve`, handled by resolveTikTokSrc.
		id: (url) => (url.pathname.match(/^\/(?:@[\w.-]+\/video\/|embed\/(?:v2\/)?|player\/v1\/)(\d{6,})(?:\/|$)/) || [])[1] || '',
		// TikTok's canonical URL needs the author handle, which we don't always
		// have — so the author's own URL is the watch/QR target verbatim.
		watch: (_id, original) => original,
		oembed: (watch) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(watch)}`,
		embed: (id) => `https://www.tiktok.com/player/v1/${id}?autoplay=1`,
		shape: 'portrait',
		asyncResolve: true,
	},
	{
		key: 'instagram',
		label: 'Instagram',
		hosts: ['instagram.com'],
		id: (url) => (url.pathname.match(/^\/(?:reels?|p|tv)\/([\w-]+)(?:\/|$)/) || [])[1] || '',
		watch: (_id, original) => original,
		oembed: null, // public oEmbed retired — needs a Facebook app token
		// The `/{p,reel,tv}/{code}/embed/` page IS frameable (no X-Frame-Options, no
		// frame-ancestors) and carries the shortcode in the URL, so it embeds
		// synchronously — immune to the ITP wall that blocks TikTok short links on
		// iPhone. Every post type normalizes to the universal `/p/{code}/embed/`
		// path, the same URL Instagram's own embed.js builds. This is the
		// self-contained iframe, NOT the `instgrm.Embeds` widget script (which we
		// still won't load into the parent: privacy + HARD RULE #24).
		embed: (id) => `https://www.instagram.com/p/${id}/embed/`,
		shape: 'portrait',
	},
];

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
export function providerFor(raw) {
	const parsed = parseUrl(raw);
	if (!parsed) return null;
	const host = parsed.hostname.toLowerCase();
	return PROVIDERS.find((p) => p.hosts.some((h) => hostMatches(host, h))) || null;
}

/**
 * Resolve a URL to a provider descriptor for the STATIC render, or null if it
 * isn't a recognized video URL. Never throws.
 *   { key, label, id, url (canonical watch/QR target), oembedUrl|null }
 */
export function detectProvider(raw) {
	const parsed = parseUrl(raw);
	const p = parsed && providerFor(parsed);
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
