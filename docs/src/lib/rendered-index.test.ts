import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAll } from '../../../lib/components';
import { appendAutoGlossary, autoGlossarySections } from '../../../lib/core/glossary-auto.mjs';
import { separatorRanges } from '../../../lib/core/slide-boundaries.mjs';
import structural from '../../../lib/core/structural-split.js';
import { createEngine } from '../../../lib/engine';
import { buildDeckIndex } from './deck-outline';
import { buildRenderedIndex, flatOfPage, pageOfFlat, renderedIndexOf, sectionsPerPart, slideCountOf, stampsOf } from './rendered-index';

type Split = {
	splitCapacityFrom: (m: unknown) => unknown;
	structuralSplit: (html: string, o: Record<string, unknown>) => { html: string };
};
const ss = structural as unknown as Split;
const ROOT = path.resolve(__dirname, '../../..');
const engine = createEngine() as { render: (md: string, theme: string, o: Record<string, unknown>) => { html: string; width: number; height: number } };
const CAPACITY = ss.splitCapacityFrom(loadAll(path.join(ROOT, 'lib', 'components')));

/** The Playground's own order: render, then split for the preview at the deck's box, then read the stamps. */
function pagesOf(md: string): { stamps: string[]; html: string } {
	const out = engine.render(appendAutoGlossary(md), 'indaco', { preview: true });
	const html = ss.structuralSplit(out.html, { deckSource: md, width: out.width, height: out.height, capacity: CAPACITY, settle: true }).html;
	return { stamps: stampsOf(html), html };
}

/** How many slides the engine makes of `md` before the preview split cuts any in two. */
function countSlides(md: string): number {
	return (structural as unknown as { splitTopLevelSections: (h: string) => string[] }).splitTopLevelSections(engine.render(appendAutoGlossary(md), 'indaco', { preview: true }).html).length;
}

/** Force the deck's slide box: `size:` in the front matter replaces any the deck declares. */
function withSize(md: string, size: string): string {
	if (!size) return md;
	const fm = /^---\n([\s\S]*?)\n---\n/.exec(md);
	if (!fm) return `---\nsize: ${size}\n---\n\n${md}`;
	const body = fm[1].replace(/^size:.*\n?/m, '');
	return `---\n${body}\nsize: ${size}\n---\n${md.slice(fm[0].length)}`;
}

function corpus(): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const dir of ['examples', 'test/integration/baseline-decks']) {
		for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) if (f.endsWith('.md') && f !== 'README.md') out.push([`${dir}/${f}`, fs.readFileSync(path.join(ROOT, dir, f), 'utf8').replace(/\r\n?/g, '\n')]);
	}
	return out;
}

describe('stampsOf', () => {
	it('reads the stamp of every top-level section, and not a nested one', () => {
		const html = '<article class="lattice"><section data-lattice-slide="1"><section data-lattice-slide="9"></section></section><section data-lattice-slide="2.2"></section><section></section></article>';
		expect(stampsOf(html)).toEqual(['1', '2.2', '']);
	});
});

