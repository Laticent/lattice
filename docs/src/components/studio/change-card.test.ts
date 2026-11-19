// The change card's per-row apply / undo, by content (change-card.ts; decision note
// engineering/decisions/2026-11-19-chat-card-apply-undo.md §5).

import { describe, expect, it } from 'vitest';
import { sliceSlide, slideCount } from '@/components/studio/ai/architect-edits.js';
import { getFrontMatter } from '../../lib/front-matter';
import { applyProposedEditsChecked } from './architect';
import { applyRows, cardHistoryLabel, type RowState, reconcile, rowName, rowStates, toldLine, undoRows } from './change-card';
import type { ChatProposal } from './studio-store';

const DECK = '---\ntheme: cuoio\n---\n\n# Title\n\n---\n\n## Revenue\n\nUp a bit.\n\n---\n\n## Costs\n\nUp too.\n\n---\n\n## Hiring\n\nSome.\n';
type RawIn = { action: string; slide: number; body: string; key?: string; value?: string | null; block?: boolean };
// The card row for a raw edit, by the same before/after rule as architect-agent's describeEdit.
const prop = (raw: RawIn): ChatProposal => {
	const fm = raw.action === 'frontmatter';
	const prev = fm ? getFrontMatter(DECK, raw.key ?? '') : undefined;
	const before = fm ? (prev === undefined ? '' : `${raw.key}: ${prev}`) : raw.action === 'insert' ? '' : sliceSlide(DECK, raw.slide);
	const after = fm ? (raw.value == null ? '' : `${raw.key}: ${raw.value}`) : raw.action === 'delete' ? '' : raw.body.trim();
	return { label: '', slide: raw.slide, action: raw.action, raw, before, after, diff: [] };
};

const EDITS = [
	prop({ action: 'replace', slide: 2, body: '## Revenue grew 40%\n\nUp 40%.' }),
	prop({ action: 'replace', slide: 3, body: '## Costs rose 12%\n\nMostly people.' }),
	prop({ action: 'insert', slide: 4, body: '## The ask\n\nTwo hires.' }),
];
const fresh = (): RowState[] => EDITS.map(() => 'waiting');
const titles = (src: string) => Array.from({ length: slideCount(src) }, (_, i) => sliceSlide(src, i + 1).split('\n')[0]);

describe('applyRows', () => {
	it('applying every row equals the whole-card apply', () => {
		const all = applyProposedEditsChecked(DECK, EDITS).source;
		expect(applyRows(DECK, EDITS, fresh(), [0, 1, 2]).source).toBe(all);
	});

	it('applies rows one at a time in any order, finding each slide by its text', () => {
		// The new slide FIRST, then slide 2: the insert must not knock the replace onto the wrong slide.
		let st = fresh();
		let r = applyRows(DECK, EDITS, st, [2]);
		st = st.map((s, i) => (r.done.includes(i) ? 'applied' : s));
		r = applyRows(r.source, EDITS, st, [0]);
		expect(titles(r.source)).toEqual(['# Title', '## Revenue grew 40%', '## Costs', '## Hiring', '## The ask']);
	});

	it('refuses a slide the author changed since the proposal, and applies the rest', () => {
		const edited = DECK.replace('Up too.', 'Up too, and I said why.');
		const r = applyRows(edited, EDITS, fresh(), [0, 1]);
		expect(r.done).toEqual([0]);
		expect(r.refused).toEqual([1]);
		expect(r.source).toContain('Up too, and I said why.');
	});
});

describe('undoRows', () => {
	const appliedAll = () => applyRows(DECK, EDITS, fresh(), [0, 1, 2]).source;
	const allApplied = (): RowState[] => EDITS.map(() => 'applied');

	it('undoing every row gives back the deck as it was', () => {
		expect(undoRows(appliedAll(), EDITS, allApplied(), [0, 1, 2]).source.trim()).toBe(DECK.trim());
	});

	it('undoes one slide after the author typed elsewhere, keeping their typing', () => {
		const typed = appliedAll().replace('Mostly people.', 'Mostly people. (my note)');
		const r = undoRows(typed, EDITS, allApplied(), [0]);
		expect(r.done).toEqual([0]);
		expect(sliceSlide(r.source, 2)).toBe('## Revenue\n\nUp a bit.');
		expect(r.source).toContain('(my note)');
	});

	it("refuses to undo a slide the author has edited since, so their edits survive", () => {
		const typed = appliedAll().replace('Mostly people.', 'Mostly people. (my note)');
		const r = undoRows(typed, EDITS, allApplied(), [1]);
		expect(r.refused).toEqual([1]);
		expect(r.source).toBe(typed);
	});

	it('removes an inserted slide, and puts a deleted one back where it was', () => {
		const del = prop({ action: 'delete', slide: 3, body: '' });
		const gone = applyRows(DECK, [del], ['waiting'], [0]).source;
		expect(titles(gone)).toEqual(['# Title', '## Revenue', '## Hiring']);
		expect(titles(undoRows(gone, [del], ['applied'], [0]).source)).toEqual(['# Title', '## Revenue', '## Costs', '## Hiring']);
		const ins = undoRows(appliedAll(), EDITS, allApplied(), [2]).source;
		expect(titles(ins)).toEqual(['# Title', '## Revenue grew 40%', '## Costs rose 12%', '## Hiring']);
	});

	it('will not apply a deck setting the author changed since the proposal', () => {
		const set = prop({ action: 'frontmatter', slide: 0, body: 'onyx', key: 'theme', value: 'onyx' });
		const changed = DECK.replace('theme: cuoio', 'theme: indaco');
		expect(applyRows(changed, [set], ['waiting'], [0]).refused).toEqual([0]);
		expect(getFrontMatter(applyRows(DECK, [set], ['waiting'], [0]).source, 'theme')).toBe('onyx');
	});

	it('restores a deck setting by key, including one that did not exist before', () => {
		const set = prop({ action: 'frontmatter', slide: 0, body: 'onyx', key: 'finish', value: 'onyx' });
		const on = applyRows(DECK, [set], ['waiting'], [0]).source;
		expect(getFrontMatter(on, 'finish')).toBe('onyx');
		expect(getFrontMatter(undoRows(on, [set], ['applied'], [0]).source, 'finish')).toBeUndefined();
	});
});

