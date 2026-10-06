// The sign-in seam: sign in to an external service without the Studio leaving the screen.
// A sibling of `platform.js`, not part of it, because platform.js loads at startup on the
// Playground (its export imports `saveFile`) and sign-in is reached only from a Connect
// click. Same rule as every seam: call sites use this, never `isDesktop()` on their own.
//
// Plain JavaScript, like platform.js, so Node-run tests can import it.

import { tauri } from './host.js';

// The desktop app's sign-in callback. OpenRouter accepts a localhost callback; the app never
// loads it. The sign-in window stops the navigation the moment the address appears and hands
// the URL back (desktop/src-tauri/src/lib.rs, `sign_in`), so nothing has to listen on it.
export const DESKTOP_SIGN_IN_CALLBACK = 'http://localhost:3000/lattice-studio/oauth';

/**
 * Sign in to an external service (today, OpenRouter's OAuth) without the Studio leaving the
 * screen.
 *
 * `begin(callback)` builds the service's sign-in URL for a given callback address.
 *
 * WEB: the page itself goes to the service and comes back to `webCallback` with `?code=`;
 * the Studio finishes the exchange on load (architect.ts, `resumePendingAuth`). The promise
 * never settles, because the page navigates away.
 *
 * DESKTOP: the main window never leaves the Studio (the owner's call, 2026-10-05: the user
 * should never meet the browser engine). A separate sign-in window shows the service, and
 * this resolves with the callback URL it was sent to, or `null` when the user closed it.
 *
 * @param {(callback: string) => Promise<string | null>} begin
 * @param {string} webCallback
 * @returns {Promise<string | null>}
 */
export async function signIn(begin, webCallback) {
	const host = tauri();
	if (host) {
		const url = await begin(DESKTOP_SIGN_IN_CALLBACK);
		if (!url) return null;
		const back = await host.invoke('sign_in', { url, callback: DESKTOP_SIGN_IN_CALLBACK });
		return typeof back === 'string' ? back : null;
	}
	const url = await begin(webCallback);
	if (url) location.href = url;
	return new Promise(() => {});
}
