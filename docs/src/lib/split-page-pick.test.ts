import { describe, expect, it } from 'vitest';
import { caretProbe, pickSplitPage } from './split-page-pick';

// A split run as the engine emits it: the cover hoists the masthead, each body page repeats the
// heading with "(cont.)" and carries one row, and the last row's page carries the insight.
const COVER = '<section><p><code>Operations · the four levers</code></p><h2>Four levers moved the quarter.</h2><p>Fulfillment →</p></section>';
const body = (row: string, extra = '') =>
	`<section><p><code>Operations · the four levers</code></p><h2>Four levers moved the quarter. <span>(cont.)</span></h2><ul><li><strong>${row}</strong></li></ul>${extra}</section>`;
const RUN = [
	COVER,
	body('Fulfillment.</strong> Same-day share rose to 71 percent.<strong>'),
	body('Returns.</strong> Processing time fell from six days to two.<strong>'),
	body('Suppliers.</strong> Two regional partners replaced one national.<strong>'),
	body('Staffing.</strong> Weekend coverage now matches weekday demand.<strong>', '<blockquote><p>Fund the supplier shift first; it unblocks the other three.</p></blockquote>'),
];

describe('caretProbe', () => {
	it('strips list, emphasis, heading and quote syntax', () => {
		expect(caretProbe('- **Returns.** Processing time fell')).toBe('returns. processing time fell');
		expect(caretProbe('## Four levers moved the quarter.')).toBe('four levers moved the quarter.');
		expect(caretProbe('> Fund the supplier shift first')).toBe('fund the supplier shift first');
		expect(caretProbe('1. [x] Done item')).toBe('done item');
	});
});

describe('pickSplitPage', () => {
	it('puts the heading and the eyebrow on the cover, because every page carries them', () => {
		expect(pickSplitPage(RUN, '## Four levers moved the quarter.', 3)).toBe(0);
		expect(pickSplitPage(RUN, '`Operations · the four levers`', 3)).toBe(0);
	});
	it('follows a row to its own page, in the CodeMirror and the ProseMirror spelling alike', () => {
		expect(pickSplitPage(RUN, '- **Returns.** Processing time fell from six days to two.')).toBe(2);
		expect(pickSplitPage(RUN, 'Suppliers. Two regional partners replaced one national.')).toBe(3);
	});
	it('puts repeated trailing material (an insight in every body page\'s markup) on the LAST page', () => {
		const repeated = RUN.map((p, i) => (i === 0 ? p : p.replace('</section>', '<blockquote><p>Fund the supplier shift first.</p></blockquote></section>')));
		expect(pickSplitPage(repeated, '> Fund the supplier shift first.')).toBe(4);
	});
	it('puts the insight on the page that carries it', () => {
		expect(pickSplitPage(RUN, '> Fund the supplier shift first; it unblocks the other three.')).toBe(4);
	});
	it('keeps the current page for a line that places nowhere (a blank line, a directive)', () => {
		expect(pickSplitPage(RUN, '', 3)).toBe(3);
		expect(pickSplitPage(RUN, '<!-- _class: inventory -->', 2)).toBe(2);
		expect(pickSplitPage(RUN, 'text that is on no page at all', 1)).toBe(1);
	});
	it('clamps a stale current page to the run, and a lone page is always page 0', () => {
		expect(pickSplitPage(RUN, '', 99)).toBe(4);
		expect(pickSplitPage([COVER], 'anything', 3)).toBe(0);
	});
	it('sends a short card title to its own page, not to a later row that mentions the word', () => {
		const card = (title: string, body: string, next?: string) =>
			`<section><h2>Levers <span>(cont.)</span></h2><ul><li><p><strong>${title}</strong></p><ul><li>${body}</li></ul></li></ul>${next ? `<div class="lat-split-rel"><span class="lat-split-label">${next}</span></div>` : ''}</section>`;
		const run = [
			'<section><h2>Levers</h2><div class="split-cover-lead">Fulfillment →</div></section>',
			card('Fulfillment', 'Same-day share rose.', 'Returns'),
			card('Returns', 'Processing time fell.', 'Tooling'),
			card('Tooling', 'The fulfillment dashboard shipped; returns on it are early.'),
		];
		expect(pickSplitPage(run, '- Fulfillment')).toBe(1);
		expect(pickSplitPage(run, '- Returns')).toBe(2);
		expect(pickSplitPage(run, '  - The fulfillment dashboard shipped; returns on it are early.')).toBe(3);
	});
});

