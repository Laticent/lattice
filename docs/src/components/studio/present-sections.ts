import { slideClass } from './lint';

// Present-mode SECTION model — the deck structure the single segmented progress
// rail groups by (2026-07-12-studio-present-redesign.md, S1). Sections derive from
// the deck's existing `section`/`divider` slides (HARD RULE #1 — reuse the authoring
// concept, don't invent a new one): a boundary slide opens a section that runs until
// the next boundary. A deck with no boundary slides is ONE flat section, so the rail
// degrades gracefully to an ungrouped bar. Pure + fs-free — safe in SSR and tests.

/** One contiguous run of slides. `start` is the 0-based index of its first slide in the
 *  presented set; `count` is how many slides it spans; `name` is its heading ('' = flat). */
export type DeckSection = { name: string; start: number; count: number };

const BOUNDARY = new Set(['section', 'divider']);

/** First Markdown heading's text on a slide (stripped of markers/emphasis), or ''. */
function headingOf(md: string): string {
	for (const raw of String(md || '').split('\n')) {
		const line = raw.trim();
		if (/^#{1,6}\s+/.test(line)) {
			return line
				.replace(/^#{1,6}\s+/, '')
				.replace(/[*_`~]/g, '')
				.replace(/<!--.*?-->/g, '')
				.trim();
		}
	}
	return '';
}

/**
 * Group a presented slide set into sections by its `section`/`divider` boundary slides.
 * Returns [] for an empty deck; one nameless section for a deck with no boundaries (the
 * rail renders flat). Every section has `count >= 1` and the sections tile the deck with
 * no gaps or overlaps: `Σ count === slides.length`.
 */
export function sectionsFromSlides(slides: string[]): DeckSection[] {
	const n = slides.length;
	if (n === 0) return [];
	const boundaries: number[] = [];
	for (let i = 0; i < n; i++) {
		if (BOUNDARY.has(slideClass(slides[i]))) boundaries.push(i);
	}
	if (boundaries.length === 0) return [{ name: '', start: 0, count: n }];
	// A leading run before the first boundary is its own section (named by its first slide).
	const starts = boundaries[0] === 0 ? boundaries.slice() : [0, ...boundaries];
	const out: DeckSection[] = [];
	for (let k = 0; k < starts.length; k++) {
		const start = starts[k];
		const end = k + 1 < starts.length ? starts[k + 1] : n;
		out.push({ name: headingOf(slides[start]) || `Section ${k + 1}`, start, count: end - start });
	}
	return out;
}

/** The index into `sections` that contains presented-slide index `i` (clamped in-range). */
export function sectionOfIndex(sections: DeckSection[], i: number): number {
	if (sections.length === 0) return -1;
	for (let s = 0; s < sections.length; s++) {
		const sec = sections[s];
		if (i < sec.start + sec.count) return Math.max(0, s);
	}
	return sections.length - 1;
}

/** Convenience: the section NAME for a presented-slide index ('' when flat/none). */
export function sectionNameOf(sections: DeckSection[], i: number): string {
	const s = sectionOfIndex(sections, i);
	return s < 0 ? '' : sections[s].name;
}
