import { describe, expect, it, vi } from 'vitest';
import { exitFullscreen, fullscreenSupported, isFullscreen, toggleFullscreen, watchFullscreen } from './fullscreen';

// The DOM half of whole-screen delivery. The interesting cases are all ABSENCE
// cases — a browser that ships none of the API (iPhone Safari), a frame that is
// not allowed to use the API it ships (an embed without `allow="fullscreen"`),
// and a request that is refused after we asked.

/** A document stub carrying only the members this module reads. `fullscreenEnabled`
 *  defaults ON, so each test states just the absence it is about. */
function fakeDoc(over: Record<string, unknown> = {}) {
	const listeners = new Map<string, Set<() => void>>();
	const doc = {
		fullscreenEnabled: true,
		fullscreenElement: null as unknown,
		// The default request/exit ACTUALLY change the state, because `toggleFullscreen`
		// now believes the document rather than the promise — a stub that resolves without
		// moving is a FAILING browser, and several tests below rely on that being detected.
		documentElement: { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = {}; doc.fire('fullscreenchange'); }) },
		exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; doc.fire('fullscreenchange'); }),
		addEventListener: (type: string, fn: () => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)?.add(fn);
		},
		removeEventListener: (type: string, fn: () => void) => { listeners.get(type)?.delete(fn); },
		/** Test-only: what a browser does when the state actually changes. */
		fire: (type: string) => { for (const fn of listeners.get(type) ?? []) fn(); },
		counts: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
		...over,
	};
	return doc as unknown as Document & { fire: (t: string) => void; counts: () => number };
}

describe('fullscreenSupported', () => {
	it('is true when the browser reports the API is allowed here', () => {
		expect(fullscreenSupported(fakeDoc())).toBe(true);
	});

	it('accepts the -webkit- half alone (older iPad Safari)', () => {
		expect(fullscreenSupported(fakeDoc({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true }))).toBe(true);
	});

	// The whole reason the button is conditional. iPhone Safari has never shipped the
	// Fullscreen API for arbitrary elements — only the native video player — while iPad
	// Safari has, for the entire life of the API (caniuse `fullscreen`, note 5).
	it('is false when the browser ships no Fullscreen API at all (iPhone Safari)', () => {
		expect(fullscreenSupported(fakeDoc({ fullscreenEnabled: undefined }))).toBe(false);
	});

	// `fullscreenEnabled` and "the method exists" are NOT the same question, and this
	// is the case that separates them: an embedded frame has `requestFullscreen` and
	// would have the call rejected. Detecting on the method would show a dead button.
	it('is false in a frame that is not permitted to use the API it ships', () => {
		const doc = fakeDoc({ fullscreenEnabled: false });
		expect(typeof (doc.documentElement as unknown as { requestFullscreen?: unknown }).requestFullscreen).toBe('function');
		expect(fullscreenSupported(doc)).toBe(false);
	});

	it('is false with no document at all (SSR)', () => {
		expect(fullscreenSupported(undefined)).toBe(false);
		expect(isFullscreen(undefined)).toBe(false);
	});
});

