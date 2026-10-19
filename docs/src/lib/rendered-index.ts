// THE RENDERED INDEX — which authored slide each page of the live preview belongs to.
//
// The preview shows PAGES: one `<section>` per page. The deck outline (docs/src/lib/deck-outline)
// counts UNITS (authored slides, what the editors edit) and PARTS (the rendered slides each unit
// becomes, what the PDF numbers). Anything that shows the same list a second way, such as a map
// of the preview, has to turn a page into a (unit, part) and back, and until now it could do that
// only by running the split again.
//
// Three things make one part more than one page, and the index names each:
//   · the engine CLONES a slide: `_focusSteps` makes one slide per step, and a pane slide at a
//     tall size makes one slide per pane. The clones are `copy` 1, 2, … of their part. The engine
//     numbers every clone as a slide of its own (`data-lattice-slide="10"`, `"11"`), so the number
//     alone cannot say which part a clone belongs to.
//   · the structural split (lib/core/structural-split.js) cuts one slide into a run of pages at
//     portrait and square: `data-lattice-slide="7"`, `"7.2"`, `"7.3"`. Those are `run` 1, 2, …
//   · the engine APPENDS a slide that no part owns (`synthetic`).
//
// The stamps are read once, from the one `splitForPreview` call in playground-engine.ts, and joined
// to the deck outline. Most decks have exactly one engine slide per part, and then the stamps are
// the whole answer. A deck whose counts differ is rare, so only then does the caller ask the
// engine how many slides each part makes on its own (`sectionsPerPart`, memoized). The engine is
// not changed, and nothing here reaches an export.
//
// UNEXPLAINED is data, not an error: a page the outline cannot place, or a part no page shows.
// It means the engine and the outliner disagree about the deck, and a map would then misplace
// tiles, so a test holds both lists empty over the example decks and a reader can still see them.

import { splitSections } from '../../../lib/core/split-sections.mjs';
import type { DeckIndex } from './deck-outline';
import { partCount, partOfFlat, partText } from './fuoco/outline';

/** One page of the preview. `unit`/`part`/`flat` are -1 for a page the outline cannot place. */
export interface RenderedPage {
	/** The page's position in the preview: the section index. */
	page: number;
	/** The engine's 1-based slide number for this page (`data-lattice-slide`, integer part). */
	slide: number;
	/** 0 for the first page of the engine slide, k-1 for `slide.k` (the structural split's run). */
	run: number;
	/** The authored slide this page belongs to (a deck outline unit). */
	unit: number;
	/** The rendered slide within that unit (a deck outline part). */
	part: number;
	/** The part's position across the whole deck. */
	flat: number;
	/** 0 for the part's own slide, 1.. for an engine clone of it (a focus step, a pane). */
	copy: number;
	/** The engine appended this slide; no part owns it. */
	synthetic: boolean;
}

export interface RenderedIndex {
	/** Every page, in document order. */
	pages: readonly RenderedPage[];
	/** For each part of the deck (by flat position), the pages that show it, in order. */
	byFlat: readonly (readonly number[])[];
	/** Pages the outline cannot place and the engine did not append. */
	unexplainedPages: readonly number[];
	/** Parts of the outline that no page shows. */
	unexplainedParts: readonly number[];
	/** How many engine slides the stamps name, before the structural split cut any in two. */
	slides: number;
}

/** The `data-lattice-slide` of every top-level section, in order; '' where a section has none. */
export function stampsOf(html: string): string[] {
	const out: string[] = [];
	for (const p of splitSections(String(html ?? '')) as Array<{ type: string; openTag?: string }>) {
		if (p.type !== 'section') continue;
		const m = /\sdata-lattice-slide="([^"]*)"/i.exec(p.openTag ?? '');
		out.push(m ? m[1] : '');
	}
	return out;
}

/** The pagination, header and footer a section carries, read from its open tag: `paginate|header|footer`. */
function chromeOf(open: string): string {
	const attr = (name: string) => new RegExp(`\\sdata-${name}="([^"]*)"`, 'i').exec(open)?.[1] ?? '';
	return `${attr('paginate')}|${attr('header')}|${attr('footer')}`;
}

/** What chrome a slide shows when nothing sets it: no page number, no header, no footer. */
export const NO_CHROME = '||';

/**
 * The chrome the DECK's front matter gives every slide, read off the first section of a render of that front
 * matter alone (a front matter plus one content slide). Pass it to `blanksOf` so a slide that shows exactly this
 * is understood to have inherited it rather than set it.
 */
