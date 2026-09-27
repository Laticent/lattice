// The Studio's map through a split panes slide, against the REAL engine: the map is only worth
// having if it predicts the section count the engine actually renders, so every case here renders.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLIDE_SEP } from './deck-ops';
import { frontMatterBlock, stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { foldPaneSplits, type SlideScript } from './narration-projection';
import { panePageOfCaret, paneSplitCounts, paneSplitLineOf, renderedPageCounts } from './pane-pages';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const engine = require('../../../../lib/engine/index.js') as { render: (md: string, theme: string) => { html: string } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sectionsOf } = require('../../../../lib/diagnostics/slice-equivalence-core.mjs') as { sectionsOf: (h: string) => string[] };

const ROOT = path.resolve(__dirname, '../../../..');

const PANES = [
	'`Pipeline review · Q3`',
	'',
	'## EMEA carried the quarter while APAC held flat.',
	'',
	'<!-- panes: 35/65 -->',
	'<!-- pane: list -->',
	'',
	'- EMEA closed three late deals',
	'- APAC renewals slipped',
	'',
	'<!-- pane: table -->',
	'',
	'| Region | Q2 | Q3 |',
	'|---|---|---|',
	'| EMEA | 4.1 | 5.3 |',
	'| APAC | 2.8 | 2.8 |',
].join('\n');

/** A deck with the panes slide MID-deck, so there is a slide after the split to land on. */
function deck(size?: string) {
	const fm = `---\npaginate: true\n${size ? `size: ${size}\n` : ''}---\n\n`;
	const body = ['# Opening', PANES, '## After the split\n\nThe slide the caret moves to.', '## Closing'].join(SLIDE_SEP);
	return fm + body;
}

function rendered(doc: string) {
	return sectionsOf(engine.render(doc, 'lattice').html);
}

describe('paneSplitCounts (the map) predicts the engine', () => {
	it('a portrait deck: the panes slide is two rendered slides, every later one shifts by one', () => {
		const doc = deck('9:16');
		const slides = splitSlides(stripFrontMatter(doc));
		const counts = paneSplitCounts(slides, doc);
		expect(counts).toEqual([1, 2, 1, 1]);
		const sections = rendered(frontMatterBlock(doc) + slides.join(SLIDE_SEP));
		expect(sections.length).toBe(5);
		// Source slide 2 ("After the split") is rendered section 3, not 2 — the map's offset.
		expect(sections[3]).toContain('After the split');
		// And the split slide's two pages are its two panes.
		expect(sections[1]).toContain('EMEA closed three late deals');
		expect(sections[2]).toContain('4.1');
		expect(sections[2]).not.toContain('EMEA closed three late deals');
	});

	it('a 16:9 deck whose panes fit: all ones — nothing moves, but the position guard is told so', () => {
		const doc = deck();
		const slides = splitSlides(stripFrontMatter(doc));
		expect(paneSplitCounts(slides, doc)).toEqual([1, 1, 1, 1]);
		expect(rendered(doc).length).toBe(slides.length);
	});

	it('a deck with a duplicated `size:` is planned at the size the engine renders (the last)', () => {
		const doc = deck('9:16').replace('size: 9:16\n', 'size: 9:16\nsize: 16:9\n');
		const slides = splitSlides(stripFrontMatter(doc));
		const counts = renderedPageCounts(slides, doc);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(rendered(frontMatterBlock(doc) + slides.join(SLIDE_SEP)).length);
	});

	it('agrees with the engine on every size family, for every committed panes deck', () => {
		const src = fs.readFileSync(path.join(ROOT, 'examples/panes.md'), 'utf8');
		for (const size of [undefined, '1:1', '4:5', '9:16']) {
			const fm = frontMatterBlock(src);
			const doc = size ? fm.replace(/^---\n/, `---\nsize: ${size}\n`) + stripFrontMatter(src) : src;
			const slides = splitSlides(stripFrontMatter(doc));
			const counts = renderedPageCounts(slides, doc);
			const total = counts.reduce((a, b) => a + b, 0);
			expect({ size, total }).toEqual({ size, total: rendered(frontMatterBlock(doc) + slides.join(SLIDE_SEP)).length });
		}
	});

	it('a deck with no panes pays one substring test per slide and returns nothing', () => {
		expect(paneSplitLineOf('# Just a slide\n\n- a\n- b', deck('9:16'))).toBe(-1);
		expect(paneSplitCounts(['# a', '# b'], '---\nsize: 9:16\n---\n# a\n---\n# b')).toBeUndefined();
	});
});

describe('panePageOfCaret — which page of the split holds the caret line', () => {
	const doc = deck('9:16');
	it('a line in the first pane is page 0, in the second pane page 1', () => {
		expect(panePageOfCaret(PANES, doc, '- APAC renewals slipped')).toBe(0);
		expect(panePageOfCaret(PANES, doc, '| EMEA | 4.1 | 5.3 |')).toBe(1);
		expect(panePageOfCaret(PANES, doc, '<!-- pane: table -->')).toBe(1);
	});
	it('the Compose editor reports plain text, and it places the same way', () => {
		expect(panePageOfCaret(PANES, doc, 'EMEA closed three late deals')).toBe(0);
	});
	it('the masthead is on every page, so it keeps the page shown', () => {
		expect(panePageOfCaret(PANES, doc, '## EMEA carried the quarter while APAC held flat.')).toBeUndefined();
	});
	it('a blank line, or a slide that does not split, keeps the page shown', () => {
		expect(panePageOfCaret(PANES, doc, '')).toBeUndefined();
		expect(panePageOfCaret(PANES, deck(), '- APAC renewals slipped')).toBeUndefined(); // 16:9, fits
	});
});

describe('foldPaneSplits — narration keeps projecting through a split', () => {
	const doc = deck('9:16');
	const s = (text: string, emphasis: SlideScript['emphasis'] = []): SlideScript => ({ text, emphasis });
	it('folds the two pages onto their one source slide, masthead said once, emphasis shifted', () => {
		const title = 'EMEA carried the quarter while APAC held flat.';
		const out = foldPaneSplits(
			[s('Opening'), s(`${title} EMEA closed three late deals.`), s(`${title} Region table.`, [{ start: title.length + 1, end: title.length + 7, weight: 1 }]), s('After the split'), s('Closing')],
			doc,
			['', title, title, '', ''],
		);
		expect(out.map((x) => x.text)).toEqual(['Opening', `${title} EMEA closed three late deals. Region table.`, 'After the split', 'Closing']);
		const e = out[1].emphasis[0];
		expect(out[1].text.slice(e.start, e.end)).toBe('Region');
	});
	it('never drops a word two panes merely share — only the page\'s own masthead is cut', () => {
		const out = foldPaneSplits([s('Opening'), s('Pipeline review. Revenue rose in EMEA.'), s('Pipeline review. Revenue fell in APAC.'), s('After'), s('Closing')], doc, ['', 'Pipeline review.', 'Pipeline review.', '', '']);
		expect(out[1].text).toBe('Pipeline review. Revenue rose in EMEA. Revenue fell in APAC.');
		// No masthead text at all: nothing is cut, even a shared opening word.
		const bare = foldPaneSplits([s('Opening'), s('Revenue rose.'), s('Revenue fell.'), s('After'), s('Closing')], doc);
		expect(bare[1].text).toBe('Revenue rose. Revenue fell.');
	});

	it('leaves a projection the map does not account for untouched (the callers guard it)', () => {
		const scripts = [s('a'), s('b'), s('c')];
		expect(foldPaneSplits(scripts, doc)).toBe(scripts);
	});
});
