/**
 * Layouts, the part both writers share: which slides share a background, and which running
 * chrome (header, footer, page number) lives once on the master or layout instead of on every slide.
 *
 * A slide's chrome is hoisted when at least two slides of the deck carry the same thing in the
 * same place, whatever background each sits on: a header or footer with the same text, geometry and
 * style; a page number with the same geometry and style (its digits are the slide's own, and
 * the layout draws a field). A frame that is a label's text, belongs to a card, or has more
 * than one style stays on its slide, and so does the chrome of a slide with no background of its
 * own in `Deck.backgrounds`: its picture is opaque, and a layout paints UNDER the slide's picture, so a
 * header on the layout would be hidden behind it. Slides that share a background and the same hoisted
 * chrome share one layout, so a deck of title, content and divider slides comes out as a
 * layout for each look.
 *
 * THE MASTER carries the chrome most slides show (`MasterPlan.master`). A layout whose header and footer are the
 * master's draws none of its own and shows the master's (`Layout.fromMaster`), so they are edited in one place, and
 * a slide added on any such layout, a slide on a background no other slide paints included, shows them. Its page
 * number, when its slides show one, is its own placeholder in the master's look. A layout with another header or
 * footer, or none (a title slide), hides the master's and draws its own. `Layout.chrome` is always what the layout's
 * slides show, wherever a writer draws it.
 */
import type { Background, Deck, FrameRole, Slide, TextFrame } from './types.js';

/** The roles that run across slides and can live on a layout. */
export const CHROME_ROLES = ['header', 'footer', 'number'] as const;
export type ChromeRole = (typeof CHROME_ROLES)[number];

/** What a layout is for: the deck's title (or closing) look, or content. */
export type LayoutKind = 'title' | 'content';

/** One layout: a background and the chrome its slides share. */
export interface Layout {
	/** `title` for a look with no running chrome that opens or closes the deck; `content` otherwise. */
	kind: LayoutKind;
	/** The layout's name in the file: "Title", "Content", "Content 2", … */
	name: string;
	/**
	 * The layout shows the master's header and footer and draws none of its own (`chrome` is then the master's, with
	 * this layout's page number, or none).
	 */
	fromMaster: boolean;
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
	/** The chrome on the master: what most slides show. Empty when no chrome is hoisted. */
	master: { chrome: Partial<Record<ChromeRole, TextFrame>> };
}

/** The run that styles a one-line frame: its first run that is not an emoji split out of the text (`splitEmojiRuns`). */
function leadRun(frame: TextFrame) {
	const line = frame.lines[0];
	return line.find((run) => !run.style.emoji) ?? line[0];
}

/** A one-line frame's text, emoji included. */
const lineText = (frame: TextFrame) => frame.lines[0].map((run) => run.text).join('');

/** Whether a frame can be a layout object: one line, one style (an emoji split out of its text does not count as a second). */
function single(frame: TextFrame): boolean {
	if (frame.lines.length !== 1 || !frame.lines[0].length) return false;
	const lead = JSON.stringify(leadRun(frame).style);
	return frame.lines[0].every((run) => run.style.emoji || JSON.stringify(run.style) === lead);
}

/** Whether a page number frame reads as the slide's 1-based position. */
export function isPosition(frame: TextFrame, position: number): boolean {
	return frame.lines.length === 1 && frame.lines[0].length >= 1 && lineText(frame).trim() === String(position);
}

/**
 * Whether a run has only the styling a layout's slide number can carry. Its look lives in the placeholder's list
 * style (`a:defRPr`, `style:text-properties`), which holds size, color, opacity, face, weight, slant, letter-spacing,
 * decoration and caps; only a highlight has no place there.
 */
function hasLayoutStyle(frame: TextFrame): boolean {
	return !leadRun(frame).style.highlight;
}

/**
 * What makes two frames "the same thing in the same place". The page number's digits are not part of it. Place is
 * to the whole px, and the height is left out: one line of the same text in the same style is the same object, and
 * a layout that sets its line a pixel taller (19 or 20 px, measured on Lattice's figure layouts) must not split it.
 */
function signature(frame: TextFrame): string {
	return JSON.stringify([frame.role, Math.round(frame.x), Math.round(frame.y), Math.round(frame.w), frame.align, leadRun(frame).style, frame.role === 'number' ? '' : lineText(frame)]);
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
		// A layout's number carries its look in a list style, which has no highlight.
		if (role === 'number' && !hasLayoutStyle(frame)) return;
		const list = found.get(role as ChromeRole) || [];
		list.push({ index, sig: signature(frame) });
		found.set(role as ChromeRole, list);
	});
	const out = new Map<ChromeRole, { index: number; sig: string }>();
	for (const [role, list] of found) if (list.length === 1) out.set(role, list[0]);
	return out;
}

