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
// not listed falls through to the poster's plain link (TikTok/Instagram today).
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
		// TikTok's official iframe player (numeric video id from /@user/video/{id}).
		// UNVERIFIED on a real device from the sandbox — confirm the player loads on
		// iOS before relying on it; the poster-link fallback covers it if it doesn't.
		key: 'tiktok',
		id: (u) => (u.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|embed\/(?:v2\/)?)(\d+)/) || [])[1],
		src: (id) => `https://www.tiktok.com/player/v1/${id}?autoplay=1`,
	},
	// Instagram has NO public iframe player — embedding needs their instgrm.Embeds JS
	// widget, which we won't load into the parent (third-party script + privacy). It
	// stays a poster + link (embedSrc returns null → the guard opens the tab).
];

// Pure: an author href → a safe, embeddable player src, or null. Exported for tests.
export function embedSrc(href) {
	if (!href) return null;
	for (const p of EMBED) {
		const id = p.id(String(href));
		if (id) return p.src(id);
	}
	return null;
}

// ── The player is a MODULE-LEVEL SINGLETON — one lightbox at a time across every
// surface (Playground, Studio, …). So the bridge can be installed on any preview
// frame's window (installVideoBridge) and they all share one player + close path.

let modal = null; // the mounted { root, onKey, prevOverflow, prevFocus } or null

function close() {
	if (!modal) return;
	document.removeEventListener('keydown', modal.onKey, true);
	document.documentElement.style.overflow = modal.prevOverflow; // restore page scroll
	modal.root.remove();
	try { modal.prevFocus && modal.prevFocus.focus && modal.prevFocus.focus(); } catch (_e) { /* focus best-effort */ }
	modal = null;
}

// Called (from a preview iframe's link guard) with the tapped poster anchor.
// Returns true if a player was mounted, false if the provider isn't embeddable.
//
// A CENTERED LIGHTBOX, not a tiny player pinned over the poster: on mobile the
// poster's rect is small, so a pinned player gave the controls at a size too small
// to hit. A large centered 16:9 modal (mounted on <body>, so `position:fixed` is
// viewport-relative even under a transformed ancestor) gives full-size controls.
function play(poster) {
	try {
		const src = embedSrc(poster && poster.getAttribute && poster.getAttribute('href'));
		if (!src) return false;
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
		shell.style.cssText =
			'position:relative;width:min(92vw,960px);aspect-ratio:16/9;max-height:86vh;' +
			'border-radius:12px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6);background:#000;';
		const player = document.createElement('iframe');
		player.src = src;
		player.title = 'Video player';
		player.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
		player.setAttribute('allowfullscreen', '');
		player.setAttribute('webkitallowfullscreen', ''); // legacy iOS Safari fullscreen
		player.referrerPolicy = 'strict-origin-when-cross-origin';
		player.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.setAttribute('aria-label', 'Close video');
		btn.textContent = '✕';
		// Top-right, clear of the player's own bottom control bar so it never overlaps.
		btn.style.cssText =
			'position:absolute;top:8px;right:8px;z-index:1;width:34px;height:34px;border:0;border-radius:50%;cursor:pointer;' +
			'background:rgba(0,0,0,.65);color:#fff;font-size:16px;line-height:34px;padding:0;';
		btn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
		shell.appendChild(player);
		shell.appendChild(btn);
		root.appendChild(shell);
		// Backdrop tap closes; a tap on the player/shell does not (it drives playback).
		root.addEventListener('click', (e) => { if (e.target === root) close(); });

		const onKey = (e) => { if (e.key === 'Escape') close(); };
		const prevOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden'; // lock background scroll
		modal = { root, onKey, prevOverflow, prevFocus };
		document.addEventListener('keydown', onKey, true);
		document.body.appendChild(root);
		requestAnimationFrame(() => { if (modal && modal.root === root) root.style.opacity = '1'; });
		try { btn.focus(); } catch (_e) { /* focus best-effort */ }
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
