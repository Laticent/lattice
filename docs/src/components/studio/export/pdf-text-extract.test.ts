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
	Range.prototype.getBoundingClientRect = function stub(this: Range) {
		const line = Number((this.startContainer.parentElement as HTMLElement)?.dataset.line ?? 0);
		return rect(this.startOffset * CHAR * scale, line * LINE * scale, (this.endOffset - this.startOffset) * CHAR * scale, SIZE * 1.2 * scale);
	};
	return section;
}

afterEach(() => {
	Range.prototype.getBoundingClientRect = realRangeRect;
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
