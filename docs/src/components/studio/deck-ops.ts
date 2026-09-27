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

// ── Split a slide in two ────────────────────────────────────────────────────
// The one-click fix for a slide too full for the deck's venue (the Studio's clip notice). A venue
// is a fixed size and nothing shrinks a slide to fit it (engineering/typography.md §7), so the fix
// is MORE slides: the slide's main collection — its biggest top-level list or table — is halved,
// the first half stays, and the second half moves to a new slide right after it that repeats the
// slide's heading, eyebrow and `_class` directives. Whatever follows the collection (a takeaway,
// the speaker notes) moves with the second half, so it still closes the run. A plain string edit,
// not the engine's SPLIT move (lib/core/auto-split.js), which cuts rendered HTML at render time and
// never touches the source.

type Collection = { start: number; end: number; members: [number, number][]; head: number };

const ITEM_RE = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\S/;
// A slide directive: a spot `_name:` or one of Marp's local names. A speaker note that happens to
// open with a word and a colon (`<!-- Note: mention Q3 -->`) is not one, so it is never doubled.
const DIRECTIVE_RE = /^<!--\s*(?:_[A-Za-z][\w-]*|class|paginate|header|footer|color|backgroundColor|backgroundImage|backgroundPosition|backgroundRepeat|backgroundSize)\s*:/;

/** The slide's biggest top-level list or table (≥ 2 members), as line ranges. Lines inside a code
 *  fence or an HTML comment never count, so a list in a code sample or a speaker note is left alone. */
function primaryCollection(lines: string[]): Collection | null {
	const found: Collection[] = [];
	let fence: string | null = null;
	let comment = false;
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		// Inside an HTML comment (a speaker note) nothing is slide content: a list there must
		// never be split, or the cut would leave the comment unclosed and swallow the next slide.
		if (comment) {
			if (line.includes('-->')) comment = false;
			i++;
			continue;
		}
		if (/^\s*<!--/.test(line) && !line.includes('-->')) {
			comment = true;
			i++;
			continue;
		}
		// A `$$` math block is fenced like code: a `- ` line inside it is math, not a list item.
		const f = line.match(/^\s*(```+|~~~+|\$\$)/);
		if (fence) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
			i++;
			continue;
		}
		if (f) {
			fence = f[1];
			i++;
			continue;
		}
		if (ITEM_RE.test(line)) {
			const members: [number, number][] = [];
			const start = i;
			let j = i;
			while (j < lines.length && ITEM_RE.test(lines[j])) {
				const s = j;
				j++;
				// An item runs on through indented lines, and through blank lines that an indented
				// line (or the next item) follows.
				while (j < lines.length) {
					if (/^\s+\S/.test(lines[j])) j++;
					else if (lines[j].trim() === '') {
						let k = j;
						while (k < lines.length && lines[k].trim() === '') k++;
						if (k < lines.length && (/^\s+\S/.test(lines[k]) || ITEM_RE.test(lines[k]))) j = k;
						else break;
					} else break;
				}
				let e = j;
				while (e > s + 1 && lines[e - 1].trim() === '') e--;
				members.push([s, e]);
			}
			found.push({ start, end: members[members.length - 1][1], members, head: start });
			i = j;
			continue;
		}
		if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
			const start = i;
			let j = i + 2;
			const members: [number, number][] = [];
			while (j < lines.length && /^\s*\|/.test(lines[j])) {
				members.push([j, j + 1]);
				j++;
			}
			if (members.length) found.push({ start, end: j, members, head: i + 2 });
			i = j;
			continue;
		}
		i++;
	}
	const usable = found.filter((c) => c.members.length >= 2);
	if (!usable.length) return null;
	return usable.reduce((a, b) => (b.members.length > a.members.length ? b : a));
}

/** The lines a continuation slide repeats from before the collection: its directives, and
 *  everything down to the heading (the eyebrow and the heading itself). Body content between the
 *  heading and the collection stays on the first half, and a non-directive HTML comment (a speaker
 *  note) is never doubled. */
function continuationPreamble(lines: string[]): string[] {
	let heading = -1;
	for (let i = 0; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) heading = i;
	const out: string[] = [];
	let inComment = false;
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i].trim();
		if (inComment) {
			if (t.includes('-->')) inComment = false;
			continue;
		}
		if (t.startsWith('<!--')) {
			if (DIRECTIVE_RE.test(t)) out.push(lines[i]);
			else if (!t.includes('-->')) inComment = true;
			continue;
		}
		if (i <= heading) out.push(lines[i]);
	}
	// Leave one blank line between the preamble and what follows.
	while (out.length && out[out.length - 1].trim() === '') out.pop();
	if (out.length) out.push('');
	return out;
}

/** Can `splitSlideInHalf` split this slide? True when it has a list or table of 2+ members. */
export function canSplitSlide(slide: string): boolean {
	return primaryCollection(slide.split('\n')) != null;
}

/** Split slide `index` in two at the middle of its main list or table. Null when the slide has
 *  no collection of two or more members (there is nothing to divide). Active = the first half. */
export function splitSlideInHalf(source: string, index: number): DeckOpResult | null {
	const slides = bodySlides(source);
	if (!slides.length) return null;
	const i = clampIndex(index, slides.length);
	const lines = slides[i].split('\n');
	const c = primaryCollection(lines);
	if (!c) return null;
	const k = Math.ceil(c.members.length / 2);
	const cut = c.members[k][0];
	const tableHead = c.head > c.start ? lines.slice(c.start, c.head) : [];
	const first = [...lines.slice(0, c.members[k - 1][1])].join('\n').trimEnd();
	const pre = continuationPreamble(lines.slice(0, c.start));
	const second = [...pre, ...tableHead, ...lines.slice(cut)].join('\n').trim();
	slides.splice(i, 1, first.trim(), second);
	return { source: rejoin(source, slides), active: i };
}
