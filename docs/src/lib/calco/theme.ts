/**
 * The deck's theme, read off what it draws: the colors and faces an office app offers for NEW content (its color
 * picker, its theme fonts, a new slide's title and body), so text typed into the file looks like the deck and not
 * like Office's defaults. Existing text keeps its own explicit colors and faces: a theme switch in PowerPoint
 * recolors theme references only, and the slides' pictures could not follow it.
 *
 * - **Title**: the style most title text is drawn in (the slide titles outside cards), weighted by characters.
 * - **Body**: the style most other text is drawn in, weighted by characters; chrome (header, footer, number), eyebrows
 *   and subtitles do not count.
 * - **Colors** (OOXML's twelve): `dk1`/`lt1` are the body ink and the ground most slides sit on, by ROLE whatever their
 *   lightness, because the master's color map draws text in `dk1` and the ground in `lt1` (a dark deck's `dk1` is light,
 *   as `OFFICE_PALETTE` has it); `dk2`/`lt2` are the title ink and a second ground; the six accents are the most used saturated colors the deck paints with,
 *   text, fills, strokes and gradient stops, each at least a visible step from the others. A deck with fewer than six
 *   fills the rest with tints and shades of the ones it has.
 *
 * A host that knows its palette exactly passes `Deck.theme`, which wins slot by slot.
 */
import type { Deck, DeckThemeHint, TextFrame, TextStyle } from './types.js';

export const COLOR_SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

export interface DeckTheme {
	/** `#rrggbb` per OOXML color slot. */
	colors: Record<ColorSlot, string>;
	/** The style the deck's titles are drawn in, and one frame drawn in it (for its line pitch). Absent: no titles. */
	title?: { style: TextStyle; frame: TextFrame };
	/** The style the deck's body text is drawn in, and one frame drawn in it. Absent: no body text. */
	body?: { style: TextStyle; frame: TextFrame };
}

const OFFICE: Record<ColorSlot, string> = {
	dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6',
	accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47',
	hlink: '#0563c1', folHlink: '#954f72',
};

