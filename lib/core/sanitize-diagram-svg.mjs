/**
 * lib/core/sanitize-diagram-svg.mjs
 *
 * The DIAGRAM profile of the slide sanitizer (HARD RULE #22, both channels). A Mermaid figure drawn in a
 * sandboxed draw frame (lib/packages/draw-frame-core.mjs) comes back to the page that embeds the preview as TEXT, and
 * that text is untrusted: the frame ran a library over an author's definition, so whatever the frame says is
 * a claim, not a fact. The slide sanitizer (`sanitize-slide-html.mjs`) cannot take it, because it forbids exactly what
 * every Mermaid figure is made of: a `<style>` (the diagram's own scoped sheet) and a `<foreignObject>` (every HTML label).
 *
 * This profile admits those two and nothing wider:
 *
 *   MARKUP      DOMPurify's svg, svgFilters and html profiles, plus `foreignObject` as an HTML integration point.
 *               `script`, `iframe`, `object`, `embed`, `form`, `input`, `base`, `link`, `meta` stay barred, as do
 *               `srcdoc` and every `on*` handler (DOMPurify's own rule).
 *   STYLESHEET  each `<style>` that survives is rewritten by `sanitizeStyleText` (a `</style` inside it would end the element
 *               and the rest would parse as markup), and an `@import` is dropped (a diagram's sheet has no use for a fetch).
 *
 * It is the same shape as `createSlideSanitizer`: a factory over an injected DOMPurify and a `window`, configured once.
 */

import { FORBID_ATTR, FORBID_TAGS, STYLE_SCRIPT_RE } from './sanitize-slide-html.mjs';
import sanitizeStyleText from './sanitize-style-text.mjs';

// The slide profile bars `style`; this one needs it, so it is lifted out of the bar and every other tag stays barred.
export const DIAGRAM_FORBID_TAGS = FORBID_TAGS.filter((t) => t !== 'style');
export const DIAGRAM_ADD_ATTR = ['dominant-baseline', 'vector-effect', 'target'];

/** CSS escapes decoded (`@\69mport` is the `@import` a browser reads). Used only to catch a hostile spelling; see `diagramStyleText`. */
const unescapeCss = (css) =>
	css.replace(/\\(?:([0-9a-f]{1,6})\s?|(.))/gis, (_m, hex, ch) => (hex ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16) || 0xfffd, 0x10ffff)) : ch));

/** A diagram sheet with its fetches removed and its terminator neutralized. */
export function diagramStyleText(css) {
	const strip = (text) => text.replace(/@import\b[^;]*;?/gi, '');
	let out = strip(String(css ?? ''));
	// An `@import` spelled with a CSS escape is hostile (a diagram's own sheet never does): whatever is left is read the way a browser reads it,
	// and the at-rule is dropped from that reading. This runs even when a literal `@import` was also present, so a decoy cannot turn it off.
	if (/@import\b/i.test(unescapeCss(out))) out = strip(unescapeCss(out));
	return sanitizeStyleText(out);
}

/**
 * @param {(win: any) => any} DOMPurifyFactory  the `dompurify` default export
 * @param {any} win                             a DOM `window` (real or jsdom)
 * @returns {(svg: string) => string}
 */
export function createDiagramSanitizer(DOMPurifyFactory, win) {
	const dp = DOMPurifyFactory(win);
	dp.addHook('uponSanitizeAttribute', (_node, data) => {
		if (data.attrName === 'style' && STYLE_SCRIPT_RE.test(data.attrValue)) data.keepAttr = false;
		// A link may open a new tab and nowhere else: `_top` would navigate the page that holds the preview.
		if (data.attrName === 'target' && data.attrValue !== '_blank') data.keepAttr = false;
	});
	dp.addHook('afterSanitizeElements', (node) => {
		if (node && node.nodeType === 1 && String(node.localName || '').toLowerCase() === 'style') node.textContent = diagramStyleText(node.textContent);
	});
	dp.setConfig({
		USE_PROFILES: { svg: true, svgFilters: true, html: true },
		ADD_TAGS: ['foreignObject', 'style'],
		HTML_INTEGRATION_POINTS: { foreignobject: true },
		FORBID_TAGS: DIAGRAM_FORBID_TAGS,
		FORBID_ATTR,
		ADD_ATTR: DIAGRAM_ADD_ATTR,
	});
	return (svg) => (!svg ? svg : dp.sanitize(String(svg)));
}
