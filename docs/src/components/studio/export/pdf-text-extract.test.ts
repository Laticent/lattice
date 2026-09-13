import { afterEach, describe, expect, it } from 'vitest';
import { applyTextTransform, collectSlideTextRuns, splitWords } from './pdf-text-extract.js';

// jsdom has no layout engine, so the geometry is stubbed: one synthetic monospace
// line per `data-line`, 8px a character, 16px type. That is enough to test the part
// that is actually ours — which nodes are read, what the text says, and the
// normalization that turns client rects into slide-box fractions (including undoing
// the capture frame's FIT transform). Whether a REAL browser puts the word where we
// think it does is an e2e question, and `docs/e2e/pdf-text-layer.spec.ts` asks it.

const CHAR = 8;
const LINE = 24;
const SIZE = 16;
const BOX_W = 640;
const BOX_H = 480;
const realRangeRect = Range.prototype.getBoundingClientRect;
const realRangeRects = Range.prototype.getClientRects;

function rect(x: number, y: number, w: number, h: number) {
	return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
}

/** Mount `html` as a slide whose deck is drawn at `scale` (the FIT transform). */
function slide(html: string, scale = 1) {
	const section = document.createElement('section');
	section.innerHTML = html;
	document.body.append(section);
	Object.defineProperty(section, 'offsetWidth', { value: BOX_W, configurable: true });
	Object.defineProperty(section, 'offsetHeight', { value: BOX_H, configurable: true });
	section.getBoundingClientRect = () => rect(0, 0, BOX_W * scale, BOX_H * scale);
	const wordRect = (r: Range) => {
		const host = r.startContainer.parentElement as HTMLElement;
		const line = Number(host?.dataset.line ?? 0);
		const left = Number(host?.dataset.x ?? 0) + r.startOffset * CHAR;
		return rect(left * scale, line * LINE * scale, (r.endOffset - r.startOffset) * CHAR * scale, SIZE * 1.2 * scale);
	};
	Range.prototype.getBoundingClientRect = function stub(this: Range) {
		return wordRect(this);
	};
	// A word that soft-wraps mid-word has one rect per line fragment; `data-wrap` says so.
	Range.prototype.getClientRects = function stub(this: Range) {
		const host = this.startContainer.parentElement as HTMLElement;
		const first = wordRect(this);
		if (!host?.dataset.wrap) return [first] as unknown as DOMRectList;
		const second = rect(0, first.top + LINE * scale, first.width / 2, first.height);
		return [first, second] as unknown as DOMRectList;
	};
	// Any element carrying `data-box="x,y,w,h"` reports that as its own border box, which
	// is what an overflow clip is measured against.
	for (const el of Array.from(section.querySelectorAll<HTMLElement>('[data-box]'))) {
		const [x, y, w, h] = String(el.dataset.box).split(',').map(Number);
		el.getBoundingClientRect = () => rect(x * scale, y * scale, w * scale, h * scale);
	}
	return section;
}

afterEach(() => {
	Range.prototype.getBoundingClientRect = realRangeRect;
	Range.prototype.getClientRects = realRangeRects;
	document.body.innerHTML = '';
});

describe('splitWords', () => {
	it('keeps each word’s offsets in the ORIGINAL string', () => {
		expect(splitWords('  ship  it\nnow ')).toEqual([
			{ text: 'ship', start: 2, end: 6 },
			{ text: 'it', start: 8, end: 10 },
			{ text: 'now', start: 11, end: 14 },
		]);
	});

	it('finds nothing in whitespace', () => {
		expect(splitWords('   \n\t ')).toEqual([]);
	});
});

describe('applyTextTransform', () => {
	it('says what the slide SHOWS, not what the Markdown said', () => {
		expect(applyTextTransform('market outlook', 'uppercase')).toBe('MARKET OUTLOOK');
		expect(applyTextTransform('Market Outlook', 'lowercase')).toBe('market outlook');
		expect(applyTextTransform('market outlook', 'capitalize')).toBe('Market Outlook');
		expect(applyTextTransform('Market Outlook', 'none')).toBe('Market Outlook');
	});

	it('leaves a length-changing transform to the run, never to the range', () => {
		// `ß`.toUpperCase() is two characters. The word offsets are taken from the raw
		// text for exactly this reason; the transform only touches the run's own string.
		expect(applyTextTransform('groß', 'uppercase')).toBe('GROSS');
	});
});

