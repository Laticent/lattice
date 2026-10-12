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
// What crosses the boundary is the photo's image source and its alt text. The source is checked
// against an allowlist again inside the core, and the alt text is set with `textContent` there
// (HARD RULE #22; this file is on the runtime-markup census with that justification).
import { openCollageLightbox } from '../../../lib/core/collage-lightbox.mjs';
import { frameGeom, innerRectToParent } from './frame-geom.js';

let current = null; // the one open lightbox handle; a second open replaces it

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
 * @returns {boolean} true when a lightbox opened
 */
export function openCollageTile(frame, tile) {
	try {
		const t = readTile(tile);
		if (!t || !t.src) return false;
		const measure = () => {
			const geom = frameGeom(frame);
			if (!geom || !tile.isConnected) return null;
			const r = innerRectToParent(t.img.getBoundingClientRect(), geom);
			return r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
		};
		current?.close();
		const handle = openCollageLightbox(document, {
			src: t.src,
			alt: t.alt,
			from: measure(),
			getFrom: measure,
			onClose: () => {
				if (current === handle) current = null;
			},
		});
		current = handle;
		return Boolean(handle);
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
		win.__collageOpen = (tile) => openCollageTile(win.frameElement || null, tile);
	} catch (_e) {
		/* a cross-origin or torn-down window takes no hook */
	}
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
			current?.close();
			current = null;
			const w = getFrame()?.contentWindow;
			if (w) {
				try {
					delete w.__collageOpen;
				} catch (_e) {
					w.__collageOpen = undefined;
				}
			}
		},
	};
}
