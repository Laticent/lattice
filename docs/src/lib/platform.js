// The platform seam: the one place the Studio asks its HOST for something only the
// operating system can do. Today the host is either a browser tab (the website and
// the installed PWA) or the Lattice Studio desktop app (Tauri, `desktop/`).
//
// THE RULE THIS FILE ENFORCES (engineering/decisions/2026-09-24-lattice-studio-desktop.md):
// everything drawn inside the window is the Studio's own UI on every host; a seam
// exists only where a web page cannot do the job itself. Saving a file is the first
// such job. A browser saves by clicking a hidden download link; a desktop webview
// has no download manager behind that link (WebKitGTK and WKWebView drop it), so the
// desktop host shows the OS save dialog and writes the bytes in Rust instead.
//
// Opening a file is NOT a seam: `<input type="file">` already raises the native picker
// in WebKitGTK, WKWebView and WebView2, so the Studio's existing inputs work unchanged.
//
// Add a capability here, never at a call site. A caller that checks `isDesktop()` and
// branches on its own is a second seam, and the next port will miss it.
//
// Saves: Studio code calls `components/studio/download.js` (the one download helper). It
// saves in the browser itself and, in the desktop app, calls `saveFile` here. This file
// must not import download.js back, and must stay free of load-time side effects, or the
// bundler starts loading both at the Studio's startup (measured: +1.3 to +2.1KB gz).
//
// Plain JavaScript on purpose: download.js imports it, and the root unit suite loads
// download.js in Node (through export/deck-export.js), which cannot follow an import into
// TypeScript.

/** Did the save happen? `failed` carries no detail on purpose: the caller's only choice is
 *  which toast to show, and the desktop host has already logged the reason.
 *  @typedef {'saved' | 'cancelled' | 'failed'} SaveResult */

import { isDesktop, tauri } from './host.js';

/** True inside the Lattice Studio desktop app. Prefer adding a seam here over branching on this. */
export { isDesktop };

/** @typedef {import('./host.js').TauriInternals} TauriInternals */

/**
 * Save `data` as a file the user keeps, suggesting `filename`.
 *
 * DESKTOP ONLY. In a browser the save belongs to `components/studio/download.js`, which
 * must click its link inside the user's gesture; this returns `failed` there and does
 * nothing, because nothing in the Studio reaches it from a browser.
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
		const run = (desktopQueue ?? Promise.resolve()).then(() => saveDesktop(host, filename, data));
		desktopQueue = run.catch(() => {});
		return run;
	}
	return Promise.resolve('failed');
}

// Created on the first save, not at load: a call at module scope reads as a side effect
// to the bundler, which would then load this module (and download.js) at startup.
/** @type {Promise<unknown> | null} */
let desktopQueue = null;

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

