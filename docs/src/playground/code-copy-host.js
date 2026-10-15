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
