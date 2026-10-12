// PARENT-HOSTED collage lightbox — enlarges one collage photo over the preview.
//
// The preview frame is a same-origin, transform-scaled `srcdoc` iframe, and the Studio's live
// preview sits in a `pointer-events-none` box. An overlay built INSIDE the frame would be clipped
// to the scaled slide and would never receive a click there, so the overlay lives in the PARENT
// document, the pattern video-overlay.js and chart-interact.js already use. The opener itself is
// `lib/core/collage-lightbox.mjs`, shared with the exported player (HARD RULE #1); this file only
// bridges the frame's coordinates and reads the tile.
//
// Two ways a click reaches the opener, because not every host lets a tap reach the frame:
//   - the frame's own guard (deck-preview.js `linkGuardAgent`) calls `window.__collageOpen(tile)`
//     on a `.collage-tile` click or Enter/Space — the Playground and the Present stage;
//   - a host whose slide box is `pointer-events-none` hit-tests the tap itself with `tapCollageAt`
//     (the Studio), the way `tapVideoAt` does for a video poster.
//
// What crosses the boundary is each photo's image source and alt text. Every source is checked
// against an allowlist again inside the core, and the alt text is set with `textContent` there
// (HARD RULE #22; this file and the core are on the runtime-markup census, which is what keeps
// it markup-free: both write only text, attributes and an image source).
import { frameGeom, innerRectToParent } from './frame-geom.js';

let current = null; // the one open lightbox handle (or a pending-open ticket); a second open replaces it

/** The tile's `<img>` and what the lightbox needs from it, or null if the tile holds no photo. */
function readTile(tile) {
	const img = tile?.querySelector?.('img');
	if (!img) return null;
	const src = img.currentSrc || img.getAttribute('src') || '';
	// `data-label` is the alt text the transform copies onto the tile for the Guide; fall back to
	// the image's own alt so a hand-built tile still captions.
	const alt = tile.getAttribute('data-label') || img.getAttribute('alt') || '';
	return { img, src, alt };
}

/**
 * Open the lightbox for `tile`, a `.collage-tile` inside `frame`'s document.
 * @param {HTMLIFrameElement|null} frame
 * @param {Element} tile
 * @param {boolean} [viaKeyboard=false] opened by Enter or Space on a focused photo, so focus returns to it on close
 * @returns {boolean} true when a lightbox opened
 */
export function openCollageTile(frame, tile, viaKeyboard = false) {
	try {
		const t = readTile(tile);
		if (!t || !t.src) return false;
		// The tile's photo rect in the PARENT's viewport, for the glide out and back.
		const measureOf = (el, img) => () => {
			const geom = frameGeom(frame);
			if (!geom || !el.isConnected) return null;
			const r = innerRectToParent(img.getBoundingClientRect(), geom);
			return r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
		};
		// Every photo of this collage in written order, so the lightbox can step through them. Each
		// carries its own re-measure; only the opened one needs a rect now.
		const list = tile.closest?.('[data-collage]') || tile.parentElement;
		const items = [];
		let index = 0;
		for (const el of list ? list.querySelectorAll('.collage-tile') : [tile]) {
			const r = readTile(el);
			if (!r || !r.src) continue;
			const getFrom = measureOf(el, r.img);
			if (el === tile) index = items.length;
			// Measured now, at the click, so the glide starts from where the tile is.
			items.push({ src: r.src, alt: r.alt, from: el === tile ? getFrom() : null, getFrom });
		}
		current?.closeNow?.();
		current = null;
		// The opener loads on first use, so the lightbox is not in every route's startup JS: a
		// reader who never enlarges a photo never downloads it. Returns true at once so the frame's
		// guard cancels the click; the lightbox follows when the chunk arrives. The input rules (swipe
		// and key) are the shared transport kernel's, handed in because the opener cannot import.
		const ticket = {};
		current = ticket;
		Promise.all([import('../../../lib/core/collage-lightbox.mjs'), import('../../../lib/core/present-transport.mjs')])
			.then(([{ openCollageLightbox }, { keyAction, swipeAction }]) => {
				if (current !== ticket) return; // a newer open, or a close, got there first
				const handle = openCollageLightbox(document, {
					items,
					index,
					kernel: { keyAction, swipeAction },
					restoreFocus: viaKeyboard,
					onClose: () => {
						if (current === handle) current = null;
					},
				});
				current = handle;
			})
			.catch(() => {
				if (current === ticket) current = null;
			});
		return true;
	} catch (_e) {
		return false;
	}
}

