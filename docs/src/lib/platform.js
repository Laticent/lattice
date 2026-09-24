// The platform seam: the one place the Studio asks its HOST for something only the
// operating system can do. Today the host is either a browser tab (the website and
// the installed PWA) or the Lattice Studio desktop app (Tauri, `desktop/`).
//
// THE RULE THIS FILE ENFORCES (engineering/decisions/2026-09-24-lattice-studio-desktop.md):
// everything drawn inside the window is the Studio's own UI on every host; a seam
// exists only where a web page cannot do the job itself. Saving a file is the first
// such job. A browser saves by clicking a hidden `<a download>`; a desktop webview
// has no download manager behind that link (WebKitGTK and WKWebView drop it), so the
// desktop host shows the OS save dialog and writes the bytes in Rust instead.
//
// Opening a file is NOT a seam: `<input type="file">` already raises the native picker
// in WebKitGTK, WKWebView and WebView2, so the Studio's existing inputs work unchanged.
//
// Add a capability here, never at a call site. A caller that checks `isDesktop()` and
// branches on its own is a second seam, and the next port will miss it.
//
// Plain JavaScript on purpose: `export/deck-export.js` imports it, and the root unit
// suite loads that file in Node, which cannot follow an import into TypeScript.

/** Did the save happen? `failed` carries no detail on purpose: the caller's only choice is
 *  which toast to show, and the desktop host has already logged the reason.
 *  @typedef {'saved' | 'cancelled' | 'failed'} SaveResult */

// `@tauri-apps/api`'s `invoke` is a thin wrapper over this same global; calling it directly
// keeps a Tauri package out of the website's bundle for one function call.
/** @typedef {{ invoke: (cmd: string, args?: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown> }} TauriInternals */

/** @returns {TauriInternals | null} */
function tauri() {
	if (typeof window === 'undefined') return null;
	return /** @type {{ __TAURI_INTERNALS__?: TauriInternals }} */ (/** @type {unknown} */ (window)).__TAURI_INTERNALS__ ?? null;
}

/** True inside the Lattice Studio desktop app. Prefer adding a seam here over branching on this. */
/** @returns {boolean} */
export function isDesktop() {
	return tauri() !== null;
}

/**
 * Save `data` as a file the user keeps, suggesting `filename`.
 *
 * WEB: clicks a hidden `<a download>` SYNCHRONOUSLY, before any `await`. Browsers only
 * honor a download while the click that asked for it is still the active user gesture,
 * so an `await` ahead of the click would get the file silently blocked. The browser
 * gives no signal back, so the web answer is always `saved`.
 *
 * DESKTOP: sends the bytes as a raw IPC body (no JSON/base64 round trip, which would
 * triple a 20MB PDF) to the `save_file` command, which shows the native save dialog and
 * writes the file. The name travels in a header because a raw body has no other field.
 *
 * @param {string} filename
 * @param {Blob} data
 * @returns {Promise<SaveResult>}
 */
export function saveFile(filename, data) {
	const host = tauri();
	if (host) {
		// One dialog at a time. Fabricate's "export all" saves several files in a loop, and
		// each save_file call runs on its own worker thread, so without the queue every
		// dialog would open at once, stacked on top of each other.
		const run = desktopQueue.then(() => saveDesktop(host, filename, data));
		desktopQueue = run.catch(() => {});
		return run;
	}
	return Promise.resolve(saveWeb(filename, data));
}

/** @type {Promise<unknown>} */
let desktopQueue = Promise.resolve();

/** @param {string} filename @param {Blob} data @returns {SaveResult} */
function saveWeb(filename, data) {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return 'failed';
	const url = URL.createObjectURL(data);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Deferred: revoking in the same task can cancel the download in Firefox before it
	// has read the blob. (Four of the five helpers this replaced already waited 1s.)
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return 'saved';
}

/** @param {TauriInternals} host @param {string} filename @param {Blob} data @returns {Promise<SaveResult>} */
async function saveDesktop(host, filename, data) {
	try {
		const bytes = new Uint8Array(await data.arrayBuffer());
		const saved = await host.invoke('save_file', bytes, { headers: { 'x-lattice-filename': encodeURIComponent(filename) } });
		return saved ? 'saved' : 'cancelled';
	} catch (err) {
		console.error('[platform] save_file failed', err);
		return 'failed';
	}
}
