// WRITE A PREVIEW FRAME'S `srcdoc` SO THE SERVICE WORKER STILL SERVES IT.
//
// Firefox gives an iframe's `srcdoc` document its parent's service-worker controller only when `srcdoc` was set BEFORE the
// frame went into the page. Setting it on a frame that is already in the page (a rewrite, or the first write into a frame
// appended empty, which is how the Studio mounts its preview) gives a document with none: `navigator.serviceWorker.controller`
// is null inside it and every request it makes (the runtime `<script src>`, the theme's fonts, Mermaid) goes straight to
// the network. Online nobody notices. Offline every one of them fails. Chromium and WebKit keep the controller. Removing
// the attribute first or loading `about:blank` in between does not help; a frame that is DETACHED while its `srcdoc`
// changes and then put back gets a fresh browsing context, and that one is controlled.
// Measured on Firefox 142, offline and online alike: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md.
//
// Re-inserting is not free where it is not needed: it drops the outgoing slide before the new document commits, which
// measured as an occasional one-frame blank on Chromium and WebKit, where an in-place write keeps the old slide up. So the
// helper ASKS the engine instead of assuming. The first rewrite on a controlled page re-inserts (safe either way) and
// starts a one-off probe: a hidden frame written twice, whose second document either has the controller or does not.
// An engine that keeps it goes back to writing in place for the rest of the page's life; one that drops it keeps
// re-inserting. No user-agent test, and the workaround switches itself off once Gecko fixes the bug.
//
// This helper never touches the markup: callers pass the document their builder already produced and sanitized (HARD RULE
// #22), exactly what they assigned to `frame.srcdoc` before. The probe's documents are two empty paragraphs.

/** How long the probe may take before it gives up and leaves the verdict unknown (re-insert stays on). */
const PROBE_MS = 5000;

/** Does a rewrite lose the controller in this engine? `null` until the probe has answered. */
let dropsController = null;
/** The probe in flight, so one page runs it once. */
let probing = null;

/** The page window that owns `frame` (the Studio's Stage window is a page of its own). */
const ownerWindow = (frame) => frame?.ownerDocument?.defaultView ?? null;

function controlled(win) {
	try {
		return !!win?.navigator?.serviceWorker?.controller;
	} catch {
		return false;
	}
}

/**
 * Ask this engine, once, whether a `srcdoc` rewrite keeps the service worker: write a hidden frame twice and look.
 * @param {Document} doc
 * @returns {Promise<void>}
 */
export function probeSrcdocRewrite(doc) {
	if (dropsController !== null || probing || !doc?.body) return probing ?? Promise.resolve();
	probing = new Promise((resolve) => {
		const f = doc.createElement('iframe');
		f.setAttribute('aria-hidden', 'true');
		f.tabIndex = -1;
		f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden';
		let writes = 0;
		const finish = (verdict) => {
			clearTimeout(timer);
			f.onload = null;
			f.remove();
			if (verdict !== undefined) dropsController = verdict;
			probing = null;
			resolve();
		};
		const timer = setTimeout(() => finish(undefined), PROBE_MS);
		f.onload = () => {
			let has = false;
			try {
				has = !!f.contentWindow?.navigator?.serviceWorker?.controller;
			} catch {
				has = false;
			}
			writes++;
			// The first document has no controller either: this engine does not hand srcdoc frames the worker at all, and
			// re-inserting cannot help. Stop paying for it.
			if (writes === 1 && !has) return finish(false);
			if (writes === 1) {
				f.srcdoc = '<p></p><p></p>';
				return;
			}
			finish(!has);
		};
		f.srcdoc = '<p></p>';
		doc.body.appendChild(f);
	});
	return probing;
}

/**
 * Should this write re-insert the frame? Only when the frame is in the page (a detached frame is already written the way
 * Firefox controls), the page is controlled (otherwise there is no controller to lose), and the engine has not shown it
 * keeps the controller on a write into a live frame.
 * @param {HTMLIFrameElement} frame
 */
export function srcdocRewriteNeedsReinsert(frame) {
	if (dropsController === false) return false;
	if (!frame?.isConnected || !frame.parentNode) return false;
	return controlled(ownerWindow(frame));
}

/**
 * Assign `html` as the frame's `srcdoc`. When the frame is in a page a service worker controls, and this engine drops the
 * controller on a write into a live frame (or has not been asked yet), the frame is taken out of the
 * tree for the assignment and put back where it was, so its new document is a client of the same worker. Focus that was
 * on the frame comes back to it.
 *
 * The element itself is kept (its id, classes, inline style, `onload` and listeners all survive); what changes is the
 * frame's WINDOW, which is a new object afterwards, so read `frame.contentWindow` after the load, never before the write.
 * A frame that is NOT in the page yet is written and then appended to `parent` when one is given: that is the shape every
 * engine controls, and it needs no probe and no re-insert. Prefer it for a first write.
 * @param {HTMLIFrameElement} frame
 * @param {string} html the sanitized document the builder produced
 * @param {Node} [parent] where to append a frame that is not in the page yet
 */
export function writeSrcdoc(frame, html, parent) {
	if (!frame.isConnected) {
		frame.srcdoc = html;
		if (parent && !frame.parentNode) parent.appendChild(frame);
		return;
	}
	if (!srcdocRewriteNeedsReinsert(frame)) {
		frame.srcdoc = html;
		return;
	}
	const home = frame.parentNode;
	const next = frame.nextSibling;
	const doc = frame.ownerDocument;
	// The frame's own root, so a frame inside a shadow root is seen too (there `document.activeElement` is the host).
	const root = frame.getRootNode();
	const hadFocus = (root && 'activeElement' in root ? root.activeElement : doc?.activeElement) === frame;
	if (dropsController === null) void probeSrcdocRewrite(doc);
	frame.remove();
	frame.srcdoc = html;
	try {
		home.insertBefore(frame, next && next.parentNode === home ? next : null);
	} catch {
		// The parent changed under us (a handler the removal ran moved things): never leave the frame out of the page.
		(home.isConnected ? home : doc.body).appendChild(frame);
	}
	if (hadFocus) {
		try {
			frame.focus({ preventScroll: true });
		} catch {
			/* a frame that cannot take focus keeps the page's */
		}
	}
}

/** Tests only: forget the probe's verdict, or set it. */
export function _setSrcdocRewriteVerdict(verdict) {
	dropsController = verdict;
	probing = null;
}
