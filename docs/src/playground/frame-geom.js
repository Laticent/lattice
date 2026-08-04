// frame-geom — the ONE parent-to-iframe coordinate bridge.
//
// A preview host can `transform: scale()` the slide iframe (the Studio scales it to fit its
// pane), so the iframe's OUTER rect is scaled while its INNER layout coordinates — what
// `getBoundingClientRect` inside the frame speaks, and what `elementFromPoint` expects — are
// not. Every hop across that boundary has to bridge the scale: parent to inner divides by S,
// inner to parent multiplies. `offsetWidth` is the untransformed layout width, so
// `rect.width / offsetWidth` is S (1 on an unscaled host — the Playground, the Drawing Board —
// which makes all of this a no-op there).
//
// This lived inside `createChartInteract` as a closure. It is lifted out unchanged because a
// SECOND consumer arrived: the Guide rung points a Vetrina cursor at elements inside the slide,
// and Vetrina's stage sits over the live app and never enters a preview iframe. Two
// implementations of a coordinate bridge is exactly the kind of duplication that drifts and
// then disagrees by a pane width, so there is one (HARD RULE #15).

/**
 * The frame's on-screen rect plus its CSS-transform scale.
 * @param {HTMLIFrameElement|null} frame
 * @returns {{ fr: DOMRect, S: number }|null} null when there is no frame yet
 */
export function frameGeom(frame) {
	if (!frame) return null;
	const fr = frame.getBoundingClientRect();
	const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
	return { fr, S };
}

/**
 * Map a rect measured INSIDE the frame into the parent document's viewport coordinates —
 * the space `position: fixed` overlays (and Vetrina's stage) live in.
 *
 * @param {DOMRect|{left:number,top:number,width:number,height:number}} inner
 * @param {{ fr: DOMRect, S: number }} geom from `frameGeom`
 * @returns {{ left:number, top:number, width:number, height:number, right:number, bottom:number, x:number, y:number, toJSON: () => object }}
 */
export function innerRectToParent(inner, geom) {
	const left = geom.fr.left + inner.left * geom.S;
	const top = geom.fr.top + inner.top * geom.S;
	const width = inner.width * geom.S;
	const height = inner.height * geom.S;
	return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({ left, top, width, height }) };
}

/**
 * A LIVE rect source for an element inside a frame — the shape Vetrina's stage takes as a
 * target (`{ getBoundingClientRect() }`). It re-measures on every call rather than closing over
 * a rect, because both halves move independently: the frame is scaled and repositioned by its
 * host's layout, and the element moves with the slide's own reflow.
 *
 * Returns a zero rect rather than throwing once the element or frame goes away, so a caller
 * animating against it degrades to "nowhere" instead of crashing mid-cue. A zero-AREA rect is
 * the agreed word for "gone" on this side of the boundary: Vetrina's `liveRect` reads a 0x0 box
 * as no position at all and holds the cursor where it is, rather than reading `left:0, top:0`
 * literally and flying it to the viewport corner. Keep the two halves in step — a rect source
 * that answered `null` would not satisfy `RectSource`, and one that answered a plausible-looking
 * box would be a lie about where a torn-down frame is.
 *
 * @param {() => HTMLIFrameElement|null} getFrame
 * @param {() => Element|null} getElement
 */
export function frameRectSource(getFrame, getElement) {
	const ZERO = { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON: () => ({}) };
	return {
		getBoundingClientRect() {
			try {
				const el = getElement();
				const geom = frameGeom(getFrame());
				if (!el || !geom) return ZERO;
				return innerRectToParent(el.getBoundingClientRect(), geom);
			} catch {
				return ZERO; // a cross-origin or torn-down frame is "nowhere", never a throw
			}
		},
	};
}
