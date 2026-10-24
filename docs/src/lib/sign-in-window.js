// The one eager piece of the sign-in seam (sign-in.js loads on the click): the popup has to
// open synchronously inside the click, before any `await`, or a popup blocker refuses it.

export const SIGN_IN_WINDOW = 'lattice-sign-in';

/**
 * Open the sign-in popup. Call it synchronously inside the click, before any `await`, or a
 * popup blocker refuses it. Returns null where a popup is not the right tool: blocked, or
 * an iOS home-screen app, whose popups open in a browser with its own storage and no way
 * back to the app.
 *
 * @returns {Window | null}
 */
export function openSignInWindow() {
	if (typeof window === 'undefined' || typeof window.open !== 'function') return null;
	if (/** @type {any} */ (navigator).standalone === true) return null;
	const w = 500;
	const h = 720;
	const left = Math.max(0, Math.round((window.screenX ?? 0) + ((window.outerWidth || w) - w) / 2));
	const top = Math.max(0, Math.round((window.screenY ?? 0) + ((window.outerHeight || h) - h) / 2));
	try {
		// An empty URL, not about:blank: opening a window that already exists by name with a URL
		// navigates it, which blanked an open sign-in on a second Connect.
		return window.open('', SIGN_IN_WINDOW, `popup,width=${w},height=${h},left=${left},top=${top}`) || null;
	} catch {
		return null;
	}
}
