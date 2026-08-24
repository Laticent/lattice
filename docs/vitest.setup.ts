import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// A CONSIDERED budget for Testing Library's OWN clock, replacing the library's generic
// 1000ms default (#1806). This is a SECOND clock, one level inside `testTimeout`: a bare
// `waitFor` / `findBy*` expires on `asyncUtilTimeout` and the outer 20s budget is never
// consulted, so #1799's fix could not reach this class and did not claim to.
//
// The default was marginal on the real suite, not merely in theory. Measured on one box,
// 4-way CPU contention against 4 vitest workers on 4 cores, inside a FULL run — the
// condition, because the other workers are the dominant pressure:
//
//   StudioShell.test.tsx:470  findByPlaceholderText(/Describe a look/i)
//     three instrumented runs:  634.5ms · 752.3ms · 996.0ms   ← against a 1000ms budget
//   and uninstrumented, that same wait FAILED 2 of 3 contended runs.
//
// 996ms of a 1000ms budget is not a tail event; it is a wait sitting on its ceiling. Note
// what it is NOT: the same React.lazy Fabricate chunk, waited on as the FIRST test of a
// fresh file, costs 224-527ms across 72 samples in those same runs (p50 368ms). #1806
// measured that one and concluded 3.1-3.7x headroom. The marginal site is the 23rd test in
// a worker that has already rendered StudioShell 22 times — same chunk, twice the cost.
//
// WHY 3000, AND WHY NOT MORE. The number is not a multiple anyone argued for; it is read off
// the suite. This file already carries 18 explicit per-call budgets (11 `waitFor`, 7
// `findBy*`) and the SMALLEST of them is exactly 3000ms. A default above that would make
// eight waits — six at 3000 in `StudioShell.test.tsx`, two at 4000 in
// `studio.present-fullscreen` — TIGHTER than the default, i.e. an author's deliberate
// widening turned into the suite's narrowest budget, in the very file this change exists to
// stabilize. 3000 is therefore the largest value that leaves every existing budget coherent,
// and it is independently 3.0x the slowest wait measured above.
//
// (An earlier draft set 5000 and justified it as "5x a CENSORED floor, since a failing run
// yields no measurement". An independent checker refuted that: the 996.0ms sample was taken
// with a 60s ceiling precisely so it would report its true duration, so it is uncensored by
// construction. The honest caveat is small-sample — n=3, at one site — which is an argument
// for care, not for a bigger number. The same check found the "every explicit budget is at
// or above this" claim was false at 5000, and that the findBy* count was 284/7, not 283/3.)
//
// The cost this buys, stated because the earlier draft did not: a FAILING wait now takes 3s
// to report instead of 1s. 187 test blocks carry at least one bare Testing Library wait, so
// a broken shared selector makes a red run meaningfully slower. Green runs are unaffected —
// a wait resolves as soon as its condition does.
//
// See engineering/decisions/2026-08-24-testing-library-async-budget.md.
configure({ asyncUtilTimeout: 3_000 });

// The Studio persists decks + settings to localStorage; without a reset between
// tests, created/renamed decks bleed across cases and break "starts on deck 0"
// assumptions. Clear it after every test (inert outside jsdom).
afterEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* no storage in this env */
	}
});

// Radix UI primitives (Select, DropdownMenu, …) call these DOM APIs that jsdom
// does not implement; without them a trigger click never opens the content in
// tests. These polyfills are test-only and inert in the browser.
if (typeof window !== 'undefined') {
	// jsdom does not implement window.prompt (used by the deck rename flow); a
	// no-op stub keeps tests that brush the rename item from throwing.
	if (!window.prompt || window.prompt.toString().includes('not implemented')) {
		window.prompt = () => null;
	}
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
	}
	if (!Element.prototype.setPointerCapture) {
		Element.prototype.setPointerCapture = () => {};
	}
	if (!Element.prototype.releasePointerCapture) {
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
	// cmdk (the ⌘K command palette) and ScrollFade observe an element with
	// ResizeObserver, which jsdom doesn't implement; a no-op stub lets them mount in
	// tests. Typed as the real `ResizeObserver` (callback constructor) so a
	// `new ResizeObserver(cb)` call isn't flagged as a superfluous argument — without
	// an empty constructor body that lint would call useless.
	if (!('ResizeObserver' in window)) {
		class ResizeObserverStub {
			// Keep the callback the real ResizeObserver takes — a faithful 1-arg
			// signature (not a zero-arg class), so `new ResizeObserver(cb)` in app code
			// reads as correct. jsdom has no layout, so it's never invoked.
			readonly callback: ResizeObserverCallback;
			constructor(callback: ResizeObserverCallback) {
				this.callback = callback;
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		(window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
	}
	// CodeMirror measures selection geometry on a scrollIntoView dispatch (the
	// editor↔preview sync uses one); jsdom's Range has no real layout, so stub the
	// rect APIs to empty so the measurement is a no-op instead of throwing.
	if (typeof Range !== 'undefined') {
		const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
		const emptyRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
		Range.prototype.getClientRects = emptyRects;
		Range.prototype.getBoundingClientRect = emptyRect;
	}
	// jsdom ships no matchMedia; the Studio's responsive hook needs it. Default to
	// "desktop" (no query matches) so component tests render the full layout.
	if (!window.matchMedia) {
		window.matchMedia = (query: string) =>
			({
				matches: false,
				media: query,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false,
			}) as unknown as MediaQueryList;
	}
}
