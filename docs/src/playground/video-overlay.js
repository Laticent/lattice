// PARENT-HOSTED video playback overlay — plays an embedded clip IN PLACE over the
// preview, without ever putting a live iframe inside the slide.
//
// WHY PARENT-HOSTED (the whole point). The slide preview is a same-origin,
// transform-scaled `srcdoc` iframe, and:
//   - `sanitizeSlideHtml` strips every `<iframe>` from slide HTML (HARD RULE #22),
//     so a live embed can NEVER live inside the slide;
//   - iOS Safari mishandles nested + transform-scaled iframes (the whole preview
//     trap catalog in engineering/gotchas.md).
// So the player lives in the PARENT document, positioned OVER the poster — exactly
// the parent-hosted pattern the debug-overlay capture surface + chart-interact use
// (2026-07-01-debug-bounding-boxes.md). The cross-origin provider embed is
// browser-sandboxed FROM the parent (it can't reach the OpenRouter key or parent
// DOM), and we only ever build a src from an ALLOW-LISTED provider template +
// validated id — never from the raw author href — so an author can't smuggle a
// `javascript:`/phishing src. Export is untouched: the static poster still renders
// in PDF/PPTX; playback is a live-preview-only enhancement.
//
// The bridge: the in-iframe link guard (deck-preview.js) calls
// `window.__videoPlay(posterAnchor)` on a `.video-poster` tap (clicks DO reach the
// iframe on iOS — it's touch-move gestures that don't). We set that hook per frame;
// it returns true if it mounted a player (→ the guard suppresses navigation), false
// for a non-embeddable provider (→ the guard falls back to opening a tab).

// Allow-listed providers → a privacy embed URL built from the video id only.
// Add a provider here (with its id parser + embed template) to support it; anything
// not listed falls through to the poster's plain link.
//
// NO `playsinline`: on iPhone Safari a `playsinline` YouTube embed is locked to a
// small inline player with a stripped control set (play/pause only) and NO
// fullscreen — iOS reserves the scrubber/volume/fullscreen for its NATIVE video
// player. Omitting `playsinline` lets iOS hand playback to that native player on
// play — full controls + fullscreen — still in-page (not a new tab). Desktop is
// unaffected (it plays inline in the lightbox with full controls either way).
const EMBED = [
	{
		key: 'youtube',
		id: (u) => (u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/) || [])[1],
		src: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
	},
	{
		key: 'vimeo',
		id: (u) => (u.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1],
		src: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`,
	},
	{
		// TikTok CANONICAL links carry the numeric id in the URL (`/@user/video/{id}`,
		// `/embed/{id}`, `/player/v1/{id}`), so they embed SYNCHRONOUSLY — no fetch, as
		// reliable as YouTube. Only `/t/{code}` SHORT links (no id in the URL) fall
		// through to the async oEmbed resolve (resolveTikTokSrc, below).
		key: 'tiktok',
		id: (u) => (u.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|embed\/(?:v2\/)?|player\/v1\/)(\d+)/) || [])[1],
		src: (id) => `https://www.tiktok.com/player/v1/${id}?autoplay=1`,
	},
	{
		// Instagram's `/{p,reel,tv}/{shortcode}/embed/` page IS frameable (no
		// `X-Frame-Options`, no `frame-ancestors` in its CSP) and carries the shortcode
		// IN THE URL — so it embeds SYNCHRONOUSLY, no resolve fetch, immune to the ITP
		// wall that blocks TikTok short links on iPhone. We normalize every post type to
		// the universal `/p/{code}/embed/` path (the same URL Instagram's own embed.js
		// builds for reels/IGTV/video posts). The shortcode is `[\w-]+`, so it can't
		// break out of the path (same rebuild-from-id safety as the other providers).
		// This is the self-contained `/embed/` IFRAME — NOT the `instgrm.Embeds` widget
		// script (which we still won't load into the parent: privacy + #24).
		key: 'instagram',
		id: (u) => (u.match(/instagram\.com\/(?:reels?|p|tv)\/([\w-]+)/) || [])[1],
		src: (id) => `https://www.instagram.com/p/${id}/embed/`,
	},
];

