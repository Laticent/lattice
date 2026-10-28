import { frontMatterBlock, stripFrontMatter } from './front-matter';
import { slideRanges, splitSlides } from './lint';

// Structural slide editing on the deck SOURCE — add / delete / duplicate / move.
// Pure string transforms: split the body into slides (front-matter held aside so
// it's never treated as a slide), mutate the list, rejoin with the canonical
// `\n\n---\n\n` separator, and reattach the front-matter verbatim. Returns the new
// source plus the index the caller should make active, so the rail + preview can
// follow the edit.

/** Default body for a freshly-added slide. */
export const NEW_SLIDE = '<!-- _class: content -->\n\n## New slide\n\nReplace this with your point.';

/** The canonical slide separator this module rejoins with. Exported because the previews
 *  reassemble a viewed slide LIST back into a deck document too (they render the deck for
 *  context and display one slide, so the engine's page number is true), and that document
 *  must split back into the same slides the engine and the rail see. */
export const SLIDE_SEP = '\n\n---\n\n';

function bodySlides(source: string): string[] {
	return splitSlides(stripFrontMatter(source));
}
function rejoin(source: string, slides: string[]): string {
	const fm = frontMatterBlock(source); // ends with its own blank line, or ''
	const body = slides.join(SLIDE_SEP);
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

/**
 * Replace slide `index`'s body in place (e.g. after editing its speaker note). Only that slide's text changes: the
 * separators, the blank lines around them and the deck's final newline stay as the author wrote them. Rejoining the whole
 * list here used to drop the final newline, so a one-word Slide-panel edit also changed the deck's LAST byte; the focus hub
 * then saw one edit spanning from this slide to the end, mapped the caret to the end, and the preview jumped to the last
 * slide (engineering/gotchas/studio-playground.md).
 */
export function replaceSlide(source: string, index: number, body: string): DeckOpResult {
	const slides = bodySlides(source);
	if (!slides.length) return { source, active: 0 };
	const i = clampIndex(index, slides.length);
	const text = stripFrontMatter(source);
	const at = source.length - text.length;
	const r = slideRanges(text)[i];
	// The ranges come from the same chunking as `bodySlides`; if they ever disagree, rebuild the list as before.
	if (r && source.endsWith(text) && text.slice(r.from, r.to) === slides[i]) {
		return { source: source.slice(0, at + r.from) + body.trim() + source.slice(at + r.to), active: i };
	}
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
