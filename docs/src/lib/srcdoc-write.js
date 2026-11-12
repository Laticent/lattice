// WRITE A PREVIEW FRAME'S `srcdoc` SO THE SERVICE WORKER STILL SERVES IT.
//
// Firefox hands the FIRST `srcdoc` document of an iframe its parent's service-worker controller, but a document written by
// setting `srcdoc` AGAIN on the same element gets none: `navigator.serviceWorker.controller` is null inside it and every
// request it makes (the runtime `<script src>`, the theme's fonts, Mermaid) goes straight to the network. Online nobody
// notices. Offline every one of them fails, so the Studio preview stops drawing after the first edit. Chromium and WebKit
// keep the controller. Removing the attribute first or loading `about:blank` in between does not help; a frame that is
// DETACHED while its `srcdoc` changes and then put back gets a fresh browsing context, and that one is controlled.
// Measured on Firefox 142, offline and online alike: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md.
//
// This helper does only that. It never touches the markup: callers pass the document their builder already produced and
// sanitized (HARD RULE #22), exactly what they assigned to `frame.srcdoc` before.

/**
 * Should this write re-insert the frame? Only when the page is controlled (otherwise there is no controller to lose)
 * and the frame already shows a `srcdoc` document (the first write is controlled in every engine).
 * @param {HTMLIFrameElement} frame
 * @param {Window} [win]
 */
export function srcdocRewriteNeedsReinsert(frame, win = globalThis.window) {
	if (!frame?.isConnected || !frame.parentNode || !frame.hasAttribute('srcdoc')) return false;
	try {
		return !!win?.navigator?.serviceWorker?.controller;
	} catch {
		return false;
	}
}

/**
 * Assign `html` as the frame's `srcdoc`. When the frame already shows a `srcdoc` document on a page a service worker
 * controls, the frame is taken out of the tree for the assignment and put back where it was, so its new document is a
 * client of the same worker in every engine. Focus that was on the frame comes back to it.
 *
 * The element itself is kept (its id, classes, inline style, `onload` and listeners all survive); what changes is the
 * frame's WINDOW, which is a new object afterwards, so read `frame.contentWindow` after the load, never before the write.
 * @param {HTMLIFrameElement} frame
 * @param {string} html the sanitized document the builder produced
 */
export function writeSrcdoc(frame, html) {
	if (!srcdocRewriteNeedsReinsert(frame)) {
		frame.srcdoc = html;
		return;
	}
	const parent = frame.parentNode;
	const next = frame.nextSibling;
	const doc = frame.ownerDocument;
	const hadFocus = doc?.activeElement === frame;
	frame.remove();
	frame.srcdoc = html;
	parent.insertBefore(frame, next);
	if (hadFocus) {
		try {
			frame.focus({ preventScroll: true });
		} catch {
			/* a frame that cannot take focus keeps the page's */
		}
	}
}