// A YouTube/Vimeo/Instagram/canonical-TikTok href → a safe player src, or null
// (SYNC — the id/shortcode is in the URL). Exported for tests. TikTok SHORT links
// are the one async case (resolveTikTokSrc); everything else resolves here.
export function embedSrc(href) {
	if (!href) return null;
	for (const p of EMBED) {
		const id = p.id(String(href));
		if (id) return p.src(id);
	}
	return null;
}

const isTikTok = (href) => /(?:^|\/\/|\.)tiktok\.com\//i.test(String(href || ''));
const isInstagram = (href) => /(?:^|\/\/|\.)instagram\.com\//i.test(String(href || ''));

/** True if a tap on this href should open the player (sync YT/Vimeo, or async TikTok). */
export function isEmbeddable(href) {
	return Boolean(embedSrc(href)) || isTikTok(href);
}

/**
 * The provider's native player shape → how the lightbox sizes itself. YouTube/Vimeo
 * are 16:9 (`landscape`); TikTok and Instagram reels are vertical phone video
 * (`portrait`), so forcing them into a 16:9 box letterboxes/crops them. Exported for
 * tests. Instagram is additionally auto-fit to its self-reported card height (below).
 * @returns {'portrait'|'landscape'}
 */
export function providerShape(href) {
	return isTikTok(href) || isInstagram(href) ? 'portrait' : 'landscape';
}

/**
 * Resolve a TikTok URL (short `/t/{code}` OR canonical `/@user/video/{id}`) to its
 * official iframe player src, via TikTok's CORS-open oEmbed. The player src is built
 * from the parsed NUMERIC id only (never the response HTML) — no injection surface.
 * `fetchImpl` is injectable for tests. Returns null on any failure (→ link fallback).
 * @returns {Promise<string|null>}
 */
export async function resolveTikTokSrc(href, fetchImpl) {
	const doFetch =
		fetchImpl ||
		((u) => {
			// Bound the wait so a hung/blocked request can't leave the lightbox stuck
			// on "Loading…" forever — a timeout rejects → the in-lightbox link fallback.
			const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
			const t = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
			// Strip tracking signals so iPhone Safari's cross-site tracking prevention
			// (ITP) is less likely to block this cross-origin request to tiktok.com —
			// no cookies, no referrer. It's a plain public oEmbed GET; we need neither.
			return fetch(u, {
				signal: ctrl ? ctrl.signal : undefined,
				credentials: 'omit',
				referrerPolicy: 'no-referrer',
				cache: 'no-store',
			}).finally(() => {
				if (t) clearTimeout(t);
			});
		});
	try {
		const r = await doFetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(String(href)));
		if (!r || !r.ok) return null;
		const j = await r.json();
		const html = String((j && j.html) || '');
		const id = (html.match(/data-video-id="(\d+)"/) || html.match(/\/video\/(\d+)/) || [])[1];
		return id ? `https://www.tiktok.com/player/v1/${id}?autoplay=1` : null;
	} catch (_e) {
		return null;
	}
}

// ── The player is a MODULE-LEVEL SINGLETON — one lightbox at a time across every
// surface (Playground, Studio, …). So the bridge can be installed on any preview
// frame's window (installVideoBridge) and they all share one player + close path.

let modal = null; // the mounted { root, onKey, prevOverflow, prevFocus } or null

function close() {
	if (!modal) return;
	document.removeEventListener('keydown', modal.onKey, true);
	if (modal.onMessage) window.removeEventListener('message', modal.onMessage, false); // IG auto-fit
	document.documentElement.style.overflow = modal.prevOverflow; // restore page scroll
	modal.root.remove();
	try { modal.prevFocus && modal.prevFocus.focus && modal.prevFocus.focus(); } catch (_e) { /* focus best-effort */ }
	modal = null;
}