describe('collectSlideTextRuns', () => {
	it('emits one run per word, normalized to the slide box', () => {
		const runs = collectSlideTextRuns(slide('<p data-line="1">Margin expansion</p>'));
		expect(runs.map((r) => r.t)).toEqual(['Margin', 'expansion']);
		expect(runs[0].x).toBeCloseTo(0, 5);
		expect(runs[0].w).toBeCloseTo((6 * CHAR) / BOX_W, 5);
		// `expansion` starts at offset 7 in the text node.
		expect(runs[1].x).toBeCloseTo((7 * CHAR) / BOX_W, 5);
		// jsdom resolves no font size, so this run is sized from its rect — the fallback
		// path. The arm below covers the one a real browser takes.
		expect(runs[0].s).toBeCloseTo(SIZE / BOX_H, 5);
		// The baseline sits inside the rect, below its top and above its bottom.
		expect(runs[0].y).toBeGreaterThan((LINE * 1) / BOX_H);
		expect(runs[0].y).toBeLessThan((LINE * 1 + SIZE * 1.2) / BOX_H);
	});

	it('undoes the capture frame’s FIT scale', () => {
		const plain = collectSlideTextRuns(slide('<p data-line="2">Scaled copy</p>', 1));
		const scaled = collectSlideTextRuns(slide('<p data-line="2">Scaled copy</p>', 2.5));
		expect(scaled).toEqual(plain);
	});

	it('skips what a human cannot see', () => {
		const runs = collectSlideTextRuns(
			slide(
				'<p data-line="0">visible</p>' +
					'<p data-line="0" style="display:none">gone</p>' +
					'<p data-line="0" style="visibility:hidden">hidden</p>' +
					'<p data-line="0" style="opacity:0">faded</p>',
			),
		);
		expect(runs.map((r) => r.t)).toEqual(['visible']);
	});

	it('skips the screen-reader-only clip, which is not copy on the slide', () => {
		const runs = collectSlideTextRuns(
			slide(
				'<p data-line="0">reachable</p>' +
					'<span data-line="0" style="position:absolute;width:1px;height:1px;overflow:hidden">not applicable</span>' +
					'<span data-line="0" style="clip-path:inset(50%)">also hidden</span>',
			),
		);
		expect(runs.map((r) => r.t)).toEqual(['reachable']);
	});

	it('keeps an aria-hidden label, because a chart marks VISIBLE ink that way', () => {
		// journey's actor dots carry their label in ink and name it elsewhere for a11y.
		const runs = collectSlideTextRuns(slide('<span data-line="0" aria-hidden="true">Ops</span>'));
		expect(runs.map((r) => r.t)).toEqual(['Ops']);
	});

	it('never reads a script or a stylesheet as copy', () => {
		const runs = collectSlideTextRuns(slide('<p data-line="0">copy</p><script>var leak = 1;</script><style>.x{color:red}</style>'));
		expect(runs.map((r) => r.t)).toEqual(['copy']);
	});

	it('applies the element’s text-transform', () => {
		const runs = collectSlideTextRuns(slide('<p data-line="0" style="text-transform:uppercase">market outlook</p>'));
		expect(runs.map((r) => r.t)).toEqual(['MARKET', 'OUTLOOK']);
	});

	it('drops a word that lies outside the slide box', () => {
		const runs = collectSlideTextRuns(slide('<p data-line="0">on</p><p data-line="40">off</p>'));
		expect(runs.map((r) => r.t)).toEqual(['on']);
	});

	it('returns nothing rather than throwing when the document has no layout', () => {
		const section = document.createElement('section');
		section.innerHTML = '<p>unlaid out</p>';
		document.body.append(section);
		expect(collectSlideTextRuns(section)).toEqual([]);
	});
});

describe('what the slide actually shows', () => {
	it('drops a word clipped out of an overflow-hidden box, and keeps the one still showing', () => {
		// A `text-overflow: ellipsis` line shows `Clipped…`; the words past the clip are not
		// on the page. Written at their unclipped position they land over whatever else
		// occupies that strip — a marquee across blank paper picking up ghost text. A word
		// the clip only PARTLY cuts is kept: part of it is genuinely on the slide.
		const runs = collectSlideTextRuns(
			slide(
				'<div data-box="0,0,80,24" style="overflow:hidden">' +
					'<span data-line="0" data-x="0">Visible</span>' +
					'<span data-line="0" data-x="200">Hidden</span>' +
					'</div>',
			),
		);
		expect(runs.map((r) => r.t)).toEqual(['Visible']);
	});

	it('keeps a visible child of a hidden parent — `visibility` inherits AND overrides', () => {
		const runs = collectSlideTextRuns(
			slide('<p data-line="0" style="visibility:hidden">gone <span data-line="0" data-x="80" style="visibility:visible">shown</span></p>'),
		);
		expect(runs.map((r) => r.t)).toEqual(['shown']);
	});

	it('places a word that soft-wraps on the line it STARTS on, not across both', () => {
		// The union of two line fragments is a box two lines tall whose baseline sits
		// between them, which places the word nowhere.
		const runs = collectSlideTextRuns(slide('<p data-line="1" data-wrap="1">Supercalifragilistic</p>'));
		expect(runs).toHaveLength(1);
		expect(runs[0].y).toBeLessThan((LINE * 1 + SIZE * 1.2) / BOX_H);
	});

	it('reads an SVG label\u2019s font size through its viewBox scale, not as raw user units', () => {
		// Inside a viewBox, computed `font-size` is in USER UNITS while every rect is CSS
		// px. A chart drawn in a 1000-unit viewBox at 250px is scaled 4x, and reading the
		// two as one unit gave every chart label a font a quarter the size of its ink.
		const section = slide('<svg data-line="0"><text data-line="0" style="font-size:8px">Coverage</text></svg>');
		const text = section.querySelector('text') as SVGTextElement & { getScreenCTM: () => DOMMatrix };
		text.getScreenCTM = () => ({ a: 4, b: 0 }) as DOMMatrix;
		const runs = collectSlideTextRuns(section);
		expect(runs[0].s).toBeCloseTo((8 * 4) / BOX_H, 5);
	});

	it('leaves an HTML font size alone — only SVG carries a second scale', () => {
		const runs = collectSlideTextRuns(slide('<p data-line="0" style="font-size:24px">Headline</p>'));
		expect(runs[0].s).toBeCloseTo(24 / BOX_H, 5);
	});
});