describe('buildRenderedIndex', () => {
	const deck = buildDeckIndex('# A\n\n---\n\n# B\n\n## B2\n\n---\n\n# C\n');
	it('joins a stamp to its unit and part, and a split run to the slide it cuts', () => {
		// Slides: A | B, B2 | C  →  flat 0..3. B2 (flat 2) renders as a run of three pages.
		const ix = buildRenderedIndex(['1', '2', '3', '3.2', '3.3', '4'], deck);
		expect(ix.pages.map((p) => [p.unit, p.part, p.flat, p.run])).toEqual([
			[0, 0, 0, 0],
			[1, 0, 1, 0],
			[1, 1, 2, 0],
			[1, 1, 2, 1],
			[1, 1, 2, 2],
			[2, 0, 3, 0],
		]);
		expect(ix.byFlat).toEqual([[0], [1], [2, 3, 4], [5]]);
		expect(ix.unexplainedPages).toEqual([]);
		expect(ix.unexplainedParts).toEqual([]);
	});

	it('counts an unstamped section as a slide of its own', () => {
		const ix = buildRenderedIndex(['', '', '', ''], deck);
		expect(ix.pages.map((p) => p.flat)).toEqual([0, 1, 2, 3]);
	});

	// The failing arms: a join that cannot report a disagreement is not evidence.
	it('reports a page the outline has no slide for', () => {
		const ix = buildRenderedIndex(['1', '2', '3', '4', '5'], deck);
		expect(ix.unexplainedPages).toEqual([4]);
		expect(ix.pages[4]).toMatchObject({ unit: -1, part: -1, flat: -1, slide: 5 });
	});

	it('reports a part that no page shows', () => {
		const ix = buildRenderedIndex(['1', '2', '4'], deck);
		expect(ix.unexplainedParts).toEqual([2]);
	});

	it('maps a part to its first page and a page to its part, clamped', () => {
		const ix = buildRenderedIndex(['1', '2', '3', '3.2', '3.3', '4'], deck);
		expect(pageOfFlat(ix, 2)).toBe(2);
		expect(pageOfFlat(ix, 99)).toBe(5);
		expect(flatOfPage(ix, 4)).toBe(2);
		expect(flatOfPage(ix, 99)).toBe(3);
		expect(flatOfPage(buildRenderedIndex([], deck), 0)).toBe(-1);
	});

	it('falls back to the nearest earlier part that is shown', () => {
		const ix = buildRenderedIndex(['1', '2', '4'], deck);
		expect(pageOfFlat(ix, 2)).toBe(1);
	});
});

describe('what the engine adds or the outline drops', () => {
	it('flags a slide the outline does not count instead of shifting every later page', () => {
		const deck = buildDeckIndex('# A\n\n---\n\n# C\n');
		// Three engine slides against two parts: the third is reported, the first two keep their parts.
		const ix = buildRenderedIndex(['1', '2', '3'], deck, [1, 1]);
		expect(ix.unexplainedPages).toEqual([2]);
		expect(ix.byFlat).toEqual([[0], [1]]);
	});

	it('marks the appended glossary page synthetic and nothing else', () => {
		const deck = buildDeckIndex('# A\n\n---\n\n# B\n');
		const ix = buildRenderedIndex(['1', '2', '3'], deck, [1, 1], 1);
		expect(ix.pages[2].synthetic).toBe(true);
		expect(ix.unexplainedPages).toEqual([]);
	});

	it('counts parts without the glossary trigger, so a glossary deck is not read as clones', async () => {
		const deck = buildDeckIndex('---\nglossary: auto\n---\n\n# A\n\n---\n\n# B\n');
		const seen: string[] = [];
		await sectionsPerPart(deck, (md) => (seen.push(md), 1));
		expect(seen.every((md) => !md.includes('glossary:'))).toBe(true);
	});

	it('reads a real glossary deck through the Playground path with no false clones', async () => {
		const md = fs.readFileSync(path.join(ROOT, 'examples/auto-glossary.md'), 'utf8').replace(/\r\n?/g, '\n');
		const { stamps } = pagesOf(md);
		const ix = await renderedIndexOf(stamps, buildDeckIndex(md), countSlides, new Map(), autoGlossarySections(md));
		expect(autoGlossarySections(md)).toBeGreaterThan(0);
		expect(ix.unexplainedPages).toEqual([]);
		expect(ix.unexplainedParts).toEqual([]);
		expect(ix.pages.some((p) => p.copy > 0)).toBe(false);
		expect(ix.pages.filter((p) => p.synthetic).length).toBe(autoGlossarySections(md));
	});
});

