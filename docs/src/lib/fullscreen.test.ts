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
		documentElement: { requestFullscreen: vi.fn(async () => {}) },
		exitFullscreen: vi.fn(async () => {}),
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
		await expect(toggleFullscreen(doc)).resolves.toBe(true);
		expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
	});

	it('exits when already fullscreen', async () => {
		const doc = fakeDoc({ fullscreenElement: {} });
		await expect(toggleFullscreen(doc)).resolves.toBe(false);
		expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
		expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
	});

	it('does nothing at all where the API is unavailable', async () => {
		const doc = fakeDoc({ fullscreenEnabled: undefined });
		await expect(toggleFullscreen(doc)).resolves.toBe(false);
		expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
	});

	// A refusal is not a crash: the browser can reject for reasons the caller cannot fix
	// (an untrusted gesture, a permissions policy, an OS refusal). We report the state
	// that actually holds, and the button — driven by the event — stays un-pressed.
	it('reports the real state when the request is refused', async () => {
		const doc = fakeDoc({ documentElement: { requestFullscreen: vi.fn(async () => { throw new Error('denied'); }) } });
		await expect(toggleFullscreen(doc)).resolves.toBe(false);
	});

	it('falls back to the -webkit- entry points', async () => {
		const webkitRequestFullscreen = vi.fn();
		const doc = fakeDoc({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true, documentElement: { webkitRequestFullscreen } });
		await expect(toggleFullscreen(doc)).resolves.toBe(true);
		expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
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
