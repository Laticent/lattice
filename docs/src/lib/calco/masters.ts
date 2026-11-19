/**
 * Layouts, the part both writers share: which slides share a background, and which running
 * chrome (header, footer, page number) lives once on the master or layout instead of on every slide.
 *
 * EVERY LAYOUT CARRIES THE WHOLE LOOK OF ITS SLIDES (owner, 2026-11-19: a dark divider, topic or closing in a light
 * deck has its own header, footer, number, eyebrow and meta line, in its own ink). Slides share a layout when they sit
 * on the same background, are the same kind of slide (`Slide.look`: title, content, divider, topic, closing) and show
 * their running chrome in the same LOOK: per role, the same place and style, whatever the text says. Within a layout,
 * chrome whose text is the same on every slide is drawn once on the layout, a layout of one slide included; chrome
 * whose text varies (a header naming each section) is a placeholder in that look (`Layout.vary`), and each slide keeps
 * its own text, so a deck of per-section headers does not become a layout per slide. A page number is always the
 * layout's (its digits are the slide's own, and the layout draws a field). A frame that is a label's text, belongs to
 * a card, or has more than one style stays on its slide, and so does the chrome of a slide with no background of its
 * own in `Deck.backgrounds`: its picture is opaque, and a layout paints UNDER the slide's picture, so a header on the
 * layout would be hidden behind it.
 *
 * THE MASTER carries the chrome most slides show (`MasterPlan.master`). A layout whose header and footer are the
 * master's draws none of its own and shows the master's (`Layout.fromMaster`), so they are edited in one place, and
 * a slide added on any such layout, a slide on a background no other slide paints included, shows them. Its page
 * number, when its slides show one, is its own placeholder in the master's look. A layout with another header or
 * footer, or none (a title slide), hides the master's and draws its own. `Layout.chrome` is always what the layout's
 * slides show, wherever a writer draws it.
 */
import { luminance } from './theme.js';
import type { Background, Deck, FrameRole, Slide, TextFrame } from './types.js';

/** The roles that run across slides and can live on a layout. */
export const CHROME_ROLES = ['header', 'footer', 'number'] as const;
export type ChromeRole = (typeof CHROME_ROLES)[number];

/** What a layout is for: a title-like look (a heading and at most one line under it), or content. */
export type LayoutKind = 'title' | 'content';