type RGB = [number, number, number];
const parseHex = (hex: string): RGB | null => {
	const h = String(hex ?? '').trim().replace(/^#/, '');
	if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
	if (/^[0-9a-f]{3}$/i.test(h)) return [...h].map((c) => Number.parseInt(c + c, 16)) as RGB;
	return null;
};
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** Relative luminance, 0–1 (WCAG). */
export function luminance(color: string): number {
	const c = parseHex(color);
	if (!c) return 0;
	const [r, g, b] = c.map((v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** HSL saturation, 0–1. */
const hslSaturation = (c: RGB) => {
	const mx = Math.max(...c) / 255;
	const mn = Math.min(...c) / 255;
	const l = (mx + mn) / 2;
	return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
};
const rgbDistance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const blendHex = (a: string, b: string, t: number) => {
	const x = parseHex(a) as RGB;
	const y = parseHex(b) as RGB;
	return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
};

const themeStyleKey = (s: TextStyle) => JSON.stringify([s.family, s.weight, s.italic, Math.round(s.size * 2) / 2, (s.color || '').toLowerCase(), s.letterSpacing || 0, s.transform]);
const frameChars = (frame: TextFrame) => frame.lines.reduce((n, line) => n + line.reduce((m, r) => m + r.text.trim().length, 0), 0);

/** The style the most characters of these frames are drawn in, and the frame that draws most of it. */
function dominantOf(frames: TextFrame[]): { style: TextStyle; frame: TextFrame } | undefined {
	const tally = new Map<string, { n: number; style: TextStyle; frame: TextFrame; best: number }>();
	for (const frame of frames) {
		for (const line of frame.lines)
			for (const run of line) {
				if (run.style.emoji) continue;
				const n = run.text.trim().length;
				if (!n) continue;
				const k = themeStyleKey(run.style);
				const hit = tally.get(k) || { n: 0, style: run.style, frame, best: 0 };
				hit.n += n;
				const c = frameChars(frame);
				if (c > hit.best) {
					hit.best = c;
					hit.frame = frame;
				}
				tally.set(k, hit);
			}
	}
	let top: { n: number; style: TextStyle; frame: TextFrame } | undefined;
	for (const v of tally.values()) if (!top || v.n > top.n) top = v;
	return top && { style: top.style, frame: top.frame };
}

/** Read the deck's theme. */
export function readTheme(deck: Deck): DeckTheme {
	const titles: TextFrame[] = [];
	const body: TextFrame[] = [];
	for (const slide of deck.slides)
		for (const f of slide.frames || []) {
			if (!f.lines?.length) continue;
			if (f.role === 'title' && f.group === undefined) titles.push(f);
			else if (!f.role) body.push(f);
		}
	const title = dominantOf(titles);
	const text = dominantOf(body);

	// Grounds, weighted by the slides that sit on them.
	const grounds = new Map<string, number>();
	deck.slides.forEach((s) => {
		const bg = s.background === undefined ? undefined : deck.backgrounds?.[s.background];
		if (bg?.color && parseHex(bg.color)) grounds.set(toHex(parseHex(bg.color) as RGB), (grounds.get(toHex(parseHex(bg.color) as RGB)) || 0) + 1);
	});
	const byUse = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([c]) => c);
	const groundsByUse = byUse(grounds);

	const ink = text?.style.color && parseHex(text.style.color) ? toHex(parseHex(text.style.color) as RGB) : undefined;
	const titleInk = title?.style.color && parseHex(title.style.color) ? toHex(parseHex(title.style.color) as RGB) : undefined;
	const colors = { ...OFFICE };
	// By role, as the color map reads them: text 1 is `dk1`, background 1 is `lt1`. A side the deck does not show takes
	// black or white, whichever reads on the other.
	const ground = groundsByUse[0];
	const text1 = ink ?? titleInk;
	const opposite = (c: string) => (luminance(c) < 0.5 ? '#ffffff' : '#000000');
	if (text1) colors.dk1 = text1;
	else if (ground) colors.dk1 = opposite(ground);
	if (ground) colors.lt1 = ground;
	else if (text1) colors.lt1 = opposite(text1);
	colors.dk2 = titleInk && titleInk !== colors.dk1 ? titleInk : blendHex(colors.dk1, colors.lt1, 0.25);
	const ground2 = groundsByUse.find((c) => c !== colors.lt1);
	colors.lt2 = ground2 ?? blendHex(colors.lt1, colors.dk1, 0.08);

	// Accents: the saturated colors the deck paints with, by use.
	const paint = new Map<string, number>();
	const add = (c: string | undefined, w: number) => {
		const rgb = c ? parseHex(c) : null;
		if (!rgb || hslSaturation(rgb) < 0.3) return;
		const l = luminance(toHex(rgb));
		if (l < 0.02 || l > 0.9) return;
		paint.set(toHex(rgb), (paint.get(toHex(rgb)) || 0) + w);
	};
	for (const slide of deck.slides) {
		for (const f of slide.frames || []) for (const line of f.lines) for (const r of line) add(r.style.color, Math.min(4, r.text.trim().length));
		for (const sh of slide.shapes || []) {
			if (sh.kind === 'picture') continue;
			add(sh.fill?.color, 4);
			add(sh.stroke?.color, 2);
			for (const st of sh.gradient?.stops || []) add(st.color, 1);
		}
	}
	for (const [c, n] of grounds) add(c, n * 4);
	const accents: string[] = [];
	// An accent is a color of its own: not the text or the ground, which have their slots, and a visible step from the others.
	const taken = [colors.dk1, colors.lt1, colors.dk2, colors.lt2];
	for (const c of byUse(paint)) {
		if (accents.length === 6) break;
		if ([...taken, ...accents].every((a) => rgbDistance(parseHex(a) as RGB, parseHex(c) as RGB) >= 48)) accents.push(c);
	}
	if (accents.length) {
		// Fewer than six: tints and shades of the ones found, alternating, so the picker's row stays the deck's.
		const found = accents.length;
		for (let i = 0; accents.length < 6; i++) {
			const base = accents[i % found];
			const step = Math.floor(i / found) + 1;
			accents.push(i % 2 ? blendHex(base, '#000000', 0.2 * step) : blendHex(base, '#ffffff', 0.3 * step));
		}
		accents.forEach((c, i) => {
			colors[`accent${i + 1}` as ColorSlot] = c;
		});
		colors.hlink = accents[0];
		colors.folHlink = blendHex(accents[0], colors.dk1, 0.4);
	}

	// The host's own palette wins slot by slot.
	const hint: DeckThemeHint | undefined = deck.theme;
	for (const slot of COLOR_SLOTS) {
		const c = hint?.colors?.[slot];
		if (c && parseHex(c)) colors[slot] = toHex(parseHex(c) as RGB);
	}
	return { colors, title, body: text };
}
