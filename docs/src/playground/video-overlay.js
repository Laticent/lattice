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

// Allow-listed providers → a privacy/inline embed URL built from the video id only.
// Add a provider here (with its id parser + embed template) to support it; anything
// not listed falls through to the poster's plain link (TikTok/Instagram today).
const EMBED = [
	{
		key: 'youtube',
		id: (u) => (u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/) || [])[1],
		src: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`,
	},
	{
		key: 'vimeo',
		id: (u) => (u.match(/vimeo\.com\/(?:video\/)?(\d+)/) || [])[1],
		src: (id) => `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1`,
	},
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

/**
 * Mount the parent-hosted video overlay over a preview iframe. The lightbox mounts
 * on <body> (viewport-fixed), so no stage element is needed.
 * @param {object} o
 * @param {() => HTMLIFrameElement|null} o.getFrame  the live preview iframe
 * @returns {{ rebind: () => void, destroy: () => void }}
 */
export function createVideoOverlay({ getFrame }) {
	let modal = null; // the mounted { root, onKey } or null

	function close() {
		if (!modal) return;
		document.removeEventListener('keydown', modal.onKey, true);
		modal.root.remove();
		modal = null;
	}

	// Called (from the iframe's link guard) with the tapped poster anchor. Returns
	// true if a player was mounted, false if the provider isn't embeddable.
	//
	// A CENTERED LIGHTBOX, not a tiny player pinned over the poster: on mobile the
	// poster's rect is small, so a pinned player gave YouTube's controls at a size
	// too small to hit (and too small to matter). A large centered 16:9 modal gives
	// full-size, tappable controls. Mounted on <body> (NOT the preview stage) so
	// `position:fixed` is viewport-relative even if an ancestor is transformed.
	function play(poster) {
		try {
			const src = embedSrc(poster && poster.getAttribute && poster.getAttribute('href'));
			if (!src) return false;
			close();

			const root = document.createElement('div');
			root.className = 'pg-video-modal';
			root.style.cssText =
				'position:fixed;inset:0;z-index:2147483000;background:rgba(6,10,18,.8);' +
				'display:flex;align-items:center;justify-content:center;padding:4vmin;';
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
			// Top-right, clear of YouTube's own bottom control bar so it never overlaps.
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
			modal = { root, onKey };
			document.addEventListener('keydown', onKey, true);
			document.body.appendChild(root);
			return true;
		} catch (_e) {
			return false;
		}
	}

	// Re-install the bridge hook after every srcdoc rewrite / section patch. The
	// iframe's link guard calls window.__videoPlay(poster) on a poster tap.
	function rebind() {
		const frame = getFrame();
		const w = frame && frame.contentWindow;
		if (w) w.__videoPlay = play;
	}

	function destroy() {
		close();
		const frame = getFrame();
		const w = frame && frame.contentWindow;
		if (w && w.__videoPlay === play) { try { delete w.__videoPlay; } catch (_e) { w.__videoPlay = undefined; } }
	}

	return { rebind, destroy };
}