describe('a blank slide is a unit, as the engine renders it', () => {
	// The outline used to drop an empty chunk, so a blank slide the PDF counts had no unit and the index had to find
	// its page from the markup (followups.d/2789-p3, closed). Only a body's empty FIRST chunk is dropped, as the engine
	// drops it.
	const SHAPES = ['# A\n\n---\n\n---\n\n# C\n', '# A\n\n---\n\n# B\n\n---\n\n---\n\n---\n\n# D\n', '# A\n\n---\n\n---\n\n# C\n\n---\n\n# D\n', '# A\n\n---\n', '# A\n\n---\n   \n---\n\n# C\n', '\n---\n\n# A\n', '---\ntheme: indaco\n---\n\n---\n\n# A\n\n---\n', '# A\n---\n---\n---\n'];

	it('counts as many units as the engine renders slides, for blank slides anywhere', () => {
		for (const md of SHAPES) expect(buildDeckIndex(md).units.length, JSON.stringify(md)).toBe(countSlides(md));
	});

	it('keeps a first chunk that holds only a link reference definition: it renders nothing, but an edit must not delete it', () => {
		const md = '[a]: https://example.com\n\n---\n\n# One [link][a]\n\n---\n\n# Two\n';
		// One unit more than the engine renders, as before this change: the known cost of keeping the bytes.
		expect(buildDeckIndex(md).units.length).toBe(countSlides(md) + 1);
	});

	it('reads a real deck with blank slides through the engine and places every page, the blank ones on their own unit', async () => {
		for (const md of SHAPES) {
			const deck = buildDeckIndex(md);
			const { stamps } = pagesOf(md);
			const ix = await renderedIndexOf(stamps, deck, countSlides, new Map());
			expect(ix.unexplainedPages, md).toEqual([]);
			expect(ix.unexplainedParts, md).toEqual([]);
			// One page per unit, in order: the blank pages sit on their own units, so no later page shifts.
			expect(ix.pages.map((p) => p.flat), md).toEqual(deck.units.map((_, i) => i));
		}
	});

	it('THE ARM: the old rule, dropping every blank chunk, disagrees with the engine on every shape but the leading one', () => {
		// The old splitSlides: every chunk between separators, trimmed, the blank ones dropped.
		const old = (md: string) => {
			const deck = buildDeckIndex(md);
			const body = md.slice(deck.bodyStart);
			const cuts = separatorRanges(body).ranges as Array<{ index: number; length: number }>;
			const chunks: string[] = [];
			let pos = 0;
			for (const c of cuts) {
				chunks.push(body.slice(pos, c.index));
				pos = c.index + c.length;
			}
			chunks.push(body.slice(pos));
			return chunks.filter((c) => c.trim()).length;
		};
		const disagree = SHAPES.filter((md) => old(md) !== countSlides(md));
		expect(disagree.length).toBe(SHAPES.length - 1);
	});
});

describe('clones: a part the engine makes into several slides', () => {
	const deck = buildDeckIndex('# A\n\n---\n\n# B\n\n---\n\n# C\n');
	it('places each clone on its own part, which the slide number alone cannot say', () => {
		// B makes three slides (a focus walk). The engine numbers them 2, 3, 4 and C 5.
		const ix = buildRenderedIndex(['1', '2', '3', '4', '5'], deck, [1, 3, 1]);
		expect(ix.pages.map((p) => [p.flat, p.copy])).toEqual([
			[0, 0],
			[1, 0],
			[1, 1],
			[1, 2],
			[2, 0],
		]);
		expect(ix.byFlat).toEqual([[0], [1, 2, 3], [4]]);
		expect(ix.unexplainedPages).toEqual([]);
		expect(ix.unexplainedParts).toEqual([]);
	});

	it('reads the same stamps wrongly without the counts (the arm that must go red)', () => {
		const ix = buildRenderedIndex(['1', '2', '3', '4', '5'], deck);
		expect(ix.unexplainedPages).toEqual([3, 4]);
		expect(ix.byFlat[2]).toEqual([2]);
	});

	it('calls an appended slide synthetic only when the caller says the engine appends one', () => {
		const ix = buildRenderedIndex(['1', '2', '3', '4'], deck, [1, 1, 1], 1);
		expect(ix.pages[3]).toMatchObject({ synthetic: true, flat: -1 });
		expect(ix.unexplainedPages).toEqual([]);
		expect(buildRenderedIndex(['1', '2', '3', '4'], deck, [1, 1, 1]).unexplainedPages).toEqual([3]);
	});

	it('keeps a structural run on the clone it cuts', () => {
		const ix = buildRenderedIndex(['1', '2', '3', '3.2', '4'], deck, [1, 2, 1]);
		expect(ix.pages.map((p) => [p.flat, p.copy, p.run])).toEqual([
			[0, 0, 0],
			[1, 0, 0],
			[1, 1, 0],
			[1, 1, 1],
			[2, 0, 0],
		]);
	});

	it('counts slides from the stamps, and an unstamped section as a slide', () => {
		expect(slideCountOf(['1', '2', '2.2', '3'])).toBe(3);
		expect(slideCountOf(['', '', ''])).toBe(3);
	});

	it('renders a part under the deck front matter and memoizes the count', async () => {
		const withFront = buildDeckIndex('---\ntheme: indaco\n---\n\n# A\n\n---\n\n# B\n');
		const seen: string[] = [];
		const memo = new Map<string, number>();
		const count = (md: string) => {
			seen.push(md);
			return md.includes('# B') ? 2 : 1;
		};
		expect(await sectionsPerPart(withFront, count, memo)).toEqual([1, 2]);
		expect(seen.every((md) => md.startsWith('---\ntheme: indaco\n---'))).toBe(true);
		await sectionsPerPart(withFront, count, memo);
		expect(seen.length).toBe(2);
	});

	it('takes the cheap join when the counts agree and renders parts only when they do not', async () => {
		let calls = 0;
		const count = () => {
			calls++;
			return 2;
		};
		await renderedIndexOf(['1', '2', '3'], deck, count);
		expect(calls).toBe(0);
		const ix = await renderedIndexOf(['1', '2', '3', '4'], deck, count);
		expect(calls).toBe(3);
		// Two engine slides per part is six; the stamps name four, so the third part is never shown.
		expect(ix.unexplainedParts).toEqual([2]);
		expect(ix.byFlat).toEqual([[0, 1], [2, 3], []]);
	});
});