describe('toggleFullscreen', () => {
	it('requests on the ROOT element, not the overlay', async () => {
		// documentElement is exempt from the UA rules that give a non-root fullscreen
		// element `position:fixed !important` and a black `::backdrop`, and nothing in
		// the DOM moves — so the live-preview iframe is untouched.
		const doc = fakeDoc();
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: true });
		expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
	});

	it('exits when already fullscreen', async () => {
		const doc = fakeDoc({ fullscreenElement: {} });
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: true });
		expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
		expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
	});

	it('does nothing at all where the API is unavailable', async () => {
		const doc = fakeDoc({ fullscreenEnabled: undefined });
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: false, reason: 'this browser has no Fullscreen API', fatal: true });
		expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
	});

	// A refusal must be REPORTABLE, not swallowed. The browser can reject for reasons the
	// caller cannot fix (an untrusted gesture, a permissions policy, an OS refusal) — and
	// every one of them looks to the reader like a button that does nothing, which is the
	// dead affordance this whole module exists to prevent. The first version returned a
	// bare boolean and ate the error; a user reported the result as "seems like a no-op",
	// which is precisely what a silent refusal feels like from the outside.
	it('carries the browser\'s own reason back when the request is refused', async () => {
		const doc = fakeDoc({
			documentElement: {
				requestFullscreen: vi.fn(async () => {
					throw new TypeError('Request for fullscreen was denied because Element.requestFullscreen() was not called from inside a short running user-generated event handler.');
				}),
			},
		});
		const res = await toggleFullscreen(doc);
		expect(res.ok).toBe(false);
		expect(res.reason).toContain('short running user-generated event handler');
	});

	it('falls back to the error NAME when a rejection carries no message', async () => {
		const doc = fakeDoc({ documentElement: { requestFullscreen: vi.fn(async () => { throw new DOMException('', 'NotAllowedError'); }) } });
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: false, reason: 'NotAllowedError' });
	});

	it('reports a refusal from the EXIT path too', async () => {
		const doc = fakeDoc({ fullscreenElement: {}, exitFullscreen: vi.fn(async () => { throw new Error('nope'); }) });
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: false, reason: 'nope' });
	});

	it('falls back to the -webkit- entry points', async () => {
		// The legacy entry point returns UNDEFINED — there is no promise to await, which is
		// exactly why the outcome is what gets waited on. Model it the way old WebKit behaves:
		// the call returns immediately and the state lands later, on the prefixed event.
		const doc = fakeDoc({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true, documentElement: {} });
		const webkitRequestFullscreen = vi.fn(() => {
			setTimeout(() => { (doc as unknown as { fullscreenElement: unknown }).fullscreenElement = {}; doc.fire('webkitfullscreenchange'); }, 10);
		});
		(doc.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen = webkitRequestFullscreen;
		await expect(toggleFullscreen(doc)).resolves.toEqual({ ok: true });
		expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
	});

	// THE REPORTED BUG. Firefox on iPad is not Gecko — iOS requires every browser to be a
	// WKWebView, where Apple gates this API behind `WKPreferences.isElementFullscreenEnabled`,
	// DEFAULT FALSE for third-party apps. So the engine answers "supported", the request goes
	// quiet, and the reader gets a button that does nothing. No capability check can see this
	// coming; only watching the outcome catches it.
	it('catches a browser that ACCEPTS the request and does nothing (WKWebView)', async () => {
		const doc = fakeDoc({ documentElement: { requestFullscreen: vi.fn(async () => {}) } });
		const res = await toggleFullscreen(doc);
		expect(res.ok).toBe(false);
		expect(res.fatal).toBe(true);
		expect(res.reason).toContain('will not hand over the screen');
	});
	// The same shape, one degree worse: the call never settles at all. Awaiting it would
	// hang forever and no message would ever reach the reader.
	it('catches a request that never settles', async () => {
		const doc = fakeDoc({ documentElement: { requestFullscreen: vi.fn(() => new Promise<void>(() => {})) } });
		const res = await toggleFullscreen(doc);
		expect(res.ok).toBe(false);
		expect(res.fatal).toBe(true);
	});
	// A REJECTION is not fatal — the browser said no in words, and an untrusted gesture is
	// the common transient cause. Only silence retires the control.
	it('does not mark a spoken rejection as fatal', async () => {
		const doc = fakeDoc({ documentElement: { requestFullscreen: vi.fn(async () => { throw new Error('nope'); }) } });
		expect((await toggleFullscreen(doc)).fatal).toBeUndefined();
	});
});

describe('exitFullscreen', () => {
	it('leaves fullscreen when in it', async () => {
		const doc = fakeDoc({ fullscreenElement: {} });
		await exitFullscreen(doc);
		expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
	});

	// Present closes far more often than it closes FROM fullscreen; calling exit when
	// nothing is fullscreen throws in some engines, so the guard is load-bearing.
	it('is a no-op when nothing is fullscreen', async () => {
		const doc = fakeDoc();
		await exitFullscreen(doc);
		expect(doc.exitFullscreen).not.toHaveBeenCalled();
	});
});

describe('watchFullscreen', () => {
	it('fires immediately, so a consumer that mounts already-fullscreen is right on first paint', () => {
		const seen: boolean[] = [];
		watchFullscreen((v) => seen.push(v), fakeDoc({ fullscreenElement: {} }));
		expect(seen).toEqual([true]);
	});

	// The point of the whole module: the reader can leave fullscreen by Escape, F11, the
	// macOS traffic lights or iPad Safari's own exit chip, none of which touch our button.
	it('reports a change the button did not make', () => {
		const doc = fakeDoc({ fullscreenElement: {} });
		const seen: boolean[] = [];
		watchFullscreen((v) => seen.push(v), doc);
		(doc as unknown as { fullscreenElement: unknown }).fullscreenElement = null;
		doc.fire('fullscreenchange');
		expect(seen).toEqual([true, false]);
	});

	it('also hears the -webkit- event name', () => {
		const doc = fakeDoc();
		const seen: boolean[] = [];
		watchFullscreen((v) => seen.push(v), doc);
		doc.fire('webkitfullscreenchange');
		expect(seen).toEqual([false, false]);
	});

	it('unsubscribes both listeners', () => {
		const doc = fakeDoc();
		const off = watchFullscreen(() => {}, doc);
		expect(doc.counts()).toBe(2);
		off();
		expect(doc.counts()).toBe(0);
	});
});
