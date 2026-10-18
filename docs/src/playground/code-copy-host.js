// PARENT-HOSTED click-through for a code block's copy buttons (lib/core/code-copy.mjs).
//
// The Studio's live preview sits in a `pointer-events-none` box, so a click never reaches the copy
// buttons the runtime draws inside the frame. The Studio hit-tests the tap itself, as `tapVideoAt`
// and `tapCollageAt` do, and runs the frame's copy with the PARENT's navigator: the click's user
// activation belongs to this page, and so does a clipboard permission. Hosts whose frame does take
// clicks (the Playground, Present) need none of this: the buttons handle their own clicks.
//
// Nothing crosses the boundary but the button the tap landed on; the copy builds its payload from
// the block's own text (no markup is written here, HARD RULE #22).
import { frameGeom } from './frame-geom.js';

/**
 * Copy from the button under a tap on the preview, if there is one.
 * @param {HTMLIFrameElement|null|undefined} frame  the live preview frame
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean} true when the tap landed on a copy button (the caller then stops it)
 */
export function tapCodeCopyAt(frame, clientX, clientY) {
	try {
		if (!frame || frame.style.opacity === '0') return false;
		const doc = frame.contentDocument;
		const win = frame.contentWindow;
		const g = frameGeom(frame);
		if (!doc || !win || !g || !g.S) return false;
		const button = doc.elementFromPoint((clientX - g.fr.left) / g.S, (clientY - g.fr.top) / g.S)?.closest?.('.lat-code-copy-btn');
		if (!button || typeof win.__latticeCodeCopy !== 'function') return false;
		void win.__latticeCodeCopy(button, window.navigator);
		return true;
	} catch (_e) {
		return false; // a torn-down or cross-origin frame has no button to tap
	}
}

/**
 * HOVER, BRIDGED THE SAME WAY. The preview box takes no pointer events, so `:hover` never reaches a
 * block inside the frame: its copy buttons stayed at rest and their tooltips never showed. The host
 * hit-tests the pointer as it moves and marks what it is over with `data-host-hover`: the block (its
 * buttons come up to full strength) and the button (its tooltip shows). code.styles.css reads the
 * marker beside `:hover`, so a host whose frame takes the pointer itself needs none of this.
 * One marked block and one marked button per frame; a move elsewhere, or `null` coordinates (the
 * pointer left the preview), clears them.
 * @param {HTMLIFrameElement|null|undefined} frame
 * @param {number|null} clientX
 * @param {number|null} clientY
 * @returns {boolean} true when the pointer is over a copy button
 */
export function hoverCodeCopyAt(frame, clientX, clientY) {
	try {
		const doc = frame?.contentDocument;
		if (!doc) return false;
		let pre = null;
		let button = null;
		if (clientX !== null && clientY !== null && frame.style.opacity !== '0') {
			const g = frameGeom(frame);
			if (g?.S) {
				const el = doc.elementFromPoint((clientX - g.fr.left) / g.S, (clientY - g.fr.top) / g.S);
				pre = el?.closest?.('pre[data-copy-ready]') ?? null;
				button = el?.closest?.('.lat-code-copy-btn') ?? null;
			}
		}
		for (const was of doc.querySelectorAll('[data-host-hover]')) if (was !== pre && was !== button) was.removeAttribute('data-host-hover');
		pre?.setAttribute('data-host-hover', '');
		button?.setAttribute('data-host-hover', '');
		return Boolean(button);
	} catch (_e) {
		return false; // a torn-down or cross-origin frame: nothing to mark
	}
}