export function deckChromeOf(html: string): string {
	for (const p of splitSections(String(html ?? '')) as Array<{ type: string; openTag?: string }>) if (p.type === 'section') return chromeOf(p.openTag ?? '');
	return NO_CHROME;
}

/**
 * Whether each top-level section is BLANK: no text, no picture, no drawing. The engine renders a slide the
 * author left empty (`---` twice in a row) and the outliner drops it, so the index needs to know which engine
 * slides own no part. Read from the markup, in the same order as `stampsOf`.
 *
 * A blank slide is a standard-frame section with an EMPTY stage, no component (`data-class=`) and no background
 * picture (`url(`). Its chrome (pagination, header, footer) must be exactly what the front matter gives every
 * slide, passed as `deckChrome`: `paginate:`, `header:` and `footer:` in the front matter put a header, a footer and
 * a page number on every slide, blank or not, but a slide that sets its own (`_header`) is a slide an author wrote
 * something on. A section the scan cannot recognize is not blank, so a doubtful slide never loses its tile.
 */
export function blanksOf(html: string, deckChrome: string = NO_CHROME): boolean[] {
	const out: boolean[] = [];
	for (const p of splitSections(String(html ?? '')) as Array<{ type: string; openTag?: string; inner?: string }>) {
		if (p.type !== 'section') continue;
		const open = p.openTag ?? '';
		const inner = p.inner ?? '';
		out.push(
			!/\sdata-class=|url\(/i.test(open) &&
				/\sdata-frame="standard"/i.test(open) &&
				chromeOf(open) === deckChrome &&
				/<div class="cell-stage"><\/div>/.test(inner) &&
				!/<(img|svg|picture|video|canvas)[\s>]/i.test(inner),
		);
	}
	return out;
}

/** `'3'` is slide 3 run 0, `'3.2'` is slide 3 run 1. Anything else is not a stamp. */
function parseStamp(stamp: string): { slide: number; run: number } | null {
	const m = /^(\d+)(?:\.(\d+))?$/.exec(stamp);
	if (!m) return null;
	return { slide: Number(m[1]), run: m[2] ? Math.max(0, Number(m[2]) - 1) : 0 };
}

/** The engine slides the stamps name: the largest integer part, or the section count when nothing is stamped. */
export function slideCountOf(stamps: readonly string[]): number {
	let slide = 0;
	for (const st of stamps) {
		const s = parseStamp(st);
		slide = s ? Math.max(slide, s.slide) : slide + 1;
	}
	return slide;
}

/**
 * Join the page stamps to the deck outline.
 *
 * `perPart[flat]` is how many engine slides that part makes on its own (1 for an ordinary slide,
 * the step count for `_focusSteps`, the pane count for a split pane slide). Leave it out when the
 * engine rendered exactly one slide per part. `synthetic` is how many slides the engine APPENDS
 * after the last part (the auto-glossary's pages); they are marked, and any slide past those is a
 * disagreement, so an empty slide the outliner dropped is reported rather than absorbed.
 * A section with no stamp (an engine bundle with no `splitForPreview`) is a slide of its own.
 *
 * `blank[i]` says page `i` is an empty section. When the engine rendered more slides than the parts and the
 * appended pages account for, that many blank slides (the first ones, in order) are slides the outliner dropped:
 * they own no part, and the slides after them keep their own. Without `blank` the surplus is only reported.
 */
export function buildRenderedIndex(stamps: readonly string[], deck: DeckIndex, perPart?: readonly number[], synthetic = 0, blank?: readonly boolean[]): RenderedIndex {
	const parts = partCount(deck);
	// Which part owns engine slide j (0-based), and which clone of it that slide is.
	const owner: Array<{ flat: number; copy: number }> = [];
	for (let flat = 0; flat < parts; flat++) {
		const n = Math.max(0, perPart ? (perPart[flat] ?? 1) : 1);
		for (let copy = 0; copy < n; copy++) owner.push({ flat, copy });
	}
	// Engine slides the outliner dropped: blank ones, as many as the engine rendered beyond what the parts and the
	// appended pages explain.
	const dropped = new Set<number>();
	if (perPart && blank) {
		let surplus = slideCountOf(stamps) - owner.length - synthetic;
		let slide = 0;
		for (let i = 0; i < stamps.length && surplus > 0; i++) {
			const s0 = parseStamp(stamps[i]);
			slide = s0 ? s0.slide : slide + 1;
			if (blank[i] && !dropped.has(slide - 1) && (!s0 || s0.run === 0)) {
				dropped.add(slide - 1);
				surplus--;
			}
		}
	}
	// `engineSlideOwner[j]` is the owner of engine slide j once the dropped ones are skipped.
	const engineSlideOwner: Array<{ flat: number; copy: number } | undefined> = [];
	{
		let next = 0;
		for (let j = 0; j < slideCountOf(stamps); j++) engineSlideOwner[j] = dropped.has(j) ? undefined : owner[next++];
	}
	const pages: RenderedPage[] = [];
	const byFlat: number[][] = Array.from({ length: parts }, () => []);
	const unexplainedPages: number[] = [];
	let slide = 0;
	for (let i = 0; i < stamps.length; i++) {
		const s = parseStamp(stamps[i]);
		slide = s ? s.slide : slide + 1;
		if (dropped.has(slide - 1)) {
			pages.push({ page: i, slide, run: s ? s.run : 0, unit: -1, part: -1, flat: -1, copy: 0, synthetic: true });
			continue;
		}
		const own = engineSlideOwner[slide - 1];
		const at = own ? partOfFlat(deck, own.flat) : null;
		// Slides just past the last part are the engine's own additions, when the caller says it
		// appends some; any further slide is a disagreement worth reporting.
		const appended = !own && slide - dropped.size - owner.length <= synthetic;
		if (own && at) byFlat[own.flat].push(i);
		else if (!appended) unexplainedPages.push(i);
		pages.push({ page: i, slide, run: s ? s.run : 0, unit: at ? at.unit : -1, part: at ? at.part : -1, flat: own && at ? own.flat : -1, copy: own ? own.copy : 0, synthetic: appended });
	}
	const unexplainedParts: number[] = [];
	byFlat.forEach((p, flat) => {
		if (!p.length) unexplainedParts.push(flat);
	});
	return { pages, byFlat, unexplainedPages, unexplainedParts, slides: slideCountOf(stamps) };
}

/** Renders `markdown` and says how many slides the engine made of it. */
export type CountSlides = (markdown: string) => number | Promise<number>;

/**
 * How many engine slides each part makes ON ITS OWN, by rendering the part under the deck's front
 * matter. Costs one render per part, so a caller reaches for it only when the deck's slide count
 * differs from its part count, and keeps `memo` between calls so an edit re-renders only the part
 * it touched. A count that fails (the renderer threw) is 1, which is what an ordinary slide is.
 */
export async function sectionsPerPart(deck: DeckIndex, count: CountSlides, memo: Map<string, number> = new Map()): Promise<number[]> {
	const front = deck.source.slice(0, deck.bodyStart);
	const out: number[] = [];
	for (let u = 0; u < deck.units.length; u++) {
		for (let k = 0; k < deck.units[u].parts.length; k++) {
			// Without the glossary trigger: the glossary belongs to the deck, and a part rendered alone
			// would grow a glossary page of its own and count as two slides.
			const md = `${front.replace(/^[ \t]*glossary:[^\n]*\r?\n?/m, '')}${partText(deck, u, k)}\n`;
			let n = memo.get(md);
			if (n === undefined) {
				try {
					n = Math.max(1, await count(md));
				} catch {
					n = 1;
				}
				if (memo.size >= 4096) memo.clear();
				memo.set(md, n);
			}
			out.push(n);
		}
	}
	return out;
}

/**
 * The whole job for a caller that holds the stamps, the deck and a way to render: take the cheap
 * join first, and count each part only when the deck's slide count differs from its part count.
 */
export async function renderedIndexOf(stamps: readonly string[], deck: DeckIndex, count: CountSlides, memo?: Map<string, number>, synthetic = 0, blank?: readonly boolean[]): Promise<RenderedIndex> {
	const plain = buildRenderedIndex(stamps, deck, undefined, synthetic);
	if (plain.slides === partCount(deck) + synthetic) return plain;
	return buildRenderedIndex(stamps, deck, await sectionsPerPart(deck, count, memo), synthetic, blank);
}

/** The first page that shows part `flat` (or the nearest earlier one that is shown), or -1 for an empty preview. */
export function pageOfFlat(ix: RenderedIndex, flat: number): number {
	for (let f = Math.min(flat, ix.byFlat.length - 1); f >= 0; f--) if (ix.byFlat[f].length) return ix.byFlat[f][0];
	return ix.pages.length ? 0 : -1;
}

/** The part a page belongs to, as a flat position (clamped into the deck; -1 for an empty preview). */
export function flatOfPage(ix: RenderedIndex, page: number): number {
	if (!ix.pages.length) return -1;
	const p = ix.pages[Math.max(0, Math.min(ix.pages.length - 1, page))];
	return p.flat >= 0 ? p.flat : Math.max(0, ix.byFlat.length - 1);
}
