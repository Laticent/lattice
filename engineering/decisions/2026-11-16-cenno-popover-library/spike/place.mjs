// Cenno spike — a synchronous, zero-dependency placement kernel.
//
// NOT the library. This file exists to answer two questions the decision record asks, with numbers:
// how small a zero-dependency engine with Floating UI's everyday feature set can be, and whether it
// places a card where Floating UI would. `harness.mjs` runs both on the same inputs in Chromium.
//
// The model: every input is a plain rect in ONE coordinate space (the viewport). Measuring the DOM
// is the adapter's job (`measure` below); `place` is pure arithmetic, so it runs the same in a
// worker, in Node and in a test with no DOM.

const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Coordinates of a `w`×`h` card on `side` of `a`, aligned `align`, `gap` px away. */
function coords(a, w, h, side, align, gap) {
	const vert = side === 'top' || side === 'bottom';
	let x;
	let y;
	if (vert) {
		y = side === 'top' ? a.y - h - gap : a.y + a.height + gap;
		x = align === 'start' ? a.x : align === 'end' ? a.x + a.width - w : a.x + (a.width - w) / 2;
	} else {
		x = side === 'left' ? a.x - w - gap : a.x + a.width + gap;
		y = align === 'start' ? a.y : align === 'end' ? a.y + a.height - h : a.y + (a.height - h) / 2;
	}
	return { x, y };
}

/** How far the card spills past each edge of the boundary (positive = spills). */
function spill(x, y, w, h, b) {
	return { top: b.y - y, bottom: y + h - (b.y + b.height), left: b.x - x, right: x + w - (b.x + b.width) };
}

/**
 * Place a card next to an anchor.
 *
 * @param {{x:number,y:number,width:number,height:number}} anchor  the thing pointed at
 * @param {{width:number,height:number}} card  the card's natural size
 * @param {{x:number,y:number,width:number,height:number}} bounds  where the card must stay
 * @param {object} [o]
 * @param {'top'|'bottom'|'left'|'right'} [o.side='bottom']
 * @param {'start'|'center'|'end'} [o.align='center']
 * @param {number} [o.gap=0]  distance from the anchor
 * @param {number} [o.pad=0]  distance kept from the bounds' edges
 * @param {number} [o.arrow=0]  arrow size; 0 = no arrow
 * @returns {{x:number,y:number,side:string,maxWidth:number,maxHeight:number,arrow:number|null}}
 */
export function place(anchor, card, bounds, o = {}) {
	const side0 = o.side || 'bottom';
	const align = o.align || 'center';
	const gap = o.gap || 0;
	const pad = o.pad || 0;
	const b = { x: bounds.x + pad, y: bounds.y + pad, width: bounds.width - 2 * pad, height: bounds.height - 2 * pad };
	const { width: w, height: h } = card;

	// FLIP: keep the asked side if it fits on its own axis; else the opposite if THAT fits; else
	// whichever of the two spills least on its own axis (Floating UI's `bestFit` with crossAxis off).
	let side = side0;
	const tries = [side0, OPP[side0]];
	let best = null;
	for (const s of tries) {
		const c = coords(anchor, w, h, s, align, gap);
		const sp = spill(c.x, c.y, w, h, b);
		if (sp[s] <= 0) {
			best = null;
			side = s;
			break;
		}
		const cost = Math.max(0, sp[s]);
		if (!best || cost < best.cost) best = { s, cost };
	}
	if (best) side = best.s;

	let { x, y } = coords(anchor, w, h, side, align, gap);

	// SHIFT: slide along the cross axis to stay inside the bounds.
	const vert = side === 'top' || side === 'bottom';
	if (vert) x = Math.min(Math.max(x, b.x), b.x + b.width - w);
	else y = Math.min(Math.max(y, b.y), b.y + b.height - h);

	// SIZE: the room left on the chosen side, so a tall card scrolls instead of spilling.
	const maxHeight = vert ? (side === 'top' ? anchor.y - gap - b.y : b.y + b.height - (anchor.y + anchor.height + gap)) : b.height;
	const maxWidth = vert ? b.width : side === 'left' ? anchor.x - gap - b.x : b.x + b.width - (anchor.x + anchor.width + gap);

	// ARROW: points at the anchor's center, clamped so it never leaves the card's edge.
	let arrow = null;
	if (o.arrow) {
		const center = vert ? anchor.x + anchor.width / 2 - x : anchor.y + anchor.height / 2 - y;
		const len = vert ? w : h;
		arrow = Math.min(Math.max(center - o.arrow / 2, 0), len - o.arrow);
	}
	return { x, y, side, maxWidth: Math.max(0, maxWidth), maxHeight: Math.max(0, maxHeight), arrow };
}

/**
 * The DOM adapter: a rect in viewport pixels for an element or a virtual anchor, with the visual
 * viewport as the bounds, so the iOS keyboard and pinch zoom shrink the room the card has.
 */
export function measure(anchor) {
	const r = typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : anchor;
	const vv = globalThis.visualViewport;
	const bounds = vv
		? { x: vv.offsetLeft, y: vv.offsetTop, width: vv.width, height: vv.height }
		: { x: 0, y: 0, width: innerWidth, height: innerHeight };
	return { anchor: { x: r.x ?? r.left, y: r.y ?? r.top, width: r.width, height: r.height }, bounds };
}

/**
 * Keep a card placed while things move: one rAF-coalesced update for any number of scroll, resize,
 * zoom, fullscreen or layout events in a frame. Returns the stop function.
 */
export function track(target, update) {
	let raf = 0;
	const kick = () => {
		if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
	};
	const ro = new ResizeObserver(kick);
	ro.observe(document.documentElement);
	if (target instanceof Element) ro.observe(target);
	const opts = { capture: true, passive: true };
	addEventListener('scroll', kick, opts);
	addEventListener('resize', kick, opts);
	visualViewport?.addEventListener('resize', kick, opts);
	visualViewport?.addEventListener('scroll', kick, opts);
	document.addEventListener('fullscreenchange', kick);
	update();
	return () => {
		cancelAnimationFrame(raf);
		ro.disconnect();
		removeEventListener('scroll', kick, opts);
		removeEventListener('resize', kick, opts);
		visualViewport?.removeEventListener('resize', kick, opts);
		visualViewport?.removeEventListener('scroll', kick, opts);
		document.removeEventListener('fullscreenchange', kick);
	};
}
