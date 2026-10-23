// The docs-site binding of the DIAGRAM sanitizer (HARD RULE #22): what a Mermaid draw frame answers is untrusted text, and
// this is the one door it passes through before the preview's runtime writes it into a slide. The logic lives once in the
// engine at `lib/core/sanitize-diagram-svg.mjs`; this file supplies DOMPurify and the ambient `window`, exactly as
// `sanitize-slide-html.js` does for the slide profile.

import DOMPurify from 'dompurify';
import { createDiagramSanitizer } from '../../../lib/core/sanitize-diagram-svg.mjs';

let _browser;

/**
 * Sanitize a Mermaid figure's svg text before it reaches a preview frame. In a window-less context (a Node unit test)
 * there is no surface and it returns the input unchanged, as the slide binding does.
 *
 * @param {string} svg
 * @returns {string}
 */
export function sanitizeDiagramSvg(svg) {
	if (!svg) return svg;
	if (_browser === undefined) {
		const win = typeof window !== 'undefined' ? window : null;
		_browser = win ? createDiagramSanitizer(DOMPurify, win) : null;
	}
	return _browser ? _browser(svg) : svg;
}
