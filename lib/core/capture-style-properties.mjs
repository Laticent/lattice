// The computed-style properties an html-to-image capture copies onto its clone.
//
// html-to-image copies a node's computed style by walking the property names the browser
// LISTS for it, and Chrome's list leaves out `counter-reset`, `counter-increment` and
// `counter-set`. A clone made from that list carries `content: counter(x)` with no counter
// ever reset or incremented, so every CSS counter on a slide (timeline discs, agenda and
// step numbers, card tags) captures as 0. So every capture passes the browser's list plus
// the three counter properties as `includeStyleProperties`.
//
// html-to-image keeps the list from its FIRST call for the whole page, so every capture on
// a page must pass this same list: route each one through this function, never a bare
// `toPng`/`toCanvas`. Used by the Studio (deck-export.js), the /calco page and the composed
// PDF's html-to-image camera (pdf-compose/compose.mjs). See engineering/gotchas/export.md.

const COUNTERS = ['counter-reset', 'counter-increment', 'counter-set'];

let cached = null;

/**
 * The browser's computed-style property list plus the counter properties, once each. The
 * same array every call, because html-to-image keeps the first list it is given. Without a
 * document (Node), undefined: html-to-image's own default, and nothing there captures.
 * @param {Document} [doc]
 * @returns {string[] | undefined}
 */
export function captureStyleProperties(doc = globalThis.document) {
	if (!doc?.defaultView) return undefined;
	if (!cached) {
		const listed = Array.from(doc.defaultView.getComputedStyle(doc.documentElement));
		cached = [...listed, ...COUNTERS.filter((p) => !listed.includes(p))];
	}
	return cached;
}
