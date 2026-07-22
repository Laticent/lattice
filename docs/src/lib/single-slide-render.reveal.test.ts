// Behavior tests for the CONTENT-DRIVEN reveal poll (#1163). Before this fix the poll that
// clears `__latticePendingLoad` (re-enabling the patch/restyle fast paths) was armed ONLY in the
// iframe-create branch, so on iOS Safari — which drops the srcdoc `onload` — a SUBSEQUENT write
// left pendingLoad stuck true forever, forcing every later edit onto a full realm-churning rewrite.
// The poll now arms on EVERY full write and supersedes a still-pending prior poll.
//
// jsdom cannot faithfully parse a srcdoc into the iframe's contentDocument, so the poll's actual
// paint DETECTION (frameHasPainted + the new-document identity guard) is genuinely iOS-Safari
// behavior and is UNVERIFIED here (HARD RULE #23) — it still REQUIRES real-device confirmation on
// an actual iPhone; it has NOT been run on one. What IS real module logic, and tested below: that a
// poll is armed on the write path, that a subsequent write supersedes the stale one, and that the
// poll stops + clears its handle once pendingLoad flips.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn(async () => ({ html: '<section></section>', css: '' })) }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };

type PollHost = HTMLElement & { __latticeRevealPoll?: ReturnType<typeof setInterval>; __latticePendingLoad?: boolean };

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: '<section></section>', css: '' }));
});
afterEach(() => {
	(window as unknown as { LatticePlayground?: unknown }).LatticePlayground = undefined;
	document.body.innerHTML = '';
});

function mountHost() {
	const host = document.createElement('figure') as PollHost;
	document.body.appendChild(host);
	return host;
}

describe('single-slide reveal poll (#1163)', () => {
	it('arms a reveal poll on the FIRST write and supersedes it on a SUBSEQUENT write', async () => {
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		// jsdom never paints the srcdoc, so the poll's pendingLoad never clears on its own — dispose()
		// in finally stops the live interval (clears ownedIntervals) so it can't leak across the suite.
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();

			await r.renderInto(host, '# a', false);
			const poll1 = host.__latticeRevealPoll;
			expect(poll1).toBeDefined(); // the write path armed a poll (was create-only before #1163)

			// A second full write. jsdom never paints a `.lattice` into the srcdoc, so the patch/restyle
			// fast paths (which require a painted live doc) miss and this re-writes — arming a NEW poll.
			// The stale poll MUST be cleared so only the latest write's poll runs (no stale tick firing
			// onFrameLoad against superseded state).
			await r.renderInto(host, '# b', false);
			const poll2 = host.__latticeRevealPoll;
			expect(poll2).toBeDefined();
			expect(poll2).not.toBe(poll1);
			expect(clearSpy).toHaveBeenCalledWith(poll1);
		} finally {
			r.dispose(); // stop the still-pending poll interval even if an assertion threw
			clearSpy.mockRestore();
		}
	});

	it('stops and clears its handle once __latticePendingLoad is cleared (the onload-work ran)', async () => {
		vi.useFakeTimers();
		const r = createSingleSlideRenderer(opts);
		try {
			const host = mountHost();
			await r.renderInto(host, '# a', false);
			expect(host.__latticeRevealPoll).toBeDefined();

			// Simulate the once-guarded load-work having run (via onload OR the poll's paint detection):
			// it clears pendingLoad. The poll's next tick must then stop itself and drop its handle.
			host.__latticePendingLoad = false;
			vi.advanceTimersByTime(100);
			expect(host.__latticeRevealPoll).toBeUndefined();
		} finally {
			r.dispose(); // belt-and-suspenders — the poll self-clears above, but release the renderer too
			vi.useRealTimers();
		}
	});
});