// Called (from a preview iframe's link guard) with the tapped poster anchor.
// Returns true if we're handling it (a player mounted, or an async TikTok resolve
// is in flight), false if the provider isn't embeddable (→ the guard opens a tab).
//
// A CENTERED LIGHTBOX, not a tiny player pinned over the poster: on mobile the
// poster's rect is small, so a pinned player gave the controls at a size too small
// to hit. A large centered 16:9 modal (mounted on <body>, so `position:fixed` is
// viewport-relative even under a transformed ancestor) gives full-size controls.
function play(poster) {
	try {
		const href = poster && poster.getAttribute ? poster.getAttribute('href') : null;
		const direct = embedSrc(href); // YouTube/Vimeo: id is in the URL (sync)
		if (!direct && !isTikTok(href)) return false; // not embeddable → guard opens the tab
		const prevFocus = document.activeElement;
		close();

		const root = document.createElement('div');
		root.className = 'pg-video-modal';
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', 'true');
		root.setAttribute('aria-label', 'Video player');
		root.style.cssText =
			'position:fixed;inset:0;z-index:2147483000;background:rgba(6,10,18,.8);' +
			'display:flex;align-items:center;justify-content:center;padding:4vmin;' +
			'opacity:0;transition:opacity .18s ease;'; // fade-in (set to 1 after mount)
		const shell = document.createElement('div');
		// Size to the provider's native shape — a 16:9 box for YouTube/Vimeo, a tall
		// phone-shaped box for portrait video (TikTok, Instagram reels) so it isn't
		// letterboxed/cropped. Instagram is further auto-fit to its reported card height.
		const portrait = providerShape(href) === 'portrait';
		shell.style.cssText =
			'position:relative;' +
			(portrait
				? 'width:min(92vw,420px);height:min(86vh,760px);'
				: 'width:min(92vw,960px);aspect-ratio:16/9;max-height:86vh;') +
			'border-radius:12px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6);background:#000;' +
			// Centered "Loading…" shown until the player <iframe> is added (TikTok resolve).
			"display:grid;place-items:center;color:rgba(255,255,255,.7);font:500 14px system-ui,sans-serif;";
		shell.textContent = 'Loading…';
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.setAttribute('aria-label', 'Close video');
		btn.textContent = '✕';
		// Top-right, clear of the player's own bottom control bar so it never overlaps.
		btn.style.cssText =
			'position:absolute;top:8px;right:8px;z-index:1;width:34px;height:34px;border:0;border-radius:50%;cursor:pointer;' +
			'background:rgba(0,0,0,.65);color:#fff;font-size:16px;line-height:34px;padding:0;';
		btn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
		shell.appendChild(btn);
		root.appendChild(shell);
		// Backdrop tap closes; a tap on the player/shell does not (it drives playback).
		root.addEventListener('click', (e) => { if (e.target === root) close(); });

		const onKey = (e) => { if (e.key === 'Escape') close(); };
		const prevOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden'; // lock background scroll

		// AUTO-FIT Instagram: its /embed/ page is a CARD (header + video + caption), whose
		// height varies per post, and it reports its own rendered height to the parent via
		// postMessage ({type:'MEASURE', details:{height}}). Size the shell to that height
		// (capped at 86vh) so the card fits with no letterbox. If the message never arrives
		// (or isn't Instagram), the fixed portrait box above stands. Origin-checked — we
		// only trust a height from instagram.com, never arbitrary cross-frame chatter.
		let onMessage = null;
		if (isInstagram(href)) {
			onMessage = (e) => {
				try {
					if (!modal || modal.root !== root) return;
					if (!/(^|\.)instagram\.com$/i.test(new URL(e.origin).hostname)) return;
					const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
					const h = d && d.type === 'MEASURE' && d.details && Number(d.details.height);
					if (h && h > 0) shell.style.height = Math.min(Math.round(h), Math.round(window.innerHeight * 0.86)) + 'px';
				} catch (_e) { /* ignore malformed / non-JSON messages */ }
			};
			window.addEventListener('message', onMessage, false);
		}

		modal = { root, onKey, prevOverflow, prevFocus, onMessage };
		document.addEventListener('keydown', onKey, true);
		document.body.appendChild(root);
		requestAnimationFrame(() => { if (modal && modal.root === root) root.style.opacity = '1'; });
		try { btn.focus(); } catch (_e) { /* focus best-effort */ }

		// Swap the "Loading…" shell for the real player <iframe> once we have a src.
		const mountPlayer = (src) => {
			if (!modal || modal.root !== root) return; // closed / replaced meanwhile
			shell.textContent = '';
			shell.style.color = ''; // drop the loading text color
			const player = document.createElement('iframe');
			player.src = src;
			player.title = 'Video player';
			player.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
			player.setAttribute('allowfullscreen', '');
			player.setAttribute('webkitallowfullscreen', ''); // legacy iOS Safari fullscreen
			player.referrerPolicy = 'strict-origin-when-cross-origin';
			player.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
			shell.appendChild(player);
			shell.appendChild(btn); // keep close on top of the player
		};

		// Fallback shown IN the lightbox if we can't build a player (e.g. TikTok
		// oEmbed blocked in this browser). NOT an async `window.open` — iOS
		// popup-blocks a window.open outside the tap gesture, which reads as
		// "nothing happened". A real <a> the user taps IS a gesture → never blocked.
		const mountFallbackLink = () => {
			if (!modal || modal.root !== root) return;
			shell.textContent = '';
			shell.style.background = 'rgba(6,10,18,.96)';
			shell.style.padding = '24px';
			shell.style.gap = '12px';
			const msg = document.createElement('div');
			msg.textContent = "Couldn't load the player here.";
			msg.style.cssText = 'color:rgba(255,255,255,.72);font:500 14px system-ui,sans-serif;text-align:center;';
			const a = document.createElement('a');
			a.href = href || '#';
			a.target = '_blank';
			a.rel = 'noreferrer noopener';
			a.textContent = 'Open on TikTok ↗';
			a.style.cssText = 'color:#fff;font:600 15px system-ui,sans-serif;text-decoration:underline;';
			shell.appendChild(msg);
			shell.appendChild(a);
			shell.appendChild(btn);
		};

		if (direct) {
			mountPlayer(direct);
		} else {
			// TikTok: resolve the (short or canonical) link to its player src via oEmbed,
			// then swap in the iframe; on failure show the in-lightbox tap-through.
			resolveTikTokSrc(href).then((src) => {
				if (!modal || modal.root !== root) return;
				if (src) mountPlayer(src);
				else mountFallbackLink();
			});
		}
		return true;
	} catch (_e) {
		return false;
	}
}