describe('the card words', () => {
	it('reads a legacy message (applied, no per-row states) as all applied', () => {
		expect(rowStates({ proposed: EDITS, applied: true })).toEqual(['applied', 'applied', 'applied']);
		expect(rowStates({ proposed: EDITS })).toEqual(['waiting', 'waiting', 'waiting']);
	});
	it('names rows by slide and title', () => {
		expect(rowName(EDITS[0])).toEqual({ lead: 'Slide 2', detail: 'Revenue → Revenue grew 40%' });
		expect(rowName(EDITS[2])).toEqual({ lead: 'New slide', detail: 'The ask · after slide 4' });
	});
	it('labels the one History entry with the time, the ask and the count', () => {
		const at = new Date(2026, 10, 19, 10, 42);
		expect(cardHistoryLabel('Make slides 2 and 3 lead with the numbers', at, ['applied', 'applied', 'waiting'])).toBe('Before AI edit · 10:42 · “Make slides 2 and 3 lead with the…” (2 of 3 applied)');
		expect(cardHistoryLabel('fix it', at, ['undone', 'discarded'])).toBe('Before AI edit · 10:42 · “fix it” (applied, then undone)');
	});
	it('tells the AI what the author did, and nothing while nothing is decided', () => {
		expect(toldLine(EDITS, ['applied', 'discarded', 'waiting'])).toBe('[The author applied slide 2; discarded slide 3; has not decided on new slide.]');
		expect(toldLine(EDITS, fresh())).toBe('');
	});
});

describe('the checker’s cases', () => {
	const BLANK = '# A\n\n---\n\n\n\n---\n\n## C\n';
	const at = (src: string) => Array.from({ length: slideCount(src) }, (_, i) => sliceSlide(src, i + 1).trim());

	it('applies a replace aimed at a blank slide', () => {
		const e: ChatProposal = { label: '', slide: 2, action: 'replace', raw: { action: 'replace', slide: 2, body: '## Filled' }, before: '', after: '## Filled', diff: [] };
		expect(at(applyRows(BLANK, [e], ['waiting'], [0]).source)).toEqual(['# A', '## Filled', '## C']);
	});

	it('places a new slide after its anchor by text, after the author added a slide above it', () => {
		const deck = '# A\n\n---\n\n## B\n\n---\n\n## C\n';
		const e: ChatProposal = { label: '', slide: 2, action: 'insert', raw: { action: 'insert', slide: 2, body: '## P' }, before: '', after: '## P', diff: [], anchor: '## B' };
		const moved = '# A\n\n---\n\n## Mine\n\n---\n\n## B\n\n---\n\n## C\n';
		expect(at(applyRows(moved, [e], ['waiting'], [0]).source)).toEqual(['# A', '## Mine', '## B', '## P', '## C']);
		expect(at(applyRows(deck, [e], ['waiting'], [0]).source)).toEqual(['# A', '## B', '## P', '## C']);
	});

	it('reads the deck after ⌘Z: an applied row whose slide reads as before again is undone, and back', () => {
		const applied = applyRows(DECK, EDITS, fresh(), [0]).source;
		expect(reconcile(DECK, EDITS, ['applied', 'waiting', 'waiting'])).toEqual(['undone', 'waiting', 'waiting']);
		expect(reconcile(applied, EDITS, ['undone', 'waiting', 'waiting'])).toEqual(['applied', 'waiting', 'waiting']);
		expect(reconcile(applied, EDITS, ['applied', 'waiting', 'waiting'])).toEqual(['applied', 'waiting', 'waiting']);
	});

	it('never puts a deleted slide back twice', () => {
		const del: ChatProposal = { label: '', slide: 3, action: 'delete', raw: { action: 'delete', slide: 3, body: '' }, before: sliceSlide(DECK, 3), after: '', diff: [], anchor: sliceSlide(DECK, 2) };
		const gone = applyRows(DECK, [del], ['waiting'], [0]).source;
		const back = undoRows(gone, [del], ['applied'], [0]).source;
		expect(undoRows(back, [del], ['applied'], [0]).refused).toEqual([0]);
		expect(reconcile(back, [del], ['applied'])).toEqual(['undone']);
	});

	it('says Auto applied what Auto applied', () => {
		expect(toldLine(EDITS, ['applied', 'undone', 'applied'], true)).toBe('[Auto applied slide 2, new slide; the author undid slide 3.]');
	});
});
