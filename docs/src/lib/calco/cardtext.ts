/**
 * A card's text as ONE text body.
 *
 * The browser lays a card out as boxes: a heading, a body, each a paragraph at its own place
 * inside the card's padding. Written as separate text boxes they drift apart the moment a
 * reader draws a face a little wider, and they know nothing of the card around them. Here the
 * paragraphs a card holds on one left edge become one body inside the card's own shape, with
 * the card's padding as the shape's insets and the gap between paragraphs as spacing, so the
 * suite wraps them inside the card.
 *
 * Only the plain case merges: the frames share the card's left edge, run top to bottom
 * without overlapping, sit inside its box and (where they wrap) end at the same right edge. A frame that does not
 * fit that (a pill on the title row, an indented list, a role) stays a text box of its own.
 */
import type { Shape, Slide, TextFrame } from './types.js';

const EDGE = 1.5;
const hasText = (f: TextFrame) => f.lines.some((l) => l.length);

/** The slide, with each card's mergeable paragraphs joined into one frame (`next`). */
export function mergeCardText(slide: Slide): Slide {
	const shapes = slide.shapes;
	if (!shapes?.length) return slide;
	const frames = slide.frames;
	const labelled = new Set<number>();
	for (const s of shapes) if (s.text !== undefined) labelled.add(s.text);
	const drop = new Set<number>();
	const merged = new Map<number, TextFrame>();
	const owner = new Map<number, number>(); // shape index → merged first frame index

	shapes.forEach((card: Shape, c) => {
		if (card.kind !== 'box' || card.text !== undefined || card.pseudo || card.sub !== undefined) return;
		if (!card.fill && !card.stroke && !card.gradient) return;
		// A shadow is cast by the shape's text too when the fill does not stop it: only an opaque fill merges.
		if (card.shadow && !(card.fill && card.fill.alpha >= 1 && !card.gradient)) return;
		const inside = (f: TextFrame) => f.x >= card.x - EDGE && f.x + f.w <= card.x + card.w + EDGE && f.y >= card.y - EDGE && f.y + f.h <= card.y + card.h + EDGE;
		// A paragraph may join a body only when the suite can wrap it as the browser did (prose that wrapped) or
		// it is one line; a `<br>` heading, code or a blank line keeps its own box.
		const plain = (f: TextFrame) => !f.role && f.align === 'left' && hasText(f) && (f.flow || f.lines.length === 1);
		const mine = frames
			.map((f, i) => ({ f, i }))
			.filter(({ f, i }) => f.group === c && !labelled.has(i) && !drop.has(i) && plain(f) && inside(f))
			.sort((a, b) => a.f.y - b.f.y);
		if (mine.length < 2) return;
		// The chain: the first frame's left edge, each next one below the last.
		let chain = [mine[0]];
		for (const m of mine.slice(1)) {
			const last = chain[chain.length - 1].f;
			if (Math.abs(m.f.x - mine[0].f.x) <= EDGE && m.f.y >= last.y + last.h - EDGE) chain.push(m);
		}
		// Paragraphs that wrap end on one edge, and the column is that edge: a one-line frame that runs past it
		// would wrap in the file, so it stays its own box.
		const wrapped = chain.filter(({ f }) => f.flow);
		const right = wrapped.length ? Math.max(...wrapped.map(({ f }) => f.x + f.w)) : Math.max(...chain.map(({ f }) => f.x + f.w));
		if (wrapped.some(({ f }) => Math.abs(f.x + f.w - right) > EDGE)) return;
		chain = chain.filter(({ f }) => f.flow || f.x + f.w <= right + EDGE);
		if (chain.length < 2) return;
		const lastF = chain[chain.length - 1].f;
		const top = chain[0].f.y;
		const inChain = new Set(chain.map(({ i }) => i));
		// Text the chain does not hold, between its paragraphs, would be reflowed over; a shape painted after the card
		// over a paragraph would draw above the card's own text. Either leaves the card as it was.
		const between = frames.some((f, i) => !inChain.has(i) && !drop.has(i) && hasText(f) && f.y < lastF.y + lastF.h && f.y + f.h > top && f.x < right && f.x + f.w > chain[0].f.x && !labelled.has(i));
		const covered = shapes.some((o, k) => k > c && o.kind !== 'line' && chain.some(({ f }) => o.x < f.x + f.w && f.x < o.x + o.w && o.y < f.y + f.h && f.y < o.y + o.h));
		if (between || covered) return;
		const [first, ...rest] = chain;
		const head: TextFrame = { ...first.f, w: right - first.f.x, h: lastF.y + lastF.h - first.f.y, flow: true, next: rest.map(({ f }) => f) };
		merged.set(first.i, head);
		owner.set(c, first.i);
		for (const { i } of rest) drop.add(i);
	});
	if (!merged.size) return slide;

	const remap = new Map<number, number>();
	const out: TextFrame[] = [];
	frames.forEach((f, i) => {
		if (drop.has(i)) return;
		remap.set(i, out.length);
		out.push(merged.get(i) || f);
	});
	const outShapes = shapes.map((s, c) => {
		const t = owner.get(c);
		const text = t !== undefined ? remap.get(t) : s.text === undefined ? undefined : remap.get(s.text);
		return text === s.text ? s : { ...s, text };
	});
	return { ...slide, frames: out, shapes: outShapes };
}
