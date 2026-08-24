// fullscreen — the DOM half of "put this deck on the whole screen".
//
// Sibling of `deck-nav.ts`: the headless kernel (`lib/core/present-transport.mjs`)
// is DOM-free by construction and its source is inlined verbatim into the export
// player, so it cannot hold anything that touches `document`. The Fullscreen API is
// nothing BUT `document`, so its rules live here.
//
// Two things this module exists to get right, and both are the reason it is not
// three inline lines at the call site.
//
// 1. CAPABILITY IS DETECTED, NEVER INFERRED FROM THE DEVICE. The Fullscreen API is
//    the one capability in the Studio that genuinely is absent on a shipping
//    device — WebKit supports it on iPad and NOT on iPhone, and has for the whole
//    life of the API (caniuse `fullscreen`, note 5: "supporting only iPad, not
//    iPhone", still true through iOS 26.x). That is a real gap, unlike the input
//    verbs, where `2026-08-10-input-verb-parity.md` established that device class
//    must never gate a verb. The distinction: parity says never ask "what KIND of
//    machine is this", it does not say never ask "does this API exist here".
//
//    So we ask the API, not the user agent — and a user-agent test would be
//    actively wrong here, because iPadOS Safari reports itself as macOS by default
//    (desktop-class browsing), so the one device that DOES support fullscreen is
//    also the one a UA sniff cannot distinguish from a Mac. `fullscreenEnabled` is
//    the exact bit we want: false on iPhone Safari, true on iPad and every desktop
//    engine, and ALSO false inside an iframe whose `allow` list omits `fullscreen`
//    — a case a bare `'requestFullscreen' in element` test passes while the call
//    itself would reject, leaving a dead button on screen.
//
// 2. THE TRUTH IS THE EVENT, NEVER OUR OWN STATE. A reader leaves fullscreen with
//    Escape, F11, the macOS traffic lights, a Space switch or (on iPad) WebKit's
//    own non-dismissible exit chip — none of which route through our button. Any
//    boolean we set at call time is stale the first time that happens, so
//    {@link watchFullscreen} subscribes and {@link isFullscreen} reads the
//    document. Nothing here caches.

/** The `-webkit-` half of the surface, as optional members rather than `any` casts. */
type WebkitDocument = Document & {
	webkitFullscreenEnabled?: boolean;
	webkitFullscreenElement?: Element | null;
	webkitExitFullscreen?: () => void;
};
type WebkitElement = Element & { webkitRequestFullscreen?: () => void };

/**
 * Can this browser put an element on the whole screen?
 *
 * SSR-safe (returns false with no `document`), so a component may call it during
 * render — but a React island must still settle it in an effect rather than in
 * initial state, or the server's `false` and the client's `true` disagree and
 * hydration warns.
 *
 * Reads `fullscreenEnabled`, which answers "would a request be allowed here",
 * NOT `'requestFullscreen' in el`, which answers only "is the method present".
 * The two differ in the case that matters: an embedded frame without
 * `allow="fullscreen"` has the method and rejects the call.
 */
export function fullscreenSupported(doc: Document | undefined = globalThis.document): boolean {
	if (!doc) return false;
	const d = doc as WebkitDocument;
	return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

/** Is something on the whole screen right now? Read from the document, never cached. */
export function isFullscreen(doc: Document | undefined = globalThis.document): boolean {
	if (!doc) return false;
	const d = doc as WebkitDocument;
	return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * The outcome of a toggle. `ok:false` means the browser REFUSED — the request
 * rejected, or the API is not available here.
 *
 * This exists because the first version returned a bare boolean and swallowed the
 * rejection, which made a refusal indistinguishable from a dead button: the one
 * failure mode this whole module was written to avoid, reintroduced at the point
 * where it is least visible. A refusal is not the caller's fault and not always
 * fixable, but it is ALWAYS worth saying out loud — the reader is standing in
 * front of a room wondering why nothing happened.
 */
export type FullscreenResult = { ok: boolean; reason?: string };

/**
 * Toggle fullscreen, resolving to whether the browser ACCEPTED the request (not
 * to the resulting state — that arrives on the event; see {@link watchFullscreen}).
 *
 * The target is `documentElement` and that is deliberate. Fullscreening the
 * Present dialog instead would drag two problems in for no gain: the UA stylesheet
 * gives a non-root fullscreen element `position:fixed !important` plus a black
 * `::backdrop`, which fights an overlay that is already `fixed inset-0` over a
 * themed background; and promoting an ancestor of the live-preview iframe into the
 * top layer risks a re-layout of the very surface being presented. The root
 * element is exempt from those UA rules, the overlay already covers the viewport,
 * and every other Studio layer (toasts, popovers portaled to `<body>`, the
 * chart-detail layer) keeps working because nothing moved in the DOM.
 *
 * A rejection is REPORTED, never swallowed. A browser can refuse for reasons the
 * caller cannot fix — the gesture is no longer trusted, a permissions policy or
 * enterprise setting forbids it, the OS declines — and every one of those looks
 * to the reader like a button that does nothing. The caller turns `reason` into
 * something a human can act on; `watchFullscreen` still owns the pressed state,
 * so a refused request correctly leaves the control un-pressed as well.
 *
 * `requestFullscreen` is called SYNCHRONOUSLY inside the caller's event handler —
 * `await X` evaluates X before it suspends — which is what keeps the transient
 * user activation the API requires. Do not hoist an `await` above it.
 */
export async function toggleFullscreen(doc: Document | undefined = globalThis.document): Promise<FullscreenResult> {
	if (!doc) return { ok: false, reason: 'no document' };
	if (!fullscreenSupported(doc)) return { ok: false, reason: 'unsupported' };
	const d = doc as WebkitDocument;
	const el = doc.documentElement as WebkitElement;
	try {
		if (isFullscreen(doc)) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
		else await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
		return { ok: true };
	} catch (err) {
		// Firefox rejects with a TypeError whose message names the actual cause
		// ("...not called from inside a short running user-generated event handler",
		// "...fullscreen is not enabled"), which is exactly what a bug report needs.
		const e = err as { name?: string; message?: string } | null;
		return { ok: false, reason: e?.message || e?.name || 'refused' };
	}
}

/** Leave fullscreen if we are in it. Used when Present closes — the window returns
 *  to the size the reader had it at, rather than stranding the editor full-screen. */
export async function exitFullscreen(doc: Document | undefined = globalThis.document): Promise<void> {
	if (!doc || !isFullscreen(doc)) return;
	const d = doc as WebkitDocument;
	try {
		await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
	} catch {
		/* Already gone, or refused — either way there is nothing to report. */
	}
}

/**
 * Subscribe to fullscreen changes; returns an unsubscribe. Fires immediately with
 * the current state so a caller never has to seed it separately (and so a
 * component that mounts while already fullscreen is correct on its first paint).
 *
 * Both event names are bound because WebKit dispatches the prefixed one on older
 * builds and the standard one on new; a browser that sends both simply calls back
 * twice with the same boolean, which is idempotent for every consumer here.
 */
export function watchFullscreen(fn: (full: boolean) => void, doc: Document | undefined = globalThis.document): () => void {
	if (!doc) return () => {};
	const emit = () => fn(isFullscreen(doc));
	doc.addEventListener('fullscreenchange', emit);
	doc.addEventListener('webkitfullscreenchange', emit);
	emit();
	return () => {
		doc.removeEventListener('fullscreenchange', emit);
		doc.removeEventListener('webkitfullscreenchange', emit);
	};
}
