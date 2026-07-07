// The docs-site binding of the shared slide-HTML sanitizer. The sanitize LOGIC +
// allowlist live once in the engine at `lib/core/sanitize-slide-html.mjs`
// (HARD RULE #1), so the self-contained `.html` EXPORT assembler can share it
// without depending on `docs/`. This file supplies the BROWSER half of the
// dependency-injection seam: it imports DOMPurify from the docs `node_modules`
// (which is why the shared module can't import it — see that module's header) and
// binds the sanitizer to the ambient `window`.
//
// Every docs preview builder keeps importing `@/lib/sanitize-slide-html.js`
// unchanged, and the HARD RULE #22 gate's `sanitizeSlideHtml(` call-site check is
// untouched. See the canonical module for the #616 threat model.

import DOMPurify from 'dompurify';
import { createSlideSanitizer } from '../../../lib/core/sanitize-slide-html.mjs';

export { createSlideSanitizer };

// Lazily-built browser sanitizer: `undefined` = unresolved, `null` = no DOM
// (window-less — provably no XSS surface), function = ready.
let _browser;

/**
 * Sanitize engine-rendered slide HTML before it enters a same-origin `srcdoc` /
 * `innerHTML` preview frame. Binds to the ambient `window`; in a window-less
 * context (a Node unit test of frame assembly / SSR — no XSS surface) it returns
 * the input unchanged (a no-op where there is no surface, NOT a fail-open).
 *
 * @param {string} html
 * @returns {string}
 */
export function sanitizeSlideHtml(html) {
	if (!html) return html;
	if (_browser === undefined) {
		const win = typeof window !== 'undefined' ? window : null;
		_browser = win ? createSlideSanitizer(DOMPurify, win) : null;
	}
	return _browser ? _browser(html) : html;
}
