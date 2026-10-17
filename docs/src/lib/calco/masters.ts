/**
 * Layouts, the part both writers share: which slides share a background, and which running
 * chrome (header, footer, page number) lives once on the layout instead of on every slide.
 *
 * A slide's chrome is hoisted onto a layout when at least two slides carry the same thing in
 * the same place on the same background: a header or footer with the same text, geometry and
 * style; a page number with the same geometry and style (its digits are the slide's own, and
 * the layout draws a field). A frame that is a label's text, belongs to a card, or has more
 * than one style stays on its slide, and so does the chrome of a slide with no shared
 * background: its picture is opaque, and a layout paints UNDER the slide's picture, so a
 * header on the layout would be hidden behind it. Slides that share a background and the same hoisted
 * chrome share one layout, so a deck of title, content and divider slides comes out as a
 * layout for each look.
 */
import type { Background, Deck, FrameRole, Slide, TextFrame } from './types.js';

/** The roles that run across slides and can live on a layout. */
export const CHROME_ROLES = ['header', 'footer', 'number'] as const;
export type ChromeRole = (typeof CHROME_ROLES)[number];

/** One layout: a background and the chrome its slides share. */
export interface Layout {
	/** Index in `Deck.backgrounds`, or undefined when the slides carry their own opaque picture. */
	background?: number;
	/** Resolved background, for a writer's convenience. */
	paint?: Background;
	/** The chrome drawn on the layout, taken from the first slide that carries it. */
	chrome: Partial<Record<ChromeRole, TextFrame>>;
}

/** The plan: layouts, which one each slide uses, and the frames each slide no longer draws. */
export interface MasterPlan {
	layouts: Layout[];
	/** Per slide, the index of its layout. */
	layoutOf: number[];
	/** Per slide, the indices in `slide.frames` that its layout draws instead. */
	hoisted: Array<Set<number>>;
}

const half = (n: number) => Math.round(n * 2) / 2;

/** Whether a frame can be a layout object: one line, one style. */
function single(frame: TextFrame): boolean {
	return frame.lines.length === 1 && frame.lines[0].length === 1;
}

/** Whether a page number frame reads as the slide's 1-based position. */
export function isPosition(frame: TextFrame, position: number): boolean {
	return frame.lines.length === 1 && frame.lines[0].length === 1 && frame.lines[0][0].text.trim() === String(position);
}

/** Whether a run has only the styling a layout's slide number can carry. */
function plain(frame: TextFrame): boolean {
	const st = frame.lines[0][0].style;
	return !st.letterSpacing && st.alpha === 1 && !st.italic && !st.underline && !st.strike && !st.smallCaps && st.transform === 'none';
}

/** What makes two frames "the same thing in the same place". The page number's digits are not part of it. */
function signature(frame: TextFrame): string {
	const run = frame.lines[0][0];
	return JSON.stringify([frame.role, half(frame.x), half(frame.y), half(frame.w), half(frame.h), frame.align, run.style, frame.role === 'number' ? '' : run.text]);
}

/** A slide's candidate chrome: the one frame of each role that a layout could draw. */
function candidates(slide: Slide, position: number): Map<ChromeRole, { index: number; sig: string }> {
	const frames = slide.frames || [];
	// A frame that a card carries, or that is a label's own text, moves with its shape.
	const bound = new Set<number>();
	for (const s of slide.shapes || []) if (s.text !== undefined) bound.add(s.text);
	const found = new Map<ChromeRole, Array<{ index: number; sig: string }>>();
	frames.forEach((frame, index) => {
		const role = frame.role as FrameRole | undefined;
		if (!role || !(CHROME_ROLES as readonly string[]).includes(role)) return;
		if (frame.group !== undefined || bound.has(index) || !single(frame)) return;
		// A page number is a field only when it IS the slide's position: a split run prints "2.2", and
		// numbering resumes after it, so the office app's own count would disagree with the page.
		if (role === 'number' && !isPosition(frame, position)) return;
		// A layout's number carries size, color, face, weight and alignment, and no more.
		if (role === 'number' && !plain(frame)) return;
		const list = found.get(role as ChromeRole) || [];
		list.push({ index, sig: signature(frame) });
		found.set(role as ChromeRole, list);
	});
	const out = new Map<ChromeRole, { index: number; sig: string }>();
	for (const [role, list] of found) if (list.length === 1) out.set(role, list[0]);
	return out;
}

/** Plan the layouts of a deck. */
export function planMasters(deck: Deck): MasterPlan {
	const slides = deck.slides;
	const cands = slides.map((sl, i) => candidates(sl, i + 1));
	// How many slides, on one background, carry each (role, signature).
	const seen = new Map<string, number>();
	const key = (slide: Slide, role: ChromeRole, sig: string) => `${slide.background ?? -1}|${role}|${sig}`;
	slides.forEach((slide, i) => {
		if (slide.background === undefined) return;
		for (const [role, { sig }] of cands[i]) seen.set(key(slide, role, sig), (seen.get(key(slide, role, sig)) || 0) + 1);
	});
	const layouts: Layout[] = [];
	const byKey = new Map<string, number>();
	const layoutOf: number[] = [];
	const hoisted: Array<Set<number>> = [];
	slides.forEach((slide, i) => {
		const mine = new Set<number>();
		const parts: string[] = [String(slide.background ?? -1)];
		const chrome: Layout['chrome'] = {};
		for (const role of CHROME_ROLES) {
			const c = slide.background === undefined ? undefined : cands[i].get(role);
			if (!c || (seen.get(key(slide, role, c.sig)) || 0) < 2) continue;
			mine.add(c.index);
			parts.push(`${role}:${c.sig}`);
			chrome[role] = slide.frames[c.index];
		}
		const k = parts.join('||');
		let li = byKey.get(k);
		if (li === undefined) {
			li = layouts.push({ background: slide.background, paint: slide.background === undefined ? undefined : deck.backgrounds?.[slide.background], chrome }) - 1;
			byKey.set(k, li);
		}
		layoutOf.push(li);
		hoisted.push(mine);
	});
	return { layouts, layoutOf, hoisted };
}

/** The slide as a writer draws it: the frames its layout carries are left out (emptied, so indices still line up). */
export function withoutHoisted(slide: Slide, hoisted: Set<number>): Slide {
	if (!hoisted.size) return slide;
	return { ...slide, frames: slide.frames.map((f, i) => (hoisted.has(i) ? { ...f, lines: [] } : f)) };
}
