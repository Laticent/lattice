// Cenno measure — turn what the host points at into rects `place` can use.
//
// Three things are measured, all in the TOP document's layout-viewport pixels:
//   - the ANCHOR: an element (in this document or in a same-origin iframe, at any depth), a rect, or
//     a point. Transforms, CSS zoom and iframe offsets are all folded in, so a mark inside a scaled
//     slide inside an iframe lands where the reader sees it.
//   - the BOUNDS: the visual viewport, so a pinch-zoomed reader keeps the card on the part of the
//     page they can see, and the iOS keyboard shrinks the room.
//   - the anchor's VISIBLE part: the anchor clipped by every scrolling or `overflow: hidden`
//     ancestor (and every iframe) it sits in. When nothing is left, the card hides.

import type { Rect } from './place.js';

/** A point or a box the host computed itself, optionally inside an iframe. */
export interface AnchorRect {
	x: number;
	y: number;
	width?: number;
	height?: number;
	/** The iframe these coordinates are relative to. Omit for the top document. */
	frame?: HTMLIFrameElement | null;
}

export type Anchor = Element | AnchorRect;

const isElement = (a: unknown): a is Element => typeof (a as Element)?.getBoundingClientRect === 'function' && (a as Element).nodeType === 1;

/** The iframe element that holds `doc`, if `doc` is a same-origin child of the page. */
function frameOf(doc: Document): HTMLIFrameElement | null {
	try {
		return (doc.defaultView?.frameElement as HTMLIFrameElement | null) ?? null;
	} catch {
		return null;
	}
}

/**
 * How an iframe maps its own coordinates into its parent's: the position of its content box and
 * the scale it is drawn at (a CSS transform on the frame or an ancestor shows up as a rendered size
 * that differs from its layout size).
 */
function frameMap(frame: HTMLIFrameElement): { x: number; y: number; sx: number; sy: number } {
	const r = frame.getBoundingClientRect();
	const sx = frame.offsetWidth ? r.width / frame.offsetWidth : 1;
	const sy = frame.offsetHeight ? r.height / frame.offsetHeight : 1;
	return { x: r.left + frame.clientLeft * sx, y: r.top + frame.clientTop * sy, sx, sy };
}

/** Map a rect from a frame's coordinates up to the top document, through every enclosing frame. */
function liftThrough(rect: Rect, frame: HTMLIFrameElement | null, top: Document): Rect {
	let r = rect;
	let f = frame;
	while (f && f.ownerDocument !== null) {
		const m = frameMap(f);
		r = { x: m.x + r.x * m.sx, y: m.y + r.y * m.sy, width: r.width * m.sx, height: r.height * m.sy };
		if (f.ownerDocument === top) break;
		f = frameOf(f.ownerDocument);
	}
	return r;
}

function toRect(r: DOMRectReadOnly): Rect {
	return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** The intersection of two rects, or null when they do not overlap. */
export function intersect(a: Rect, b: Rect): Rect | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const r = Math.min(a.x + a.width, b.x + b.width);
	const btm = Math.min(a.y + a.height, b.y + b.height);
	return r < x || btm < y ? null : { x, y, width: r - x, height: btm - y };
}

/** The anchor as a rect in the top document's layout viewport. */
export function anchorRect(anchor: Anchor, top: Document): Rect {
	if (isElement(anchor)) {
		const doc = anchor.ownerDocument;
		return liftThrough(toRect(anchor.getBoundingClientRect()), doc === top ? null : frameOf(doc), top);
	}
	const local = { x: anchor.x, y: anchor.y, width: anchor.width ?? 0, height: anchor.height ?? 0 };
	return anchor.frame ? liftThrough(local, anchor.frame, top) : local;
}

/** The room the card may use: the visual viewport, in layout-viewport coordinates. */
export function viewBounds(win: Window): Rect {
	const vv = win.visualViewport;
	if (vv) return { x: vv.offsetLeft, y: vv.offsetTop, width: vv.width, height: vv.height };
	return { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight };
}

/** The visual viewport's pinch scale (1 when the reader has not pinched). */
export function pinchScale(win: Window): number {
	return win.visualViewport?.scale || 1;
}

function clips(el: Element): boolean {
	const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
	if (!cs) return false;
	return cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
}

/**
 * The part of an anchor element the reader can see: clipped by each scrolling or clipping
 * ancestor, each enclosing iframe and the visual viewport. Null when none of it shows.
 * A rect or point anchor is clipped by its frame (if any) and the viewport only.
 */
export function visiblePart(anchor: Anchor, top: Document): Rect | null {
	const win = top.defaultView;
	let r: Rect | null = anchorRect(anchor, top);
	if (isElement(anchor)) {
		let el: Element | null = anchor.parentElement;
		let frame: HTMLIFrameElement | null = anchor.ownerDocument === top ? null : frameOf(anchor.ownerDocument);
		let doc = anchor.ownerDocument;
		while (r) {
			if (!el) {
				if (!frame) break;
				r = intersect(r, anchorRect(frame, top));
				el = frame.parentElement;
				doc = frame.ownerDocument;
				frame = doc === top ? null : frameOf(doc);
				continue;
			}
			if (el !== doc.documentElement && el !== doc.body && clips(el)) r = intersect(r, anchorRect(el, top));
			el = el.parentElement;
		}
	} else if (anchor.frame) {
		r = intersect(r, anchorRect(anchor.frame, top));
	}
	// `intersect` keeps a zero-size anchor (a cursor point) that lies inside, edges included.
	return r && win ? intersect(r, viewBounds(win)) : r;
}