/** The master's header and footer with a layout's own page number, or none. */
function withNumber(chrome: Layout['chrome'], number: TextFrame | undefined): Layout['chrome'] {
	const out: Layout['chrome'] = {};
	if (chrome.header) out.header = chrome.header;
	if (chrome.footer) out.footer = chrome.footer;
	if (number) out.number = number;
	return out;
}

/** Plan the layouts of a deck. */
export function planMasters(deck: Deck): MasterPlan {
	const slides = deck.slides;
	const cands = slides.map((sl, i) => candidates(sl, i + 1));
	// How many slides of the deck carry each (role, signature), over every background: a header on a slide whose
	// background no other slide paints is still the deck's header.
	const seen = new Map<string, number>();
	const key = (role: ChromeRole, sig: string) => `${role}|${sig}`;
	slides.forEach((slide, i) => {
		if (slide.background === undefined) return;
		for (const [role, { sig }] of cands[i]) seen.set(key(role, sig), (seen.get(key(role, sig)) || 0) + 1);
	});
	// Per slide, the chrome it hoists: role → signature and frame index.
	const mine = slides.map((slide, i) => {
		const out = new Map<ChromeRole, { index: number; sig: string }>();
		if (slide.background === undefined) return out;
		for (const role of CHROME_ROLES) {
			const c = cands[i].get(role);
			if (c && (seen.get(key(role, c.sig)) || 0) >= 2) out.set(role, c);
		}
		return out;
	});
	// The master's chrome: per role, the hoisted signature most slides carry.
	const masterSig = new Map<ChromeRole, string>();
	const master: MasterPlan['master'] = { chrome: {} };
	for (const role of CHROME_ROLES) {
		const count = new Map<string, { n: number; slide: number; index: number }>();
		mine.forEach((m, i) => {
			const c = m.get(role);
			if (!c) return;
			const hit = count.get(c.sig) || { n: 0, slide: i, index: c.index };
			hit.n++;
			count.set(c.sig, hit);
		});
		let best: [string, { n: number; slide: number; index: number }] | undefined;
		for (const entry of count) if (!best || entry[1].n > best[1].n) best = entry;
		if (!best) continue;
		masterSig.set(role, best[0]);
		master.chrome[role] = slides[best[1].slide].frames[best[1].index];
	}
	const layouts: Layout[] = [];
	const byKey = new Map<string, number>();
	const layoutOf: number[] = [];
	const hoisted: Array<Set<number>> = [];
	slides.forEach((slide, i) => {
		const parts: string[] = [String(slide.background ?? -1)];
		const chrome: Layout['chrome'] = {};
		const set = new Set<number>();
		// The header and footer decide whether a layout shows the master's: a page number is a placeholder, which an
		// office app draws on a slide only from the slide's own copy, so a layout that drops it still shows the rest.
		// A slide with its own opaque picture shows nothing of a layout or master: its chrome is its own.
		let sameAsMaster = slide.background !== undefined;
		for (const role of CHROME_ROLES) {
			const c = mine[i].get(role);
			if (c) {
				set.add(c.index);
				parts.push(`${role}:${c.sig}`);
				chrome[role] = slide.frames[c.index];
			}
			if (role !== 'number' && (c?.sig ?? null) !== (masterSig.get(role) ?? null)) sameAsMaster = false;
		}
		const k = parts.join('||');
		let li = byKey.get(k);
		if (li === undefined) {
			li =
				layouts.push({
					kind: 'content',
					name: '',
					fromMaster: sameAsMaster,
					background: slide.background,
					paint: slide.background === undefined ? undefined : deck.backgrounds?.[slide.background],
					chrome: sameAsMaster ? withNumber(master.chrome, chrome.number) : chrome,
				}) - 1;
			byKey.set(k, li);
		}
		layoutOf.push(li);
		hoisted.push(set);
	});
	// Names. A look with no running chrome that opens or closes the deck is its title look.
	const last = slides.length - 1;
	let content = 0;
	let titles = 0;
	layouts.forEach((layout, li) => {
		const ends = layoutOf[0] === li || layoutOf[last] === li;
		if (ends && !Object.keys(layout.chrome).length) {
			layout.kind = 'title';
			layout.name = ++titles === 1 ? 'Title' : `Title ${titles}`;
		} else layout.name = ++content === 1 ? 'Content' : `Content ${content}`;
	});
	return { layouts, layoutOf, hoisted, master };
}

/** The slide as a writer draws it: the frames its layout carries are left out (emptied, so indices still line up). */
export function withoutHoisted(slide: Slide, hoisted: Set<number>): Slide {
	if (!hoisted.size) return slide;
	return { ...slide, frames: slide.frames.map((f, i) => (hoisted.has(i) ? { ...f, lines: [] } : f)) };
}
