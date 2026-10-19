import { describe, expect, it } from 'vitest';
import { splitSections } from '../../../../../lib/core/split-sections.mjs';
import { emptySlidesOf } from './deck-export.js';

// The fit check lays out only the slides a turn changed; every other slide reaches the frame as an
// empty section. The frame measures what it is given, so what is kept, what is emptied and when
// nothing is emptied at all are the whole contract.
const DECK = '<style>a{}</style>\n<section class="title" id="1"><h1>One</h1></section>\n<section class="content" id="2"><h2>Two</h2><p>body</p></section>\n<section class="kpi" id="3"><h2>Three</h2></section>';

describe('emptySlidesOf', () => {
	it('keeps the open tag, order and number of an emptied slide, and the slides asked for whole', () => {
		const out = emptySlidesOf(DECK, [2], 3, splitSections) as string;
		expect(out).toContain('<section class="title" id="1"></section>');
		expect(out).toContain('<section class="content" id="2"><h2>Two</h2><p>body</p></section>');
		expect(out).toContain('<section class="kpi" id="3"></section>');
		expect(out.startsWith('<style>a{}</style>\n')).toBe(true);
		expect(splitSections(out).filter((p) => p.type === 'section')).toHaveLength(3);
	});

	it('empties every slide when none is asked for, and none when all are', () => {
		expect(emptySlidesOf(DECK, [], 3, splitSections)).not.toContain('<h');
		expect(emptySlidesOf(DECK, [1, 2, 3], 3, splitSections)).toBe(DECK);
	});

	it('returns null when the section count is not the slide count, so the caller measures the whole deck', () => {
		expect(emptySlidesOf(DECK, [2], 2, splitSections)).toBeNull();
		expect(emptySlidesOf(DECK, [2], 4, splitSections)).toBeNull();
	});

	it('does not mistake a section nested in a slide for a slide', () => {
		const nested = '<section id="1"><section class="inner"><p>x</p></section></section><section id="2"><p>y</p></section>';
		const out = emptySlidesOf(nested, [2], 2, splitSections) as string;
		expect(out).toBe('<section id="1"></section><section id="2"><p>y</p></section>');
	});
});
