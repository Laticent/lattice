// The sign-in seam: sign in to an external service (today, OpenRouter's OAuth) without the
// Studio leaving the screen. The service's page opens in a popup; when it sends the popup
// back to our callback page (docs/public/sign-in/callback/index.html), that page hands the
// callback URL to this tab and closes. The full-page redirect is the fallback for when a
// popup cannot be opened.
//
// Plain JavaScript, so Node-run tests can import it. It loads on the click; the popup itself
// opens from sign-in-window.js, which must run before that import's `await`.

// The channel the callback page and this tab talk on. Both are same-origin, so nothing
// outside the site can post on it. `window.opener` is the second route, but it is not
// enough alone: a sign-in page that sends `Cross-Origin-Opener-Policy` (Google's does, when
// OpenRouter signs the user in with Google) cuts the popup off from its opener for good.
export const SIGN_IN_CHANNEL = 'lattice-sign-in';
// Where the callback page sends itself when no tab answers it (this tab was reloaded or
// closed mid-sign-in): the page the sign-in started from, which finishes it on load.
export const SIGN_IN_RETURN_LS = 'lattice-sign-in-return';
// How long a tab keeps listening after the popup reads as closed. A severed popup (above)
// reads as closed while the user is still signing in, so "closed" resets the button but the
// code is still accepted when it comes.
const LATE_MS = 10 * 60 * 1000;
const POLL_MS = 500;

/** The callback page's address on this site. */
export function webSignInCallback() {
	return new URL('/sign-in/callback/', location.origin).toString();
}

// The sign-in in flight: { promise, settled, cancel }. Kept through the late window too, so a
// new sign-in can stop the old listener. That does not stop the new listener from taking a
// code the OLD popup sends (nothing in the callback names the sign-in it belongs to), and
// that code fails the exchange against the new PKCE verifier. The user sees "Connect
// failed" and connects again; a nonce in the callback would need OpenRouter to keep a query
// on `callback_url`, which is unverified.
let pending = null;

/**
 * Sign in to an external service.
 *
 * `begin(callback)` builds the service's sign-in URL for a given callback address.
 *
 * With a `popup` (from openSignInWindow), the popup goes to the service and this resolves
 * with the callback URL it came back to, or `null` once the popup reads as closed. A code
 * that arrives after that `null` (see LATE_MS) goes to `onLate` instead.
 *
 * Without one, the page itself goes to the service and comes back to `pageCallback` with
 * `?code=`, which the Studio finishes on load (architect.ts, `resumePendingAuth`). The promise
 * never settles, because the page navigates away.
 *
 * @param {(callback: string) => Promise<string | null>} begin
 * @param {string} pageCallback
 * @param {{ popup?: Window | null, onLate?: (url: string) => void }} [opts]
 * @returns {Promise<string | null>}
 */
export async function signIn(begin, pageCallback, opts = {}) {
	const { popup = null, onLate } = opts;
	if (!popup) {
		const url = await begin(pageCallback);
		if (url) location.href = url;
		return new Promise(() => {});
	}
	// One sign-in at a time. The popup is reused by name, so a second Connect while it is
	// open brings it forward and waits on the same answer.
	if (pending && !pending.settled) {
		try { popup.focus(); } catch { /* best effort */ }
		return pending.promise;
	}
	pending?.cancel();
	const state = waitForCallback(popup, onLate);
	pending = state;
	let url;
	try {
		url = await begin(webSignInCallback());
	} catch (e) {
		state.cancel(null);
		try { popup.close(); } catch { /* already gone */ }
		throw e;
	}
	if (!url) {
		state.cancel(null);
		try { popup.close(); } catch { /* already gone */ }
		return state.promise;
	}
	try { localStorage.setItem(SIGN_IN_RETURN_LS, pageCallback); } catch { /* the fallback is lost, nothing else */ }
	popup.location.href = url;
	return state.promise;
}

function waitForCallback(popup, onLate) {
	/** @type {(v: string | null) => void} */
	let resolve = () => {};
	const promise = new Promise((r) => { resolve = r; });
	let done = false;
	let late = 0;
	const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SIGN_IN_CHANNEL) : null;
	const state = { promise, settled: false, cancel: (v = null) => { settle(v); finish(); } };

	const settle = (v) => {
		if (state.settled) return false;
		state.settled = true;
		resolve(v);
		return true;
	};
	const finish = () => {
		if (done) return;
		done = true;
		clearInterval(poll);
		clearTimeout(late);
		window.removeEventListener('message', onMessage);
		channel?.close();
		try { localStorage.removeItem(SIGN_IN_RETURN_LS); } catch { /* nothing to clear */ }
		if (pending === state) pending = null;
	};
	const accept = (data) => {
		if (done || !data || data.type !== 'sign-in-callback' || typeof data.url !== 'string') return;
		// Only our own callback page: the callback URL must be on this origin and that path.
		let back;
		try { back = new URL(data.url); } catch { return; }
		const expected = new URL(webSignInCallback());
		if (back.origin !== expected.origin || back.pathname !== expected.pathname) return;
		try { channel?.postMessage({ type: 'sign-in-ack' }); } catch { /* the page closes on its own timer */ }
		try { popup.close(); } catch { /* severed or gone */ }
		finish();
		if (!settle(data.url)) onLate?.(data.url);
	};
	const onMessage = (e) => {
		if (e.origin !== location.origin) return;
		accept(e.data);
	};
	if (channel) channel.onmessage = (e) => accept(e.data);
	window.addEventListener('message', onMessage);
	const poll = setInterval(() => {
		let closed = true;
		try { closed = popup.closed; } catch { /* treat as closed */ }
		if (!closed || state.settled) return;
		settle(null);
		clearInterval(poll);
		// A tab that cannot hear a late answer has nothing to wait for.
		if (channel && onLate) late = setTimeout(finish, LATE_MS);
		else finish();
	}, POLL_MS);
	return state;
}

/** Test seam: forget a sign-in in flight. */
export function _resetSignIn() {
	pending?.cancel();
	pending = null;
}
