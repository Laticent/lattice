// Which host is the Studio running in: a browser tab (the website, the installed PWA) or
// the Lattice Studio desktop app (Tauri, `desktop/`). Split out of `platform.js` so code
// that only needs the ANSWER (for example, copy that describes where decks are stored)
// does not pull the save seam into the Studio's startup bundle. Anything the host must DO
// stays a seam in `platform.js`; see its header for why a call site never branches on its own.
//
// Plain JavaScript for the same reason as platform.js: Node-run tests import it.

// `@tauri-apps/api`'s `invoke` is a thin wrapper over this same global; calling it directly
// keeps a Tauri package out of the website's bundle for one function call.
/** @typedef {{ invoke: (cmd: string, args?: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown> }} TauriInternals */

/** @returns {TauriInternals | null} */
export function tauri() {
	if (typeof window === 'undefined') return null;
	return /** @type {{ __TAURI_INTERNALS__?: TauriInternals }} */ (/** @type {unknown} */ (window)).__TAURI_INTERNALS__ ?? null;
}

/** True inside the Lattice Studio desktop app. Prefer adding a seam in platform.js over branching on this. */
/** @returns {boolean} */
export function isDesktop() {
	return tauri() !== null;
}