/** One layout: a background and the chrome its slides share. */
export interface Layout {
	/**
	 * `title` for a look whose slides hold a heading and at most one plain line under it (a title, divider, topic or
	 * closing): its second placeholder is a subtitle. `content` otherwise: a body placeholder.
	 */
	kind: LayoutKind;
	/** The slides' look (`Slide.look`), when they say. */
	look?: string;
	/** The layout's name in the file: the look's ("Title", "Divider", "Topic", "Closing", "Content"), numbered when one repeats. */
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
	/** Header or footer whose text differs between the layout's slides: a placeholder in this look; the slides keep theirs. */
	vary: Partial<Record<'header' | 'footer', TextFrame>>;
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

/** The same, without the text: where and how a role is drawn, whatever it says. */
function lookOf(frame: TextFrame): string {
	return JSON.stringify([frame.role, Math.round(frame.x), Math.round(frame.y), Math.round(frame.w), frame.align, leadRun(frame).style]);
}

/** WCAG contrast ratio of two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * A slide's candidate chrome: the one frame of each role that a layout could draw. `ground` is the solid color of the
 * slide's background, when it has one: chrome whose ink hardly shows on it (under 1.5:1) sits on something the slide's
 * own picture paints (a split slide's dark half), and a layout paints UNDER that picture, so it stays on the slide
 * (card-tags slide 7's white header, measured: hoisted, it vanished).
 */
function candidates(slide: Slide, position: number, ground?: string): Map<ChromeRole, { index: number; sig: string; look: string }> {
	const frames = slide.frames || [];
	// A frame that a card carries, or that is a label's own text, moves with its shape.
	const bound = new Set<number>();
	for (const s of slide.shapes || []) if (s.text !== undefined) bound.add(s.text);
	const found = new Map<ChromeRole, Array<{ index: number; sig: string; look: string }>>();
	frames.forEach((frame, index) => {
		const role = frame.role as FrameRole | undefined;
		if (!role || !(CHROME_ROLES as readonly string[]).includes(role)) return;
		if (frame.group !== undefined || bound.has(index) || !single(frame)) return;
		if (ground && contrast(leadRun(frame).style.color, ground) < 1.5) return;
		// A page number is a field only when it IS the slide's position: a split run prints "2.2", and
		// numbering resumes after it, so the office app's own count would disagree with the page.
		if (role === 'number' && !isPosition(frame, position)) return;
		// A layout's number carries its look in a list style, which has no highlight.
		if (role === 'number' && !hasLayoutStyle(frame)) return;
		const list = found.get(role as ChromeRole) || [];
		list.push({ index, sig: signature(frame), look: lookOf(frame) });
		found.set(role as ChromeRole, list);
	});
	const out = new Map<ChromeRole, { index: number; sig: string; look: string }>();
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

/** Whether a slide's text is a heading and at most one plain line under it (a title-like look). */
function titleLike(slide: Slide): boolean {
	const plain = (slide.frames || []).filter((f) => !f.role && f.group === undefined && f.lines.length);
	return plain.length <= 1 && plain.every((f) => f.lines.length <= 3);
}

/** A look's name in the file: "divider" reads "Divider". */
const titleCase = (look: string) => look.charAt(0).toUpperCase() + look.slice(1);

/** Plan the layouts of a deck. */
export function planMasters(deck: Deck): MasterPlan {
	const slides = deck.slides;
	const cands = slides.map((sl, i) => (sl.background === undefined ? new Map() : candidates(sl, i + 1, deck.backgrounds?.[sl.background]?.color)));
	// LAYOUTS, by look: background, kind of slide, and per chrome role where and how it is drawn (not what it says).
	const layouts: Layout[] = [];
	const byKey = new Map<string, number>();
	const layoutOf: number[] = [];
	const members: number[][] = [];
	slides.forEach((slide, i) => {
		const parts: string[] = [String(slide.background ?? `own${i}`), slide.look || ''];
		for (const role of CHROME_ROLES) parts.push(`${role}:${cands[i].get(role)?.look ?? ''}`);
		const k = parts.join('||');
		let li = byKey.get(k);
		if (li === undefined) {
			li =
				layouts.push({
					kind: 'content',
					look: slide.look,
					name: '',
					fromMaster: false,
					background: slide.background,
					paint: slide.background === undefined ? undefined : deck.backgrounds?.[slide.background],
					chrome: {},
					vary: {},
				}) - 1;
			byKey.set(k, li);
			members.push([]);
		}
		layoutOf.push(li);
		members[li].push(i);
	});
	// Per layout and role: the same text on every slide is drawn on the layout; text that varies is a placeholder.
	const hoisted: Array<Set<number>> = slides.map(() => new Set<number>());
	const sigOf = layouts.map(() => new Map<ChromeRole, string>());
	layouts.forEach((layout, li) => {
		for (const role of CHROME_ROLES) {
			const own = members[li].map((i) => cands[i].get(role)).filter(Boolean) as Array<{ index: number; sig: string }>;
			if (!own.length) continue;
			const first = members[li].find((i) => cands[i].get(role)) as number;
			const frame = slides[first].frames[(cands[first].get(role) as { index: number }).index];
			if (role === 'number' || own.every((c) => c.sig === own[0].sig)) {
				layout.chrome[role] = frame;
				sigOf[li].set(role, own[0].sig);
				for (const i of members[li]) {
					const c = cands[i].get(role);
					if (c) hoisted[i].add(c.index);
				}
			} else layout.vary[role] = frame;
		}
	});
	// THE MASTER: per role, the drawn chrome the most slides show.
	const master: MasterPlan['master'] = { chrome: {} };
	const masterSig = new Map<ChromeRole, string>();
	for (const role of CHROME_ROLES) {
		const count = new Map<string, { n: number; frame: TextFrame }>();
		layouts.forEach((layout, li) => {
			const sig = sigOf[li].get(role);
			if (!sig) return;
			const hit = count.get(sig) || { n: 0, frame: layout.chrome[role] as TextFrame };
			hit.n += members[li].length;
			count.set(sig, hit);
		});
		let best: [string, { n: number; frame: TextFrame }] | undefined;
		for (const entry of count) if (!best || entry[1].n > best[1].n) best = entry;
		if (!best) continue;
		masterSig.set(role, best[0]);
		master.chrome[role] = best[1].frame;
	}
	// A layout whose header and footer are the master's shows the master's and draws none of its own: its chrome is the
	// master's, with its own page number. A slide with its own opaque picture shows nothing of a layout or master.
	layouts.forEach((layout, li) => {
		if (layout.background === undefined || layout.vary.header || layout.vary.footer) return;
		const same = (['header', 'footer'] as const).every((role) => (sigOf[li].get(role) ?? null) === (masterSig.get(role) ?? null));
		if (!same || !Object.keys(master.chrome).length) return;
		layout.fromMaster = true;
		layout.chrome = withNumber(master.chrome, layout.chrome.number);
	});
	// KIND and NAMES. A title-like look (a heading and at most one line under it) offers a subtitle; content a body.
	// The name is the look's ("Divider", "Topic"), numbered when it repeats; with no look, "Title" for a title-like
	// look that opens or closes the deck and "Content" otherwise.
	const last = slides.length - 1;
	const used = new Map<string, number>();
	layouts.forEach((layout, li) => {
		const opensOrCloses = layoutOf[0] === li || layoutOf[last] === li;
		// With a look, a title-like look is a title look wherever it sits (a divider mid-deck); with none, as before, a look
		// that opens or closes the deck and shows no running chrome.
		const titleish = members[li].every((i) => titleLike(slides[i]));
		layout.kind = layout.look === 'content' ? 'content' : (layout.look ? titleish : titleish && opensOrCloses && !Object.keys(layout.chrome).length) ? 'title' : 'content';
		const base = layout.look ? titleCase(layout.look) : layout.kind === 'title' ? 'Title' : 'Content';
		const n = (used.get(base) || 0) + 1;
		used.set(base, n);
		layout.name = n === 1 ? base : `${base} ${n}`;
	});
	return { layouts, layoutOf, hoisted, master };
}

/** The slide as a writer draws it: the frames its layout carries are left out (emptied, so indices still line up). */
export function withoutHoisted(slide: Slide, hoisted: Set<number>): Slide {
	if (!hoisted.size) return slide;
	return { ...slide, frames: slide.frames.map((f, i) => (hoisted.has(i) ? { ...f, lines: [] } : f)) };
}
