// Cenno place — where a card goes, as pure arithmetic.
//
// Every input is a plain rect in ONE coordinate space (the layout viewport, which is what
// `getBoundingClientRect` reports). Measuring the page is `measure.ts`'s job, so this runs the same
// in a worker, in Node and in a test with no DOM. It places a card the way Floating UI does with
// `offset` + `flip` (best fit, main axis) + `shift` (cross axis) + `size` + `arrow`: the spike in
// engineering/decisions/2026-11-16-cenno-popover-library/ agreed with it on 5,000 seeded cases in
// Chromium, WebKit and Firefox.

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Align = 'start' | 'center' | 'end';

/** A box in layout-viewport pixels. */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PlaceOptions {
	/** The side of the anchor the card prefers. Default `bottom`. */
	side?: Side;
	/** Where the card sits along that side. `start` is the reading start, so it flips under `rtl`. Default `center`. */
	align?: Align;
	/** Distance between the anchor and the card. Default 0. */
	gap?: number;
	/** Distance kept from the edges of the bounds. Default 0. */
	pad?: number;
	/** Arrow size along the card's edge; 0 draws no arrow. Default 0. */
	arrow?: number;
	/** How far the arrow stays from the card's corners. Default 0. */
	arrowPad?: number;
	/** Right-to-left writing: `start` and `end` swap on the top and bottom sides. */
	rtl?: boolean;
}

export interface Placement {
	/** The card's top-left corner. */
	x: number;
	y: number;
	/** The side the card ended up on (it flips when the preferred side has no room). */
	side: Side;
	/** The room the card has, so a long card scrolls instead of spilling. */
	maxWidth: number;
	maxHeight: number;
	/** The arrow's offset along the card's edge, or null with no arrow. */
	arrow: number | null;
	/** True when the anchor is entirely outside the bounds, so the card should not show. */
	hidden: boolean;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const isVertical = (side: Side) => side === 'top' || side === 'bottom';

function coords(a: Rect, w: number, h: number, side: Side, align: Align, gap: number): { x: number; y: number } {
	if (isVertical(side)) {
		const y = side === 'top' ? a.y - h - gap : a.y + a.height + gap;
		const x = align === 'start' ? a.x : align === 'end' ? a.x + a.width - w : a.x + (a.width - w) / 2;
		return { x, y };
	}
	const x = side === 'left' ? a.x - w - gap : a.x + a.width + gap;
	const y = align === 'start' ? a.y : align === 'end' ? a.y + a.height - h : a.y + (a.height - h) / 2;
	return { x, y };
}

/** How far a card at (x, y) spills past the edge of `b` on `side` (positive = spills). */
function spillOn(side: Side, x: number, y: number, w: number, h: number, b: Rect): number {
	if (side === 'top') return b.y - y;
	if (side === 'bottom') return y + h - (b.y + b.height);
	if (side === 'left') return b.x - x;
	return x + w - (b.x + b.width);
}

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** True when two rects share any area or touch (a zero-size point on an edge counts as inside). */
export function intersects(a: Rect, b: Rect): boolean {
	return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

/**
 * Place a card next to an anchor.
 *
 * Flip: keep the preferred side if the card fits on it; otherwise the opposite side if that fits;
 * otherwise whichever of the two spills less. Shift: slide along the cross axis to stay inside the
 * bounds, keeping the start edge visible when the card is wider than them. Size: report the room on
 * the chosen side. Arrow: point at the anchor's center, clamped to the card's edge.
 */
export function place(anchor: Rect, card: { width: number; height: number }, bounds: Rect, options: PlaceOptions = {}): Placement {
	const preferred = options.side ?? 'bottom';
	const gap = options.gap ?? 0;
	const pad = options.pad ?? 0;
	let align = options.align ?? 'center';
	if (options.rtl && isVertical(preferred) && align !== 'center') align = align === 'start' ? 'end' : 'start';
	const b: Rect = { x: bounds.x + pad, y: bounds.y + pad, width: Math.max(0, bounds.width - 2 * pad), height: Math.max(0, bounds.height - 2 * pad) };
	const { width: w, height: h } = card;

	let side = preferred;
	let best: { side: Side; spill: number } | null = null;
	for (const s of [preferred, OPPOSITE[preferred]]) {
		const c = coords(anchor, w, h, s, align, gap);
		const spill = spillOn(s, c.x, c.y, w, h, b);
		if (spill <= 0) {
			best = null;
			side = s;
			break;
		}
		if (!best || spill < best.spill) best = { side: s, spill };
	}
	if (best) side = best.side;

	let { x, y } = coords(anchor, w, h, side, align, gap);
	const vertical = isVertical(side);
	if (vertical) x = clamp(b.x, x, b.x + b.width - w);
	else y = clamp(b.y, y, b.y + b.height - h);

	let maxWidth: number;
	let maxHeight: number;
	if (vertical) {
		maxWidth = b.width;
		maxHeight = side === 'top' ? anchor.y - gap - b.y : b.y + b.height - (anchor.y + anchor.height + gap);
	} else {
		maxHeight = b.height;
		maxWidth = side === 'left' ? anchor.x - gap - b.x : b.x + b.width - (anchor.x + anchor.width + gap);
	}

	let arrow: number | null = null;
	if (options.arrow) {
		const size = options.arrow;
		const edge = options.arrowPad ?? 0;
		const center = vertical ? anchor.x + anchor.width / 2 - x : anchor.y + anchor.height / 2 - y;
		const length = vertical ? w : h;
		arrow = clamp(edge, center - size / 2, Math.max(edge, length - size - edge));
	}

	return { x, y, side, maxWidth: Math.max(0, maxWidth), maxHeight: Math.max(0, maxHeight), arrow, hidden: !intersects(anchor, bounds) };
}