/**
 * A tap the HOST caught at viewport point (`clientX`, `clientY`) over a frame that cannot receive
 * it. If it lands on a collage tile, open that photo. Returns true when it did, so the host stops
 * treating the tap as anything else. The point is mapped through `frameGeom`, because the frame
 * may be CSS-scaled.
 * @param {HTMLIFrameElement|null|undefined} frame
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean}
 */
export function tapCollageAt(frame, clientX, clientY) {
	try {
		if (!frame || frame.style.opacity === '0' || frame.style.pointerEvents === 'none') return false;
		const doc = frame.contentDocument;
		const g = frameGeom(frame);
		if (!doc || !g || !g.S) return false;
		const tile = doc.elementFromPoint((clientX - g.fr.left) / g.S, (clientY - g.fr.top) / g.S)?.closest?.('.collage-tile');
		return tile ? openCollageTile(frame, tile) : false;
	} catch (_e) {
		return false; // a torn-down or cross-origin frame has no tile to tap
	}
}

/**
 * Install the open bridge on a preview iframe's window: the frame's guard calls
 * `window.__collageOpen(tile)`. Safe to call after every srcdoc rewrite.
 * @param {Window|null|undefined} win
 */
export function installCollageBridge(win) {
	if (!win) return;
	try {
		win.__collageOpen = (tile, viaKeyboard) => openCollageTile(win.frameElement || null, tile, Boolean(viaKeyboard));
		stampPhotos(win);
	} catch (_e) {
		/* a cross-origin or torn-down window takes no hook */
	}
}

/**
 * Make each collage photo reachable by keyboard: the `<img>` inside a tile gets `tabindex`,
 * `role="button"` and an "Enlarge" label. The photo is the button, not the `<li>`, so the list keeps
 * its list semantics. It is stamped HERE, on the live frame that has the opener, and not by the
 * frame's own script, because the print and capture frames serialize `outerHTML` into exports and
 * would carry a button that does nothing. A MutationObserver re-stamps after a re-render.
 * @param {Window} win
 */
function stampPhotos(win) {
	const doc = win.document;
	const stamp = () => {
		for (const img of doc.querySelectorAll('.collage-tile > img:not([tabindex])')) {
			const alt = img.getAttribute('alt');
			img.setAttribute('tabindex', '0');
			img.setAttribute('role', 'button');
			img.setAttribute('aria-label', alt ? `Enlarge: ${alt}` : 'Enlarge photo');
		}
	};
	stamp();
	if (win.__collageObserver || !win.MutationObserver) return;
	let pending = false;
	win.__collageObserver = new win.MutationObserver(() => {
		if (pending) return;
		pending = true;
		(win.requestAnimationFrame || win.setTimeout)(() => {
			pending = false;
			stamp();
		});
	});
	win.__collageObserver.observe(doc.documentElement, { childList: true, subtree: true });
}

/**
 * Mount the bridge for a host with one persistent frame (the Playground), in the
 * { rebind, destroy } shape `createVideoOverlay` uses.
 * @param {object} o
 * @param {() => HTMLIFrameElement|null} o.getFrame
 */
export function createCollageOverlay({ getFrame }) {
	return {
		rebind() {
			installCollageBridge(getFrame()?.contentWindow);
		},
		destroy() {
			current?.closeNow?.();
			current = null;
			const w = getFrame()?.contentWindow;
			if (w) {
				try {
					w.__collageObserver?.disconnect();
					w.__collageObserver = null;
					delete w.__collageOpen;
				} catch (_e) {
					w.__collageOpen = undefined;
				}
			}
		},
	};
}