/**
 * Install the playback bridge on a preview iframe's window. Its link guard
 * (deck-preview.js `linkGuardAgent`) calls `window.__videoPlay(poster)` on a
 * `.video-poster` tap. Call after each srcdoc rewrite / load. Safe to call repeatedly.
 * @param {Window|null|undefined} win
 */
export function installVideoBridge(win) {
	if (win) win.__videoPlay = play;
}

/**
 * Mount the parent-hosted video overlay over a preview iframe. Thin wrapper over the
 * shared singleton so hosts with a single persistent frame (Playground, Drawing
 * Board) keep the { rebind, destroy } shape; `installVideoBridge` is the direct
 * entry for renderers that manage frames themselves (single-slide-render).
 * @param {object} o
 * @param {() => HTMLIFrameElement|null} o.getFrame  the live preview iframe
 * @returns {{ rebind: () => void, destroy: () => void }}
 */
export function createVideoOverlay({ getFrame }) {
	function rebind() {
		const frame = getFrame();
		installVideoBridge(frame && frame.contentWindow);
	}
	function destroy() {
		close();
		const frame = getFrame();
		const w = frame && frame.contentWindow;
		if (w && w.__videoPlay === play) { try { delete w.__videoPlay; } catch (_e) { w.__videoPlay = undefined; } }
	}
	return { rebind, destroy };
}
