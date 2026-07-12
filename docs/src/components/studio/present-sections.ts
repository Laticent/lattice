// Present-mode SECTION model — the deck structure the single segmented progress
// rail groups by (2026-07-12-studio-present-redesign.md, S1). Sections derive from
// the deck's existing `divider` slides (HARD RULE #1 — reuse the authoring concept,
// don't invent a new one): a boundary slide opens a section that runs until the next
// boundary. A deck with no boundary slides is ONE flat section, so the rail degrades
// gracefully to an ungrouped bar. Pure + fs-free — safe in SSR and tests.

/** One contiguous run of slides. `start` is the 0-based index of its first slide in the
 *  presented set; `count` is how many slides it spans; `name` is its heading ('' = flat). */
export type DeckSection = { name: string; start: number; count: number };

const CLASS_LINE = /<!--\s*_class:\s*([^\n>]*?)\s*-->/;

/**
 * A slide starts a section iff it's a DARK `divider` (anchor/divider — dark canvas + heading).
 * `divider light` is deliberately NOT a boundary: its docs define it as a within-section
 * waypoint ("a lighter context switch for narrowing focus WITHIN a section"), so it must not
 * open a top-level rail group. (There is no `section` class — an earlier draft assumed one.)
 */
function isSectionBoundary(md: string): boolean {
	const m = CLASS_LINE.exec(String(md || ''));
	if (!m) return false;
	const tokens = m[1].trim().split(/[ \t]+/);
	return tokens[0] === 'divider' && !tokens.includes('light');
}

/** First Markdown heading's text on a slide (stripped of markers/emphasis), or ''. */
function headingOf(md: string): string {
	for (const raw of String(md || '').split('\n')) {
		const line = raw.trim();
		if (/^#{1,6}\s+/.test(line)) {
			return (
				line
					.replace(/^#{1,6}\s+/, '')
					.replace(/[*_`~]/g, '')
					// Drop any trailing HTML comment by cutting at the first `<!--` — a regex
					// strip (`/<!--.*?-->/g`) can leave a partial `<!--` and misses newline
					// comments (CodeQL: incomplete multi-character sanitization / bad HTML regexp).
					// A heading's text ends where a comment begins, so the prefix is the title.
					.split('<!--')[0]
					.trim()
			);
		}
	}
	return '';
}

/**
 * Group a presented slide set into sections by its `divider` boundary slides.
 * Returns [] for an empty deck; one nameless section for a deck with no boundaries (the
 * rail renders flat). Slides BEFORE the first divider are an unlabeled cover run (title /
 * agenda) — a nameless section, so the rail shows their segments but no section title until
 * the first real one. Every section has `count >= 1` and the sections tile the deck with no
 * gaps or overlaps: `Σ count === slides.length`.
 */
export function sectionsFromSlides(slides: string[]): DeckSection[] {
	const n = slides.length;
	if (n === 0) return [];
	const boundaries: number[] = [];
	for (let i = 0; i < n; i++) {
		if (isSectionBoundary(slides[i])) boundaries.push(i);
	}
	if (boundaries.length === 0) return [{ name: '', start: 0, count: n }];
	// Slides before the first divider are an unlabeled COVER run — a nameless leading section.
	const hasCover = boundaries[0] !== 0;
	const starts = hasCover ? [0, ...boundaries] : boundaries.slice();
	const out: DeckSection[] = [];
	let sectionNo = 0; // numbers only the real (divider) sections, so a cover doesn't shift them
	for (let k = 0; k < starts.length; k++) {
		const start = starts[k];
		const end = k + 1 < starts.length ? starts[k + 1] : n;
		if (hasCover && k === 0) {
			out.push({ name: '', start, count: end - start });
		} else {
			sectionNo++;
			out.push({ name: headingOf(slides[start]) || `Section ${sectionNo}`, start, count: end - start });
		}
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
