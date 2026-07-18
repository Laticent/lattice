import { frontMatterBlock, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';

// Structural slide editing on the deck SOURCE — add / delete / duplicate / move.
// Pure string transforms: split the body into slides (front-matter held aside so
// it's never treated as a slide), mutate the list, rejoin with the canonical
// `\n\n---\n\n` separator, and reattach the front-matter verbatim. Returns the new
// source plus the index the caller should make active, so the rail + preview can
// follow the edit.

/** Default body for a freshly-added slide. */
export const NEW_SLIDE = '<!-- _class: content -->\n\n## New slide\n\nReplace this with your point.';

function bodySlides(source: string): string[] {
	return splitSlides(stripFrontMatter(source));
}
function rejoin(source: string, slides: string[]): string {
	const fm = frontMatterBlock(source); // ends with its own blank line, or ''
	const body = slides.join('\n\n---\n\n');
	return fm ? fm + body : body;
}
const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len - 1));

export type DeckOpResult = { source: string; active: number };

/** Insert a new slide after `index` (—1 / before-0 prepends). Active = the new one.
 *  A non-finite `index` (an empty-deck entry point that never set a cursor) coerces
 *  to -1 → insert at 0, so the returned `active` is always a real number and never
 *  NaN — a NaN active would silently poison the rail highlight + every later insert. */
export function addSlideAfter(source: string, index: number, body: string = NEW_SLIDE): DeckOpResult {
	const slides = bodySlides(source);
	const from = Number.isFinite(index) ? index : -1;
	const at = Math.max(0, Math.min(from + 1, slides.length));
	slides.splice(at, 0, body.trim());
	return { source: rejoin(source, slides), active: at };
}

/** Duplicate slide `index`; the copy lands right after it and becomes active. */
export function duplicateSlide(source: string, index: number): DeckOpResult {
	const slides = bodySlides(source);
	if (!slides.length) return { source, active: 0 };
	const i = clampIndex(index, slides.length);
	slides.splice(i + 1, 0, slides[i]);
	return { source: rejoin(source, slides), active: i + 1 };
}

/** Delete slide `index`. The last slide is never deleted (a deck needs ≥1). */
export function deleteSlide(source: string, index: number): DeckOpResult {
	const slides = bodySlides(source);
	if (slides.length <= 1) return { source, active: 0 };
	const i = clampIndex(index, slides.length);
	slides.splice(i, 1);
	return { source: rejoin(source, slides), active: clampIndex(i, slides.length - 1) };
}

/** Replace slide `index`'s body in place (e.g. after editing its speaker note). */
export function replaceSlide(source: string, index: number, body: string): DeckOpResult {
	const slides = bodySlides(source);
	if (!slides.length) return { source, active: 0 };
	const i = clampIndex(index, slides.length);
	slides[i] = body.trim();
	return { source: rejoin(source, slides), active: i };
}

/** Move slide `from` to position `to` (clamped). Active follows the moved slide. */
export function moveSlide(source: string, from: number, to: number): DeckOpResult {
	const slides = bodySlides(source);
	if (slides.length <= 1) return { source, active: 0 };
	const f = clampIndex(from, slides.length);
	const t = clampIndex(to, slides.length);
	if (f === t) return { source, active: f };
	const [moved] = slides.splice(f, 1);
	slides.splice(t, 0, moved);
	return { source: rejoin(source, slides), active: t };
}