describe('the rendered index over the example decks', () => {
	const decks = corpus();
	const memo = new Map<string, number>();
	it('reads a real corpus (the oracle is not vacuous)', () => {
		expect(decks.length).toBeGreaterThan(100);
	});

	// The failing arm for the whole corpus: the same decks read WITHOUT the clone counts must show
	// disagreements, or the zero below proves nothing about the counting.
	it('shows the focus-step and pane clones as unexplained when the counts are left out', () => {
		const bad = new Set<string>();
		for (const size of ['', 'portrait']) {
			for (const [name, src] of decks) {
				const md = withSize(src, size);
				const ix = buildRenderedIndex(pagesOf(md).stamps, buildDeckIndex(md));
				if (ix.unexplainedPages.length || ix.unexplainedParts.length) bad.add(name);
			}
		}
		expect(bad.has('examples/focus.md')).toBe(true);
		expect(bad.has('examples/panes.md')).toBe(true);
	}, 240_000);

	for (const size of ['', 'portrait', 'square']) {
		it(`explains every page and every part at ${size || 'the deck’s own size'}`, async () => {
			const bad: string[] = [];
			let splitDecks = 0;
			let cloneDecks = 0;
			for (const [name, src] of decks) {
				const md = withSize(src, size);
				const { stamps } = pagesOf(md);
				const ix = await renderedIndexOf(stamps, buildDeckIndex(md), countSlides, memo, autoGlossarySections(md));
				if (ix.unexplainedPages.length || ix.unexplainedParts.length) bad.push(`${name}: pages ${ix.unexplainedPages.join(',')} parts ${ix.unexplainedParts.join(',')}`);
				// Order and shape: pages never go back a slide, and each slide's run opens on copy 0.
				ix.pages.forEach((p, i) => {
					if (i && p.flat >= 0 && ix.pages[i - 1].flat > p.flat) bad.push(`${name}: page ${i} goes back a slide`);
				});
				ix.byFlat.forEach((pages, flat) => {
					if (pages.length && ix.pages[pages[0]].run !== 0) bad.push(`${name}: slide ${flat + 1} opens on run ${ix.pages[pages[0]].run}`);
				});
				if (ix.byFlat.some((p) => p.length > 1)) splitDecks++;
				if (ix.pages.some((p) => p.copy > 0)) cloneDecks++;
			}
			expect(bad).toEqual([]);
			// At portrait and square the property means something only if decks really split.
			if (size) expect(splitDecks).toBeGreaterThan(10);
			// …and that clones are exercised at all: `_focusSteps` makes them at every size.
			expect(cloneDecks).toBeGreaterThan(0);
		}, 240_000);
	}
});
