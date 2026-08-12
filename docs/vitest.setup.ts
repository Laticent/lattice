import { configure } from '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { ASYNC_UTIL_TIMEOUT_MS } from './test-budgets.js';

// Testing Library polls `findBy*` / `waitFor` for 1 s by default — sized for a
// query against an idle DOM, not for one that has to wait out a StudioShell
// render plus a 400 ms assessment debounce while three sibling test files
// compete for the same cores. That default is the inner half of #1324: the
// failure it produced ("Unable to find an element with the placeholder text
// of: /Describe a look/i") reads like a missing element and is really a missed
// deadline. Rationale + measurements: ./test-budgets.js.
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

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
